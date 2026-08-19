"""
Sync NB data from the DSR file's NB sheet into Supabase daily_metrics.
Handles both datetime and string date formats in column H.
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
    "ARIANA CRAWFORD": "Ariana",
    "BRIGILDA AQUINO": "Gilda",
    "CHARMAINE CARRILLO": "Charmaine",
    "CHRIS ELLIOTT": "Chris",
    "CHRISTIAN REYES": "Christian",
    "CLAUDIA SAMBRANO": "Claudia",
    "DANIELLE SELF": "Danielle",
    "DENICE SANTOS": "Denice",
    "EDDIE CONTRERAS": "Eddie",
    "EDWIN SERNAS": "Edwin",
    "ESTELA JIMENEZ": "Estela",
    "ESTELA MONTALVO": "Estela",
    "FRANK VILLALOBOS": "Frank",
    "GISELLE RAMOS": "Giselle",
    "HERIBERTO JR SANCHEZ": "Eddie",
    "HRACH KOSYAN": "Hrach",
    "ISABEL TORRES": "Isabel",
    "JENNA ZAZUETA": "Jenna",
    "JEROME DELFIN": "Jerome",
    "JESSIE MARTINEZ": "Jessie",
    "JONATHAN JIMENEZ": "Jonathan",
    "JOSE HUERTA": "Jose",
    "JUANA CALDERON": "Juanita",
    "LILIANA CAMACHO": "Liliana",
    "MAILA CASTRO": "Maila",
    "MARLON BONILLA": "Danny",
    "MISTY BARAJAS": "Misty",
    "MYLES VINLUAN": "Myles",
    "NANCY AMAYA": "Nancy",
    "ROBERT LEWIS": "Robert",
    "ROSALBA LOZANO": "Rosalba",
    "ROSIE GONZALEZ": "Rosie",
    "SUZANNE VILLALOBOS": "Suzanne",
    "SYLVIA LOPEZ": "Sylvia",
    "YESSENIA PEDROZA-CHAVEZ": "Jessie",
}

TARGET_YEAR = 2026
TARGET_MONTH = 5

def parse_date(val):
    """Parse date from either datetime object or string like '05/13/2026'"""
    if isinstance(val, datetime):
        return val
    if isinstance(val, str):
        for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m-%d-%Y"):
            try:
                return datetime.strptime(val.strip(), fmt)
            except ValueError:
                continue
    return None

# Load agents
res = requests.get(f"{URL}/rest/v1/agents?select=id,name&active=eq.true",
                   headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
agents = res.json()
db_agent_map = {a["name"]: a["id"] for a in agents}
agent_id_to_name = {a["id"]: a["name"] for a in agents}

# Parse DSR NB sheet
print("Reading DSR NB sheet...")
wb = openpyxl.load_workbook(DSR_PATH, data_only=True, read_only=False)
ws = wb["NB"]

nb_data = defaultdict(lambda: {"nb": 0, "items": 0})
unmapped = set()
parsed = 0
skipped_date = 0

for row in ws.iter_rows(min_row=2, values_only=True):
    excel_name = (row[2] or "").strip()
    raw_date = row[7]  # Date column H
    item_count = row[14] or 0  # Item Count column O
    
    issued_date = parse_date(raw_date)
    if not issued_date:
        skipped_date += 1
        continue
    
    # Fallback: if Sub-Producer Name is blank, use Bind ID Name (col 4)
    if not excel_name:
        excel_name = (row[4] or "").strip()
        if excel_name:
            print(f"  [fallback] Using Bind ID Name '{excel_name}' for row with date {raw_date}")
    if not excel_name:
        continue
    if issued_date.year != TARGET_YEAR or issued_date.month != TARGET_MONTH:
        continue
    
    db_name = NB_NAME_MAP.get(excel_name)
    if not db_name:
        first = excel_name.split()[0].title()
        if first in db_agent_map:
            db_name = first
        else:
            unmapped.add(excel_name)
            continue
    
    agent_id = db_agent_map.get(db_name)
    if not agent_id:
        unmapped.add(f"{excel_name} -> {db_name}")
        continue
    
    date_str = issued_date.strftime("%Y-%m-%d")
    nb_data[(agent_id, date_str)]["nb"] += 1
    nb_data[(agent_id, date_str)]["items"] += item_count
    parsed += 1

wb.close()

if unmapped:
    print(f"WARNING unmapped: {unmapped}")
print(f"Parsed {parsed} May records, skipped {skipped_date} rows with unparseable dates")

# Preview by day
total_nb = 0
total_items = 0
by_date = defaultdict(lambda: {"nb": 0, "items": 0})
for (aid, d), v in nb_data.items():
    by_date[d]["nb"] += v["nb"]
    by_date[d]["items"] += v["items"]
    total_nb += v["nb"]
    total_items += v["items"]

print(f"\n=== DSR NB SYNC PREVIEW ===")
for d in sorted(by_date.keys()):
    print(f"  {d}: {by_date[d]['nb']} policies, {by_date[d]['items']} items")
print(f"  TOTAL: {total_nb} policies, {total_items} items")
print(f"  {len(nb_data)} agent-day combinations\n")

# Write to DB (upsert: insert if missing, update if exists)
print("--- WRITING TO DB (upsert) ---")
upsert_headers = {**HEADERS, "Prefer": "resolution=merge-duplicates"}
success = 0
errors = 0
for (agent_id, date_str), v in nb_data.items():
    resp = requests.post(
        f"{URL}/rest/v1/daily_metrics?on_conflict=agent_id,report_date",
        json={
            "agent_id": agent_id,
            "report_date": date_str,
            "nb_count": v["nb"],
            "items": v["items"],
            "updated_at": datetime.now().isoformat(),
        },
        headers=upsert_headers
    )
    if resp.status_code in (200, 201, 204):
        success += 1
    else:
        name = agent_id_to_name.get(agent_id, "?")
        print(f"  ERROR {date_str} {name}: {resp.status_code} {resp.text}")
        errors += 1

print(f"\nDone! {success} rows upserted, {errors} errors.")
