"""Verify Saturday premium was correctly zeroed and check if the 14705 file should actually be Saturday"""
import os
import requests
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
headers = {'apikey': key, 'Authorization': f'Bearer {key}'}

spine = Spine('C:/Users/scag3s29/Documents/Claude Scope/Daily Standup Report.xlsx',
              sheet_name='Spine', excluded_agents=['Teyssy','Elizabeth'])

# The $14,705 file - downloaded today at 2:14 PM and 3:03 PM
for name in ['sales-report - 2026-05-11T141447.453.csv', 'sales-report - 2026-05-11T150348.207.csv']:
    f = f'C:/Users/scag3s29/Downloads/{name}'
    df = pd.read_csv(f)
    df = df[df['Producer'] != 'Total']
    df['Agent'] = df['Producer'].apply(spine.resolve_agent)
    df = df.dropna(subset=['Agent'])
    df['clean_prem'] = df['Premium'].apply(lambda x: float(str(x).replace('$', '').replace(',', '')) if pd.notna(x) else 0)
    print(f"\n{name}: {len(df)} agents, ${df['clean_prem'].sum():,.2f}")
    for _, row in df.iterrows():
        print(f"  {row['Agent']:20s}  ${row['clean_prem']:>10,.2f}")

# Check DB Saturday  
print("\n\nDB Saturday 2026-05-09:")
res = requests.get(
    f'{url}/rest/v1/daily_metrics?report_date=eq.2026-05-09&select=prem_premium,agent_id&prem_premium=gt.0',
    headers=headers
)
data = res.json()
res2 = requests.get(f'{url}/rest/v1/agents?select=id,name', headers=headers)
agents = {a['id']: a['name'] for a in res2.json()}
total = sum(float(r.get('prem_premium') or 0) for r in data)
print(f"  {len(data)} agents, Total = ${total:,.2f}")
for r in data:
    print(f"  {agents.get(r['agent_id'], '???'):20s}  ${float(r['prem_premium']):>10,.2f}")
