"""
Full comparison: Manual Excel 'Weekly' sheet vs Supabase DB for 05.04-05.10.
"""
import pandas as pd
import requests

# ── Load Supabase config ──
env_vars = {}
with open(r"C:\Users\scag3s29\Documents\Claude Scope\dsr-dashboard\.env.local") as f:
    for line in f:
        if "=" in line and not line.startswith("#"):
            key, val = line.strip().split("=", 1)
            env_vars[key] = val

SUPABASE_URL = env_vars["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = env_vars["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
HEADERS = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}

# ── Read Manual Excel Weekly sheet ──
EXCEL_PATH = r"C:\Users\scag3s29\Documents\Claude Scope\Daily Standup Report.xlsx"
df_excel = pd.read_excel(EXCEL_PATH, sheet_name="Weekly", header=2, engine="openpyxl")

# Clean column names
df_excel.columns = [str(c).strip() for c in df_excel.columns]
print("Excel columns:", list(df_excel.columns))

# The Name column is 'Name'
df_excel = df_excel.dropna(subset=["Name"])
df_excel = df_excel[df_excel["Name"] != ""]

# Show all columns we care about
print(f"\nExcel has {len(df_excel)} agents")

# ── Fetch DB data ──
WEEK_START = "2026-05-04"
WEEK_END = "2026-05-10"

res = requests.get(
    f"{SUPABASE_URL}/rest/v1/daily_metrics?report_date=gte.{WEEK_START}&report_date=lte.{WEEK_END}&select=*,agents(name,office)",
    headers=HEADERS
)
all_metrics = res.json()

# Aggregate DB data by agent name
db_agents = {}
for m in all_metrics:
    name = m.get("agents", {}).get("name", "")
    if not name:
        continue
    if name not in db_agents:
        db_agents[name] = {
            "calls": 0, "inbound": 0, "outbound": 0, "talk_time_seconds": 0,
            "texts": 0, "quotes": 0, "items": 0, "nb_count": 0,
            "prem_premium": 0, "prem_points": 0, "written_premium": 0,
            "office": m.get("agents", {}).get("office", "")
        }
    a = db_agents[name]
    a["calls"] += m.get("calls") or 0
    a["inbound"] += m.get("inbound") or 0
    a["outbound"] += m.get("outbound") or 0
    a["talk_time_seconds"] += m.get("talk_time_seconds") or 0
    a["texts"] += m.get("texts") or 0
    a["quotes"] += m.get("quotes") or 0
    a["items"] += m.get("items") or 0
    a["nb_count"] += m.get("nb_count") or 0
    a["prem_premium"] += float(m.get("prem_premium") or 0)
    a["prem_points"] += float(m.get("prem_points") or 0)
    a["written_premium"] += float(m.get("written_premium") or 0)

# Helper to convert talk time string to seconds
def talk_to_seconds(val):
    if pd.isna(val):
        return 0
    s = str(val)
    parts = s.split(":")
    if len(parts) == 3:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
    return 0

def seconds_to_hm(s):
    h = s // 3600
    m = (s % 3600) // 60
    return f"{h}:{m:02d}"

# ── Compare ──
# Map Excel columns to DB fields
# Excel: In Calls, Out Calls, Total Calls, Talk Time, Texts, Unique Leads, Rico Hot Pipeline,
#         #PIVOT, #SAVED, eAgent Dismissed To-do's, Past Due To-Do's, Rico Past Due Tasks
#         Auto Quotes, Written Premium Wk, MTD Total Premium, Auto Pts Wk, Prev Mo Pts, MTD Auto Items

# Find column names that contain keywords
excel_cols = list(df_excel.columns)
print("\nAll Excel columns:")
for i, c in enumerate(excel_cols):
    print(f"  [{i}] {c}")

# Build comparison
COMPARE_FIELDS = [
    # (label, excel_col, db_field, is_currency)
    ("In Calls", "In Calls", "inbound", False),
    ("Out Calls", "Out Calls", "outbound", False),
    ("Total Calls", "Total Calls", "calls", False),
    ("Talk Time", "Talk Time", None, False),  # special handling
    ("Texts", "Texts", "texts", False),
    ("Auto Quotes", "Auto Quotes", "quotes", False),
    ("Written Prem", "Total Written Premium Wk", "prem_premium", True),
    ("Auto Pts Wk", "Auto Pts Wk", "prem_points", False),
]

print("\n" + "=" * 130)
print("  WEEKLY COMPARISON: Manual Excel vs Dashboard DB (05.04 - 05.10)")
print("=" * 130)
print(f"  {'Agent':<15s} {'Metric':<15s} {'Excel':>10s} {'DB':>10s} {'Diff':>10s}  Status")
print("-" * 130)

diffs_found = 0
agents_checked = 0

for _, row in df_excel.iterrows():
    name = str(row["Name"]).strip()
    if name not in db_agents:
        print(f"  {name:<15s} ** NOT IN DB **")
        continue
    
    db = db_agents[name]
    agents_checked += 1
    agent_has_diff = False
    
    for label, excel_col, db_field, is_curr in COMPARE_FIELDS:
        if excel_col not in df_excel.columns:
            continue
        
        excel_val = row.get(excel_col)
        if pd.isna(excel_val):
            excel_val = 0
        
        if label == "Talk Time":
            # Special: compare talk time
            excel_secs = talk_to_seconds(excel_val)
            db_secs = db["talk_time_seconds"]
            excel_str = seconds_to_hm(excel_secs)
            db_str = seconds_to_hm(db_secs)
            diff_secs = db_secs - excel_secs
            if abs(diff_secs) > 60:  # Allow 1 min tolerance
                print(f"  {name:<15s} {'Talk Time':<15s} {excel_str:>10s} {db_str:>10s} {diff_secs//60:>+9d}m  ** DIFF")
                diffs_found += 1
                agent_has_diff = True
        elif is_curr:
            ev = float(excel_val)
            dv = float(db.get(db_field, 0))
            diff = dv - ev
            if abs(diff) > 1:
                print(f"  {name:<15s} {label:<15s} ${ev:>9,.0f} ${dv:>9,.0f} ${diff:>+9,.0f}  ** DIFF")
                diffs_found += 1
                agent_has_diff = True
        else:
            ev = int(float(excel_val))
            dv = int(db.get(db_field, 0))
            diff = dv - ev
            if diff != 0:
                print(f"  {name:<15s} {label:<15s} {ev:>10d} {dv:>10d} {diff:>+10d}  ** DIFF")
                diffs_found += 1
                agent_has_diff = True

print("\n" + "=" * 130)
print(f"  Summary: {agents_checked} agents compared, {diffs_found} differences found")
print("=" * 130)
