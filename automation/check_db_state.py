import requests
from collections import defaultdict

URL = "https://xejmpdfqaghamemjrhxa.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhlam1wZGZxYWdoYW1lbWpyaHhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NTkxMTUsImV4cCI6MjA5MjAzNTExNX0.0m_8BHyk-2dVZUjCme-yDXwrpswhpBi8gFZVTdIyWOc"
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}

# Check 5/12
r = requests.get(
    f"{URL}/rest/v1/daily_metrics?select=report_date,agent_id,nb_count,items"
    f"&report_date=eq.2026-05-12&or=(nb_count.gt.0,items.gt.0)",
    headers=H
)
rows = r.json()
print(f"5/12 rows with nb/items > 0: {len(rows)}")
for row in rows:
    print(f"  agent={row['agent_id']}, nb={row['nb_count']}, items={row['items']}")

# Full total
r2 = requests.get(
    f"{URL}/rest/v1/daily_metrics?select=report_date,items,nb_count"
    f"&report_date=gte.2026-05-01&report_date=lte.2026-05-14",
    headers=H
)
by_day = defaultdict(lambda: {"items": 0, "nb": 0})
for row in r2.json():
    by_day[row["report_date"]]["items"] += row["items"] or 0
    by_day[row["report_date"]]["nb"] += row["nb_count"] or 0

total_items = 0
total_nb = 0
for d in sorted(by_day):
    if by_day[d]["items"] > 0 or by_day[d]["nb"] > 0:
        print(f"  {d}: {by_day[d]['nb']} nb, {by_day[d]['items']} items")
        total_items += by_day[d]["items"]
        total_nb += by_day[d]["nb"]
print(f"TOTAL: {total_nb} nb, {total_items} items")
