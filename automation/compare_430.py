"""Compare DSR Excel vs Supabase data for 2026-04-30."""
import openpyxl, json, requests
from datetime import date

# ── Load DSR Excel ──
wb = openpyxl.load_workbook(
    r"C:\Users\scag3s29\Documents\Claude Scope\Daily Standup Report.xlsx",
    data_only=True
)
ws = wb["DSR"]

# Extract 4/30 data from Excel
# Column mapping: B=Date, C=Role, D=Agent(short), E=Office, F=Agent(full)
# G=Calls, H=Inbound, I=Outbound, J=TalkTime, K=Texts, L=OutTexts
# M=OptIns, N=OptOuts, O=Quotes, P=NB, Q=Total Premium, R=Items
dsr = {}
for row in ws.iter_rows(min_row=4, values_only=False):
    d = row[1].value  # Col B = Date
    if d and hasattr(d, 'date'):
        d = d.date()
    elif d and hasattr(d, 'isoformat'):
        pass
    else:
        continue
    
    if d != date(2026, 4, 30):
        continue
    
    agent_short = str(row[3].value or "").strip()  # Col D = short name
    full_name = str(row[5].value or "").strip()     # Col F = full name
    if not agent_short:
        continue
    
    vals = {}
    for cell in row:
        if cell.value is not None:
            vals[cell.column_letter] = cell.value
    
    dsr[agent_short] = {
        "full_name": full_name or agent_short,
        "calls": int(vals.get("G", 0) or 0),
        "inbound": int(vals.get("H", 0) or 0),
        "outbound": int(vals.get("I", 0) or 0),
        "texts": int(vals.get("K", 0) or 0),
        "out_texts": int(vals.get("L", 0) or 0),
        "quotes": int(vals.get("O", 0) or 0),
        "nb": int(vals.get("P", 0) or 0),
        "premium": float(vals.get("Q", 0) or 0),
        "items": int(vals.get("R", 0) or 0),
    }

# ── Load Supabase ──
config = json.load(open("config/config.json"))
url = config["supabase"]["url"]
key = config["supabase"]["key"]
hdr = {"apikey": key, "Authorization": f"Bearer {key}"}

res = requests.get(
    f"{url}/rest/v1/daily_metrics?report_date=eq.2026-04-30"
    "&select=calls,inbound,outbound,texts,out_texts,quotes,nb_count,items,"
    "written_premium,prem_premium,prem_items,agents(name)",
    headers=hdr
)
supabase = {}
for r in res.json():
    name = r.get("agents", {}).get("name")
    if name:
        supabase[name] = r

# ── Compare ── (match by short/first name since Supabase uses first names)
print()
print(f"{'Agent':15s} | {'Metric':12s} | {'DSR Excel':>10s} | {'Supabase':>10s} | {'Diff':>8s} |")
print("-" * 75)

mismatches = 0
matched = 0
missing = []

for agent_short, d in sorted(dsr.items()):
    # Supabase uses first-name-only keys
    sb = supabase.get(agent_short)
    if not sb:
        missing.append(agent_short)
        continue
    
    matched += 1
    checks = [
        ("calls",     d["calls"],    sb.get("calls") or 0),
        ("inbound",   d["inbound"],  sb.get("inbound") or 0),
        ("outbound",  d["outbound"], sb.get("outbound") or 0),
        ("texts",     d["texts"],    sb.get("texts") or 0),
        ("out_texts", d["out_texts"], sb.get("out_texts") or 0),
        ("quotes",    d["quotes"],   sb.get("quotes") or 0),
        ("nb",        d["nb"],       sb.get("nb_count") or 0),
        ("premium",   d["premium"],  float(sb.get("prem_premium") or 0)),
        ("items",     d["items"],    sb.get("items") or 0),
    ]
    
    agent_printed = False
    for metric, dsr_val, sb_val in checks:
        dsr_num = float(dsr_val)
        sb_num = float(sb_val)
        diff = sb_num - dsr_num
        if abs(diff) > 0.01:
            mismatches += 1
            label = agent_short if not agent_printed else ""
            agent_printed = True
            print(f"{label:15s} | {metric:12s} | {dsr_num:>10.0f} | {sb_num:>10.0f} | {diff:>+8.0f} | ***")

print("-" * 75)
print(f"Matched: {matched} agents | Mismatches: {mismatches}")
if missing:
    print(f"DSR agents NOT found in Supabase: {missing}")

sb_names = set(supabase.keys())
dsr_names = set(dsr.keys())
extra = sb_names - dsr_names
if extra:
    print(f"Supabase agents NOT in DSR: {sorted(extra)}")

# Also show a side-by-side for ALL agents that match (even if no diff)
print()
print("=" * 130)
print(f"{'Agent':15s} | {'calls':>6s} {'':>6s} | {'inb':>4s} {'':>4s} | {'out':>4s} {'':>4s} | {'txt':>4s} {'':>4s} | {'otxt':>4s} {'':>4s} | {'qt':>3s} {'':>3s} | {'nb':>3s} {'':>3s} | {'prem':>8s} {'':>8s} | {'itm':>3s} {'':>3s} |")
print(f"{'':15s} | {'DSR':>6s} {'SB':>6s} | {'DSR':>4s} {'SB':>4s} | {'DSR':>4s} {'SB':>4s} | {'DSR':>4s} {'SB':>4s} | {'DSR':>4s} {'SB':>4s} | {'DSR':>3s} {'SB':>3s} | {'DSR':>3s} {'SB':>3s} | {'DSR':>8s} {'SB':>8s} | {'DSR':>3s} {'SB':>3s} |")
print("-" * 130)

for agent_short, d in sorted(dsr.items()):
    sb = supabase.get(agent_short)
    if not sb:
        print(f"{agent_short:15s} | ** NOT IN SUPABASE **")
        continue
    
    sc = sb.get("calls") or 0
    si = sb.get("inbound") or 0
    so = sb.get("outbound") or 0
    st = sb.get("texts") or 0
    sot = sb.get("out_texts") or 0
    sq = sb.get("quotes") or 0
    sn = sb.get("nb_count") or 0
    sp = float(sb.get("written_premium") or 0)
    sim = sb.get("items") or 0
    
    # Flag row if any mismatch
    has_diff = any([
        d["calls"] != sc, d["inbound"] != si, d["outbound"] != so,
        d["texts"] != st, d["out_texts"] != sot, d["quotes"] != sq,
        d["nb"] != sn, abs(d["premium"] - sp) > 0.01, d["items"] != sim
    ])
    flag = " !!!" if has_diff else ""
    
    print(f"{agent_short:15s} | {d['calls']:>6} {sc:>6} | {d['inbound']:>4} {si:>4} | {d['outbound']:>4} {so:>4} | {d['texts']:>4} {st:>4} | {d['out_texts']:>4} {sot:>4} | {d['quotes']:>3} {sq:>3} | {d['nb']:>3} {sn:>3} | {d['premium']:>8.0f} {sp:>8.0f} | {d['items']:>3} {sim:>3} |{flag}")
