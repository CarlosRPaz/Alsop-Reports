"""Fix missing 5/12 and 5/5 discrepancy by re-syncing from DSR file"""
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
    "ESTELA JIMENEZ": "Estela", "FRANK VILLALOBOS": "Frank",
    "GISELLE RAMOS": "Giselle", "HERIBERTO JR SANCHEZ": "Eddie",
    "HRACH KOSYAN": "Hrach", "ISABEL TORRES": "Isabel",
    "JENNA ZAZUETA": "Jenna", "JEROME DELFIN": "Jerome",
    "JESSIE MARTINEZ": "Jessie", "JONATHAN JIMENEZ": "Jonathan",
    "JOSE HUERTA": "Jose", "JUANA CALDERON": "Juanita",
    "LILIANA CAMACHO": "Liliana", "MAILA CASTRO": "Maila",
    "MARLON BONILLA": "Danny", "MISTY BARAJAS": "Misty",
    "MYLES VINLUAN": "Myles", "NANCY AMAYA": "Nancy",
    "ROBERT LEWIS": "Robert", "ROSALBA LOZANO": "Rosalba",
    "ROSIE GONZALEZ": "Rosie", "SUZANNE VILLALOBOS": "Suzanne",
    "SYLVIA LOPEZ": "Sylvia", "YESSENIA PEDROZA-CHAVEZ": "Jessie",
}

def parse_date(val):
    if isinstance(val, datetime): return val
    if isinstance(val, str):
        for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
            try: return datetime.strptime(val.strip(), fmt)
            except: pass
    return None

# Load agents
res = requests.get(f"{URL}/rest/v1/agents?select=id,name&active=eq.true",
                   headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
agents = res.json()
db_agent_map = {a["name"]: a["id"] for a in agents}
agent_id_to_name = {a["id"]: a["name"] for a in agents}

# Read DSR NB - ALL May data (use DSR as source of truth since it has 203 items)
wb = openpyxl.load_workbook(DSR_PATH, data_only=True, read_only=False)
ws = wb["NB"]

nb_data = defaultdict(lambda: {"nb": 0, "items": 0})
unmapped = set()

for row in ws.iter_rows(min_row=2, values_only=True):
    excel_name = (row[2] or "").strip()
    raw_date = row[7]
    item_count = row[14] or 0
    
    issued_date = parse_date(raw_date)
    if not issued_date or not excel_name: continue
    if issued_date.year != 2026 or issued_date.month != 5: continue
    
    db_name = NB_NAME_MAP.get(excel_name)
    if not db_name:
        first = excel_name.split()[0].title()
        db_name = first if first in db_agent_map else None
    if not db_name:
        unmapped.add(excel_name)
        continue
    
    agent_id = db_agent_map.get(db_name)
    if not agent_id:
        unmapped.add(f"{excel_name} -> {db_name}")
        continue
    
    date_str = issued_date.strftime("%Y-%m-%d")
    nb_data[(agent_id, date_str)]["nb"] += 1
    nb_data[(agent_id, date_str)]["items"] += item_count

wb.close()

if unmapped:
    print(f"WARNING unmapped: {unmapped}")

# Preview
total_nb = sum(v["nb"] for v in nb_data.values())
total_items = sum(v["items"] for v in nb_data.values())
print(f"DSR NB: {total_nb} policies, {total_items} items, {len(nb_data)} agent-days")

by_date = defaultdict(lambda: {"nb": 0, "items": 0})
for (aid, d), v in nb_data.items():
    by_date[d]["nb"] += v["nb"]
    by_date[d]["items"] += v["items"]

for d in sorted(by_date):
    print(f"  {d}: {by_date[d]['nb']} policies, {by_date[d]['items']} items")

# Write ALL to DB
print("\n--- WRITING ALL MAY NB TO DB ---")
success = 0
errors = 0
for (agent_id, date_str), v in nb_data.items():
    resp = requests.patch(
        f"{URL}/rest/v1/daily_metrics?agent_id=eq.{agent_id}&report_date=eq.{date_str}",
        json={"nb_count": v["nb"], "items": v["items"], "updated_at": datetime.now().isoformat()},
        headers=HEADERS
    )
    if resp.status_code in (200, 204):
        success += 1
    else:
        name = agent_id_to_name.get(agent_id, "?")
        print(f"  ERROR {date_str} {name}: {resp.status_code} {resp.text}")
        errors += 1

print(f"Done! {success} updated, {errors} errors.")
