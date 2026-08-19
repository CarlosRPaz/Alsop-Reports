"""
Fix premium for Thu 5/7 and Fri 5/8 by re-pushing the correct per-agent values.
Thu 5/7: sales-report - 2026-05-08T080513.947.csv ($53,646 total)
Fri 5/8: sales-report - 2026-05-11T122817.512.csv ($46,133 total)
"""
import os
import requests
import json
import pandas as pd
from src.spine import Spine

env = {}
with open('C:/Users/scag3s29/Documents/Claude Scope/dsr-dashboard/.env.local', 'r') as f:
    for line in f:
        if '=' in line and not line.startswith('#'):
            k, v = line.strip().split('=', 1)
            env[k] = v.strip('"\'')

url = env.get('NEXT_PUBLIC_SUPABASE_URL')
key = env.get('NEXT_PUBLIC_SUPABASE_ANON_KEY')
headers = {'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json', 'Prefer': 'return=minimal'}

spine = Spine('C:/Users/scag3s29/Documents/Claude Scope/Daily Standup Report.xlsx',
              sheet_name='Spine', excluded_agents=['Teyssy','Elizabeth'])

# Get agent name -> id mapping
res = requests.get(f'{url}/rest/v1/agents?select=id,name', headers={'apikey': key, 'Authorization': f'Bearer {key}'})
agent_lookup = {a['name']: a['id'] for a in res.json()}

def parse_sales_csv(filepath, spine_obj):
    df = pd.read_csv(filepath)
    df = df[df['Producer'] != 'Total']
    df['Agent'] = df['Producer'].apply(spine_obj.resolve_agent)
    df = df.dropna(subset=['Agent'])
    df['clean_prem'] = df['Premium'].apply(lambda x: float(str(x).replace('$', '').replace(',', '')) if pd.notna(x) else 0)
    df['clean_items'] = df['Items'].fillna(0).astype(int)
    df['clean_points'] = df['Points'].fillna(0).astype(int)
    return df

def push_premium(date_str, df):
    """First zero out all agents for this date, then set correct values."""
    # Step 1: Zero out all premium for the date
    zero_payload = {'prem_premium': 0, 'prem_items': 0, 'prem_points': 0}
    res = requests.patch(
        f'{url}/rest/v1/daily_metrics?report_date=eq.{date_str}',
        headers=headers, json=zero_payload
    )
    print(f"  Zeroed {date_str}: {res.status_code}")
    
    # Step 2: Set correct per-agent values
    updated = 0
    for _, row in df.iterrows():
        agent_name = row['Agent']
        agent_id = agent_lookup.get(agent_name)
        if not agent_id:
            continue
        payload = {
            'prem_premium': row['clean_prem'],
            'prem_items': int(row['clean_items']),
            'prem_points': int(row['clean_points']),
        }
        res = requests.patch(
            f'{url}/rest/v1/daily_metrics?report_date=eq.{date_str}&agent_id=eq.{agent_id}',
            headers=headers, json=payload
        )
        if res.status_code == 200:
            updated += 1
    print(f"  Updated {updated} agents for {date_str}")

# Fix Thursday 5/7
print("=== Fixing Thursday 5/7 ===")
thu_df = parse_sales_csv('C:/Users/scag3s29/Downloads/sales-report - 2026-05-08T080513.947.csv', spine)
print(f"  File total: ${thu_df['clean_prem'].sum():,.2f} ({len(thu_df)} agents)")
push_premium('2026-05-07', thu_df)

# Fix Friday 5/8
print("\n=== Fixing Friday 5/8 ===")
fri_df = parse_sales_csv('C:/Users/scag3s29/Downloads/sales-report - 2026-05-11T122817.512.csv', spine)
print(f"  File total: ${fri_df['clean_prem'].sum():,.2f} ({len(fri_df)} agents)")
push_premium('2026-05-08', fri_df)

# Verify
print("\n=== Verification ===")
verify_headers = {'apikey': key, 'Authorization': f'Bearer {key}'}
for date_str in ['2026-05-07', '2026-05-08']:
    res = requests.get(
        f'{url}/rest/v1/daily_metrics?report_date=eq.{date_str}&select=prem_premium',
        headers=verify_headers
    )
    total = sum(float(r.get('prem_premium') or 0) for r in res.json())
    print(f"  {date_str}: DB Total Premium = ${total:,.2f}")
