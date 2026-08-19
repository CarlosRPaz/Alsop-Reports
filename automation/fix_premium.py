"""
Fix premium overlap — for April 17 and 29, the pipeline had already pushed
prem_premium values. The backfill didn't overwrite them. But the pipeline used
different values than the AZ Premium export (because the pipeline ran before 
the full data was available). Let's reconcile by setting ALL premium to match
the AZ Premium export exactly.
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

config = load_config()
url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or config.get("supabase", {}).get("url")
key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") or config.get("supabase", {}).get("key")
headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates"}

# Get agent maps
r = requests.get(f"{url}/rest/v1/agents?select=id,name", headers=headers)
name_to_id = {a["name"]: a["id"] for a in r.json()}
id_to_name = {v: k for k, v in name_to_id.items()}

# Read AZ Premium from workbook
spine_df = pd.read_excel(DSR_PATH, sheet_name="Spine")
az_name_map = {}
for _, row in spine_df.iterrows():
    if pd.notna(row.get("AgencyZoom Name")):
        az_name_map[str(row["AgencyZoom Name"]).strip()] = row["Agent"]

prem_df = pd.read_excel(DSR_PATH, sheet_name="Premium")
prem_df["DateOnly"] = pd.to_datetime(prem_df["Date"]).dt.date

from datetime import date
april_prem = prem_df[(prem_df["DateOnly"] >= date(2026, 4, 1)) & (prem_df["DateOnly"] <= date(2026, 4, 29))]

# Build target premium: (agent, date) -> premium
target_prem = {}
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
    if key not in target_prem:
        target_prem[key] = {"premium": 0, "items": 0, "points": 0}
    target_prem[key]["premium"] += premium
    target_prem[key]["items"] += prem_items
    target_prem[key]["points"] += prem_points

# Get current Supabase premium data
r = requests.get(
    f"{url}/rest/v1/daily_metrics?select=agent_id,report_date,prem_premium&report_date=gte.2026-04-01&report_date=lte.2026-04-29&prem_premium=gt.0",
    headers=headers
)
current = r.json()

# Find where Supabase has premium but AZ doesn't, or values differ
print("Checking Supabase premium records against AZ target...")
corrections = 0
for m in current:
    name = id_to_name.get(m["agent_id"], "?")
    d = m["report_date"]
    sb_prem = float(m["prem_premium"])
    target = target_prem.get((name, d))
    
    if target:
        if abs(sb_prem - target["premium"]) > 1:
            print(f"  {name:20s} {d}  SB=${sb_prem:>10,.0f}  AZ=${target['premium']:>10,.0f}  Delta=${sb_prem - target['premium']:,.0f}")
            # Fix it
            r2 = requests.patch(
                f"{url}/rest/v1/daily_metrics?agent_id=eq.{m['agent_id']}&report_date=eq.{d}",
                headers=headers,
                json={"prem_premium": target["premium"], "prem_items": target["items"], "prem_points": target["points"]}
            )
            corrections += 1
    else:
        # Supabase has premium but AZ doesn't — this shouldn't happen, but check
        print(f"  {name:20s} {d}  SB=${sb_prem:>10,.0f}  AZ=NO DATA  (keeping as-is)")

print(f"\n{corrections} corrections made")

# Also set premium to 0 for days/agents where AZ has no data but SB has premium
# Get ALL prem > 0 records
r = requests.get(
    f"{url}/rest/v1/daily_metrics?select=agent_id,report_date,prem_premium&report_date=gte.2026-04-01&report_date=lte.2026-04-29&prem_premium=gt.0",
    headers=headers
)
for m in r.json():
    name = id_to_name.get(m["agent_id"], "?")
    d = m["report_date"]
    if (name, d) not in target_prem:
        print(f"  Zeroing: {name:20s} {d}  SB=${float(m['prem_premium']):,.0f} (no AZ data)")
        r2 = requests.patch(
            f"{url}/rest/v1/daily_metrics?agent_id=eq.{m['agent_id']}&report_date=eq.{d}",
            headers=headers,
            json={"prem_premium": 0, "prem_items": 0, "prem_points": 0}
        )
        corrections += 1

# Verify
r = requests.get(
    f"{url}/rest/v1/daily_metrics?select=agent_id,items,prem_premium&report_date=gte.2026-04-01&report_date=lte.2026-04-29",
    headers=headers
)
total_items = sum(m.get("items") or 0 for m in r.json())
total_prem = sum(float(m.get("prem_premium") or 0) for m in r.json())
print(f"\nFinal totals:")
print(f"  Items MTD: {total_items} (target: 485)")
print(f"  Premium MTD: ${total_prem:,.0f} (target: $1,009,908)")
