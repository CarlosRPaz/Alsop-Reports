"""Quick script to check data coverage for a given date in Supabase."""
import requests, json

config = json.load(open("config/config.json"))
url = config["supabase"]["url"]
key = config["supabase"]["key"]
headers = {"apikey": key, "Authorization": f"Bearer {key}"}

DATE = "2026-04-29"

# Fetch metrics
res = requests.get(
    f"{url}/rest/v1/daily_metrics?report_date=eq.{DATE}"
    f"&select=agent_id,calls,inbound,outbound,talk_time_seconds,"
    f"texts,out_texts,opt_ins,opt_outs,"
    f"quotes,nb_count,items,written_premium,"
    f"prem_premium,prem_items,prem_points,"
    f"dismissed_todos,past_due_todos,"
    f"agents(name,team,office)",
    headers=headers
)
data = res.json()
print(f"Total agent rows for {DATE}: {len(data)}\n")

has_calls    = sum(1 for d in data if (d.get("calls") or 0) > 0)
has_texts    = sum(1 for d in data if (d.get("texts") or 0) > 0)
has_quotes   = sum(1 for d in data if (d.get("quotes") or 0) > 0)
has_nb       = sum(1 for d in data if (d.get("nb_count") or 0) > 0)
has_items    = sum(1 for d in data if (d.get("items") or 0) > 0)
has_premium  = sum(1 for d in data if float(d.get("written_premium") or 0) > 0)
has_prem_prem= sum(1 for d in data if float(d.get("prem_premium") or 0) > 0)
has_prem_itm = sum(1 for d in data if (d.get("prem_items") or 0) > 0)
has_dismissed= sum(1 for d in data if (d.get("dismissed_todos") or 0) > 0)
has_pastdue  = sum(1 for d in data if (d.get("past_due_todos") or 0) > 0)

print("=== SOURCE COVERAGE (agents with non-zero values) ===")
print(f"  RC/Ricochet Calls:     {has_calls} agents")
print(f"  Hearsay Texts:         {has_texts} agents")
print(f"  Quotes (Allstate):     {has_quotes} agents")
print(f"  NB Count (Allstate):   {has_nb} agents")
print(f"  Items (from NB):       {has_items} agents")
print(f"  Written Premium (NB):  {has_premium} agents")
print(f"  AZ Premium (sales-rpt):{has_prem_prem} agents")
print(f"  AZ Items (sales-rpt):  {has_prem_itm} agents")
print(f"  eAgent Dismissed:      {has_dismissed} agents")
print(f"  eAgent Past Due:       {has_pastdue} agents")
print()

# Check leads snapshot
res2 = requests.get(
    f"{url}/rest/v1/leads_snapshot?report_date=eq.{DATE}"
    f"&select=agent_id,contact,quoted,hot,xsale,agents(name)",
    headers=headers
)
leads = res2.json()
has_any_leads = sum(
    1 for l in leads
    if any((l.get(k) or 0) > 0 for k in ["contact", "quoted", "hot", "xsale"])
)
print(f"  Rico Leads Snapshot:   {has_any_leads} agents with pipeline data")
print()

# Show per-agent detail for agents with zero data
print("=== AGENTS WITH NO ACTIVITY DATA ===")
for d in sorted(data, key=lambda x: x.get("agents", {}).get("name", "")):
    a = d.get("agents", {})
    name = a.get("name", "?")
    office = a.get("office", "?")
    team = a.get("team", "?")
    zero_keys = ["calls", "texts", "quotes", "nb_count", "items"]
    if all((d.get(k) or 0) == 0 for k in zero_keys):
        wp = float(d.get("written_premium") or 0)
        pp = float(d.get("prem_premium") or 0)
        if wp == 0 and pp == 0:
            print(f"  {name:20s}  {office:4s} / {team}")

print()
print("=== FULL AGENT DATA DUMP ===")
for d in sorted(data, key=lambda x: x.get("agents", {}).get("name", "")):
    a = d.get("agents", {})
    name = a.get("name", "?")
    calls = d.get("calls") or 0
    texts = d.get("texts") or 0
    quotes = d.get("quotes") or 0
    nb = d.get("nb_count") or 0
    items = d.get("items") or 0
    wp = float(d.get("written_premium") or 0)
    pp = float(d.get("prem_premium") or 0)
    pi = d.get("prem_items") or 0
    print(f"  {name:20s}  Calls:{calls:3d}  Txts:{texts:3d}  Qts:{quotes:3d}  NB:{nb:2d}  Itms:{items:2d}  WP:${wp:>8.0f}  AZ-P:${pp:>8.0f}  AZ-I:{pi:2d}")
