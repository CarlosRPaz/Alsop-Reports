"""
Audit weekly data for May 4-10, 2026.
Queries Supabase per-day to find exactly where gaps exist.
Focuses on Meeting 1 (9:00 AM) agents as the test case.
"""
import requests
import json

# Load env
env_vars = {}
with open(r"C:\Users\scag3s29\Documents\Claude Scope\dsr-dashboard\.env.local") as f:
    for line in f:
        if "=" in line and not line.startswith("#"):
            key, val = line.strip().split("=", 1)
            env_vars[key] = val

SUPABASE_URL = env_vars["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = env_vars["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

WEEK_START = "2026-05-04"
WEEK_END = "2026-05-10"
DATES = ["2026-05-04", "2026-05-05", "2026-05-06", "2026-05-07", "2026-05-08", "2026-05-09", "2026-05-10"]
DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

# Meeting 1 agents to focus on
FOCUS_AGENTS = ["Ariana", "Charmaine", "Claudia", "Eddie", "Jessie", "Rosalba"]

# First, get agent IDs
res = requests.get(
    f"{SUPABASE_URL}/rest/v1/agents?select=id,name,office,team,meeting_time",
    headers=HEADERS
)
all_agents = res.json()
agent_map = {a["name"]: a for a in all_agents}

# Check Estela and Robert for double-space issue
print("=== DOUBLE-SPACE CHECK ===")
for name in ["Estela", "Robert"]:
    matches = [a for a in all_agents if name.lower() in a["name"].lower()]
    for m in matches:
        print(f"  Agent: '{m['name']}' (repr: {repr(m['name'])})")
    if not matches:
        print(f"  No agent found matching '{name}'")

# Fetch ALL daily_metrics for the week
print(f"\n=== WEEKLY DATA: {WEEK_START} to {WEEK_END} ===")
res = requests.get(
    f"{SUPABASE_URL}/rest/v1/daily_metrics?report_date=gte.{WEEK_START}&report_date=lte.{WEEK_END}&select=*,agents(name,office,meeting_time)",
    headers=HEADERS
)
all_metrics = res.json()
print(f"Total daily_metrics rows for the week: {len(all_metrics)}")

# Count rows per day
from collections import defaultdict
day_counts = defaultdict(int)
for m in all_metrics:
    day_counts[m["report_date"]] += 1

print("\n=== ROWS PER DAY ===")
for d, name in zip(DATES, DAY_NAMES):
    count = day_counts.get(d, 0)
    flag = " !! MISSING!" if count == 0 else ""
    print(f"  {name} {d}: {count} agents{flag}")

# Per-agent, per-day breakdown for focus agents
print("\n" + "=" * 100)
print("PER-AGENT DAILY BREAKDOWN (Meeting 1 Focus Agents)")
print("=" * 100)

for agent_name in FOCUS_AGENTS:
    agent_data = agent_map.get(agent_name)
    if not agent_data:
        print(f"\n!!  Agent '{agent_name}' NOT FOUND in agents table!")
        continue
    
    agent_rows = [m for m in all_metrics if m.get("agents", {}).get("name") == agent_name]
    
    # Organize by date
    by_date = {m["report_date"]: m for m in agent_rows}
    
    print(f"\n{'-' * 80}")
    print(f"  {agent_name} ({agent_data.get('office', '?')}) — {len(agent_rows)} days in week")
    print(f"{'-' * 80}")
    
    totals = {
        "calls": 0, "inbound": 0, "outbound": 0, "talk_time_seconds": 0,
        "texts": 0, "quotes": 0, "items": 0, "prem_premium": 0, "prem_points": 0,
        "nb_count": 0, "written_premium": 0
    }
    
    print(f"  {'Day':4s} {'Date':12s} {'Calls':>6s} {'In':>5s} {'Out':>6s} {'Talk(s)':>8s} {'Texts':>6s} {'Quotes':>7s} {'Items':>6s} {'NB':>4s} {'PremPrem':>10s} {'PremPts':>8s} {'WritPrem':>10s}")
    print(f"  {'-'*4} {'-'*12} {'-'*6} {'-'*5} {'-'*6} {'-'*8} {'-'*6} {'-'*7} {'-'*6} {'-'*4} {'-'*10} {'-'*8} {'-'*10}")
    
    for d, name in zip(DATES, DAY_NAMES):
        row = by_date.get(d)
        if row:
            c = row.get("calls", 0) or 0
            i = row.get("inbound", 0) or 0
            o = row.get("outbound", 0) or 0
            t = row.get("talk_time_seconds", 0) or 0
            tx = row.get("texts", 0) or 0
            q = row.get("quotes", 0) or 0
            it = row.get("items", 0) or 0
            nb = row.get("nb_count", 0) or 0
            pp = float(row.get("prem_premium", 0) or 0)
            pts = float(row.get("prem_points", 0) or 0)
            wp = float(row.get("written_premium", 0) or 0)
            
            totals["calls"] += c
            totals["inbound"] += i
            totals["outbound"] += o
            totals["talk_time_seconds"] += t
            totals["texts"] += tx
            totals["quotes"] += q
            totals["items"] += it
            totals["nb_count"] += nb
            totals["prem_premium"] += pp
            totals["prem_points"] += pts
            totals["written_premium"] += wp
            
            print(f"  {name:4s} {d:12s} {c:6d} {i:5d} {o:6d} {t:8d} {tx:6d} {q:7d} {it:6d} {nb:4d} ${pp:9.2f} {pts:8.0f} ${wp:9.2f}")
        else:
            print(f"  {name:4s} {d:12s}   — NO DATA —")
    
    # Print totals
    tt_h = totals["talk_time_seconds"] // 3600
    tt_m = (totals["talk_time_seconds"] % 3600) // 60
    print(f"  {'':4s} {'TOTAL':12s} {totals['calls']:6d} {totals['inbound']:5d} {totals['outbound']:6d} {totals['talk_time_seconds']:8d} {totals['texts']:6d} {totals['quotes']:7d} {totals['items']:6d} {totals['nb_count']:4d} ${totals['prem_premium']:9.2f} {totals['prem_points']:8.0f} ${totals['written_premium']:9.2f}")
    print(f"         Talk: {tt_h}:{tt_m:02d}")

# Also check: is there a daily_reports_meta for each day?
print("\n=== DAILY REPORTS META ===")
res = requests.get(
    f"{SUPABASE_URL}/rest/v1/daily_reports_meta?report_date=gte.{WEEK_START}&report_date=lte.{WEEK_END}&select=*",
    headers=HEADERS
)
meta = res.json()
for d, name in zip(DATES, DAY_NAMES):
    meta_row = [m for m in meta if m["report_date"] == d]
    if meta_row:
        m = meta_row[0]
        print(f"  {name} {d}: rc={m.get('rc_synced', '?')} hs={m.get('hs_synced', '?')} quotes={m.get('quotes_synced', '?')} nb={m.get('nb_synced', '?')} prem={m.get('premium_synced', '?')} eagent={m.get('eagent_submitted', '?')}")
    else:
        print(f"  {name} {d}: NO META ROW")
