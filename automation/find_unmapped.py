"""Find the specific unmapped policies on 5/5 and 5/12"""
import openpyxl
from datetime import datetime

DSR_PATH = r"c:\Users\scag3s29\Documents\Claude Scope\Daily Standup Report.xlsx"

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

wb = openpyxl.load_workbook(DSR_PATH, data_only=True, read_only=False)
ws = wb["NB"]

print("=== ALL May 2026 records in DSR NB sheet ===")
all_may = []
for row in ws.iter_rows(min_row=2, values_only=True):
    d = parse_date(row[7])
    if d and d.year == 2026 and d.month == 5:
        name = (row[2] or "").strip()
        items = row[14] or 0
        mapped = NB_NAME_MAP.get(name, "???UNMAPPED")
        all_may.append((d.strftime("%Y-%m-%d"), name, mapped, items))

# Show all, highlighting unmapped
for date, name, mapped, items in sorted(all_may):
    flag = " *** UNMAPPED" if mapped == "???UNMAPPED" else ""
    print(f"  {date} | {name:30s} -> {mapped:12s} | items={items}{flag}")

print(f"\nTotal: {len(all_may)} records, {sum(r[3] for r in all_may)} items")
unmapped = [r for r in all_may if r[2] == "???UNMAPPED"]
if unmapped:
    print(f"\nUNMAPPED: {len(unmapped)} records, {sum(r[3] for r in unmapped)} items:")
    for r in unmapped:
        print(f"  {r[0]} | {r[1]} | items={r[3]}")

wb.close()
