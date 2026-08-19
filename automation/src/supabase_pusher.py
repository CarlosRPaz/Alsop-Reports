import os
import json
import requests
import pandas as pd
from datetime import date

# Which Supabase columns each source type populates
SOURCE_FIELD_MAP = {
    "rc":          ["calls", "inbound", "outbound", "talk_time_seconds"],
    "rico_ap":     ["calls", "inbound", "outbound"],
    "rico_ch":     ["talk_time_seconds"],
    "hs":          ["texts", "out_texts", "opt_ins", "opt_outs"],
    "quotes":      ["quotes", "quotes_deduped"],
    "nb":          ["nb_count", "items", "written_premium", "nb_auto_count", "nb_auto_items"],
    "premium":     ["prem_premium", "prem_items", "prem_points"],
    "rico_leads":  [],  # writes to leads_snapshot table, not daily_metrics columns
}

def push_to_supabase(merged_df: pd.DataFrame, report_date: date, config: dict,
                     upload_types: list[str] | None = None,
                     actual_sources: list[str] | None = None,
                     quote_duplicates: list[dict] | None = None,
                     quote_records: list[dict] | None = None,
                     upload_id: str | None = None):
    """
    Pushes the merged DSR dataframe to Supabase via its REST API.
    Handles upserting agents and daily metrics.
    
    Parameters
    ----------
    upload_types : list[str], optional
        If provided (upload mode), only update the fields associated with
        these source types. Existing data for other fields is preserved.
    """
    supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or config.get("supabase", {}).get("url")
    supabase_key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") or config.get("supabase", {}).get("key")

    if not supabase_url or not supabase_key:
        print("  [Supabase] Skip push: SUPABASE_URL or SUPABASE_ANON_KEY not found in config/env.")
        return

    is_partial = upload_types is not None and len(upload_types) > 0
    mode_label = f"PARTIAL ({','.join(upload_types)})" if is_partial else "FULL"
    print(f"  [Supabase] Pushing data to Supabase ({mode_label})...")
    
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
    }

    # Determine which fields to write in partial mode
    partial_fields = set()
    if is_partial:
        for src in upload_types:
            partial_fields.update(SOURCE_FIELD_MAP.get(src, []))
        print(f"  [Supabase] Partial update fields: {sorted(partial_fields)}")

    # 1. Upsert Agents
    agents_data = []
    for _, row in merged_df.iterrows():
        agent_payload = {
            "name": row.get("agent"),
            "team": row.get("team", ""),
            "office": row.get("office", ""),
            "active": True
        }
        for k, v in agent_payload.items():
            if pd.isna(v):
                agent_payload[k] = ""
        agents_data.append(agent_payload)

    if agents_data:
        res = requests.post(
            f"{supabase_url}/rest/v1/agents?on_conflict=name",
            headers=headers,
            json=agents_data
        )
        if res.status_code >= 400:
            print(f"  [Supabase] Failed to push agents: {res.text}")
            return

    # 2. Fetch Agent IDs
    res = requests.get(
        f"{supabase_url}/rest/v1/agents?select=id,name",
        headers=headers
    )
    if res.status_code >= 400:
        print(f"  [Supabase] Failed to fetch agents: {res.text}")
        return
        
    agents_db = res.json()
    agent_id_map = {a["name"]: a["id"] for a in agents_db}

    # 3. Fetch existing daily metrics to preserve data
    date_str = report_date.isoformat()
    if is_partial:
        # In partial mode, fetch full rows so we can merge
        res = requests.get(
            f"{supabase_url}/rest/v1/daily_metrics?report_date=eq.{date_str}&select=*",
            headers=headers
        )
    else:
        res = requests.get(
            f"{supabase_url}/rest/v1/daily_metrics?report_date=eq.{date_str}&select=agent_id,dismissed_todos,past_due_todos,pivots",
            headers=headers
        )
    
    existing_rows = {}
    existing_manual_data = {}
    if res.status_code < 400:
        for row in res.json():
            if is_partial:
                existing_rows[row["agent_id"]] = row
            existing_manual_data[row["agent_id"]] = {
                "dismissed_todos": row.get("dismissed_todos"),
                "past_due_todos": row.get("past_due_todos"),
                "pivots": row.get("pivots")
            }

    # 4. Upsert Daily Metrics
    metrics_data = []
    
    for _, row in merged_df.iterrows():
        name = row.get("agent")
        agent_id = agent_id_map.get(name)
        if not agent_id:
            continue
            
        def get_val(col, default=0, is_float=False):
            val = row.get(col, default)
            if pd.isna(val):
                return default
            if is_float:
                return float(val)
            return int(float(val))

        existing = existing_manual_data.get(agent_id, {})
        
        def preserve_manual(key):
            if existing.get(key) is not None:
                return existing[key]
            return get_val(key)

        # Build the full field map from pipeline data
        all_fields = {
            "calls": get_val("Calls"),
            "inbound": get_val("Inbound"),
            "outbound": get_val("Outbound"),
            "talk_time_seconds": get_val("TalkTimeSeconds"),
            "texts": get_val("Texts"),
            "out_texts": get_val("OutTexts"),
            "opt_ins": get_val("OptIns"),
            "opt_outs": get_val("OptOuts"),
            "quotes": get_val("Quotes"),
            "quotes_deduped": get_val("QuotesDeduped"),
            "nb_count": get_val("NB"),
            "items": get_val("Items"),
            "written_premium": get_val("WrittenPremium", 0.0, True),
            "nb_auto_count": get_val("NBAutoCount"),
            "nb_auto_items": get_val("NBAutoItems"),
            "prem_premium": get_val("PremPremium", 0.0, True),
            "prem_items": get_val("PremItems"),
            "prem_points": get_val("PremPoints", 0.0, True),
            "dismissed_todos": preserve_manual("dismissed_todos"),
            "past_due_todos": preserve_manual("past_due_todos"),
            "pivots": preserve_manual("pivots"),
        }

        if is_partial:
            # Start from existing row, only overwrite targeted fields
            existing_row = existing_rows.get(agent_id, {})
            metric = {
                "agent_id": agent_id,
                "report_date": date_str,
            }
            for field, new_val in all_fields.items():
                if field in partial_fields:
                    existing_val = existing_row.get(field)
                    # Only overwrite if: new data is non-zero, OR there's no existing data
                    if new_val and new_val != 0:
                        metric[field] = new_val
                    elif existing_val is not None:
                        metric[field] = existing_val
                    else:
                        metric[field] = new_val
                else:
                    # Keep existing value, fall back to 0/default if no existing row
                    metric[field] = existing_row.get(field) if existing_row.get(field) is not None else new_val
            metrics_data.append(metric)
        else:
            # Full mode — write everything
            metric = {"agent_id": agent_id, "report_date": date_str}
            metric.update(all_fields)
            metrics_data.append(metric)

    if metrics_data:
        res = requests.post(
            f"{supabase_url}/rest/v1/daily_metrics?on_conflict=agent_id,report_date",
            headers=headers,
            json=metrics_data
        )
        if res.status_code >= 400:
            print(f"  [Supabase] Failed to push metrics: {res.text}")
            return

    # 5. Upsert Leads Snapshot
    has_leads = not is_partial or (upload_types and "rico_leads" in upload_types)
    if has_leads:
        leads_data = []
        for _, row in merged_df.iterrows():
            name = row.get("agent")
            agent_id = agent_id_map.get(name)
            if not agent_id:
                continue
                
            def get_val(col, default=0):
                val = row.get(col, default)
                if pd.isna(val):
                    return default
                return int(float(val))
                
            leads_data.append({
                "agent_id": agent_id,
                "report_date": date_str,
                "contact": get_val("contact"),
                "quoted": get_val("quoted"),
                "hot": get_val("hot"),
                "xsale": get_val("xsale")
            })

        if leads_data:
            res = requests.post(
                f"{supabase_url}/rest/v1/leads_snapshot?on_conflict=agent_id,report_date",
                headers=headers,
                json=leads_data
            )
            if res.status_code >= 400:
                print(f"  [Supabase] Failed to push leads: {res.text}")
                return

    # 6. Upsert daily_reports_meta to mark eAgent as synced
    sources_to_check = actual_sources or upload_types or []
    if "screenshots" in sources_to_check or "eagent" in sources_to_check:
        try:
            from datetime import datetime as dt
            now_iso = dt.utcnow().isoformat() + "Z"
            meta_payload = {
                "report_date": date_str,
                "eagent_submitted": True,
                "submitted_at": now_iso,
                "updated_at": now_iso
            }
            res = requests.post(
                f"{supabase_url}/rest/v1/daily_reports_meta?on_conflict=report_date",
                headers=headers,
                json=meta_payload
            )
            if res.status_code >= 400:
                print(f"  [Supabase] Failed to update daily_reports_meta: {res.text}")
            else:
                print(f"  [Supabase] Marked eAgent as submitted in daily_reports_meta for {date_str}.")
        except Exception as e:
            print(f"  [Supabase] Error updating daily_reports_meta: {e}")

    # 7. Push quote duplicates if provided
    if quote_duplicates:
        print(f"  [Supabase] Uploading {len(quote_duplicates)} duplicate quote records...")
        months_to_clear = sorted(set(r["report_month"] for r in quote_duplicates))
        for rm in months_to_clear:
            requests.delete(
                f"{supabase_url}/rest/v1/quote_duplicates?report_month=eq.{rm}",
                headers={"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"}
            )
        
        batch_success = 0
        for i in range(0, len(quote_duplicates), 50):
            batch = quote_duplicates[i:i+50]
            resp = requests.post(
                f"{supabase_url}/rest/v1/quote_duplicates", 
                json=batch, 
                headers=headers
            )
            if resp.status_code in (200, 201, 204):
                batch_success += len(batch)
            else:
                print(f"  [Supabase] ERROR batch {i}: {resp.status_code} {resp.text}")
        print(f"  [Supabase] quote_duplicates: {batch_success}/{len(quote_duplicates)} inserted.")

    # 8. Push individual quote records if provided
    if quote_records:
        print(f"  [Supabase] Uploading {len(quote_records)} individual quote records...")
        quote_payloads = []
        for r in quote_records:
            aid = agent_id_map.get(r["agent"])
            if not aid:
                continue
            quote_payloads.append({
                "agent_id": aid,
                "report_date": r["report_date"],
                "quote_control_number": r["quote_control_number"],
                "product": r["product"],
                "premium": r["premium"],
                "sub_producer": r["sub_producer"],
                "upload_id": upload_id
            })

        if quote_payloads:
            # Delete existing quote records for the dates present in this batch to prevent duplicates
            dates_to_clear = sorted(set(r["report_date"] for r in quote_payloads))
            print(f"  [Supabase] Clearing existing quote records for {len(dates_to_clear)} date(s): {', '.join(dates_to_clear)}")
            for d in dates_to_clear:
                requests.delete(
                    f"{supabase_url}/rest/v1/quote_records?report_date=eq.{d}",
                    headers={"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"}
                )

            # Insert new quote records in batches
            batch_success = 0
            for i in range(0, len(quote_payloads), 100):
                batch = quote_payloads[i:i+100]
                resp = requests.post(
                    f"{supabase_url}/rest/v1/quote_records",
                    json=batch,
                    headers=headers
                )
                if resp.status_code in (200, 201, 204):
                    batch_success += len(batch)
                else:
                    print(f"  [Supabase] ERROR quote_records batch {i}: {resp.status_code} {resp.text}")
            print(f"  [Supabase] quote_records: {batch_success}/{len(quote_payloads)} inserted.")

    print(f"  [Supabase] Successfully pushed {len(metrics_data)} daily metrics for {date_str} ({mode_label}).")
