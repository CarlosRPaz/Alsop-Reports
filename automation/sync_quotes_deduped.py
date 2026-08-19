"""
Populate DB quotes from the DSR Quotes sheet, then run deduplication.
This replaces the existing quotes pipeline for the Quotes & NB report.

Steps:
1. Read all quotes from DSR Quotes sheet
2. Map agents (ROSARIO DELGADO → Rosie, unmapped → Other)
3. Write raw quote counts to daily_metrics.quotes
4. Run deduplication and write to daily_metrics.quotes_deduped
5. Store duplicate details in quote_duplicates
"""
import sys
import openpyxl
import requests
from collections import defaultdict, Counter
from datetime import datetime

DSR_PATH = r"c:\Users\scag3s29\Documents\Claude Scope\Daily Standup Report.xlsx"
URL = "https://xejmpdfqaghamemjrhxa.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhlam1wZGZxYWdoYW1lbWpyaHhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NTkxMTUsImV4cCI6MjA5MjAzNTExNX0.0m_8BHyk-2dVZUjCme-yDXwrpswhpBi8gFZVTdIyWOc"
HEADERS = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json",
           "Prefer": "resolution=merge-duplicates"}

# Agent name map
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
    "ROSARIO DELGADO": "Rosie",
    "SUZANNE VILLALOBOS": "Suzanne", "SYLVIA LOPEZ": "Sylvia",
    "YESSENIA PEDROZA-CHAVEZ": "Jessie",
    "ZYPHER SCHNAKENBERG": "Zypher", "WHITNEY POOLE": "Whitney",
    "ERIC ALSOP": "Other", "JENNIFER MARTINEZ": "Other",
    "RICARDO BECERRA": "Other", "JOHN DIZON": "Other",
}

TARGET_YEAR = 2026
TARGET_MONTH = int(sys.argv[1]) if len(sys.argv) > 1 else None
mode_label = f"{TARGET_YEAR}-{TARGET_MONTH:02d}" if TARGET_MONTH else f"{TARGET_YEAR} YTD"

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

# Load agents from DB
res = requests.get(f"{URL}/rest/v1/agents?select=id,name",
                   headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
agents = res.json()
db_agent_map = {a["name"]: a["id"] for a in agents}
agent_id_to_name = {a["id"]: a["name"] for a in agents}

OTHER_ID = db_agent_map.get("Other")
if not OTHER_ID:
    print("ERROR: 'Other' agent not found in DB!")
    sys.exit(1)
print(f"Other agent ID: {OTHER_ID}")

# ── Read all quotes ──
print(f"\nReading DSR Quotes sheet ({mode_label})...")
wb = openpyxl.load_workbook(DSR_PATH, data_only=True, read_only=False)
ws = wb["Quotes"]

raw_quotes = []
routed_to_other = 0
other_sources = Counter()

for row in ws.iter_rows(min_row=2, values_only=True):
    agent_number = (row[0] or "").strip()
    sub_producer = (row[1] or "").strip()
    quote_control_number = (row[2] or "").strip()
    first_name = (row[3] or "").strip().upper()
    last_name = (row[4] or "").strip().upper()
    address = (row[5] or "").strip().upper().replace("\n", "").replace("\r", "")
    raw_date = row[9]
    premium = row[12] or 0
    
    quote_date = parse_date(raw_date)
    if not quote_date:
        continue
    if quote_date.year != TARGET_YEAR:
        continue
    if TARGET_MONTH and quote_date.month != TARGET_MONTH:
        continue
    
    # Map agent
    excel_name = extract_agent_name(sub_producer)
    agent_id = None
    
    if excel_name:
        db_name = NB_NAME_MAP.get(excel_name)
        if not db_name:
            first = excel_name.split()[0].title()
            db_name = first if first in db_agent_map else None
        if db_name:
            agent_id = db_agent_map.get(db_name)
    
    # If still unmapped, route to Other
    if not agent_id:
        agent_id = OTHER_ID
        routed_to_other += 1
        other_sources[excel_name or sub_producer or "(blank)"] += 1
    
    dedup_key = f"{sub_producer}|{first_name}|{last_name}|{address}"
    
    raw_quotes.append({
        "agent_id": agent_id,
        "date": quote_date,
        "date_str": quote_date.strftime("%Y-%m-%d"),
        "month": quote_date.month,
        "dedup_key": dedup_key,
        "sub_producer": sub_producer,
        "first_name": first_name,
        "last_name": last_name,
        "address": address,
        "agent_number": agent_number,
        "quote_control_number": quote_control_number,
        "premium": premium,
    })

wb.close()

print(f"Total {mode_label} DSR quotes read: {len(raw_quotes)}")
print(f"Routed to Other: {routed_to_other}")
if other_sources:
    print(f"Other breakdown: {dict(other_sources.most_common(10))}")

# ── Read "Closed without serious quote" from QDR NB sheet ──
# These are NB policies that never appeared on the Quotes sheet.
# They must be added to the quote count so Close Rate is accurate.
import pandas as pd

QDR_PATH = r"c:\Users\scag3s29\Documents\Claude Scope\Quotes Detail Report__New Business Detail.xlsx"
print(f"\nReading QDR NB sheet for 'Closed without serious quote'...")

try:
    df_nb = pd.read_excel(QDR_PATH, sheet_name="New Business", header=4, engine="openpyxl")
    df_nb.columns = [str(c).strip() for c in df_nb.columns]
    
    cwsq_col = [c for c in df_nb.columns if "closed without" in c.lower()]
    if cwsq_col:
        col = cwsq_col[0]
        df_nb["Issued Date"] = pd.to_datetime(df_nb["Issued Date"], errors="coerce")
        
        # Filter to target period
        if TARGET_MONTH:
            mask = (df_nb["Issued Date"].dt.year == TARGET_YEAR) & (df_nb["Issued Date"].dt.month == TARGET_MONTH)
        else:
            mask = (df_nb["Issued Date"].dt.year == TARGET_YEAR)
        
        cwsq_rows = df_nb[mask & df_nb[col].notna() & (df_nb[col] != 0) & (df_nb[col] != "")]
        
        cwsq_added = 0
        for _, row in cwsq_rows.iterrows():
            cwsq_val = int(row[col])
            if cwsq_val <= 0:
                continue
            
            # Map agent from Sub-Producer Name
            sub_name = str(row.get("Sub-Producer Name", "") or "").strip()
            bind_name = str(row.get("Bind ID Name", "") or "").strip()
            agent_name = sub_name if sub_name else bind_name
            
            db_name = NB_NAME_MAP.get(agent_name.upper())
            if not db_name:
                first = agent_name.split()[0].title() if agent_name else ""
                db_name = first if first in db_agent_map else None
            
            agent_id = db_agent_map.get(db_name) if db_name else None
            if not agent_id:
                agent_id = OTHER_ID
            
            issued_date = row["Issued Date"]
            date_str = issued_date.strftime("%Y-%m-%d")
            
            # Add synthetic quote entries (1 per CWSQ count)
            for _ in range(cwsq_val):
                raw_quotes.append({
                    "agent_id": agent_id,
                    "date": issued_date.to_pydatetime(),
                    "date_str": date_str,
                    "month": issued_date.month,
                    "dedup_key": f"CWSQ|{agent_name}|{date_str}|{row.get('Policy No', '')}|{_}",
                    "sub_producer": f"CWSQ-{agent_name}",
                    "first_name": str(row.get("Customer Name", "")).strip().upper(),
                    "last_name": "",
                    "address": "",
                    "agent_number": "",
                    "quote_control_number": f"CWSQ-{row.get('Policy No', '')}",
                    "premium": 0,
                })
                cwsq_added += 1
        
        print(f"CWSQ entries added: {cwsq_added}")
        print(f"Total quotes after CWSQ: {len(raw_quotes)}")
    else:
        print("WARNING: 'Closed without serious quote' column not found in NB sheet")
except Exception as e:
    print(f"WARNING: Could not read QDR NB for CWSQ: {e}")

# ── STEP 1: Write raw quote counts to daily_metrics.quotes ──
print(f"\n{'=' * 60}")
print("STEP 1: Writing raw quote counts to daily_metrics.quotes")
print(f"{'=' * 60}")

raw_by_agent_date = defaultdict(int)
for q in raw_quotes:
    raw_by_agent_date[(q["agent_id"], q["date_str"])] += 1

print(f"Agent-day combos: {len(raw_by_agent_date)}")

success = 0
errors = 0
for (agent_id, date_str), count in raw_by_agent_date.items():
    resp = requests.post(
        f"{URL}/rest/v1/daily_metrics?on_conflict=agent_id,report_date",
        json={
            "agent_id": agent_id,
            "report_date": date_str,
            "quotes": count,
            "updated_at": datetime.now().isoformat(),
        },
        headers=HEADERS
    )
    if resp.status_code in (200, 201, 204):
        success += 1
    else:
        name = agent_id_to_name.get(agent_id, "?")
        print(f"  ERROR {date_str} {name}: {resp.status_code} {resp.text}")
        errors += 1

print(f"Raw quotes written: {success} upserted, {errors} errors.")

# Preview by month
raw_by_month = defaultdict(int)
for q in raw_quotes:
    raw_by_month[q["month"]] += 1
for m in sorted(raw_by_month):
    print(f"  {TARGET_YEAR}-{m:02d}: {raw_by_month[m]} raw quotes")

# ── STEP 2: Deduplication per month ──
print(f"\n{'=' * 60}")
print("STEP 2: Deduplication")
print(f"{'=' * 60}")

quotes_by_month = defaultdict(list)
for q in raw_quotes:
    quotes_by_month[q["month"]].append(q)

all_deduped = []
all_duplicate_records = []
grand_removed = 0

for month in sorted(quotes_by_month.keys()):
    month_quotes = quotes_by_month[month]
    report_month = f"{TARGET_YEAR}-{month:02d}"
    
    groups_by_key = defaultdict(list)
    for q in month_quotes:
        groups_by_key[q["dedup_key"]].append(q)
    
    month_deduped = []
    month_dup_records = []
    
    for key, quotes in groups_by_key.items():
        quotes.sort(key=lambda q: q["date"], reverse=True)
        kept = quotes[0]
        month_deduped.append(kept)
        
        if len(quotes) > 1:
            month_dup_records.append({
                "report_month": report_month,
                "dedup_key": key,
                "sub_producer": kept["sub_producer"],
                "first_name": kept["first_name"],
                "last_name": kept["last_name"],
                "address": kept["address"],
                "quote_date": kept["date_str"],
                "agent_number": kept["agent_number"],
                "quote_control_number": kept["quote_control_number"],
                "premium": float(kept["premium"]) if kept["premium"] else 0,
                "is_kept": True,
            })
            for removed in quotes[1:]:
                month_dup_records.append({
                    "report_month": report_month,
                    "dedup_key": key,
                    "sub_producer": removed["sub_producer"],
                    "first_name": removed["first_name"],
                    "last_name": removed["last_name"],
                    "address": removed["address"],
                    "quote_date": removed["date_str"],
                    "agent_number": removed["agent_number"],
                    "quote_control_number": removed["quote_control_number"],
                    "premium": float(removed["premium"]) if removed["premium"] else 0,
                    "is_kept": False,
                })
    
    month_removed = len(month_quotes) - len(month_deduped)
    grand_removed += month_removed
    print(f"  {report_month}: {len(month_quotes)} raw -> {len(month_deduped)} deduped ({month_removed} removed)")
    
    all_deduped.extend(month_deduped)
    all_duplicate_records.extend(month_dup_records)

print(f"\nTOTAL: {len(raw_quotes)} raw -> {len(all_deduped)} deduped ({grand_removed} removed)")

# ── STEP 3: Write quotes_deduped ──
print(f"\n{'=' * 60}")
print("STEP 3: Writing quotes_deduped")
print(f"{'=' * 60}")

deduped_by_agent_date = defaultdict(int)
for q in all_deduped:
    deduped_by_agent_date[(q["agent_id"], q["date_str"])] += 1

success2 = 0
errors2 = 0
for (agent_id, date_str), count in deduped_by_agent_date.items():
    resp = requests.post(
        f"{URL}/rest/v1/daily_metrics?on_conflict=agent_id,report_date",
        json={
            "agent_id": agent_id,
            "report_date": date_str,
            "quotes_deduped": count,
            "updated_at": datetime.now().isoformat(),
        },
        headers=HEADERS
    )
    if resp.status_code in (200, 201, 204):
        success2 += 1
    else:
        print(f"  ERROR: {resp.status_code} {resp.text}")
        errors2 += 1

print(f"quotes_deduped: {success2} upserted, {errors2} errors.")

# ── STEP 4: Write duplicate details ──
if all_duplicate_records:
    print(f"\n{'=' * 60}")
    print(f"STEP 4: Writing {len(all_duplicate_records)} duplicate records")
    print(f"{'=' * 60}")
    
    months_to_clear = sorted(set(r["report_month"] for r in all_duplicate_records))
    for rm in months_to_clear:
        requests.delete(
            f"{URL}/rest/v1/quote_duplicates?report_month=eq.{rm}",
            headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"}
        )
    print(f"  Cleared: {', '.join(months_to_clear)}")
    
    batch_success = 0
    for i in range(0, len(all_duplicate_records), 50):
        batch = all_duplicate_records[i:i+50]
        resp = requests.post(f"{URL}/rest/v1/quote_duplicates", json=batch, headers=HEADERS)
        if resp.status_code in (200, 201, 204):
            batch_success += len(batch)
        else:
            print(f"  ERROR batch {i}: {resp.status_code} {resp.text}")
    print(f"  quote_duplicates: {batch_success}/{len(all_duplicate_records)} inserted.")

# ── Summary ──
print(f"\n{'=' * 60}")
print(f"DONE!")
print(f"{'=' * 60}")
print(f"  Raw quotes written to DB:     {len(raw_quotes)}")
print(f"  Deduped quotes written to DB: {len(all_deduped)}")
print(f"  Duplicates removed:           {grand_removed}")
print(f"  Routed to 'Other':            {routed_to_other}")
