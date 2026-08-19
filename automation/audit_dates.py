"""
Check how many dates have data in Supabase for April 2026
"""
import os, json, requests

def load_config():
    with open("config/config.json") as f:
        return json.load(f)

config = load_config()
url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or config.get("supabase", {}).get("url")
key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") or config.get("supabase", {}).get("key")
headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}

# Get distinct dates in April 
r = requests.get(
    f"{url}/rest/v1/daily_metrics?select=report_date&report_date=gte.2026-04-01&report_date=lte.2026-04-30&order=report_date",
    headers=headers
)
dates = sorted(set(m["report_date"] for m in r.json()))
print(f"Dates with data in Supabase (April 2026): {len(dates)}")
for d in dates:
    # Count agents with items > 0 for each date
    r2 = requests.get(
        f"{url}/rest/v1/daily_metrics?select=items,prem_premium&report_date=eq.{d}&items=gt.0",
        headers=headers
    )
    items_total = sum(m.get("items", 0) or 0 for m in r2.json())
    prem_total = sum(float(m.get("prem_premium", 0) or 0) for m in r2.json())
    print(f"  {d}: {len(r2.json())} agents with items > 0, total items={items_total}, prem=${prem_total:,.0f}")

# Now check the Premium sheet dates
import pandas as pd
DSR_PATH = r"C:\Users\scag3s29\Documents\Claude Scope\Daily Standup Report.xlsx"
prem_df = pd.read_excel(DSR_PATH, sheet_name="Premium")
prem_df["DateOnly"] = pd.to_datetime(prem_df["Date"]).dt.date

from datetime import date
april_prem = prem_df[(prem_df["DateOnly"] >= date(2026,4,1)) & (prem_df["DateOnly"] <= date(2026,4,29))]
prem_dates = sorted(april_prem["DateOnly"].unique())
print(f"\nDates with Premium data in manual DSR (April): {len(prem_dates)}")
for d in prem_dates:
    day_data = april_prem[april_prem["DateOnly"] == d]
    items = int(day_data["Items"].sum())
    prem = float(day_data["Premium"].sum())
    print(f"  {d}: {len(day_data)} rows, items={items}, premium=${prem:,.0f}")

print(f"\nManual DSR total items April: {int(april_prem['Items'].sum())}")
print(f"Manual DSR total premium April: ${float(april_prem['Premium'].sum()):,.0f}")
