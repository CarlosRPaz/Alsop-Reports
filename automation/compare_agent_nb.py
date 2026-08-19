"""
Compare NB Policy and Items counts per agent between DSR Excel File and Supabase DB for May 2026.
"""
import openpyxl
import requests
from collections import defaultdict
from datetime import datetime

DSR_PATH = r"c:\Users\scag3s29\Documents\Claude Scope\Daily Standup Report.xlsx"
URL = "https://xejmpdfqaghamemjrhxa.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhlam1wZGZxYWdoYW1lbWpyaHhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NTkxMTUsImV4cCI6MjA5MjAzNTExNX0.0m_8BHyk-2dVZUjCme-yDXwrpswhpBi8gFZVTdIyWOc"
HEADERS = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

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
    "JEROME DELFIN": "Jerome", "JESSIE MARTINEZ": "Jessie",
    "JONATHAN JIMENEZ": "Jonathan", "JOSE HUERTA": "Jose",
    "JUANA CALDERON": "Juanita", "LILIANA CAMACHO": "Liliana",
    "MAILA CASTRO": "Maila", "MARLON BONILLA": "Danny",
    "MISTY BARAJAS": "Misty", "MYLES VINLUAN": "Myles",
    "NANCY AMAYA": "Nancy", "ROBERT LEWIS": "Robert",
    "ROSALBA LOZANO": "Rosalba", "ROSIE GONZALEZ": "Rosie",
    "SUZANNE VILLALOBOS": "Suzanne", "SYLVIA LOPEZ": "Sylvia",
    "YESSENIA PEDROZA-CHAVEZ": "Jessie",
}

def parse_date(val):
    if isinstance(val, datetime): return val
    if isinstance(val, str):
        for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
            try: return datetime.strptime(val.strip(), fmt)
            except: pass
    return None

# Fetch active agents
res = requests.get(f"{URL}/rest/v1/agents?select=id,name&active=eq.true", headers=HEADERS)
agents = res.json()
db_agent_map = {a["name"]: a["id"] for a in agents}
agent_id_to_name = {a["id"]: a["name"] for a in agents}

# 1. Parse DSR File
wb = openpyxl.load_workbook(DSR_PATH, data_only=True, read_only=False)
ws = wb["NB"]

excel_counts = defaultdict(lambda: {"policies": 0, "items": 0})
unmapped = set()

for row in ws.iter_rows(min_row=2, values_only=True):
    excel_name = (row[2] or "").strip()
    raw_date = row[7]
    item_count = row[14] or 0
    
    issued_date = parse_date(raw_date)
    if not issued_date: continue
    
    # Fallback for blank names
    if not excel_name:
        excel_name = (row[4] or "").strip()
    if not excel_name: continue
    if issued_date.year != 2026 or issued_date.month != 5: continue
    
    db_name = NB_NAME_MAP.get(excel_name)
    if not db_name:
        first = excel_name.split()[0].title()
        db_name = first if first in db_agent_map else None
    
    if not db_name:
        unmapped.add(excel_name)
        continue
    
    excel_counts[db_name]["policies"] += 1
    excel_counts[db_name]["items"] += item_count

wb.close()

# 2. Fetch DB Metrics
db_res = requests.get(
    f"{URL}/rest/v1/daily_metrics?select=agent_id,nb_count,items"
    f"&report_date=gte.2026-05-01&report_date=lte.2026-05-31",
    headers=HEADERS
)
db_rows = db_res.json()
db_counts = defaultdict(lambda: {"policies": 0, "items": 0})

for row in db_rows:
    aid = row["agent_id"]
    name = agent_id_to_name.get(aid, "Unknown")
    db_counts[name]["policies"] += row["nb_count"] or 0
    db_counts[name]["items"] += row["items"] or 0

# 3. Compare
all_names = sorted(set(excel_counts.keys()) | set(db_counts.keys()))

print("AGENT COMPARISON: EXCEL vs DB")
print(f"{'Agent':<20} | {'Excel Pol':<10} | {'DB Pol':<10} | {'Diff Pol':<10} || {'Excel Item':<10} | {'DB Item':<10} | {'Diff Item':<10}")
print("-" * 95)

total_excel_pol = 0
total_db_pol = 0
total_excel_item = 0
total_db_item = 0

for name in all_names:
    ep = excel_counts[name]["policies"]
    ei = excel_counts[name]["items"]
    dp = db_counts[name]["policies"]
    di = db_counts[name]["items"]
    
    total_excel_pol += ep
    total_db_pol += dp
    total_excel_item += ei
    total_db_item += di
    
    diff_p = ep - dp
    diff_i = ei - di
    
    flag = ""
    if diff_p != 0 or diff_i != 0:
        flag = " <--- MISMATCH"
        
    print(f"{name:<20} | {ep:<10} | {dp:<10} | {diff_p:<10} || {ei:<10} | {di:<10} | {diff_i:<10}{flag}")

print("-" * 95)
print(f"{'TOTAL':<20} | {total_excel_pol:<10} | {total_db_pol:<10} | {total_excel_pol-total_db_pol:<10} || {total_excel_item:<10} | {total_db_item:<10} | {total_excel_item-total_db_item:<10}")

if unmapped:
    print(f"\nWarning: Unmapped agents in Excel: {unmapped}")
