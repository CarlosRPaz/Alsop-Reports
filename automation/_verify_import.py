import pandas as pd
import json
import requests
import warnings
warnings.filterwarnings("ignore")

DSR_PATH = r"C:\Users\scag3s29\Documents\Claude Scope\Daily Standup Report.xlsx"

with open("config/config.json") as f:
    config = json.load(f)
url = config["supabase"]["url"]
key = config["supabase"]["key"]
headers = {"apikey": key, "Authorization": f"Bearer {key}"}

TARGET = "2026-06-03"

# 1. Check Excel DSR for June 3rd
df = pd.read_excel(DSR_PATH, sheet_name="DSR", header=2)
df = df.dropna(subset=["Date"])
df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
df = df.dropna(subset=["Date"])

june3 = df[df["Date"].dt.date.isoformat() == TARGET] if hasattr(df["Date"].dt.date, "isoformat") else df[df["Date"].dt.strftime("%Y-%m-%d") == TARGET]

print(f"=== Excel DSR for {TARGET} ===")
print(f"Rows: {len(june3)}")
if len(june3) > 0:
    cols = ["Date", "Agent", "Contact", "Quoted", "Hot", "x-sale"]
    existing = [c for c in cols if c in june3.columns]
    print(june3[existing].to_string())
    print(f"\nContact sum: {june3['Contact'].fillna(0).astype(float).sum()}")
    print(f"Quoted sum:  {june3['Quoted'].fillna(0).astype(float).sum()}")
    print(f"Hot sum:     {june3['Hot'].fillna(0).astype(float).sum()}")
    print(f"x-sale sum:  {june3['x-sale'].fillna(0).astype(float).sum()}")
else:
    print("  NO DATA for this date in Excel!")

# 2. Check Supabase leads_snapshot
print(f"\n=== Supabase leads_snapshot for {TARGET} ===")
r = requests.get(
    f"{url}/rest/v1/leads_snapshot?select=*&report_date=eq.{TARGET}",
    headers=headers
)
leads = r.json()
print(f"Rows: {len(leads)}")
if leads:
    for l in leads[:5]:
        print(f"  agent_id={l['agent_id'][:8]}... contact={l['contact']} quoted={l['quoted']} hot={l['hot']} xsale={l['xsale']}")

# 3. Check Supabase daily_metrics for that date
print(f"\n=== Supabase daily_metrics for {TARGET} ===")
r = requests.get(
    f"{url}/rest/v1/daily_metrics?select=agent_id,calls,outbound,texts,quotes&report_date=eq.{TARGET}",
    headers=headers
)
metrics = r.json()
print(f"Rows: {len(metrics)}")
if metrics:
    total_calls = sum(m.get("calls", 0) or 0 for m in metrics)
    print(f"Total calls: {total_calls}")

# 4. Check what dates around June 3rd look like
print(f"\n=== Dates around June 3rd in Excel ===")
for d in range(1, 8):
    target = f"2026-06-{d:02d}"
    day_df = df[df["Date"].dt.strftime("%Y-%m-%d") == target]
    if len(day_df) > 0:
        contact = day_df["Contact"].fillna(0).astype(float).sum()
        quoted = day_df["Quoted"].fillna(0).astype(float).sum()
        print(f"  {target}: {len(day_df)} rows  Contact={int(contact)}  Quoted={int(quoted)}")
    else:
        print(f"  {target}: NO DATA")

print(f"\n=== Dates around June 3rd in Supabase leads_snapshot ===")
for d in range(1, 8):
    target = f"2026-06-{d:02d}"
    r = requests.get(
        f"{url}/rest/v1/leads_snapshot?select=report_date&report_date=eq.{target}",
        headers=headers | {"Prefer": "count=exact", "Range": "0-0"}
    )
    count = r.headers.get("Content-Range", "?/?").split("/")[-1]
    print(f"  {target}: {count} rows")
