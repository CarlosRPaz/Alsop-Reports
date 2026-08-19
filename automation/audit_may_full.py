"""
Full May 1-10 audit: Check every day's data for gaps, zeros, and duplicates.
Focuses on: calls, talk_time, quotes, items, nb_count, prem_premium, prem_points
"""
import requests
import json
from collections import defaultdict

URL = "https://xejmpdfqaghamemjrhxa.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhlam1wZGZxYWdoYW1lbWpyaHhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NTkxMTUsImV4cCI6MjA5MjAzNTExNX0.0m_8BHyk-2dVZUjCme-yDXwrpswhpBi8gFZVTdIyWOc"
HEADERS = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}

DATES = [f"2026-05-{str(d).zfill(2)}" for d in range(1, 11)]
DAY_NAMES = {
    "2026-05-01": "Fri", "2026-05-02": "Sat", "2026-05-03": "Sun",
    "2026-05-04": "Mon", "2026-05-05": "Tue", "2026-05-06": "Wed",
    "2026-05-07": "Thu", "2026-05-08": "Fri", "2026-05-09": "Sat",
    "2026-05-10": "Sun",
}

# Fetch agents
res = requests.get(f"{URL}/rest/v1/agents?select=id,name,office,team&active=eq.true&order=name", headers=HEADERS)
agents = res.json()
agent_map = {a["id"]: a["name"] for a in agents}
print(f"Total active agents: {len(agents)}")

# Fetch ALL daily_metrics for May 1-10
date_list = ",".join(DATES)
res = requests.get(
    f"{URL}/rest/v1/daily_metrics?report_date=in.({date_list})"
    f"&select=agent_id,report_date,calls,inbound,outbound,talk_time_seconds,texts,out_texts,quotes,nb_count,items,prem_premium,prem_points,written_premium"
    f"&order=report_date,agent_id",
    headers=HEADERS
)
all_rows = res.json()
print(f"Total rows fetched: {len(all_rows)}")

# ===== SECTION 1: Per-day row counts and coverage =====
print("\n" + "=" * 100)
print("SECTION 1: PER-DAY ROW COUNTS & SOURCE COVERAGE")
print("=" * 100)

day_rows = defaultdict(list)
for r in all_rows:
    day_rows[r["report_date"]].append(r)

metrics_to_check = ["calls", "inbound", "outbound", "talk_time_seconds", "texts", "quotes", "items", "nb_count", "prem_premium"]

for d in DATES:
    rows = day_rows.get(d, [])
    day_name = DAY_NAMES.get(d, "???")
    
    if not rows:
        print(f"\n  {day_name} {d}: *** NO DATA AT ALL ***")
        continue
    
    # Count how many agents have non-zero values for each metric
    non_zero = {}
    totals = {}
    for m in metrics_to_check:
        vals = [float(r.get(m) or 0) for r in rows]
        non_zero[m] = sum(1 for v in vals if v > 0)
        totals[m] = sum(vals)
    
    print(f"\n  {day_name} {d}: {len(rows)} agents")
    print(f"    {'Metric':<20} {'Agents w/data':>14} {'Agency Total':>14}")
    print(f"    {'-'*20} {'-'*14} {'-'*14}")
    for m in metrics_to_check:
        flag = ""
        if m in ("calls", "texts", "quotes") and non_zero[m] == 0 and day_name not in ("Sat", "Sun"):
            flag = " *** EMPTY (WEEKDAY!) ***"
        elif m == "prem_premium" and non_zero[m] == 0 and day_name not in ("Sat", "Sun"):
            flag = " *** NO PREMIUM ***"
        
        total_fmt = f"${totals[m]:,.0f}" if m == "prem_premium" else f"{totals[m]:,.0f}"
        print(f"    {m:<20} {non_zero[m]:>14} {total_fmt:>14}{flag}")

# ===== SECTION 2: Duplicate detection (same values on consecutive days) =====
print("\n" + "=" * 100)
print("SECTION 2: DUPLICATE DAY DETECTION (identical values on consecutive days)")
print("=" * 100)

# Compare Thu vs Fri, and any other consecutive pairs
pairs_to_check = [
    ("2026-05-04", "2026-05-05"),
    ("2026-05-05", "2026-05-06"),
    ("2026-05-06", "2026-05-07"),
    ("2026-05-07", "2026-05-08"),
]

for d1, d2 in pairs_to_check:
    r1_map = {r["agent_id"]: r for r in day_rows.get(d1, [])}
    r2_map = {r["agent_id"]: r for r in day_rows.get(d2, [])}
    
    dupe_agents = []
    for aid in r1_map:
        if aid in r2_map:
            a = r1_map[aid]
            b = r2_map[aid]
            # Check if calls are identical and non-zero
            if (a.get("calls") or 0) > 0 and a.get("calls") == b.get("calls") and a.get("inbound") == b.get("inbound") and a.get("outbound") == b.get("outbound"):
                name = agent_map.get(aid, aid[:8])
                dupe_agents.append(f"{name} (calls={a.get('calls')})")
    
    day1_name = DAY_NAMES.get(d1, "?")
    day2_name = DAY_NAMES.get(d2, "?")
    if dupe_agents:
        print(f"\n  {day1_name} {d1} vs {day2_name} {d2}: {len(dupe_agents)} agents with IDENTICAL call data:")
        for da in dupe_agents[:10]:
            print(f"    - {da}")
        if len(dupe_agents) > 10:
            print(f"    ... and {len(dupe_agents) - 10} more")
    else:
        print(f"\n  {day1_name} {d1} vs {day2_name} {d2}: OK (no duplicates)")

# ===== SECTION 3: Weekly totals vs MTD for the week of May 4-10 =====
print("\n" + "=" * 100)
print("SECTION 3: WEEKLY TOTALS (May 4-10) FOR SELECT AGENTS")
print("=" * 100)

week_dates = [f"2026-05-{str(d).zfill(2)}" for d in range(4, 11)]

# Pick some agents from Meeting 1 for detailed view
focus_agents = {}
for a in agents:
    focus_agents[a["id"]] = a["name"]

# Build per-agent weekly sums
agent_weekly = {}
for aid, name in focus_agents.items():
    sums = {m: 0 for m in metrics_to_check}
    sums["talk_time_seconds"] = 0
    day_detail = {}
    for d in week_dates:
        for r in day_rows.get(d, []):
            if r["agent_id"] == aid:
                for m in metrics_to_check:
                    sums[m] += float(r.get(m) or 0)
                sums["talk_time_seconds"] += r.get("talk_time_seconds") or 0
                day_detail[d] = r
                break
    agent_weekly[aid] = {"name": name, "sums": sums, "days": day_detail}

# Print top-level weekly summary for all agents
print(f"\n  {'Agent':<18} {'Calls':>7} {'TalkTime':>10} {'Texts':>7} {'Quotes':>7} {'Items':>7} {'NB':>5} {'Prem($)':>10}")
print(f"  {'-'*18} {'-'*7} {'-'*10} {'-'*7} {'-'*7} {'-'*7} {'-'*5} {'-'*10}")

sorted_agents = sorted(agent_weekly.values(), key=lambda x: x["name"])
for aw in sorted_agents:
    s = aw["sums"]
    tt_h = int(s["talk_time_seconds"] // 3600)
    tt_m = int((s["talk_time_seconds"] % 3600) // 60)
    print(f"  {aw['name']:<18} {s['calls']:>7.0f} {tt_h:>4}:{str(tt_m).zfill(2):<5} {s['texts']:>7.0f} {s['quotes']:>7.0f} {s['items']:>7.0f} {s['nb_count']:>5.0f} {s['prem_premium']:>10,.0f}")

# ===== SECTION 4: MTD Items and Premium (May 1-10) =====
print("\n" + "=" * 100)
print("SECTION 4: MTD TOTALS (May 1-10) - Items, Premium, Points")
print("=" * 100)

# Sum ALL days May 1-10 per agent
agent_mtd = {}
for aid, name in focus_agents.items():
    mtd_items = 0
    mtd_premium = 0.0
    days_with_items = 0
    days_with_premium = 0
    for d in DATES:
        for r in day_rows.get(d, []):
            if r["agent_id"] == aid:
                items_val = r.get("items") or 0
                prem_val = float(r.get("prem_premium") or 0)
                mtd_items += items_val
                mtd_premium += prem_val
                if items_val > 0:
                    days_with_items += 1
                if prem_val > 0:
                    days_with_premium += 1
                break
    agent_mtd[aid] = {
        "name": name,
        "items": mtd_items,
        "premium": mtd_premium,
        "points": mtd_items * 10,
        "days_items": days_with_items,
        "days_premium": days_with_premium,
    }

print(f"\n  {'Agent':<18} {'MTD Items':>10} {'Points':>8} {'MTD Prem($)':>12} {'Days w/Items':>13} {'Days w/Prem':>12}")
print(f"  {'-'*18} {'-'*10} {'-'*8} {'-'*12} {'-'*13} {'-'*12}")

sorted_mtd = sorted(agent_mtd.values(), key=lambda x: x["name"])
agency_items = 0
agency_prem = 0.0
for am in sorted_mtd:
    agency_items += am["items"]
    agency_prem += am["premium"]
    flag = ""
    if am["days_premium"] == 0:
        flag = " *** NO PREMIUM ANY DAY ***"
    elif am["days_premium"] < 3 and am["days_items"] > 0:
        flag = " *** PREMIUM SPARSE ***"
    print(f"  {am['name']:<18} {am['items']:>10} {am['points']:>8} ${am['premium']:>11,.0f} {am['days_items']:>13} {am['days_premium']:>12}{flag}")

print(f"\n  {'AGENCY TOTAL':<18} {agency_items:>10} {agency_items*10:>8} ${agency_prem:>11,.0f}")

# ===== SECTION 5: Per-day detail for items and premium =====
print("\n" + "=" * 100)
print("SECTION 5: ITEMS PER DAY (agency total) - looking for missing days")
print("=" * 100)

print(f"\n  {'Date':<12} {'Day':<5} {'Items':>7} {'NB':>5} {'Prem($)':>10} {'Agents w/Items':>15} {'Agents w/Prem':>14}")
print(f"  {'-'*12} {'-'*5} {'-'*7} {'-'*5} {'-'*10} {'-'*15} {'-'*14}")

for d in DATES:
    rows = day_rows.get(d, [])
    total_items = sum(r.get("items") or 0 for r in rows)
    total_nb = sum(r.get("nb_count") or 0 for r in rows)
    total_prem = sum(float(r.get("prem_premium") or 0) for r in rows)
    agents_items = sum(1 for r in rows if (r.get("items") or 0) > 0)
    agents_prem = sum(1 for r in rows if float(r.get("prem_premium") or 0) > 0)
    day_name = DAY_NAMES.get(d, "?")
    
    flag = ""
    if total_items == 0 and day_name not in ("Sat", "Sun"):
        flag = " *** NO ITEMS ON WEEKDAY ***"
    if total_prem == 0 and day_name not in ("Sat", "Sun"):
        flag += " *** NO PREMIUM ***"
    
    print(f"  {d:<12} {day_name:<5} {total_items:>7} {total_nb:>5} ${total_prem:>9,.0f} {agents_items:>15} {agents_prem:>14}{flag}")

print("\n\nAUDIT COMPLETE.")
