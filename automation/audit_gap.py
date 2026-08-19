"""
Quick check: what does DB have for May 2026 items, and what does the NB source file have?
"""
import requests
from collections import defaultdict
from pathlib import Path
import pandas as pd
from datetime import datetime

URL = "https://xejmpdfqaghamemjrhxa.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhlam1wZGZxYWdoYW1lbWpyaHhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NTkxMTUsImV4cCI6MjA5MjAzNTExNX0.0m_8BHyk-2dVZUjCme-yDXwrpswhpBi8gFZVTdIyWOc"
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}

# 1. What's in the DB right now?
print("=" * 60)
print("SUPABASE DB - May 2026 NB Items by Day")
print("=" * 60)
r = requests.get(
    f"{URL}/rest/v1/daily_metrics?select=report_date,nb_count,items"
    f"&report_date=gte.2026-05-01&report_date=lte.2026-05-31",
    headers=H
)
db_rows = r.json()
db_by_day = defaultdict(lambda: {"policies": 0, "items": 0})
for row in db_rows:
    d = row["report_date"]
    db_by_day[d]["policies"] += row["nb_count"] or 0
    db_by_day[d]["items"] += row["items"] or 0

total_db_items = 0
total_db_pol = 0
for d in sorted(db_by_day):
    if db_by_day[d]["items"] > 0 or db_by_day[d]["policies"] > 0:
        print(f"  {d}: {db_by_day[d]['policies']:>3} policies, {db_by_day[d]['items']:>3} items")
        total_db_items += db_by_day[d]["items"]
        total_db_pol += db_by_day[d]["policies"]
print(f"  TOTAL: {total_db_pol} policies, {total_db_items} items")

# 2. What NB files exist in the usual locations?
print("\n" + "=" * 60)
print("NB SOURCE FILES")
print("=" * 60)
nb_locations = [
    r"C:\Users\scag3s29\Downloads",
    r"c:\Users\scag3s29\Documents\Claude Scope",
    r"c:\Users\scag3s29\Documents\Claude Scope\excel-report-automation\data\raw",
]
for loc in nb_locations:
    p = Path(loc)
    if not p.exists():
        print(f"  {loc}: does not exist")
        continue
    nb_files = sorted(p.glob("New Business Details*"), key=lambda f: f.stat().st_mtime, reverse=True)
    if nb_files:
        for f in nb_files[:3]:
            mod = datetime.fromtimestamp(f.stat().st_mtime).strftime("%Y-%m-%d %H:%M")
            print(f"  {loc}:")
            print(f"    {f.name}  (modified: {mod}, size: {f.stat().st_size:,} bytes)")
            # Quick peek at the date range inside
            try:
                probe = pd.read_excel(str(f), engine="openpyxl", header=None, nrows=10)
                # Find header row
                header_row = 0
                for i in range(min(10, len(probe))):
                    vals = [str(v).strip() for v in probe.iloc[i] if pd.notna(v)]
                    if any("Sub-Producer Name" in v for v in vals):
                        header_row = i
                        break
                df = pd.read_excel(str(f), engine="openpyxl", header=header_row)
                df.columns = [str(c).strip() for c in df.columns]
                
                # Find date column
                for dc in ["Issued Date", "Date Written", "Date"]:
                    if dc in df.columns:
                        df[dc] = pd.to_datetime(df[dc], errors="coerce")
                        may_df = df[(df[dc].dt.year == 2026) & (df[dc].dt.month == 5)]
                        may_items = may_df["Item Count"].sum() if "Item Count" in df.columns else "?"
                        min_date = may_df[dc].min()
                        max_date = may_df[dc].max()
                        print(f"    May rows: {len(may_df)}, May items: {may_items}")
                        print(f"    Date range: {min_date} to {max_date}")
                        break
            except Exception as e:
                print(f"    (couldn't read: {e})")
    else:
        print(f"  {loc}: no NB files found")

print("\n" + "=" * 60)
print(f"GAP: DB has {total_db_items} items, target is 280. Missing: {280 - total_db_items}")
print("=" * 60)
