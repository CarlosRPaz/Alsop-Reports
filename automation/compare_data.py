"""Compare Excel DSR data with Supabase data for a given date."""
import pandas as pd
import requests
import json
from datetime import time

EXCEL_PATH = r"C:\Users\scag3s29\Documents\Claude Scope\Daily Standup Report.xlsx"

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

TEST_DATE = "2025-11-19"

# --- Load Excel ---
print("=== EXCEL DATA ===")
df = pd.read_excel(EXCEL_PATH, sheet_name="DSR", header=2, engine="openpyxl")
df = df.dropna(subset=["Date", "Agent"])
day = df[df["Date"].astype(str).str.startswith(TEST_DATE)].copy()
print(f"Rows for {TEST_DATE}: {len(day)}")

for _, r in day.iterrows():
    agent = r.get("Agent", "")
    calls = int(r["Calls"]) if pd.notna(r.get("Calls")) else 0
    inb = int(r["Inbound"]) if pd.notna(r.get("Inbound")) else 0
    outb = int(r["Outbound"]) if pd.notna(r.get("Outbound")) else 0
    texts = int(r["Texts"]) if pd.notna(r.get("Texts")) else 0
    quotes = int(r["Quotes"]) if pd.notna(r.get("Quotes")) else 0
    nb = int(r["NB"]) if pd.notna(r.get("NB")) else 0
    prem = float(r["Total Premium"]) if pd.notna(r.get("Total Premium")) else 0
    items = int(r["Items"]) if pd.notna(r.get("Items")) else 0
    tt = r.get("Talk Time")
    if isinstance(tt, time):
        tts = tt.hour * 3600 + tt.minute * 60 + tt.second
    elif isinstance(tt, (int, float)) and not pd.isna(tt) and tt < 1:
        tts = int(tt * 86400)
    else:
        tts = 0
    office = r.get("Office", "")
    team = r.get("Team", "")
    print(f"  {agent:15s} | Off={office:4s} Team={team:8s} | Calls={calls:3d} In={inb:3d} Out={outb:3d} Talk={tts:5d}s | Txt={texts:3d} | Q={quotes:2d} NB={nb:2d} Prem=${prem:10.2f} Items={items:2d}")

# --- Load Supabase ---
print()
print("=== SUPABASE DATA ===")
res = requests.get(
    f"{SUPABASE_URL}/rest/v1/daily_metrics?report_date=eq.{TEST_DATE}&select=*,agents(name,office,team)",
    headers=HEADERS
)
sb_data = res.json()
print(f"Rows in Supabase for {TEST_DATE}: {len(sb_data)}")

for r in sorted(sb_data, key=lambda x: x.get("agents", {}).get("name", "")):
    agent = r.get("agents", {}).get("name", "?")
    office = r.get("agents", {}).get("office", "")
    team = r.get("agents", {}).get("team", "")
    calls = r.get("calls", 0) or 0
    inb = r.get("inbound", 0) or 0
    outb = r.get("outbound", 0) or 0
    tts = r.get("talk_time_seconds", 0) or 0
    texts = r.get("texts", 0) or 0
    quotes = r.get("quotes", 0) or 0
    nb = r.get("nb_count", 0) or 0
    prem = r.get("written_premium", 0) or 0
    items = r.get("items", 0) or 0
    print(f"  {agent:15s} | Off={office:4s} Team={team:8s} | Calls={calls:3d} In={inb:3d} Out={outb:3d} Talk={tts:5d}s | Txt={texts:3d} | Q={quotes:2d} NB={nb:2d} Prem=${prem:10.2f} Items={items:2d}")

# --- Also check: does today have data? ---
print()
print("=== CHECK TODAY ===")
from datetime import date
today = date.today().isoformat()
res2 = requests.get(
    f"{SUPABASE_URL}/rest/v1/daily_metrics?report_date=eq.{today}&select=agent_id",
    headers=HEADERS
)
print(f"Rows for today ({today}): {len(res2.json())}")
