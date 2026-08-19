import os
import json
import requests
import pandas as pd
from datetime import datetime, time

# Config
EXCEL_PATH = r"C:\Users\scag3s29\Documents\Claude Scope\Daily Standup Report.xlsx"
ENV_PATH = r"C:\Users\scag3s29\Documents\Claude Scope\dsr-dashboard\.env.local"

# Parse ENV
env_vars = {}
try:
    with open(ENV_PATH, "r") as f:
        for line in f:
            if "=" in line and not line.startswith("#"):
                key, val = line.strip().split("=", 1)
                env_vars[key] = val
except Exception as e:
    print(f"Failed to read env: {e}")

SUPABASE_URL = env_vars.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = env_vars.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Missing Supabase credentials!")
    exit(1)

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates"
}

print(f"Loading data from {EXCEL_PATH}...")
try:
    df = pd.read_excel(EXCEL_PATH, sheet_name="DSR", header=2, engine="openpyxl")
except Exception as e:
    print(f"Error loading Excel: {e}")
    exit(1)

# Drop rows where Date or Agent is empty
df = df.dropna(subset=["Date", "Agent"])

print(f"Loaded {len(df)} rows. Transforming data...")

agents_payload = {}
metrics_payload = []
leads_payload = []

def parse_time_seconds(val):
    if pd.isna(val):
        return 0
    if isinstance(val, time):
        return val.hour * 3600 + val.minute * 60 + val.second
    if isinstance(val, (int, float)):
        # Sometimes Excel stores time as a fraction of a day
        if val < 1:
            total_seconds = int(val * 86400)
            return total_seconds
    return 0

for _, row in df.iterrows():
    # 1. Collect Agent Info
    agent_name = str(row.get("Agent", "")).strip()
    if not agent_name:
        continue
        
    team = str(row.get("Team", "")).strip()
    office = str(row.get("Office", "")).strip()
    
    if agent_name not in agents_payload:
        agents_payload[agent_name] = {
            "name": agent_name,
            "team": team if team != 'nan' else "",
            "office": office if office != 'nan' else "",
            "active": True
        }
        
    # 2. Daily Metrics
    # Date processing
    dt = row.get("Date")
    if isinstance(dt, str):
        # try parsing
        try:
            dt = datetime.strptime(dt, "%Y-%m-%d").date()
        except:
            continue
    elif hasattr(dt, "date"):
        dt = dt.date()
    else:
        continue
        
    date_str = dt.isoformat()
    
    # Safe float parser
    def sf(col):
        val = row.get(col, 0)
        return float(val) if pd.notna(val) else 0.0

    def si(col):
        val = row.get(col, 0)
        return int(val) if pd.notna(val) else 0

    talk_time = parse_time_seconds(row.get("Talk Time"))

    metrics_payload.append({
        "_agent_name": agent_name, # Temporary for matching IDs later
        "report_date": date_str,
        "calls": si("Calls"),
        "inbound": si("Inbound"),
        "outbound": si("Outbound"),
        "talk_time_seconds": talk_time,
        "texts": si("Texts"),
        "out_texts": si("OutTexts"),
        "opt_ins": si("Opt-Ins"),
        "opt_outs": si("Opt-Outs"),
        "quotes": si("Quotes"),
        "nb_count": si("NB"),
        "written_premium": sf("Total Premium"),
        "items": si("Items"),
        "dismissed_todos": si("Dismissed To-Do's"),
        "past_due_todos": si("Past Due To-Do's")
    })
    
    # 3. Leads Snapshot
    leads_payload.append({
        "_agent_name": agent_name,
        "report_date": date_str,
        "contact": si("Contact"),
        "quoted": si("Quoted"),
        "hot": si("Hot"),
        "xsale": si("x-sale")
    })

print(f"Found {len(agents_payload)} unique agents.")

# Step 1: Push Agents
if agents_payload:
    print("Upserting agents...")
    agent_list = list(agents_payload.values())
    res = requests.post(
        f"{SUPABASE_URL}/rest/v1/agents?on_conflict=name",
        headers=HEADERS,
        json=agent_list
    )
    if res.status_code >= 400:
        print(f"Error pushing agents: {res.text}")
        exit(1)

# Step 2: Get Agent IDs mapping
res = requests.get(f"{SUPABASE_URL}/rest/v1/agents?select=id,name", headers=HEADERS)
if res.status_code >= 400:
    print("Failed to get agent IDs")
    exit(1)
    
agent_map = {a["name"]: a["id"] for a in res.json()}

# Step 3: Push Daily Metrics in chunks of 500
print("Preparing to push metrics...")
final_metrics = []
for m in metrics_payload:
    agent_id = agent_map.get(m["_agent_name"])
    if not agent_id:
        continue
    del m["_agent_name"]
    m["agent_id"] = agent_id
    final_metrics.append(m)

CHUNK_SIZE = 500
for i in range(0, len(final_metrics), CHUNK_SIZE):
    chunk = final_metrics[i:i + CHUNK_SIZE]
    print(f"Pushing metrics chunk {i} to {i + len(chunk)}...")
    res = requests.post(
        f"{SUPABASE_URL}/rest/v1/daily_metrics?on_conflict=agent_id,report_date",
        headers=HEADERS,
        json=chunk
    )
    if res.status_code >= 400:
        print(f"Error pushing metrics: {res.text}")

# Step 4: Push Leads Snapshot
print("Preparing to push leads...")
final_leads = []
for l in leads_payload:
    agent_id = agent_map.get(l["_agent_name"])
    if not agent_id:
        continue
    del l["_agent_name"]
    l["agent_id"] = agent_id
    final_leads.append(l)

for i in range(0, len(final_leads), CHUNK_SIZE):
    chunk = final_leads[i:i + CHUNK_SIZE]
    print(f"Pushing leads chunk {i} to {i + len(chunk)}...")
    res = requests.post(
        f"{SUPABASE_URL}/rest/v1/leads_snapshot?on_conflict=agent_id,report_date",
        headers=HEADERS,
        json=chunk
    )
    if res.status_code >= 400:
        print(f"Error pushing leads: {res.text}")

print("Seeding complete!")
