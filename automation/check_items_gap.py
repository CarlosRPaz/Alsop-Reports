import openpyxl
import requests
from collections import defaultdict
from datetime import datetime

EXCEL_PATH = r"c:\Users\scag3s29\Documents\Claude Scope\Quotes Detail Report__New Business Detail.xlsx"
URL = "https://xejmpdfqaghamemjrhxa.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhlam1wZGZxYWdoYW1lbWpyaHhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NTkxMTUsImV4cCI6MjA5MjAzNTExNX0.0m_8BHyk-2dVZUjCme-yDXwrpswhpBi8gFZVTdIyWOc"
HEADERS = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}

# Parse Excel - items per day
wb = openpyxl.load_workbook(EXCEL_PATH, read_only=True, data_only=True)
ws = wb["New Business"]

excel_by_day = defaultdict(lambda: {"policies": 0, "items": 0})
for row in ws.iter_rows(min_row=6, values_only=True):
    issued_date = row[7]  # Issued Date
    item_count = row[14]  # Item Count (column O, index 14)
    if not isinstance(issued_date, datetime):
        continue
    if issued_date.year == 2026 and issued_date.month == 5:
        d = issued_date.strftime("%Y-%m-%d")
        excel_by_day[d]["policies"] += 1
        excel_by_day[d]["items"] += (item_count or 0)

wb.close()

# Get DB items per day
res = requests.get(
    f"{URL}/rest/v1/daily_metrics?select=report_date,items,nb_count"
    f"&report_date=gte.2026-05-01&report_date=lte.2026-05-14",
    headers=HEADERS
)
db_rows = res.json()

db_by_day = defaultdict(lambda: {"items": 0, "nb_count": 0})
for r in db_rows:
    d = r["report_date"]
    db_by_day[d]["items"] += r["items"] or 0
    db_by_day[d]["nb_count"] += r["nb_count"] or 0

# Compare
all_dates = sorted(set(list(excel_by_day.keys()) + list(db_by_day.keys())))

print(f"{'Date':<12} {'Excel Pol':>10} {'Excel Items':>12} {'DB nb_count':>12} {'DB items':>10} {'Items Diff':>11}")
print("-" * 70)

total_excel_pol = 0
total_excel_items = 0
total_db_nb = 0
total_db_items = 0

for d in all_dates:
    ep = excel_by_day[d]["policies"]
    ei = excel_by_day[d]["items"]
    dn = db_by_day[d]["nb_count"]
    di = db_by_day[d]["items"]
    diff = ei - di
    flag = " ***" if diff != 0 else ""
    print(f"  {d:<10} {ep:>10} {ei:>12} {dn:>12} {di:>10} {diff:>+11}{flag}")
    total_excel_pol += ep
    total_excel_items += ei
    total_db_nb += dn
    total_db_items += di

print("-" * 70)
print(f"  {'TOTAL':<10} {total_excel_pol:>10} {total_excel_items:>12} {total_db_nb:>12} {total_db_items:>10} {total_excel_items - total_db_items:>+11}")
print(f"\nExcel max date: {max(excel_by_day.keys())}")
print(f"DB max date with data: {max(d for d in db_by_day if db_by_day[d]['items'] > 0 or db_by_day[d]['nb_count'] > 0)}")
