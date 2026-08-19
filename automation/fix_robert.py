"""Create missing daily_metrics record for Robert on 2026-04-18"""
import os, json, sys, requests
sys.stdout.reconfigure(encoding='utf-8')

def load_config():
    with open("config/config.json") as f:
        return json.load(f)

config = load_config()
url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or config.get("supabase", {}).get("url")
key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") or config.get("supabase", {}).get("key")
headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates"}

r = requests.get(f"{url}/rest/v1/agents?select=id,name&name=eq.Robert", headers=headers)
robert_id = r.json()[0]["id"]

# Create the record with items=1 and zeros for everything else
r = requests.post(
    f"{url}/rest/v1/daily_metrics?on_conflict=agent_id,report_date",
    headers=headers,
    json={
        "agent_id": robert_id,
        "report_date": "2026-04-18",
        "calls": 0, "inbound": 0, "outbound": 0, "talk_time_seconds": 0,
        "texts": 0, "out_texts": 0, "opt_ins": 0, "opt_outs": 0,
        "quotes": 0, "nb_count": 1, "items": 1,
        "written_premium": 0, "prem_premium": 0, "prem_items": 0, "prem_points": 0,
        "dismissed_todos": 0, "past_due_todos": 0
    }
)
print(f"Create result: {r.status_code} - {r.text[:200] if r.text else 'OK'}")

# Verify total
r = requests.get(
    f"{url}/rest/v1/daily_metrics?select=agent_id,items&report_date=gte.2026-04-01&report_date=lte.2026-04-29",
    headers=headers
)
total = sum(m.get("items") or 0 for m in r.json())
print(f"Items MTD after fix: {total}")
