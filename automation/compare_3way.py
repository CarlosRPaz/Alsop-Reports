"""Fast 3-way comparison - correct header rows."""
import pandas as pd
import requests
from collections import defaultdict

QDR_PATH = r"c:\Users\scag3s29\Documents\Claude Scope\Quotes Detail Report__New Business Detail.xlsx"
URL = "https://xejmpdfqaghamemjrhxa.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhlam1wZGZxYWdoYW1lbWpyaHhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NTkxMTUsImV4cCI6MjA5MjAzNTExNX0.0m_8BHyk-2dVZUjCme-yDXwrpswhpBi8gFZVTdIyWOc"
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}

# ─── DB ───
r = requests.get(
    f"{URL}/rest/v1/daily_metrics?select=report_date,quotes,quotes_deduped,nb_count,items"
    f"&report_date=gte.2026-05-01&report_date=lte.2026-05-31", headers=H)
db_rows = r.json()
db_by_day = defaultdict(lambda: {"quotes": 0, "deduped": 0, "nb": 0, "items": 0})
for row in db_rows:
    d = row["report_date"]
    db_by_day[d]["quotes"] += row["quotes"] or 0
    db_by_day[d]["deduped"] += row["quotes_deduped"] or 0
    db_by_day[d]["nb"] += row["nb_count"] or 0
    db_by_day[d]["items"] += row["items"] or 0

# ─── QDR Quotes (header at row 6, 0-indexed) ───
df_q = pd.read_excel(QDR_PATH, sheet_name="P&C Total Serious Quotes Detail", header=6, engine="openpyxl")
df_q.columns = [str(c).strip() for c in df_q.columns]
print(f"QDR Quotes columns: {list(df_q.columns)}")

# The Date column
date_col = "Date" if "Date" in df_q.columns else [c for c in df_q.columns if "Date" in c][0]
print(f"Using: {date_col}")
df_q[date_col] = pd.to_datetime(df_q[date_col], errors="coerce")
may_q = df_q[(df_q[date_col].dt.year == 2026) & (df_q[date_col].dt.month == 5)]

# Check for a "counted" column (row 3 says col 14 is counted for reports)
print(f"\nColumn 14 name: {df_q.columns[14] if len(df_q.columns) > 14 else 'N/A'}")

qdr_q_by_day = {}
for d, grp in may_q.groupby(may_q[date_col].dt.date):
    qdr_q_by_day[str(d)] = len(grp)

# ─── QDR NB (header at row 4, 0-indexed) ───
df_nb = pd.read_excel(QDR_PATH, sheet_name="New Business", header=4, engine="openpyxl")
df_nb.columns = [str(c).strip() for c in df_nb.columns]
print(f"\nQDR NB columns: {list(df_nb.columns)}")

nb_date_col = "Issued Date" if "Issued Date" in df_nb.columns else "Date"
df_nb[nb_date_col] = pd.to_datetime(df_nb[nb_date_col], errors="coerce")
may_nb = df_nb[(df_nb[nb_date_col].dt.year == 2026) & (df_nb[nb_date_col].dt.month == 5)]

item_col = [c for c in df_nb.columns if "Item Count" in c]
item_col = item_col[0] if item_col else None

qdr_nb_by_day = {}
for d, grp in may_nb.groupby(may_nb[nb_date_col].dt.date):
    items = int(grp[item_col].sum()) if item_col else 0
    qdr_nb_by_day[str(d)] = {"pol": len(grp), "items": items}

# ─── DSR data (from earlier run) ───
dsr_quotes = {
    "2026-05-01": 116, "2026-05-02": 25, "2026-05-03": 2, "2026-05-04": 103,
    "2026-05-05": 122, "2026-05-06": 127, "2026-05-07": 111, "2026-05-08": 104,
    "2026-05-09": 20, "2026-05-11": 134, "2026-05-12": 107, "2026-05-13": 118,
    "2026-05-14": 127,
}

# ─── COMPARISON TABLE ───
print("\n" + "=" * 100)
print("QUOTES COMPARISON (May 2026)")
print("=" * 100)
print(f"{'Date':<12} | {'DB Raw':>7} {'DB Ded':>7} {'DSR':>7} {'QDR':>7} | {'DB-DSR':>7} {'DB-QDR':>7} {'DSR-QDR':>8}")
print("-" * 85)
t = {"db": 0, "dd": 0, "dsr": 0, "qdr": 0}
all_days = sorted(set(list(db_by_day.keys()) + list(dsr_quotes.keys()) + list(qdr_q_by_day.keys())))
for d in all_days:
    db = db_by_day[d]["quotes"]
    dd = db_by_day[d]["deduped"]
    dsr = dsr_quotes.get(d, 0)
    qdr = qdr_q_by_day.get(d, 0)
    t["db"] += db; t["dd"] += dd; t["dsr"] += dsr; t["qdr"] += qdr
    flag = " *" if db != dsr or dsr != qdr else ""
    print(f"{d:<12} | {db:>7} {dd:>7} {dsr:>7} {qdr:>7} | {db-dsr:>7} {db-qdr:>7} {dsr-qdr:>8}{flag}")
print("-" * 85)
print(f"{'TOTAL':<12} | {t['db']:>7} {t['dd']:>7} {t['dsr']:>7} {t['qdr']:>7} | {t['db']-t['dsr']:>7} {t['db']-t['qdr']:>7} {t['dsr']-t['qdr']:>8}")

print("\n" + "=" * 100)
print("NB COMPARISON (May 2026)")
print("=" * 100)
print(f"{'Date':<12} | {'DB Pol':>7} {'QDR Pol':>8} {'Diff':>6} | {'DB Itm':>7} {'QDR Itm':>8} {'Diff':>6}")
print("-" * 65)
tn = {"db_p": 0, "qdr_p": 0, "db_i": 0, "qdr_i": 0}
all_nb_days = sorted(set(list(db_by_day.keys()) + list(qdr_nb_by_day.keys())))
for d in all_nb_days:
    db_p = db_by_day[d]["nb"]
    db_i = db_by_day[d]["items"]
    qdr = qdr_nb_by_day.get(d, {"pol": 0, "items": 0})
    if db_p == 0 and qdr["pol"] == 0: continue
    tn["db_p"] += db_p; tn["qdr_p"] += qdr["pol"]; tn["db_i"] += db_i; tn["qdr_i"] += qdr["items"]
    flag = " *" if db_p != qdr["pol"] or db_i != qdr["items"] else ""
    print(f"{d:<12} | {db_p:>7} {qdr['pol']:>8} {db_p-qdr['pol']:>6} | {db_i:>7} {qdr['items']:>8} {db_i-qdr['items']:>6}{flag}")
print("-" * 65)
print(f"{'TOTAL':<12} | {tn['db_p']:>7} {tn['qdr_p']:>8} {tn['db_p']-tn['qdr_p']:>6} | {tn['db_i']:>7} {tn['qdr_i']:>8} {tn['db_i']-tn['qdr_i']:>6}")
