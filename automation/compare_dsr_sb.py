"""Compare DSR Excel vs Supabase data for 2026-04-29."""
import openpyxl, requests, json
from datetime import date

# Load DSR
wb = openpyxl.load_workbook("C:/Users/scag3s29/Documents/Claude Scope/Daily Standup Report.xlsx", data_only=True)
ws = wb["DSR"]

# Get manual data  
dsr = {}
for row in ws.iter_rows(min_row=4, values_only=True):
    d = row[1]
    if d and hasattr(d, 'date'):
        d = d.date()
    if d == date(2026, 4, 29):
        agent = row[3]
        if agent:
            dsr[agent] = {
                "calls": row[6] or 0,
                "inbound": row[7] or 0,
                "outbound": row[8] or 0,
                "texts": row[10] or 0,
                "out_texts": row[11] or 0,
                "quotes": row[14] or 0,
                "nb": row[15] or 0,
                "premium": row[16] or 0,  # This is the "Total Premium" column  
                "items": row[17] or 0,
            }

# Load Supabase data
config = json.load(open("config/config.json"))
url = config["supabase"]["url"]
key = config["supabase"]["key"]
headers = {"apikey": key, "Authorization": f"Bearer {key}"}

res = requests.get(
    f"{url}/rest/v1/daily_metrics?report_date=eq.2026-04-29"
    f"&select=calls,inbound,outbound,texts,out_texts,quotes,nb_count,items,"
    f"written_premium,prem_premium,prem_items,agents(name)",
    headers=headers
)
supabase_data = {}
for d in res.json():
    name = d.get("agents", {}).get("name")
    if name:
        supabase_data[name] = d

# Compare
print(f"{'Agent':15s} | {'Metric':10s} | {'DSR':>8s} | {'Supabase':>8s} | {'Diff':>6s}")
print("-" * 65)

mismatches = 0
for agent in sorted(dsr.keys()):
    if agent not in supabase_data:
        print(f"{agent:15s} | {'MISSING':10s} | {'--':>8s} | {'--':>8s} |")
        continue
    
    s = supabase_data[agent]
    d = dsr[agent]
    
    checks = [
        ("calls", d["calls"], s.get("calls") or 0),
        ("inbound", d["inbound"], s.get("inbound") or 0),
        ("outbound", d["outbound"], s.get("outbound") or 0),
        ("texts", d["texts"], s.get("texts") or 0),
        ("out_texts", d["out_texts"], s.get("out_texts") or 0),
        ("quotes", d["quotes"], s.get("quotes") or 0),
        ("nb", d["nb"], s.get("nb_count") or 0),
        ("premium", d["premium"], float(s.get("prem_premium") or 0)),  # Compare against AZ premium
        ("items", d["items"], s.get("items") or 0),
    ]
    
    for metric, dsr_val, sb_val in checks:
        dsr_num = float(dsr_val) if dsr_val else 0
        sb_num = float(sb_val) if sb_val else 0
        diff = sb_num - dsr_num
        if abs(diff) > 0.01:
            mismatches += 1
            flag = "***"
            print(f"{agent:15s} | {metric:10s} | {dsr_num:>8.0f} | {sb_num:>8.0f} | {diff:>+6.0f} {flag}")

print(f"\nTotal mismatches: {mismatches}")
