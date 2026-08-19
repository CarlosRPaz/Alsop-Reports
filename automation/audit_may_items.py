"""
Full audit: compare DSR NB sheet vs DB for May 2026, day by day.
Shows exactly where the gaps are.
"""
import openpyxl
import requests
from collections import defaultdict
from datetime import datetime

DSR_PATH = r"c:\Users\scag3s29\Documents\Claude Scope\Daily Standup Report.xlsx"
URL = "https://xejmpdfqaghamemjrhxa.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhlam1wZGZxYWdoYW1lbWpyaHhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NTkxMTUsImV4cCI6MjA5MjAzNTExNX0.0m_8BHyk-2dVZUjCme-yDXwrpswhpBi8gFZVTdIyWOc"
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}

NB_NAME_MAP = {
    "ARIANA CRAWFORD": "Ariana", "BRIGILDA AQUINO": "Gilda",
    "CHARMAINE CARRILLO": "Charmaine", "CHRIS ELLIOTT": "Chris",
    "CHRISTIAN REYES": "Christian", "CLAUDIA SAMBRANO": "Claudia",
    "DANIELLE SELF": "Danielle", "DENICE SANTOS": "Denice",
    "EDDIE CONTRERAS": "Eddie", "EDWIN SERNAS": "Edwin",
    "ESTELA JIMENEZ": "Estela", "ESTELA MONTALVO": "Estela",
    "FRANK VILLALOBOS": "Frank", "GISELLE RAMOS": "Giselle",
    "HERIBERTO JR SANCHEZ": "Eddie", "HRACH KOSYAN": "Hrach",
    "ISABEL TORRES": "Isabel", "JENNA ZAZUETA": "Jenna",
    "JENNIFER MARTINEZ": "Jenna",
    "JEROME DELFIN": "Jerome", "JESSIE MARTINEZ": "Jessie",
    "JONATHAN JIMENEZ": "Jonathan", "JOSE HUERTA": "Jose",
    "JUANA CALDERON": "Juanita", "LILIANA CAMACHO": "Liliana",
    "LILIANA MORALES": "Liliana",
    "MAILA CASTRO": "Maila", "MARLON BONILLA": "Danny",
    "MISTY BARAJAS": "Misty", "MYLES VINLUAN": "Myles",
    "NANCY AMAYA": "Nancy", "ROBERT LEWIS": "Robert",
    "RICARDO BECERRA": "Robert",
    "ROSALBA LOZANO": "Rosalba", "ROSARIO DELGADO": "Rosalba",
    "ROSIE GONZALEZ": "Rosie",
    "SUZANNE VILLALOBOS": "Suzanne", "SYLVIA LOPEZ": "Sylvia",
    "TEYSSY ESPINO": "Jessie",
    "YESSENIA PEDROZA-CHAVEZ": "Jessie",
}

def parse_date(val):
    if isinstance(val, datetime): return val
    if isinstance(val, str):
        for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m-%d-%Y"):
            try: return datetime.strptime(val.strip(), fmt)
            except: pass
    return None

# ── 1. Parse DSR NB Sheet ──
print("=" * 60)
print("READING DSR NB SHEET...")
print("=" * 60)
wb = openpyxl.load_workbook(DSR_PATH, data_only=True, read_only=False)
ws = wb["NB"]

excel_by_day = defaultdict(lambda: {"policies": 0, "items": 0})
excel_unmapped = defaultdict(int)
excel_blank = defaultdict(int)
total_may_rows = 0

for row in ws.iter_rows(min_row=2, values_only=True):
    excel_name = (row[2] or "").strip()
    raw_date = row[7]
    item_count = row[14] or 0

    issued_date = parse_date(raw_date)
    if not issued_date: continue
    if issued_date.year != 2026 or issued_date.month != 5: continue
    
    total_may_rows += 1
    
    # Fallback for blank names
    if not excel_name:
        excel_name = (row[4] or "").strip()
    
    if not excel_name:
        d = issued_date.strftime("%Y-%m-%d")
        excel_blank[d] += 1
        # Still count toward day totals
        excel_by_day[d]["policies"] += 1
        excel_by_day[d]["items"] += item_count
        continue
    
    db_name = NB_NAME_MAP.get(excel_name)
    if not db_name:
        first = excel_name.split()[0].title()
        db_name = first  # try first name
    
    d = issued_date.strftime("%Y-%m-%d")
    excel_by_day[d]["policies"] += 1
    excel_by_day[d]["items"] += item_count

wb.close()

print(f"Total May NB rows in DSR: {total_may_rows}")
if excel_blank:
    print(f"Rows with blank names (even after Bind ID fallback): {dict(excel_blank)}")

# ── 2. Fetch DB ──
print("\n" + "=" * 60)
print("READING SUPABASE DB...")
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

# ── 3. Compare ──
print("\n" + "=" * 60)
print("DAY-BY-DAY COMPARISON")
print("=" * 60)
all_days = sorted(set(list(excel_by_day.keys()) + list(db_by_day.keys())))

total_excel_pol = 0
total_excel_items = 0
total_db_pol = 0
total_db_items = 0

print(f"{'Date':<12} | {'Excel Pol':<10} {'Excel Items':<12} | {'DB Pol':<10} {'DB Items':<10} | {'Diff Pol':<10} {'Diff Items':<10}")
print("-" * 90)

for d in all_days:
    ep = excel_by_day[d]["policies"]
    ei = excel_by_day[d]["items"]
    dp = db_by_day[d]["policies"]
    di = db_by_day[d]["items"]
    
    total_excel_pol += ep
    total_excel_items += ei
    total_db_pol += dp
    total_db_items += di
    
    flag = ""
    if ep != dp or ei != di:
        flag = " <-- MISMATCH"
    if dp == 0 and ep > 0:
        flag = " <-- MISSING IN DB"
    
    print(f"{d:<12} | {ep:<10} {ei:<12} | {dp:<10} {di:<10} | {ep-dp:<10} {ei-di:<10}{flag}")

print("-" * 90)
print(f"{'TOTAL':<12} | {total_excel_pol:<10} {total_excel_items:<12} | {total_db_pol:<10} {total_db_items:<10} | {total_excel_pol-total_db_pol:<10} {total_excel_items-total_db_items:<10}")

if total_excel_items != total_db_items:
    print(f"\n*** GAP: Excel has {total_excel_items} items, DB has {total_db_items} items. Missing {total_excel_items - total_db_items} items. ***")
else:
    print(f"\n✓ Items match perfectly: {total_excel_items}")
