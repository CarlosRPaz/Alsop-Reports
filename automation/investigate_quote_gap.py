"""
Investigate why DB quotes (1062) != DSR Quotes sheet (1216).
The gap = 154 quotes. Is it unmapped agents?
"""
import openpyxl
import requests
from collections import defaultdict, Counter
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

# Load agents from DB
res = requests.get(f"{URL}/rest/v1/agents?select=id,name&active=eq.true", headers=H)
agents = res.json()
db_agent_map = {a["name"]: a["id"] for a in agents}

def parse_date(val):
    if isinstance(val, datetime): return val
    if isinstance(val, str):
        for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
            try: return datetime.strptime(val.strip(), fmt)
            except: pass
    return None

def extract_agent_name(sub_producer):
    if not sub_producer: return None
    parts = str(sub_producer).split("-", 1)
    return parts[1].strip() if len(parts) > 1 else parts[0].strip()

print("Reading DSR Quotes sheet...")
wb = openpyxl.load_workbook(DSR_PATH, data_only=True, read_only=False)
ws = wb["Quotes"]

may_total = 0
mapped_total = 0
unmapped_counts = Counter()
unmapped_reasons = Counter()

for row in ws.iter_rows(min_row=2, values_only=True):
    raw_date = row[9]
    d = parse_date(raw_date)
    if not d or d.year != 2026 or d.month != 5: continue
    may_total += 1
    
    sub_producer = (row[1] or "").strip()
    excel_name = extract_agent_name(sub_producer)
    
    if not excel_name:
        unmapped_counts["(blank sub producer)"] += 1
        unmapped_reasons["blank_sub"] += 1
        continue
    
    db_name = NB_NAME_MAP.get(excel_name)
    if not db_name:
        first = excel_name.split()[0].title()
        db_name = first if first in db_agent_map else None
    
    if not db_name:
        unmapped_counts[excel_name] += 1
        unmapped_reasons["not_in_name_map"] += 1
        continue
    
    agent_id = db_agent_map.get(db_name)
    if not agent_id:
        unmapped_counts[f"{excel_name} -> {db_name}"] += 1
        unmapped_reasons["name_not_in_db"] += 1
        continue
    
    mapped_total += 1

wb.close()

unmapped_total = may_total - mapped_total

print(f"\n{'=' * 60}")
print(f"DSR Quotes Sheet - May 2026 Analysis")
print(f"{'=' * 60}")
print(f"Total May quotes in DSR:     {may_total}")
print(f"Successfully mapped:         {mapped_total}")
print(f"UNMAPPED (lost):             {unmapped_total}")
print(f"\nUnmapped breakdown:")
for reason, cnt in unmapped_reasons.most_common():
    print(f"  {reason}: {cnt}")

print(f"\nUnmapped agents (with counts):")
for name, cnt in unmapped_counts.most_common():
    print(f"  {name}: {cnt} quotes")

# Compare against DB
print(f"\n{'=' * 60}")
print(f"DB Comparison")
print(f"{'=' * 60}")
r = requests.get(
    f"{URL}/rest/v1/daily_metrics?select=quotes&report_date=gte.2026-05-01&report_date=lte.2026-05-31",
    headers=H
)
db_raw = sum(row["quotes"] or 0 for row in r.json())
print(f"DB raw quotes:               {db_raw}")
print(f"DSR mapped quotes:           {mapped_total}")
print(f"DSR total quotes:            {may_total}")
print(f"\nGap: DSR total ({may_total}) - DSR mapped ({mapped_total}) = {unmapped_total} unmapped")
print(f"Gap: DSR mapped ({mapped_total}) - DB raw ({db_raw}) = {mapped_total - db_raw}")
print(f"\nNote: DB 'quotes' comes from a DIFFERENT SOURCE (Quotes Detail Report downloads)")
print(f"The dedup script reads from DSR but only writes quotes_deduped, not raw quotes.")
print(f"\nTo fix: populate DB 'quotes' from the DSR Quotes sheet directly.")
