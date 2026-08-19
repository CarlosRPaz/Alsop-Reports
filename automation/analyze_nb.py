import openpyxl
import requests
from collections import Counter, defaultdict
from datetime import datetime

wb = openpyxl.load_workbook(
    r"c:\Users\scag3s29\Documents\Claude Scope\Quotes Detail Report__New Business Detail.xlsx",
    read_only=True, data_only=True
)
ws = wb["New Business"]
rows = list(ws.iter_rows(min_row=6, values_only=True))

# Parse May 2026 NB by day and agent
may_by_agent_day = defaultdict(lambda: defaultdict(int))
may_by_agent = Counter()

for r in rows:
    issued_date = r[7]
    name = (r[2] or "").strip()
    if not name or not isinstance(issued_date, datetime):
        continue
    if issued_date.year == 2026 and issued_date.month == 5:
        date_str = issued_date.strftime("%Y-%m-%d")
        may_by_agent_day[name][date_str] += 1
        may_by_agent[name] += 1

print(f"Excel May 2026: {sum(may_by_agent.values())} total NB records, {len(may_by_agent)} agents\n")

# Get DB data
URL = "https://xejmpdfqaghamemjrhxa.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhlam1wZGZxYWdoYW1lbWpyaHhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NTkxMTUsImV4cCI6MjA5MjAzNTExNX0.0m_8BHyk-2dVZUjCme-yDXwrpswhpBi8gFZVTdIyWOc"
HEADERS = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}

res = requests.get(
    f"{URL}/rest/v1/agents?select=id,name&active=eq.true&order=name",
    headers=HEADERS
)
agents = res.json()
agent_map = {a["id"]: a["name"] for a in agents}

res = requests.get(
    f"{URL}/rest/v1/daily_metrics?select=agent_id,report_date,nb_count"
    f"&report_date=gte.2026-05-01&report_date=lte.2026-05-14",
    headers=HEADERS
)
db_rows = res.json()

# DB nb_count per agent per day
db_by_agent_day = defaultdict(lambda: defaultdict(int))
db_by_agent = defaultdict(int)
for r in db_rows:
    name = agent_map.get(r["agent_id"], "?")
    db_by_agent_day[name][r["report_date"]] += r["nb_count"] or 0
    db_by_agent[name] += r["nb_count"] or 0

# Build name mapping (Excel uses full uppercase, DB uses first name)
# Manual map from Excel full name -> DB name
name_map = {}
for excel_name in may_by_agent:
    parts = excel_name.split()
    first = parts[0].title() if parts else ""
    # Find matching DB agent
    for a in agents:
        db_first = a["name"].split()[0] if a["name"] else ""
        if db_first.lower() == first.lower():
            name_map[excel_name] = a["name"]
            break
    # Special cases
    if "BRIGILDA" in excel_name:
        name_map[excel_name] = "Gilda"
    if "HERIBERTO" in excel_name:
        name_map[excel_name] = "Robert"
    if "YESSENIA" in excel_name:
        name_map[excel_name] = "Jessie"
    if "JUANA" in excel_name:
        name_map[excel_name] = "Juanita"
    if "MARLON" in excel_name:
        name_map[excel_name] = "Danny"

print("=== MAY 2026 NB: Excel vs DB ===")
print(f"{'Excel Name':<28} {'DB Name':<15} {'Excel':>6} {'DB':>6} {'Diff':>6}")
print("-" * 65)

total_excel = 0
total_db = 0
for excel_name in sorted(may_by_agent.keys()):
    db_name = name_map.get(excel_name)
    excel_val = may_by_agent[excel_name]
    db_val = db_by_agent.get(db_name, 0) if db_name else 0
    diff = excel_val - db_val
    total_excel += excel_val
    total_db += db_val
    flag = " ***" if diff != 0 else ""
    mapped = db_name or "??? UNMAPPED"
    print(f"  {excel_name:<26} {mapped:<15} {excel_val:>6} {db_val:>6} {diff:>+6}{flag}")

print("-" * 65)
print(f"  {'TOTAL':<26} {'':<15} {total_excel:>6} {total_db:>6} {total_excel - total_db:>+6}")

# Show per-day breakdown for discrepancies
print("\n\n=== PER-DAY DETAIL (Excel NB by Issued Date) ===")
all_dates = sorted(set(d for agent in may_by_agent_day.values() for d in agent))
print(f"  {'Date':<12} {'NB Count':>8}")
print(f"  {'-'*12} {'-'*8}")
for d in all_dates:
    total = sum(may_by_agent_day[agent][d] for agent in may_by_agent_day)
    print(f"  {d:<12} {total:>8}")

wb.close()
