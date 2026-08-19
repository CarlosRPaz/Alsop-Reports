import os
import requests
import json

env = {}
with open('C:/Users/scag3s29/Documents/Claude Scope/dsr-dashboard/.env.local', 'r') as f:
    for line in f:
        if '=' in line and not line.startswith('#'):
            k, v = line.strip().split('=', 1)
            env[k] = v.strip('"\'')

url = env.get('NEXT_PUBLIC_SUPABASE_URL')
key = env.get('NEXT_PUBLIC_SUPABASE_ANON_KEY')
headers = {'apikey': key, 'Authorization': f'Bearer {key}', 'Prefer': 'return=representation', 'Content-Type': 'application/json'}

payload = {
    'prem_premium': 0,
    'prem_items': 0,
    'prem_points': 0
}

# Clear Saturday
res1 = requests.patch(f'{url}/rest/v1/daily_metrics?report_date=eq.2026-05-09', headers=headers, json=payload)
print('Sat:', res1.status_code)

# Clear Sunday
res2 = requests.patch(f'{url}/rest/v1/daily_metrics?report_date=eq.2026-05-10', headers=headers, json=payload)
print('Sun:', res2.status_code)
