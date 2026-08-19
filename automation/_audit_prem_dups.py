import os
import requests

env = {}
with open('C:/Users/scag3s29/Documents/Claude Scope/dsr-dashboard/.env.local', 'r') as f:
    for line in f:
        if '=' in line and not line.startswith('#'):
            k, v = line.strip().split('=', 1)
            env[k] = v.strip('"\'')

url = env.get('NEXT_PUBLIC_SUPABASE_URL')
key = env.get('NEXT_PUBLIC_SUPABASE_ANON_KEY')
headers = {'apikey': key, 'Authorization': f'Bearer {key}'}

# Fetch all daily_metrics for the week 5/4 - 5/10
dates = '2026-05-04,2026-05-05,2026-05-06,2026-05-07,2026-05-08,2026-05-09,2026-05-10'
res = requests.get(
    f'{url}/rest/v1/daily_metrics?report_date=in.({dates})&select=report_date,agent_id,prem_premium,prem_items,prem_points',
    headers=headers
)
data = res.json()

# Also fetch agent names
res2 = requests.get(f'{url}/rest/v1/agents?select=id,name', headers=headers)
agents = {a['id']: a['name'] for a in res2.json()}

# Group by date, show totals
print("=" * 80)
print("  PREMIUM TOTALS BY DAY")
print("=" * 80)
for date in sorted(set(r['report_date'] for r in data)):
    day_data = [r for r in data if r['report_date'] == date]
    total_prem = sum(float(r.get('prem_premium') or 0) for r in day_data)
    total_items = sum(int(r.get('prem_items') or 0) for r in day_data)
    total_pts = sum(int(r.get('prem_points') or 0) for r in day_data)
    print(f"  {date}:  Premium=${total_prem:,.2f}  Items={total_items}  Points={total_pts}")

# Now check for duplicates — compare per-agent premium across consecutive days
print()
print("=" * 80)
print("  CHECKING FOR DUPLICATE PREMIUM (same values on consecutive days)")
print("=" * 80)
all_dates = sorted(set(r['report_date'] for r in data))
for i in range(len(all_dates) - 1):
    d1 = all_dates[i]
    d2 = all_dates[i + 1]
    d1_data = {r['agent_id']: float(r.get('prem_premium') or 0) for r in data if r['report_date'] == d1}
    d2_data = {r['agent_id']: float(r.get('prem_premium') or 0) for r in data if r['report_date'] == d2}
    
    # Check if all non-zero values match
    common = set(d1_data.keys()) & set(d2_data.keys())
    nonzero = [aid for aid in common if d1_data[aid] > 0 and d2_data[aid] > 0]
    if nonzero:
        matches = sum(1 for aid in nonzero if d1_data[aid] == d2_data[aid])
        if matches == len(nonzero) and len(nonzero) > 3:
            print(f"  !! {d1} vs {d2}: ALL {matches} agents with premium have IDENTICAL values — LIKELY DUPLICATE!")
        elif matches > len(nonzero) * 0.8:
            print(f"  ?? {d1} vs {d2}: {matches}/{len(nonzero)} agents match — SUSPICIOUS")
        else:
            print(f"  OK {d1} vs {d2}: {matches}/{len(nonzero)} matches (looks like different data)")
    else:
        print(f"  -- {d1} vs {d2}: no overlapping non-zero premium to compare")

# Show per-agent detail for any suspicious pairs
print()
print("=" * 80)
print("  PER-AGENT PREMIUM DETAIL (agents with premium > 0)")
print("=" * 80)
for date in all_dates:
    day_data = [(agents.get(r['agent_id'], r['agent_id'][:8]), float(r.get('prem_premium') or 0)) 
                for r in data if r['report_date'] == date and float(r.get('prem_premium') or 0) > 0]
    day_data.sort(key=lambda x: x[0])
    print(f"\n  {date}:")
    for name, prem in day_data:
        print(f"    {name:20s}  ${prem:>10,.2f}")
