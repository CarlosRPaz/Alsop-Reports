"""Identify all dates missing leads data in Supabase since Jan 1, 2026."""
import json, requests
from datetime import date, timedelta

with open("config/config.json") as f:
    config = json.load(f)
url = config["supabase"]["url"]
key = config["supabase"]["key"]
headers = {"apikey": key, "Authorization": f"Bearer {key}"}

# Get all dates that have leads_snapshot rows
all_leads = []
offset = 0
while True:
    r = requests.get(
        f"{url}/rest/v1/leads_snapshot?select=report_date,contact,quoted,hot,xsale"
        f"&report_date=gte.2026-01-01&report_date=lte.2026-06-11&offset={offset}&limit=1000",
        headers=headers
    )
    batch = r.json()
    if not batch:
        break
    all_leads.extend(batch)
    if len(batch) < 1000:
        break
    offset += 1000

# Dates that have non-zero leads data
dates_with_data = set()
for row in all_leads:
    if (row.get("contact", 0) or 0) > 0 or (row.get("quoted", 0) or 0) > 0 or \
       (row.get("hot", 0) or 0) > 0 or (row.get("xsale", 0) or 0) > 0:
        dates_with_data.add(row["report_date"])

# Also check dates with ANY leads_snapshot rows (even zeros)
dates_with_any_rows = set(row["report_date"] for row in all_leads)

# Generate all weekdays from Jan 1 to Jun 11
all_dates = []
d = date(2026, 1, 1)
end = date(2026, 6, 11)
while d <= end:
    # Include all days (weekdays + weekends since leads snapshots run daily)
    all_dates.append(d.isoformat())
    d += timedelta(days=1)

# Find gaps
missing_any = sorted(set(all_dates) - dates_with_any_rows)
missing_nonzero = sorted(set(all_dates) - dates_with_data)

print(f"=== Leads Data Gap Analysis ===")
print(f"Total calendar days (Jan 1 - Jun 11): {len(all_dates)}")
print(f"Days with leads_snapshot rows: {len(dates_with_any_rows)}")
print(f"Days with non-zero leads data: {len(dates_with_data)}")
print(f"Days with NO leads_snapshot rows at all: {len(missing_any)}")
print(f"Days with NO non-zero leads data: {len(missing_nonzero)}")

# Show missing dates grouped by month
print(f"\n=== Missing Dates (no leads rows at all) ===")
for month in range(1, 7):
    month_missing = [d for d in missing_any if d.startswith(f"2026-{month:02d}")]
    if month_missing:
        print(f"\n  2026-{month:02d} ({len(month_missing)} missing):")
        for d in month_missing:
            print(f"    {d}")

print(f"\n=== Dates with leads rows but ALL zeros ===")
zeros_only = sorted(dates_with_any_rows - dates_with_data)
for month in range(1, 7):
    month_zeros = [d for d in zeros_only if d.startswith(f"2026-{month:02d}")]
    if month_zeros:
        print(f"  2026-{month:02d}: {month_zeros}")

# Total missing dates that need backfill
all_missing = sorted(set(missing_any) | set(zeros_only))
print(f"\n=== TOTAL dates needing leads backfill: {len(all_missing)} ===")
for d in all_missing:
    print(f"  {d}")
