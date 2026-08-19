"""
Investigate Christian Reyes quote count gap.
Manual file shows 53 quotes (COUNTIFS from QDR + "Closed without serious Quote" from NB).
Our DB may not include the "Closed without serious Quote" additions.
"""
import openpyxl
import pandas as pd
import requests
from datetime import datetime

DSR_PATH = r"c:\Users\scag3s29\Documents\Claude Scope\Daily Standup Report.xlsx"
QDR_PATH = r"c:\Users\scag3s29\Documents\Claude Scope\Quotes Detail Report__New Business Detail.xlsx"
URL = "https://xejmpdfqaghamemjrhxa.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhlam1wZGZxYWdoYW1lbWpyaHhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NTkxMTUsImV4cCI6MjA5MjAzNTExNX0.0m_8BHyk-2dVZUjCme-yDXwrpswhpBi8gFZVTdIyWOc"
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}

# 1. Count Christian's quotes in DSR Quotes sheet
print("=" * 60)
print("SOURCE 1: DSR Quotes sheet")
print("=" * 60)
wb = openpyxl.load_workbook(DSR_PATH, data_only=True, read_only=False)
ws = wb["Quotes"]

christian_dsr = 0
christian_dsr_rows = []
for row in ws.iter_rows(min_row=2, values_only=True):
    sub = (row[1] or "").strip()
    if "CHRISTIAN REYES" not in sub.upper():
        continue
    raw_date = row[9]
    if isinstance(raw_date, datetime):
        d = raw_date
    elif isinstance(raw_date, str):
        try: d = datetime.strptime(raw_date.strip(), "%m/%d/%Y")
        except: continue
    else:
        continue
    if d.year != 2026 or d.month != 5:
        continue
    christian_dsr += 1
    christian_dsr_rows.append({
        "sub": sub,
        "qcn": (row[2] or ""),
        "first": (row[3] or ""),
        "last": (row[4] or ""),
        "date": d.strftime("%Y-%m-%d"),
    })

wb.close()
print(f"Christian in DSR Quotes: {christian_dsr}")

# 2. Count in QDR (Quotes Detail Report)
print(f"\n{'=' * 60}")
print("SOURCE 2: Quotes Detail Report (QDR)")
print("=" * 60)

df_q = pd.read_excel(QDR_PATH, sheet_name="P&C Total Serious Quotes Detail", header=6, engine="openpyxl")
df_q.columns = [str(c).strip() for c in df_q.columns]
df_q["Production Date"] = pd.to_datetime(df_q["Production Date"], errors="coerce")
may_q = df_q[(df_q["Production Date"].dt.year == 2026) & (df_q["Production Date"].dt.month == 5)]

christian_qdr = may_q[may_q["Sub Producer"].str.contains("CHRISTIAN REYES", case=False, na=False)]
print(f"Christian in QDR Quotes: {len(christian_qdr)}")

# 3. Check "Closed without serious Quote" in NB sheet
print(f"\n{'=' * 60}")
print("SOURCE 3: NB sheet - 'Closed without serious quote'")
print("=" * 60)

df_nb = pd.read_excel(QDR_PATH, sheet_name="New Business", header=4, engine="openpyxl")
df_nb.columns = [str(c).strip() for c in df_nb.columns]
# Check for the column
cwsq_col = [c for c in df_nb.columns if "closed without" in c.lower()]
print(f"Columns matching 'closed without': {cwsq_col}")

df_nb["Issued Date"] = pd.to_datetime(df_nb["Issued Date"], errors="coerce")
may_nb = df_nb[(df_nb["Issued Date"].dt.year == 2026) & (df_nb["Issued Date"].dt.month == 5)]

if cwsq_col:
    col = cwsq_col[0]
    # For Christian
    christian_nb = may_nb[
        may_nb["Sub-Producer Name"].str.contains("CHRISTIAN", case=False, na=False) |
        may_nb["Bind ID Name"].str.contains("CHRISTIAN", case=False, na=False)
    ]
    christian_cwsq = christian_nb[christian_nb[col].notna() & (christian_nb[col] != 0) & (christian_nb[col] != "")]
    print(f"Christian NB rows with 'Closed without serious quote': {len(christian_cwsq)}")
    if len(christian_cwsq) > 0:
        print(f"  Values: {christian_cwsq[col].tolist()}")
        print(f"  Sum: {christian_cwsq[col].sum()}")
    
    # For all agents
    all_cwsq = may_nb[may_nb[col].notna() & (may_nb[col] != 0) & (may_nb[col] != "")]
    print(f"\nAll agents with 'Closed without serious quote' in May:")
    if len(all_cwsq) > 0:
        by_agent = all_cwsq.groupby("Sub-Producer Name")[col].sum()
        for agent, cnt in by_agent.items():
            print(f"  {agent}: {cnt}")
        print(f"  TOTAL: {all_cwsq[col].sum()}")

# 4. DB count
print(f"\n{'=' * 60}")
print("SOURCE 4: Database")  
print("=" * 60)

# Get Christian's agent_id
r = requests.get(f"{URL}/rest/v1/agents?name=eq.Christian&select=id,name", headers=H)
christian_agent = r.json()
if christian_agent:
    cid = christian_agent[0]["id"]
    r2 = requests.get(
        f"{URL}/rest/v1/daily_metrics?agent_id=eq.{cid}&report_date=gte.2026-05-01&report_date=lte.2026-05-31&select=report_date,quotes,quotes_deduped",
        headers=H
    )
    db_rows = r2.json()
    db_raw = sum(r["quotes"] or 0 for r in db_rows)
    db_ded = sum(r["quotes_deduped"] or 0 for r in db_rows)
    print(f"Christian in DB: {db_raw} raw, {db_ded} deduped")

print(f"\n{'=' * 60}")
print("SUMMARY")
print("=" * 60)
print(f"  DSR Quotes sheet:              {christian_dsr}")
print(f"  QDR Quotes Detail:             {len(christian_qdr)}")
if cwsq_col and len(christian_cwsq) > 0:
    cwsq_val = int(christian_cwsq[cwsq_col[0]].sum())
    print(f"  + Closed w/o serious quote:    {cwsq_val}")
    print(f"  Manual total (QDR + CWSQ):     {len(christian_qdr) + cwsq_val}")
print(f"  DB raw:                        {db_raw}")
print(f"  DB deduped:                    {db_ded}")
