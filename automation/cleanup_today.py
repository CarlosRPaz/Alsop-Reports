"""Delete today's data and verify latest dates in Supabase."""
import requests
import json

env = {}
with open("C:/Users/scag3s29/Documents/Claude Scope/dsr-dashboard/.env.local") as f:
    for line in f:
        if "=" in line and not line.startswith("#"):
            key, val = line.strip().split("=", 1)
            env[key] = val

URL = env["NEXT_PUBLIC_SUPABASE_URL"]
KEY = env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
H = {
    "apikey": KEY,
    "Authorization": "Bearer " + KEY,
}

# Check latest dates
r = requests.get(URL + "/rest/v1/daily_metrics?select=report_date&order=report_date.desc&limit=10", headers=H)
dates_seen = set()
for x in r.json():
    dates_seen.add(x["report_date"])
print("Latest dates in Supabase:", sorted(dates_seen, reverse=True))

# Delete today's spurious data
today = "2026-04-29"
r2 = requests.delete(URL + "/rest/v1/daily_metrics?report_date=eq." + today, headers=H)
print("Delete metrics for today:", r2.status_code)
r3 = requests.delete(URL + "/rest/v1/leads_snapshot?report_date=eq." + today, headers=H)
print("Delete leads for today:", r3.status_code)

# Verify
r4 = requests.get(URL + "/rest/v1/daily_metrics?report_date=eq." + today + "&select=agent_id", headers=H)
print("Rows remaining for today:", len(r4.json()))

# Check a recent date with premium data - compare with Excel
TEST = "2025-12-15"
print()
print("=== Checking", TEST, "===")
r5 = requests.get(URL + "/rest/v1/daily_metrics?report_date=eq." + TEST + "&select=*,agents(name,office,team)&order=agents(name)", headers=H)
for row in sorted(r5.json(), key=lambda x: x.get("agents", {}).get("name", "")):
    a = row.get("agents", {})
    print(f"  {a.get('name','?'):15s} Calls={row.get('calls',0):3d} Prem=${row.get('written_premium',0):10.2f} Items={row.get('items',0):2d} NB={row.get('nb_count',0):2d}")
