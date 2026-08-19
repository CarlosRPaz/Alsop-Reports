"""
backfill_supabase.py — Backfill historical NB items and AZ Premium data into Supabase.

Reads:
  - NB sheet from Daily Standup Report.xlsx for items per agent per day
  - Premium sheet from Daily Standup Report.xlsx for prem_premium per agent per day

Updates daily_metrics rows that already exist, adding the missing items/premium.
"""

import os, json, sys
import pandas as pd
import requests
import warnings
warnings.filterwarnings("ignore")
sys.stdout.reconfigure(encoding='utf-8')

DSR_PATH = r"C:\Users\scag3s29\Documents\Claude Scope\Daily Standup Report.xlsx"

def load_config():
    with open("config/config.json") as f:
        return json.load(f)

def main():
    config = load_config()
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or config.get("supabase", {}).get("url")
    key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") or config.get("supabase", {}).get("key")
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
    }

    print("=" * 70)
    print("  BACKFILL: Loading historical NB items & AZ Premium into Supabase")
    print("=" * 70)

    # --- 1. Build agent name map from Supabase ---
    print("\n[1] Fetching agent IDs from Supabase...")
    r = requests.get(f"{url}/rest/v1/agents?select=id,name", headers=headers)
    agent_id_map = {a["name"]: a["id"] for a in r.json()}
    print(f"  {len(agent_id_map)} agents")

    # --- 2. Build Spine name maps ---
    spine_df = pd.read_excel(DSR_PATH, sheet_name="Spine")
    nb_name_map = {}
    az_name_map = {}
    for _, row in spine_df.iterrows():
        agent = row["Agent"]
        if pd.notna(row.get("NB Sub-Producer Name")):
            nb_name_map[str(row["NB Sub-Producer Name"]).strip()] = agent
        if pd.notna(row.get("AgencyZoom Name")):
            az_name_map[str(row["AgencyZoom Name"]).strip()] = agent

    # --- 3. Read NB data for all April dates ---
    print("\n[2] Reading NB items from DSR workbook...")
    nb_df = pd.read_excel(DSR_PATH, sheet_name="NB")
    nb_df["DateOnly"] = pd.to_datetime(nb_df["Date"]).dt.date

    from datetime import date
    april_nb = nb_df[(nb_df["DateOnly"] >= date(2026, 4, 1)) & (nb_df["DateOnly"] <= date(2026, 4, 29))]

    # Aggregate NB items per agent per day using Item Count
    nb_items = {}  # (agent, date_str) -> item_count
    for _, row in april_nb.iterrows():
        sub_prod = str(row.get("Sub-Producer Name", "")).strip()
        agent = nb_name_map.get(sub_prod)
        if not agent:
            continue
        d = row["DateOnly"].isoformat()
        item_count = int(row.get("Item Count", 1) or 1)
        key = (agent, d)
        nb_items[key] = nb_items.get(key, 0) + item_count

    print(f"  NB records: {len(nb_items)} (agent, date) pairs")
    total_nb_items = sum(nb_items.values())
    print(f"  Total NB items (April): {total_nb_items}")

    # --- 4. Read Premium (AZ) data for all April dates ---
    print("\n[3] Reading AZ Premium from DSR workbook...")
    prem_df = pd.read_excel(DSR_PATH, sheet_name="Premium")
    prem_df["DateOnly"] = pd.to_datetime(prem_df["Date"]).dt.date
    april_prem = prem_df[(prem_df["DateOnly"] >= date(2026, 4, 1)) & (prem_df["DateOnly"] <= date(2026, 4, 29))]

    prem_data = {}  # (agent, date_str) -> premium
    for _, row in april_prem.iterrows():
        producer = str(row.get("Producer", "")).strip()
        agent = az_name_map.get(producer)
        if not agent:
            continue
        d = row["DateOnly"].isoformat()
        premium = float(row.get("Premium", 0) or 0)
        prem_items = int(row.get("Items", 0) or 0)
        prem_points = float(row.get("Points", 0) or 0)
        key = (agent, d)
        if key not in prem_data:
            prem_data[key] = {"premium": 0, "items": 0, "points": 0}
        prem_data[key]["premium"] += premium
        prem_data[key]["items"] += prem_items
        prem_data[key]["points"] += prem_points

    print(f"  Premium records: {len(prem_data)} (agent, date) pairs")
    total_prem = sum(v["premium"] for v in prem_data.values())
    print(f"  Total AZ Premium (April): ${total_prem:,.0f}")

    # --- 5. Get existing Supabase daily_metrics records ---
    print("\n[4] Fetching existing daily_metrics from Supabase...")
    r = requests.get(
        f"{url}/rest/v1/daily_metrics?select=id,agent_id,report_date,items,prem_premium&report_date=gte.2026-04-01&report_date=lte.2026-04-29",
        headers=headers
    )
    existing = r.json()
    print(f"  {len(existing)} existing records")

    # Build lookup by (agent_id, date)
    id_to_name = {v: k for k, v in agent_id_map.items()}
    existing_map = {}
    for m in existing:
        name = id_to_name.get(m["agent_id"], "")
        existing_map[(name, m["report_date"])] = m

    # --- 6. Build updates ---
    print("\n[5] Building update batch...")
    updates = []
    
    # Collect all unique (agent, date) pairs that need updates
    all_keys = set(nb_items.keys()) | set(prem_data.keys())
    
    for agent, date_str in all_keys:
        agent_id = agent_id_map.get(agent)
        if not agent_id:
            continue
        
        existing_record = existing_map.get((agent, date_str))
        if not existing_record:
            continue  # Only update existing records
        
        update_fields = {"updated_at": "now()"}
        changed = False
        
        # NB items: only update if current value is 0 or different
        nb_val = nb_items.get((agent, date_str), 0)
        current_items = existing_record.get("items") or 0
        if nb_val > 0 and nb_val != current_items:
            update_fields["items"] = nb_val
            changed = True
        
        # Premium: only update if current value is 0
        prem_info = prem_data.get((agent, date_str))
        current_prem = float(existing_record.get("prem_premium") or 0)
        if prem_info and prem_info["premium"] > 0 and abs(current_prem) < 1:
            update_fields["prem_premium"] = prem_info["premium"]
            update_fields["prem_items"] = prem_info["items"]
            update_fields["prem_points"] = prem_info["points"]
            changed = True
        
        if changed:
            updates.append({
                "agent_id": agent_id,
                "report_date": date_str,
                **update_fields
            })

    print(f"  {len(updates)} records need updating")

    # Preview first 10 changes
    if updates:
        print("\n  Preview (first 10):")
        for u in updates[:10]:
            name = id_to_name.get(u["agent_id"], "?")
            items_change = f"items={u.get('items', '-')}" if "items" in u else ""
            prem_change = f"prem=${u.get('prem_premium', 0):,.0f}" if "prem_premium" in u else ""
            print(f"    {name:20s} {u['report_date']}  {items_change}  {prem_change}")

    # --- 7. Apply updates ---
    if updates:
        print(f"\n[6] Applying {len(updates)} updates to Supabase...")
        success = 0
        errors = 0
        for u in updates:
            agent_id = u.pop("agent_id")
            report_date = u.pop("report_date")
            # Remove the now() since we can't use SQL functions via REST
            u.pop("updated_at", None)
            
            r = requests.patch(
                f"{url}/rest/v1/daily_metrics?agent_id=eq.{agent_id}&report_date=eq.{report_date}",
                headers=headers,
                json=u
            )
            if r.status_code < 400:
                success += 1
            else:
                errors += 1
                if errors <= 3:
                    name = id_to_name.get(agent_id, "?")
                    print(f"    Error for {name} {report_date}: {r.text}")
        
        print(f"  Done! {success} updated, {errors} errors")
    else:
        print("\n[6] No updates needed!")

    # --- 8. Verify ---
    print("\n[7] Verifying totals...")
    r = requests.get(
        f"{url}/rest/v1/daily_metrics?select=agent_id,items,prem_premium&report_date=gte.2026-04-01&report_date=lte.2026-04-29",
        headers=headers
    )
    post_update = r.json()
    new_items_total = sum(m.get("items") or 0 for m in post_update)
    new_prem_total = sum(float(m.get("prem_premium") or 0) for m in post_update)
    print(f"  New Items MTD Total: {new_items_total}")
    print(f"  New Premium MTD Total: ${new_prem_total:,.0f}")
    print(f"  NB target Items MTD: {total_nb_items}")
    print(f"  AZ target Premium MTD: ${total_prem:,.0f}")


if __name__ == "__main__":
    main()
