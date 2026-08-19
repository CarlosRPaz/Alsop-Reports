"""Compare DSR Excel vs Supabase for 2026-05-05."""
import zipfile
import xml.etree.ElementTree as ET
import json
import requests
from datetime import datetime, timedelta, date
from pathlib import Path

ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
DSR_PATH = r"C:\Users\scag3s29\Documents\Claude Scope\Daily Standup Report.xlsx"
CONFIG_PATH = r"C:\Users\scag3s29\Documents\Claude Scope\excel-report-automation\config\config.json"
TARGET_DATES = {date(2026, 5, 5)}
BASE = datetime(1899, 12, 30)

def read_dsr():
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

    dsr = {}
    for row in rows[header_idx + 1:]:
        data = {}
        for cell in row.findall(f"{{{ns}}}c"):
            ref = cell.get("r", "")
            col = "".join(ch for ch in ref if ch.isalpha())
            val = cell_val(cell)
            col_name = header.get(col, "")
            if col_name:
                data[col_name] = val
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
        parsed = {}
        for key in ["Inbound", "Outbound", "Total Calls", "Total Texts", "Outbound Texts",
                     "Quotes", "NB", "Items"]:
            raw = data.get(key, "0")
            try:
                parsed[key] = int(float(raw)) if raw else 0
            except:
                parsed[key] = 0
        if parsed["Total Calls"] == 0 and (parsed["Inbound"] > 0 or parsed["Outbound"] > 0):
            parsed["Total Calls"] = parsed["Inbound"] + parsed["Outbound"]
        dsr[(dt, agent)] = parsed
    return dsr


def read_supabase():
    cfg = json.loads(Path(CONFIG_PATH).read_text())
    url = cfg["supabase"]["url"]
    key = cfg["supabase"]["key"]
    hdrs = {"apikey": key, "Authorization": f"Bearer {key}"}
    res = requests.get(f"{url}/rest/v1/agents?select=id,name", headers=hdrs)
    agents_map = {a["id"]: a["name"] for a in res.json()}
    res = requests.get(f"{url}/rest/v1/daily_metrics?report_date=eq.2026-05-05&select=*", headers=hdrs)
    sb = {}
    for m in res.json():
        name = agents_map.get(m["agent_id"], "Unknown")
        sb[(m["report_date"], name)] = m
    return sb


def main():
    print("=" * 90)
    print("  DSR vs Supabase Comparison — 5/5/2026")
    print("=" * 90)

    print("\n[1] Reading DSR Excel...")
    dsr = read_dsr()
    dsr_agents = set(a for (_, a) in dsr)
    print(f"  {len(dsr)} rows, {len(dsr_agents)} unique agents")

    print("\n[2] Reading Supabase...")
    sb = read_supabase()
    sb_agents = set(a for (_, a) in sb)
    print(f"  {len(sb)} rows, {len(sb_agents)} unique agents")

    # Name mapping
    name_map = {}
    for dn in dsr_agents:
        for sn in sb_agents:
            if dn.lower() == sn.lower():
                name_map[dn] = sn
                break
            elif dn.lower() == sn.split()[0].lower():
                name_map[dn] = sn
                break

    unmatched = dsr_agents - set(name_map.keys())
    if unmatched:
        print(f"  [!] Unmatched DSR agents: {sorted(unmatched)}")

    COMPARE = [
        ("Total Calls", "calls"),
        ("Inbound", "inbound"),
        ("Outbound", "outbound"),
        ("Total Texts", "texts"),
        ("Outbound Texts", "out_texts"),
        ("Quotes", "quotes"),
        ("NB", "nb_count"),
        ("Items", "items"),
    ]

    mismatches = []
    total = 0
    for dt in sorted(TARGET_DATES):
        for dn in sorted(dsr_agents):
            sn = name_map.get(dn)
            if not sn:
                continue
            dr = dsr.get((dt, dn))
            sr = sb.get((dt.isoformat(), sn))
            if not dr:
                continue
            for dc, sc in COMPARE:
                dv = dr.get(dc, 0)
                sv = int(float(sr.get(sc) or 0)) if sr else 0
                total += 1
                if dv != sv:
                    mismatches.append((dt, dn, sc, dv, sv, sv - dv))

    print(f"\n{'='*90}")
    print(f"  DSR agents: {len(dsr_agents)} | SB agents: {len(sb_agents)} | Matched: {len(name_map)}")
    print(f"  Total comparisons: {total} | Mismatches: {len(mismatches)}")
    print(f"{'='*90}")

    if mismatches:
        print(f"\n  {'Date':<12} {'Agent':<16} {'Metric':<16} {'DSR':>8} {'Supabase':>8} {'Diff':>8}")
        print(f"  {'-'*12} {'-'*16} {'-'*16} {'-'*8} {'-'*8} {'-'*8}")
        for dt, agent, metric, dv, sv, diff in sorted(mismatches):
            sign = f"+{diff}" if diff > 0 else str(diff)
            print(f"  {str(dt):<12} {agent:<16} {metric:<16} {dv:>8d} {sv:>8d} {sign:>8}")
        by_metric = {}
        for _, _, m, _, _, _ in mismatches:
            by_metric[m] = by_metric.get(m, 0) + 1
        print(f"\n  Mismatches by metric:")
        for m, c in sorted(by_metric.items()):
            print(f"    {m:<16}: {c}")
    else:
        print("\n  *** ALL NUMBERS MATCH! ***")

    # Check for agents in DSR but no SB row at all
    missing_sb = []
    for dt in sorted(TARGET_DATES):
        for dn in sorted(dsr_agents):
            sn = name_map.get(dn)
            if not sn:
                continue
            dr = dsr.get((dt, dn))
            sr = sb.get((dt.isoformat(), sn))
            if dr and not sr:
                missing_sb.append((dt, dn))
    if missing_sb:
        print(f"\n  Agents in DSR but NO Supabase row:")
        for dt, dn in missing_sb:
            print(f"    {dt} — {dn}")


if __name__ == "__main__":
    main()
