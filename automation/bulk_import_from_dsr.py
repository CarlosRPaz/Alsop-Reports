"""
bulk_import_from_dsr.py — Bulk-import the ENTIRE year of DSR data from Excel into Supabase.

Reads:
  1. DSR sheet — main combined daily data per agent (calls, texts, quotes, NB, items,
     written premium, eAgent todos, leads pipeline)
  2. Premium sheet — AgencyZoom premium data per producer per day (prem_premium,
     prem_items, prem_points)
  3. Spine sheet — maps producer names to canonical agent names

Pushes all rows from 2026-01-01 onwards into the Supabase daily_metrics and
leads_snapshot tables.

Usage:
  python bulk_import_from_dsr.py                  # Import all 2026 data
  python bulk_import_from_dsr.py --from 2026-03-01 # Import from a specific date
  python bulk_import_from_dsr.py --dry-run          # Preview without writing
"""

import os
import sys
import json
import argparse
import math
import pandas as pd
import requests
import warnings
from datetime import date, datetime

warnings.filterwarnings("ignore")
sys.stdout.reconfigure(encoding="utf-8")

DSR_PATH = r"C:\Users\scag3s29\Documents\Claude Scope\Daily Standup Report.xlsx"
BATCH_SIZE = 50  # Supabase REST API batch size


def load_config():
    with open("config/config.json") as f:
        return json.load(f)


def parse_talk_time(val):
    """Convert a talk time string/timedelta to total seconds."""
    if pd.isna(val) or val is None:
        return 0
    s = str(val).strip()
    if not s or s == "0" or s == "nan":
        return 0

    # Handle timedelta-style: "0 days HH:MM:SS" or "HH:MM:SS"
    if "days" in s:
        s = s.split("days")[-1].strip()

    # Handle HH:MM:SS
    parts = s.split(":")
    if len(parts) == 3:
        try:
            h, m, sec = int(parts[0]), int(parts[1]), int(float(parts[2]))
            return h * 3600 + m * 60 + sec
        except (ValueError, TypeError):
            pass

    # Handle pure number (already seconds)
    try:
        return int(float(s))
    except (ValueError, TypeError):
        return 0


def build_az_name_map(dsr_path):
    """Build a map from AgencyZoom producer name → canonical agent name using the Spine sheet."""
    spine_df = pd.read_excel(dsr_path, sheet_name="Spine")
    az_map = {}
    for _, row in spine_df.iterrows():
        agent = row.get("Agent")
        az_name = row.get("AgencyZoom Name")
        if pd.notna(agent) and pd.notna(az_name):
            az_map[str(az_name).strip()] = str(agent).strip()
    return az_map


def load_premium_data(dsr_path, from_date, to_date, az_name_map):
    """Load and aggregate Premium (AgencyZoom) data per agent per day."""
    prem_df = pd.read_excel(dsr_path, sheet_name="Premium")
    prem_df["Date"] = pd.to_datetime(prem_df["Date"], errors="coerce")
    prem_df = prem_df.dropna(subset=["Date"])
    prem_df["DateOnly"] = prem_df["Date"].dt.date

    # Filter to date range
    prem_df = prem_df[(prem_df["DateOnly"] >= from_date) & (prem_df["DateOnly"] <= to_date)]

    # Aggregate per agent per day
    prem_data = {}  # (agent_name, date_str) → {premium, items, points}
    unmapped_producers = set()

    for _, row in prem_df.iterrows():
        producer = str(row.get("Producer", "")).strip()
        agent = az_name_map.get(producer)
        if not agent:
            unmapped_producers.add(producer)
            continue

        d = row["DateOnly"].isoformat()
        key = (agent, d)

        premium = 0.0
        try:
            premium = float(row.get("Premium", 0) or 0)
        except (ValueError, TypeError):
            pass

        items = 0
        try:
            items = int(float(row.get("Items", 0) or 0))
        except (ValueError, TypeError):
            pass

        points = 0.0
        try:
            points = float(row.get("Points", 0) or 0)
        except (ValueError, TypeError):
            pass

        if key not in prem_data:
            prem_data[key] = {"premium": 0.0, "items": 0, "points": 0.0}
        prem_data[key]["premium"] += premium
        prem_data[key]["items"] += items
        prem_data[key]["points"] += points

    return prem_data, unmapped_producers


def main():
    parser = argparse.ArgumentParser(description="Bulk import DSR data into Supabase")
    parser.add_argument("--from", dest="from_date", default="2026-01-01",
                        help="Start date (inclusive), default: 2026-01-01")
    parser.add_argument("--to", dest="to_date", default=None,
                        help="End date (inclusive), default: today")
    parser.add_argument("--dry-run", action="store_true",
                        help="Preview without writing to Supabase")
    args = parser.parse_args()

    config = load_config()
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or config.get("supabase", {}).get("url")
    key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") or config.get("supabase", {}).get("key")
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
    }

    from_date = date.fromisoformat(args.from_date)
    to_date = date.fromisoformat(args.to_date) if args.to_date else date.today()

    print("=" * 72)
    print("  BULK IMPORT: DSR Excel → Supabase")
    print(f"  Date Range: {from_date} to {to_date}")
    if args.dry_run:
        print("  *** DRY RUN — no data will be written ***")
    print("=" * 72)

    # ── Step 1: Fetch agent map from Supabase ──────────────────────────────
    print("\n[1/7] Fetching agent IDs from Supabase...")
    r = requests.get(f"{url}/rest/v1/agents?select=id,name,active", headers=headers)
    if r.status_code >= 400:
        print(f"  ERROR: {r.text}")
        return
    all_agents = r.json()
    agent_id_map = {a["name"]: a["id"] for a in all_agents}
    print(f"  {len(agent_id_map)} agents in database")

    # ── Step 2: Read DSR sheet ─────────────────────────────────────────────
    print("\n[2/7] Reading DSR sheet from Excel...")
    df = pd.read_excel(DSR_PATH, sheet_name="DSR", header=2)

    # Clean up
    df = df.dropna(subset=["Date"])
    df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    df = df.dropna(subset=["Date"])
    df["DateOnly"] = df["Date"].dt.date

    # Filter to requested range
    df = df[(df["DateOnly"] >= from_date) & (df["DateOnly"] <= to_date)]
    print(f"  {len(df)} rows in date range")
    print(f"  Unique dates: {df['DateOnly'].nunique()}")
    print(f"  Unique agents: {df['Agent'].nunique()}")

    if len(df) == 0:
        print("  No data to import!")
        return

    # ── Step 3: Read Premium (AgencyZoom) sheet ────────────────────────────
    print("\n[3/7] Reading Premium (AgencyZoom) sheet + Spine...")
    az_name_map = build_az_name_map(DSR_PATH)
    print(f"  {len(az_name_map)} AgencyZoom name → agent mappings in Spine")

    prem_data, unmapped_producers = load_premium_data(DSR_PATH, from_date, to_date, az_name_map)
    print(f"  {len(prem_data)} (agent, date) premium records")
    total_prem = sum(v["premium"] for v in prem_data.values())
    print(f"  Total AZ Premium: ${total_prem:,.0f}")
    if unmapped_producers:
        print(f"  ⚠ Unmapped AZ producers: {sorted(unmapped_producers)[:10]}")

    # ── Step 4: Map agents & build payloads ────────────────────────────────
    print("\n[4/7] Mapping agents and building payloads...")

    metrics_payloads = []
    leads_payloads = []
    unmapped = set()

    for _, row in df.iterrows():
        agent_name = str(row.get("Agent", "")).strip()
        if not agent_name or agent_name == "nan":
            continue

        agent_id = agent_id_map.get(agent_name)
        if not agent_id:
            unmapped.add(agent_name)
            continue

        date_str = row["DateOnly"].isoformat()

        def safe_int(col, default=0):
            val = row.get(col, default)
            if pd.isna(val):
                return default
            try:
                return int(float(val))
            except (ValueError, TypeError):
                return default

        def safe_float(col, default=0.0):
            val = row.get(col, default)
            if pd.isna(val):
                return default
            try:
                return float(val)
            except (ValueError, TypeError):
                return default

        talk_seconds = parse_talk_time(row.get("Talk Time"))

        # Get AZ premium data for this agent+date
        prem_info = prem_data.get((agent_name, date_str), {})

        # Build daily_metrics payload
        metric = {
            "agent_id": agent_id,
            "report_date": date_str,
            "calls": safe_int("Calls"),
            "inbound": safe_int("Inbound"),
            "outbound": safe_int("Outbound"),
            "talk_time_seconds": talk_seconds,
            "texts": safe_int("Texts"),
            "out_texts": safe_int("OutTexts"),
            "opt_ins": safe_int("Opt-Ins"),
            "opt_outs": safe_int("Opt-Outs"),
            "quotes": safe_int("Quotes"),
            "nb_count": safe_int("NB"),
            "items": safe_int("Items"),
            "written_premium": safe_float("Total Premium"),
            "prem_premium": prem_info.get("premium", 0.0),
            "prem_items": prem_info.get("items", 0),
            "prem_points": prem_info.get("points", 0.0),
            "dismissed_todos": safe_int("Dismissed To-Do's"),
            "past_due_todos": safe_int("Past Due To-Do's"),
            "pivots": safe_int("Pivots"),
        }
        metrics_payloads.append(metric)

        # Build leads_snapshot payload (Contact/Quoted/Hot/x-sale)
        contact = safe_int("Contact")
        quoted = safe_int("Quoted")
        hot = safe_int("Hot")
        xsale = safe_int("x-sale")

        if contact > 0 or quoted > 0 or hot > 0 or xsale > 0:
            leads_payloads.append({
                "agent_id": agent_id,
                "report_date": date_str,
                "contact": contact,
                "quoted": quoted,
                "hot": hot,
                "xsale": xsale,
            })

    print(f"  {len(metrics_payloads)} daily_metrics payloads ready")
    print(f"  {len(leads_payloads)} leads_snapshot payloads ready")
    if unmapped:
        print(f"  ⚠ Unmapped agents (skipped): {sorted(unmapped)}")

    # Count how many rows have premium data
    prem_count = sum(1 for m in metrics_payloads if m["prem_premium"] > 0)
    print(f"  {prem_count} rows include AZ premium data")

    # ── Step 5: Preview ────────────────────────────────────────────────────
    print("\n[5/7] Preview (first 10 metrics):")
    id_to_name = {v: k for k, v in agent_id_map.items()}
    for m in metrics_payloads[:10]:
        name = id_to_name.get(m["agent_id"], "?")
        tt_min = m["talk_time_seconds"] // 60
        prem_str = f"  az=${m['prem_premium']:,.0f}" if m["prem_premium"] > 0 else ""
        print(f"    {m['report_date']}  {name:16s}  calls={m['calls']:3d}  "
              f"ob={m['outbound']:3d}  tt={tt_min}m  "
              f"texts={m['texts']:3d}  quotes={m['quotes']}  "
              f"nb={m['nb_count']}  items={m['items']}  wp=${m['written_premium']:,.0f}  "
              f"todos={m['dismissed_todos']}/{m['past_due_todos']}{prem_str}")

    if args.dry_run:
        print("\n  *** DRY RUN complete. No data written. ***")
        return

    # ── Step 6: Upsert daily_metrics in batches ────────────────────────────
    n_batches = math.ceil(len(metrics_payloads) / BATCH_SIZE)
    print(f"\n[6/7] Upserting {len(metrics_payloads)} daily_metrics rows ({n_batches} batches)...")

    success = 0
    errors = 0
    for i in range(0, len(metrics_payloads), BATCH_SIZE):
        batch = metrics_payloads[i:i + BATCH_SIZE]
        batch_num = (i // BATCH_SIZE) + 1
        r = requests.post(
            f"{url}/rest/v1/daily_metrics?on_conflict=agent_id,report_date",
            headers=headers,
            json=batch
        )
        if r.status_code < 400:
            success += len(batch)
            if batch_num % 20 == 0 or batch_num == n_batches:
                print(f"    Batch {batch_num}/{n_batches}: OK ({success} total)")
        else:
            errors += len(batch)
            print(f"    Batch {batch_num}/{n_batches}: ERROR — {r.text[:200]}")

    print(f"  daily_metrics: {success} upserted, {errors} errors")

    # ── Step 7: Upsert leads_snapshot in batches ───────────────────────────
    if leads_payloads:
        n_batches_leads = math.ceil(len(leads_payloads) / BATCH_SIZE)
        print(f"\n[7/7] Upserting {len(leads_payloads)} leads_snapshot rows ({n_batches_leads} batches)...")

        l_success = 0
        l_errors = 0
        for i in range(0, len(leads_payloads), BATCH_SIZE):
            batch = leads_payloads[i:i + BATCH_SIZE]
            batch_num = (i // BATCH_SIZE) + 1
            r = requests.post(
                f"{url}/rest/v1/leads_snapshot?on_conflict=agent_id,report_date",
                headers=headers,
                json=batch
            )
            if r.status_code < 400:
                l_success += len(batch)
            else:
                l_errors += len(batch)
                print(f"    Batch {batch_num}/{n_batches_leads}: ERROR — {r.text[:200]}")

        print(f"  leads_snapshot: {l_success} upserted, {l_errors} errors")
    else:
        print("\n[7/7] No leads data to push.")

    # ── Verification ──────────────────────────────────────────────────────
    print("\n" + "=" * 72)
    print("  VERIFICATION")
    print("=" * 72)

    # Count records per month
    for month in range(1, 7):
        start = f"2026-{month:02d}-01"
        end = f"2026-{month:02d}-31"
        r = requests.get(
            f"{url}/rest/v1/daily_metrics?select=report_date&report_date=gte.{start}&report_date=lte.{end}",
            headers={k: v for k, v in headers.items() if k != "Prefer"} | {"Prefer": "count=exact", "Range-Unit": "items"}
        )
        content_range = r.headers.get("Content-Range", "")
        parts = content_range.split("/")
        total = parts[-1] if len(parts) > 1 else "?"
        print(f"  2026-{month:02d}: {total} records in Supabase")

    # Spot-check totals
    print("\n  Spot check (May 2026):")
    r = requests.get(
        f"{url}/rest/v1/daily_metrics?select=calls,outbound,prem_premium&report_date=gte.2026-05-01&report_date=lte.2026-05-31",
        headers={k: v for k, v in headers.items() if k != "Prefer"}
    )
    if r.status_code < 400:
        rows = r.json()
        total_calls = sum(row.get("calls", 0) or 0 for row in rows)
        total_ob = sum(row.get("outbound", 0) or 0 for row in rows)
        total_prem = sum(float(row.get("prem_premium", 0) or 0) for row in rows)
        print(f"  Supabase — calls: {total_calls:,}  outbound: {total_ob:,}  AZ premium: ${total_prem:,.0f}")

    # Compare with Excel
    may_excel = df[(df["DateOnly"] >= date(2026, 5, 1)) & (df["DateOnly"] <= date(2026, 5, 31))]
    excel_calls = may_excel["Calls"].fillna(0).astype(int).sum()
    excel_ob = may_excel["Outbound"].fillna(0).astype(int).sum()
    print(f"  Excel    — calls: {excel_calls:,}  outbound: {excel_ob:,}")

    print("\n  ✅ Bulk import complete!")


if __name__ == "__main__":
    main()
