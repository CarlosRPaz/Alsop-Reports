"""Full comparison of DSR vs Supabase for 5/1, 5/2, 5/3."""
import zipfile
import xml.etree.ElementTree as ET
import json
import requests
from datetime import datetime, timedelta, date
from pathlib import Path

ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
DSR_PATH = r"C:\Users\scag3s29\Documents\Claude Scope\Daily Standup Report.xlsx"
CONFIG_PATH = r"C:\Users\scag3s29\Documents\Claude Scope\excel-report-automation\config\config.json"
TARGET_DATES = {date(2026,5,1), date(2026,5,2), date(2026,5,3)}
BASE = datetime(1899, 12, 30)

# ─── Read DSR ───────────────────────────────────────────────────────
def read_dsr_sheet():
    """Read the DSR sheet, find actual header row, and extract data."""
    zf = zipfile.ZipFile(DSR_PATH)
    
    strings = []
    if "xl/sharedStrings.xml" in zf.namelist():
        tree = ET.parse(zf.open("xl/sharedStrings.xml"))
        for si in tree.findall(f".//{{{ns}}}si"):
            texts = si.findall(f".//{{{ns}}}t")
            strings.append("".join(t.text or "" for t in texts))
    
    tree = ET.parse(zf.open("xl/worksheets/sheet1.xml"))
    rows = tree.findall(f".//{{{ns}}}row")
    
    def cell_val(cell):
        t = cell.get("t")
        v = cell.find(f"{{{ns}}}v")
        val = v.text if v is not None else ""
        if t == "s" and val:
            val = strings[int(val)]
        return val
    
    # Find header row (contains "Date")
    header_idx = None
    header = {}
    for i, row in enumerate(rows):
        for cell in row.findall(f"{{{ns}}}c"):
            if cell_val(cell) == "Date":
                header_idx = i
                break
        if header_idx is not None:
            for cell in rows[header_idx].findall(f"{{{ns}}}c"):
                ref = cell.get("r", "")
                col = "".join(ch for ch in ref if ch.isalpha())
                header[col] = cell_val(cell)
            break
    
    if header_idx is None:
        print("[!] Could not find header row")
        return {}
    
    # Print header for debugging
    non_empty_header = {k:v for k,v in header.items() if v}
    print(f"  Header at row {header_idx}: {non_empty_header}")
    
    # Extract data rows
    result = {}  # (date, agent) -> {metric: value}
    for row in rows[header_idx+1:]:
        data = {}
        for cell in row.findall(f"{{{ns}}}c"):
            ref = cell.get("r", "")
            col = "".join(ch for ch in ref if ch.isalpha())
            val = cell_val(cell)
            col_name = header.get(col, "")
            if col_name:
                data[col_name] = val
        
        # Parse date
        date_raw = data.get("Date", "")
        try:
            serial = int(float(date_raw))
            dt = (BASE + timedelta(days=serial)).date()
        except:
            continue
        
        if dt not in TARGET_DATES:
            continue
        
        agent = data.get("Agent", "").strip()
        if not agent:
            continue
        
        # Parse numeric values
        parsed = {}
        for key in ["Inbound", "Outbound", "Total Calls", "Total Texts", "Outbound Texts", 
                     "Quotes", "NB", "Items"]:
            raw = data.get(key, "0")
            try:
                parsed[key] = int(float(raw)) if raw else 0
            except (ValueError, TypeError):
                parsed[key] = 0  # formula cell
        
        # If Total Calls is 0 but inbound/outbound exist, compute it
        if parsed["Total Calls"] == 0 and (parsed["Inbound"] > 0 or parsed["Outbound"] > 0):
            parsed["Total Calls"] = parsed["Inbound"] + parsed["Outbound"]
        
        result[(dt, agent)] = parsed
    
    return result

# ─── Read Supabase ──────────────────────────────────────────────────
def read_supabase():
    cfg = json.loads(Path(CONFIG_PATH).read_text())
    url = cfg["supabase"]["url"]
    key = cfg["supabase"]["key"]
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    
    res = requests.get(f"{url}/rest/v1/agents?select=id,name", headers=headers)
    agents = {a["id"]: a["name"] for a in res.json()}
    
    date_filter = ",".join(d.isoformat() for d in sorted(TARGET_DATES))
    res = requests.get(
        f"{url}/rest/v1/daily_metrics?report_date=in.({date_filter})&select=*",
        headers=headers
    )
    
    result = {}
    for m in res.json():
        name = agents.get(m["agent_id"], "Unknown")
        dt = m["report_date"]
        result[(dt, name)] = m
    
    return result

# ─── Main ───────────────────────────────────────────────────────────
def main():
    print("=" * 90)
    print("  DSR vs Supabase Comparison — 5/1, 5/2, 5/3")
    print("=" * 90)
    
    print("\n[1] Reading DSR Excel...")
    dsr = read_dsr_sheet()
    
    # Build name list
    dsr_agents = set()
    for (dt, agent) in dsr:
        dsr_agents.add(agent)
    print(f"  {len(dsr)} rows, {len(dsr_agents)} unique agents")
    
    print("\n[2] Reading Supabase...")
    sb = read_supabase()
    sb_agents = set()
    for (dt, name) in sb:
        sb_agents.add(name)
    print(f"  {len(sb)} rows, {len(sb_agents)} unique agents")
    
    # Name mapping (DSR uses first names, SB uses first names too in this case)
    name_map = {}
    for dsr_name in dsr_agents:
        for sb_name in sb_agents:
            if dsr_name.lower() == sb_name.lower():
                name_map[dsr_name] = sb_name
                break
            elif dsr_name.lower() == sb_name.split()[0].lower():
                name_map[dsr_name] = sb_name
                break
    
    unmatched = dsr_agents - set(name_map.keys())
    if unmatched:
        print(f"  [!] Unmatched DSR agents: {sorted(unmatched)}")
    
    # Metrics to compare (DSR column -> SB column)
    COMPARE = [
        ("Total Calls", "calls"),
        ("Inbound",     "inbound"),
        ("Outbound",    "outbound"),
        ("Total Texts", "texts"),
        ("Outbound Texts","out_texts"),
        ("Quotes",      "quotes"),
        ("NB",          "nb_count"),
        ("Items",       "items"),
    ]
    
    # Compare
    print(f"\n[3] Comparing (excluding premium)...")
    mismatches = []
    total_compared = 0
    
    for target_date in sorted(TARGET_DATES):
        date_mismatches = 0
        for dsr_name in sorted(dsr_agents):
            sb_name = name_map.get(dsr_name)
            if not sb_name:
                continue
            
            dsr_row = dsr.get((target_date, dsr_name))
            sb_row = sb.get((target_date.isoformat(), sb_name))
            
            if not dsr_row:
                continue
            
            for dsr_col, sb_col in COMPARE:
                dsr_val = dsr_row.get(dsr_col, 0)
                sb_val = int(float(sb_row.get(sb_col) or 0)) if sb_row else 0
                
                total_compared += 1
                if dsr_val != sb_val:
                    diff = sb_val - dsr_val
                    mismatches.append({
                        "date": target_date,
                        "agent": dsr_name,
                        "metric": sb_col,
                        "dsr": dsr_val,
                        "sb": sb_val,
                        "diff": diff,
                    })
                    date_mismatches += 1
        
        print(f"  {target_date}: {date_mismatches} mismatches")
    
    # Summary
    print(f"\n{'=' * 90}")
    print(f"  TOTAL: {total_compared} comparisons, {len(mismatches)} mismatches")
    print(f"{'=' * 90}")
    
    # By metric
    by_metric = {}
    for m in mismatches:
        by_metric.setdefault(m["metric"], []).append(m)
    
    print(f"\n  Mismatches by metric:")
    for metric in ["calls", "inbound", "outbound", "texts", "out_texts", "quotes", "nb_count", "items"]:
        count = len(by_metric.get(metric, []))
        if count:
            print(f"    {metric:<16s}: {count}")
    
    # Detailed table
    if mismatches:
        print(f"\n  DETAILED MISMATCHES:")
        print(f"  {'Date':<12s} {'Agent':<16s} {'Metric':<16s} {'DSR':>8s} {'Supabase':>8s} {'Diff':>8s}")
        print(f"  {'-'*12} {'-'*16} {'-'*16} {'-'*8} {'-'*8} {'-'*8}")
        for m in sorted(mismatches, key=lambda x: (x["date"], x["agent"], x["metric"])):
            sign = f"+{m['diff']}" if m['diff'] > 0 else str(m['diff'])
            print(f"  {str(m['date']):<12s} {m['agent']:<16s} {m['metric']:<16s} {m['dsr']:>8d} {m['sb']:>8d} {sign:>8s}")
    
    # Agents in DSR but missing from Supabase
    print(f"\n  Agents in DSR but with NO Supabase data for a given date:")
    for target_date in sorted(TARGET_DATES):
        for dsr_name in sorted(dsr_agents):
            sb_name = name_map.get(dsr_name)
            if not sb_name:
                continue
            dsr_row = dsr.get((target_date, dsr_name))
            sb_row = sb.get((target_date.isoformat(), sb_name))
            if dsr_row and not sb_row:
                print(f"    {target_date} — {dsr_name}")

if __name__ == "__main__":
    main()
