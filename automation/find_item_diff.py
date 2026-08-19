"""
Find the 1-item difference: compare NB items per agent per day.
"""
import os, json, sys
import pandas as pd
import requests
import warnings
warnings.filterwarnings("ignore")
sys.stdout.reconfigure(encoding='utf-8')

DSR_PATH = r"C:\Users\scag3s29\Documents\Claude Scope\Daily Standup Report.xlsx"

def load_config():
    with open("config/config.json") as f:
        return json.load(f)

config = load_config()
url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or config.get("supabase", {}).get("url")
key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") or config.get("supabase", {}).get("key")
headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}

# Agent maps
r = requests.get(f"{url}/rest/v1/agents?select=id,name", headers=headers)
id_to_name = {a["id"]: a["name"] for a in r.json()}
name_to_id = {v: k for k, v in id_to_name.items()}

# Spine
spine_df = pd.read_excel(DSR_PATH, sheet_name="Spine")
nb_name_map = {}
for _, row in spine_df.iterrows():
    if pd.notna(row.get("NB Sub-Producer Name")):
        nb_name_map[str(row["NB Sub-Producer Name"]).strip()] = row["Agent"]

# NB from workbook
nb_df = pd.read_excel(DSR_PATH, sheet_name="NB")
nb_df["DateOnly"] = pd.to_datetime(nb_df["Date"]).dt.date

from datetime import date
april_nb = nb_df[(nb_df["DateOnly"] >= date(2026, 4, 1)) & (nb_df["DateOnly"] <= date(2026, 4, 29))]

# Build NB items per (agent, date)
nb_items = {}
for _, row in april_nb.iterrows():
    sub_prod = str(row.get("Sub-Producer Name", "")).strip()
    agent = nb_name_map.get(sub_prod)
    if not agent:
        continue
    d = row["DateOnly"].isoformat()
    item_count = int(row.get("Item Count", 1) or 1)
    key = (agent, d)
    nb_items[key] = nb_items.get(key, 0) + item_count

# Build NB items per agent MTD
nb_mtd = {}
for (agent, d), items in nb_items.items():
    nb_mtd[agent] = nb_mtd.get(agent, 0) + items

# Supabase MTD
r = requests.get(
    f"{url}/rest/v1/daily_metrics?select=agent_id,report_date,items&report_date=gte.2026-04-01&report_date=lte.2026-04-29",
    headers=headers
)
sb_daily = {}
sb_mtd = {}
for m in r.json():
    name = id_to_name.get(m["agent_id"], "?")
    items = m.get("items") or 0
    key = (name, m["report_date"])
    sb_daily[key] = items
    sb_mtd[name] = sb_mtd.get(name, 0) + items

# Compare per agent MTD
print("Items MTD per agent (NB vs Supabase):")
print(f"  {'Agent':20s} {'NB':>6} {'SB':>6} {'Delta':>6}")
print(f"  {'-'*20} {'-'*6} {'-'*6} {'-'*6}")
total_nb = 0
total_sb = 0
for agent in sorted(set(list(nb_mtd.keys()) + list(sb_mtd.keys()))):
    nb_v = nb_mtd.get(agent, 0)
    sb_v = sb_mtd.get(agent, 0)
    total_nb += nb_v
    total_sb += sb_v
    flag = " <--" if nb_v != sb_v else ""
    print(f"  {agent:20s} {nb_v:>6} {sb_v:>6} {sb_v - nb_v:>6}{flag}")
print(f"  {'TOTAL':20s} {total_nb:>6} {total_sb:>6} {total_sb - total_nb:>6}")

# Find the specific day/agent that's off
print(f"\nPer-day differences:")
all_keys = set(list(nb_items.keys()) + list(sb_daily.keys()))
for key in sorted(all_keys):
    agent, d = key
    nb_v = nb_items.get(key, 0)
    sb_v = sb_daily.get(key, 0)
    if nb_v != sb_v and (nb_v > 0 or sb_v > 0):
        print(f"  {agent:20s} {d}  NB={nb_v}  SB={sb_v}  Delta={sb_v - nb_v}")
