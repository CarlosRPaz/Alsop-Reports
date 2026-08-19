"""
Targeted investigation for user-flagged issues:
1. Find the 1-item MTD difference (NB items)
2. Check Lori in RicoCH — she doesn't use Rico
3. Check Nancy — is it Gutierrez or Maldonado?
4. Check Juanita's Spine entry for Rico name
"""
import os, json, sys
import pandas as pd
import requests
import warnings
warnings.filterwarnings("ignore")
sys.stdout.reconfigure(encoding='utf-8')

DSR_PATH = r"C:\Users\scag3s29\Documents\Claude Scope\Daily Standup Report.xlsx"
REPORT_DATE = "2026-04-29"

def load_config():
    with open("config/config.json") as f:
        return json.load(f)

# ========================================
# INVESTIGATION 1: Find the 1-item difference
# ========================================
print("=" * 80)
print("  INVESTIGATION 1: Finding the 1-item NB MTD difference")
print("=" * 80)

# Read NB sheet
nb_df = pd.read_excel(DSR_PATH, sheet_name="NB")
nb_df["DateOnly"] = pd.to_datetime(nb_df["Date"]).dt.date

from datetime import date
april_nb = nb_df[(nb_df["DateOnly"] >= date(2026,4,1)) & (nb_df["DateOnly"] <= date(2026,4,29))]

# Read Spine for name mapping
spine_df = pd.read_excel(DSR_PATH, sheet_name="Spine")
nb_name_map = {}
for _, row in spine_df.iterrows():
    if pd.notna(row.get("NB Sub-Producer Name")):
        nb_name_map[str(row["NB Sub-Producer Name"]).strip()] = row["Agent"]

# Count NB items per agent from the NB sheet
nb_items_by_agent = {}
unmatched_nb = []
for _, row in april_nb.iterrows():
    sub_prod = str(row.get("Sub-Producer Name", "")).strip()
    agent = nb_name_map.get(sub_prod)
    if agent:
        nb_items_by_agent[agent] = nb_items_by_agent.get(agent, 0) + 1
    else:
        unmatched_nb.append(sub_prod)

# NB has one row per policy, so count = items
nb_mtd_total = sum(nb_items_by_agent.values())
print(f"\nNB items MTD from Excel (April 1-29): {nb_mtd_total}")
print(f"Unmatched NB producers: {set(unmatched_nb)}")

# Now check NB items per agent on 4/29 specifically
april29_nb = nb_df[nb_df["DateOnly"] == date(2026,4,29)]
nb_daily_items = {}
for _, row in april29_nb.iterrows():
    sub_prod = str(row.get("Sub-Producer Name", "")).strip()
    agent = nb_name_map.get(sub_prod)
    if agent:
        nb_daily_items[agent] = nb_daily_items.get(agent, 0) + 1

print(f"\nNB items for 4/29:")
for agent in sorted(nb_daily_items.keys()):
    print(f"  {agent}: {nb_daily_items[agent]}")
print(f"  Total: {sum(nb_daily_items.values())}")

# Get Supabase items for comparison
config = load_config()
url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or config.get("supabase", {}).get("url")
key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") or config.get("supabase", {}).get("key")
headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}

r = requests.get(f"{url}/rest/v1/agents?select=id,name", headers=headers)
agent_names = {a["id"]: a["name"] for a in r.json()}
name_to_id = {v: k for k, v in agent_names.items()}

# Get items from Supabase for 4/29
r = requests.get(f"{url}/rest/v1/daily_metrics?select=agent_id,items&report_date=eq.{REPORT_DATE}", headers=headers)
sb_daily = {agent_names.get(m["agent_id"], "?"): m["items"] or 0 for m in r.json()}

print(f"\nSupabase items for 4/29:")
for agent in sorted(sb_daily.keys()):
    if sb_daily[agent] > 0:
        print(f"  {agent}: {sb_daily[agent]}")
print(f"  Total: {sum(sb_daily.values())}")

# Compare
print(f"\nDifferences (NB vs Supabase) for 4/29:")
all_agents = sorted(set(list(nb_daily_items.keys()) + [a for a in sb_daily if sb_daily[a] > 0]))
for agent in all_agents:
    nb_val = nb_daily_items.get(agent, 0)
    sb_val = sb_daily.get(agent, 0)
    if nb_val != sb_val:
        print(f"  {agent}: NB={nb_val}  Supabase={sb_val}  Delta={sb_val - nb_val}")

# Now MTD comparison
r = requests.get(
    f"{url}/rest/v1/daily_metrics?select=agent_id,items&report_date=gte.2026-04-01&report_date=lte.2026-04-29",
    headers=headers
)
sb_mtd = {}
for m in r.json():
    name = agent_names.get(m["agent_id"], "?")
    sb_mtd[name] = sb_mtd.get(name, 0) + (m["items"] or 0)

print(f"\nItems MTD comparison (NB Excel vs Supabase sum):")
print(f"  NB Excel total: {nb_mtd_total}")
print(f"  Supabase total: {sum(sb_mtd.values())}")
print(f"  Delta: {sum(sb_mtd.values()) - nb_mtd_total}")

# Per-agent differences
print(f"\n  Per-agent MTD differences:")
for agent in sorted(set(list(nb_items_by_agent.keys()) + list(sb_mtd.keys()))):
    nb_v = nb_items_by_agent.get(agent, 0)
    sb_v = sb_mtd.get(agent, 0)
    if nb_v != sb_v:
        print(f"    {agent}: NB={nb_v}  Supabase={sb_v}  Delta={sb_v - nb_v}")

# ========================================
# INVESTIGATION 2: Lori in RicoCH
# ========================================
print("\n\n" + "=" * 80)
print("  INVESTIGATION 2: Lori in RicoCH sheet")
print("=" * 80)

rico_df = pd.read_excel(DSR_PATH, sheet_name="RicoCH")
rico_df["DateOnly"] = pd.to_datetime(rico_df["Date"]).dt.date
rico_apr29 = rico_df[rico_df["DateOnly"] == date(2026,4,29)]

# Find any mention of "Lori" in the User column
lori_rows = rico_apr29[rico_apr29["User"].astype(str).str.contains("Lori", case=False, na=False)]
print(f"\nRicoCH entries with 'Lori' on 4/29: {len(lori_rows)}")
if len(lori_rows) > 0:
    print(lori_rows[["Date", "Full name", "User", "Call Type", "Call Duration In Seconds"]].head(20).to_string())

# Also check "Full name" column
lori_fullname = rico_apr29[rico_apr29["Full name"].astype(str).str.contains("Lori", case=False, na=False)]
print(f"\nRicoCH 'Full name' entries with 'Lori' on 4/29: {len(lori_fullname)}")

# Check what Lori's Spine entry says
lori_spine = spine_df[spine_df["Agent"] == "Lori"]
print(f"\nLori's Spine entry:")
print(lori_spine.to_string())

# ========================================
# INVESTIGATION 3: Nancy - Gutierrez vs Maldonado
# ========================================
print("\n\n" + "=" * 80)
print("  INVESTIGATION 3: Nancy in RC and Rico")
print("=" * 80)

# Check Spine for Nancy
nancy_spine = spine_df[spine_df["Agent"] == "Nancy"]
print(f"\nNancy's Spine entry:")
print(nancy_spine.to_string())

# Check RC for any "Nancy" on 4/29
rc_df = pd.read_excel(DSR_PATH, sheet_name="RC")
rc_df["DateOnly"] = pd.to_datetime(rc_df["Date"]).dt.date
rc_apr29 = rc_df[rc_df["DateOnly"] == date(2026,4,29)]
nancy_rc = rc_apr29[rc_apr29["Name"].astype(str).str.contains("Nancy", case=False, na=False)]
print(f"\nRC entries with 'Nancy' on 4/29:")
print(nancy_rc[["Date", "Name", "Total Calls", "# Inbound", "# Outbound"]].to_string())

# Check RicoCH for Nancy
nancy_rico = rico_apr29[rico_apr29["User"].astype(str).str.contains("Nancy", case=False, na=False)]
print(f"\nRicoCH entries with 'Nancy' on 4/29: {len(nancy_rico)}")
if len(nancy_rico) > 0:
    print(nancy_rico[["Date", "User", "Call Type"]].head(5).to_string())

# ========================================
# INVESTIGATION 4: Juanita's Spine for Rico
# ========================================
print("\n\n" + "=" * 80)
print("  INVESTIGATION 4: Juanita in Rico")
print("=" * 80)

juanita_spine = spine_df[spine_df["Agent"] == "Juanita"]
print(f"\nJuanita's Spine entry:")
print(juanita_spine.to_string())

# Check RicoCH for Juanita
juanita_rico = rico_apr29[rico_apr29["User"].astype(str).str.contains("Juanita", case=False, na=False)]
print(f"\nRicoCH entries with 'Juanita' on 4/29: {len(juanita_rico)}")

# Also check by full name
juanita_fullname = rico_apr29[rico_apr29["Full name"].astype(str).str.contains("Juanita", case=False, na=False)]
print(f"RicoCH 'Full name' entries with 'Juanita' on 4/29: {len(juanita_fullname)}")

# Check all unique Rico users on 4/29
rico_users = rico_apr29["User"].dropna().unique()
print(f"\nAll Rico users on 4/29 ({len(rico_users)}):")
for u in sorted(rico_users):
    count = len(rico_apr29[rico_apr29["User"] == u])
    print(f"  {u}: {count} calls")
