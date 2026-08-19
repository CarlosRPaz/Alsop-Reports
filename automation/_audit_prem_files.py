"""
Fix premium for Thu 5/7 and Fri 5/8.

Thu 5/7: Correct file is sales-report - 2026-05-08T080513.947.csv ($53,646)
         DB currently shows $99,779 — WRONG, needs re-push
Fri 5/8: No file downloaded on 5/9. User uploaded sales-report - 2026-05-11T150348.207.csv
         but that's the SATURDAY file ($14,705). 
         The user uploaded sales-report - 2026-05-11T122817.512.csv earlier today for Fri.
         Let me check which one is the correct Friday file.
"""
import os
import requests
import pandas as pd
from pathlib import Path
from src.spine import Spine

env = {}
with open('C:/Users/scag3s29/Documents/Claude Scope/dsr-dashboard/.env.local', 'r') as f:
    for line in f:
        if '=' in line and not line.startswith('#'):
            k, v = line.strip().split('=', 1)
            env[k] = v.strip('"\'')

url = env.get('NEXT_PUBLIC_SUPABASE_URL')
key = env.get('NEXT_PUBLIC_SUPABASE_ANON_KEY')
headers = {'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}

spine = Spine('C:/Users/scag3s29/Documents/Claude Scope/Daily Standup Report.xlsx', 
              sheet_name='Spine', excluded_agents=['Teyssy','Elizabeth'])

# Check what's in the upload staging folder
upload_dir = Path('C:/Users/scag3s29/Documents/Claude Scope/excel-report-automation/data/uploads/manual_premium')
print("Files in manual_premium upload dir:")
for f in upload_dir.glob('*'):
    df = pd.read_csv(f)
    df = df[df['Producer'] != 'Total']
    df['Agent'] = df['Producer'].apply(spine.resolve_agent)
    df = df.dropna(subset=['Agent'])
    df['clean_prem'] = df['Premium'].apply(lambda x: float(str(x).replace('$', '').replace(',', '')) if pd.notna(x) else 0)
    total = df['clean_prem'].sum()
    print(f"  {f.name}: {len(df)} agents, ${total:,.2f}")

# Also list the candidate Friday files from Downloads (uploaded today around 12:28)
print("\nCandidate Friday files from today's uploads:")
for name in ['sales-report - 2026-05-11T122817.512.csv', 'sales-report - 2026-05-11T122733.303.csv']:
    f = Path(f'C:/Users/scag3s29/Downloads/{name}')
    if f.exists():
        df = pd.read_csv(f)
        df = df[df['Producer'] != 'Total']
        df['Agent'] = df['Producer'].apply(spine.resolve_agent)
        df = df.dropna(subset=['Agent'])
        df['clean_prem'] = df['Premium'].apply(lambda x: float(str(x).replace('$', '').replace(',', '')) if pd.notna(x) else 0)
        total = df['clean_prem'].sum()
        print(f"  {name}: {len(df)} agents, ${total:,.2f}")
