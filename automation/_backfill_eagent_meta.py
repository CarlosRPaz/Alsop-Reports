"""Backfill daily_reports_meta.eagent_submitted for all dates with eAgent data."""
import pandas as pd
import json
import requests
import warnings
from datetime import datetime

warnings.filterwarnings("ignore")

DSR_PATH = r"C:\Users\scag3s29\Documents\Claude Scope\Daily Standup Report.xlsx"

with open("config/config.json") as f:
    config = json.load(f)
url = config["supabase"]["url"]
key = config["supabase"]["key"]
headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates"
}

# Find all dates with eAgent data in the DSR
df = pd.read_excel(DSR_PATH, sheet_name="DSR", header=2)
df = df.dropna(subset=["Date"])
df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
df = df.dropna(subset=["Date"])
df2026 = df[df["Date"].dt.year == 2026]

eagent_mask = (
    (df2026["Dismissed To-Do's"].fillna(0).astype(float) > 0) |
    (df2026["Past Due To-Do's"].fillna(0).astype(float) > 0) |
    (df2026["Pivots"].fillna(0).astype(float) > 0)
)
eagent_dates = sorted(df2026[eagent_mask]["Date"].dt.date.unique())
print(f"Found {len(eagent_dates)} dates with eAgent data in Excel")

# Get existing meta records
r = requests.get(
    f"{url}/rest/v1/daily_reports_meta?select=report_date,eagent_submitted"
    f"&report_date=gte.2026-01-01&report_date=lte.2026-06-30",
    headers={k: v for k, v in headers.items() if k != "Prefer"}
)
existing = {m["report_date"]: m for m in r.json()}
print(f"Existing meta records: {len(existing)}")

# Build upsert payloads for dates missing meta or not marked as submitted
now_iso = datetime.utcnow().isoformat() + "Z"
payloads = []
for d in eagent_dates:
    ds = d.isoformat()
    existing_record = existing.get(ds)
    if not existing_record or not existing_record.get("eagent_submitted"):
        payloads.append({
            "report_date": ds,
            "eagent_submitted": True,
            "submitted_at": now_iso,
            "updated_at": now_iso
        })

print(f"Need to upsert {len(payloads)} meta records")

if payloads:
    # Upsert in batches
    BATCH_SIZE = 50
    success = 0
    errors = 0
    for i in range(0, len(payloads), BATCH_SIZE):
        batch = payloads[i:i + BATCH_SIZE]
        r = requests.post(
            f"{url}/rest/v1/daily_reports_meta?on_conflict=report_date",
            headers=headers,
            json=batch
        )
        if r.status_code < 400:
            success += len(batch)
        else:
            errors += len(batch)
            print(f"  ERROR: {r.text[:200]}")

    print(f"\nUpserted: {success}, Errors: {errors}")

# Verify
r = requests.get(
    f"{url}/rest/v1/daily_reports_meta?select=report_date,eagent_submitted"
    f"&eagent_submitted=eq.true&report_date=gte.2026-01-01&report_date=lte.2026-06-30",
    headers={k: v for k, v in headers.items() if k != "Prefer"}
)
final = r.json()
print(f"\nFinal: {len(final)} dates marked as eagent_submitted=true")
if final:
    dates = sorted([m["report_date"] for m in final])
    print(f"Range: {dates[0]} to {dates[-1]}")

print("\n✅ eAgent meta backfill complete!")
