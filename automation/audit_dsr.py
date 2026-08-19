"""
Re-audit v2: Compare NB items + AZ Premium from DSR Excel vs Supabase.
Uses Spine resolver for correct name matching.
"""
import os, json, sys
import pandas as pd
import requests
import warnings
warnings.filterwarnings("ignore")
sys.stdout.reconfigure(encoding='utf-8')

REPORT_DATE = "2026-04-29"
DSR_PATH = r"C:\Users\scag3s29\Documents\Claude Scope\Daily Standup Report.xlsx"

from src.spine import Spine

def load_config():
    with open("config/config.json") as f:
        return json.load(f)

def get_supabase_data(config):
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or config.get("supabase", {}).get("url")
    key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") or config.get("supabase", {}).get("key")
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    r = requests.get(f"{url}/rest/v1/agents?select=id,name,office,team&active=eq.true", headers=headers)
    agents = {a["id"]: a for a in r.json()}
    r = requests.get(f"{url}/rest/v1/daily_metrics?select=*&report_date=eq.{REPORT_DATE}", headers=headers)
    metrics = r.json()
    r = requests.get(f"{url}/rest/v1/leads_snapshot?select=*&report_date=eq.{REPORT_DATE}", headers=headers)
    leads = {l["agent_id"]: l for l in r.json()}

    year, month, _ = REPORT_DATE.split("-")
    first_day = f"{year}-{month}-01"
    r = requests.get(f"{url}/rest/v1/daily_metrics?select=agent_id,items,prem_premium&report_date=gte.{first_day}&report_date=lte.{REPORT_DATE}", headers=headers)
    mtd_items = {}; mtd_prem = {}
    for m in r.json():
        aid = m["agent_id"]
        mtd_items[aid] = mtd_items.get(aid, 0) + (m.get("items") or 0)
        mtd_prem[aid] = mtd_prem.get(aid, 0) + (float(m.get("prem_premium") or 0))

    rows = {}
    for m in metrics:
        aid = m["agent_id"]
        agent = agents.get(aid, {})
        lead = leads.get(aid, {})
        rows[agent.get("name", "??")] = {
            "Calls": m.get("calls") or 0, "Inbound": m.get("inbound") or 0,
            "Outbound": m.get("outbound") or 0, "TalkTimeSec": m.get("talk_time_seconds") or 0,
            "Texts": m.get("texts") or 0, "OutTexts": m.get("out_texts") or 0,
            "OptIns": m.get("opt_ins") or 0, "OptOuts": m.get("opt_outs") or 0,
            "Quotes": m.get("quotes") or 0, "NB": m.get("nb_count") or 0,
            "Premium": float(m.get("prem_premium") or 0), "Items": m.get("items") or 0,
            "ItemsMTD": mtd_items.get(aid, 0), "PremiumMTD": mtd_prem.get(aid, 0),
            "Contact": lead.get("contact") or 0, "Quoted": lead.get("quoted") or 0,
            "Hot": lead.get("hot") or 0, "XDate": lead.get("xsale") or 0,
        }
    return rows


def read_manual_dsr(spine):
    from datetime import date
    target = date(2026, 4, 29)
    first_of_month = date(2026, 4, 1)

    result = {}
    for agent in spine.agent_names():
        result[agent] = {
            "Calls": 0, "Inbound": 0, "Outbound": 0, "TalkTimeSec": 0,
            "Texts": 0, "OutTexts": 0, "OptIns": 0, "OptOuts": 0,
            "Quotes": 0, "NB": 0, "Premium": 0, "Items": 0,
            "ItemsMTD": 0, "PremiumMTD": 0,
        }

    # RC
    rc_df = pd.read_excel(DSR_PATH, sheet_name="RC")
    rc_df["DateOnly"] = pd.to_datetime(rc_df["Date"]).dt.date
    rc_day = rc_df[rc_df["DateOnly"] == target]
    for _, row in rc_day.iterrows():
        agent = spine.resolve_agent(str(row.get("Name", "")))
        if agent and agent in result:
            def to_sec(v):
                if hasattr(v, 'total_seconds'): return int(v.total_seconds())
                return 0
            result[agent]["Calls"] += int(row.get("Total Calls", 0) or 0)
            result[agent]["Inbound"] += int(row.get("# Inbound", 0) or 0)
            result[agent]["Outbound"] += int(row.get("# Outbound", 0) or 0)
            result[agent]["TalkTimeSec"] += to_sec(row.get("Total Handle Time"))

    # Rico CH
    rico_df = pd.read_excel(DSR_PATH, sheet_name="RicoCH")
    rico_df["DateOnly"] = pd.to_datetime(rico_df["Date"]).dt.date
    rico_day = rico_df[rico_df["DateOnly"] == target]
    for _, row in rico_day.iterrows():
        user = str(row.get("User", ""))
        if user == "nan" or not user.strip(): continue
        agent = spine.resolve_agent(user)
        if agent and agent in result:
            result[agent]["Calls"] += 1
            if "inbound" in str(row.get("Call Type", "")).lower():
                result[agent]["Inbound"] += 1
            else:
                result[agent]["Outbound"] += 1
            result[agent]["TalkTimeSec"] += int(row.get("Call Duration In Seconds", 0) or 0)

    # HS
    hs_df = pd.read_excel(DSR_PATH, sheet_name="HS")
    hs_df["DateOnly"] = pd.to_datetime(hs_df["Date"]).dt.date
    hs_day = hs_df[hs_df["DateOnly"] == target]
    hs_cols = hs_df.columns.tolist()
    opt_in_col = [c for c in hs_cols if "opt" in c.lower() and "in" in c.lower()]
    opt_out_col = [c for c in hs_cols if "opt" in c.lower() and "out" in c.lower()]
    for _, row in hs_day.iterrows():
        agent = spine.resolve_agent(str(row.get("User Name", "")))
        if agent and agent in result:
            result[agent]["Texts"] += int(row.get("Number of Total Messages", 0) or 0)
            result[agent]["OutTexts"] += int(row.get("Number of Outbound Messages", 0) or 0)
            if opt_in_col: result[agent]["OptIns"] += int(row.get(opt_in_col[0], 0) or 0)
            if opt_out_col: result[agent]["OptOuts"] += int(row.get(opt_out_col[0], 0) or 0)

    # Quotes
    q_df = pd.read_excel(DSR_PATH, sheet_name="Quotes")
    q_df["DateOnly"] = pd.to_datetime(q_df["Date"]).dt.date
    q_day = q_df[q_df["DateOnly"] == target]
    for _, row in q_day.iterrows():
        agent = spine.resolve_agent(str(row.get("Sub Producer", "")))
        if agent and agent in result:
            result[agent]["Quotes"] += 1

    # NB (daily items & NB count)
    nb_df = pd.read_excel(DSR_PATH, sheet_name="NB")
    nb_df["DateOnly"] = pd.to_datetime(nb_df["Date"]).dt.date
    nb_day = nb_df[nb_df["DateOnly"] == target]
    for _, row in nb_day.iterrows():
        agent = spine.resolve_agent(str(row.get("Sub-Producer Name", "")))
        if agent and agent in result:
            result[agent]["NB"] += 1
            result[agent]["Items"] += int(row.get("Item Count", 1) or 1)

    # NB MTD items
    nb_month = nb_df[(nb_df["DateOnly"] >= first_of_month) & (nb_df["DateOnly"] <= target)]
    for _, row in nb_month.iterrows():
        agent = spine.resolve_agent(str(row.get("Sub-Producer Name", "")))
        if agent and agent in result:
            result[agent]["ItemsMTD"] += int(row.get("Item Count", 1) or 1)

    # Premium (AZ) daily
    prem_df = pd.read_excel(DSR_PATH, sheet_name="Premium")
    prem_df["DateOnly"] = pd.to_datetime(prem_df["Date"]).dt.date
    prem_day = prem_df[prem_df["DateOnly"] == target]
    for _, row in prem_day.iterrows():
        agent = spine.resolve_agent(str(row.get("Producer", "")))
        if agent and agent in result:
            result[agent]["Premium"] += float(row.get("Premium", 0) or 0)

    # Premium MTD
    prem_month = prem_df[(prem_df["DateOnly"] >= first_of_month) & (prem_df["DateOnly"] <= target)]
    for _, row in prem_month.iterrows():
        agent = spine.resolve_agent(str(row.get("Producer", "")))
        if agent and agent in result:
            result[agent]["PremiumMTD"] += float(row.get("Premium", 0) or 0)

    return result


def fmt_time(secs):
    h, rem = divmod(int(secs), 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}"


def main():
    config = load_config()
    spine = Spine(DSR_PATH, sheet_name="Spine", excluded_agents=["Teyssy", "Elizabeth"])

    print("=" * 100)
    print(f"  RE-AUDIT -- {REPORT_DATE}")
    print("=" * 100)

    print("\n[1] Reading manual DSR sources...")
    manual = read_manual_dsr(spine)
    m_items = sum(v["ItemsMTD"] for v in manual.values())
    m_prem = sum(v["PremiumMTD"] for v in manual.values())
    print(f"  Items MTD: {m_items}")
    print(f"  Premium MTD: ${m_prem:,.0f}")

    print("\n[2] Fetching Supabase...")
    sb = get_supabase_data(config)
    s_items = sum(v["ItemsMTD"] for v in sb.values())
    s_prem = sum(v["PremiumMTD"] for v in sb.values())
    print(f"  Items MTD: {s_items}")
    print(f"  Premium MTD: ${s_prem:,.0f}")

    compare_cols = ["Calls", "Inbound", "Outbound", "TalkTimeSec",
                    "Texts", "OutTexts", "OptIns", "OptOuts",
                    "Quotes", "NB", "Premium", "Items", "ItemsMTD", "PremiumMTD"]

    all_agents = sorted(set(list(manual.keys()) + list(sb.keys())))
    mismatches = []

    for agent in all_agents:
        m = manual.get(agent, {})
        s = sb.get(agent, {})
        diffs = []
        for col in compare_cols:
            mv = m.get(col, 0)
            sv = s.get(col, 0)
            if "Premium" in col:
                if abs(mv - sv) > 1: diffs.append((col, mv, sv))
            elif "TalkTime" in col:
                if abs(mv - sv) > 5: diffs.append((col, mv, sv))
            else:
                if mv != sv: diffs.append((col, mv, sv))
        if diffs:
            mismatches.append((agent, diffs))

    print(f"\n{'='*100}")
    print(f"  MISMATCHES ({len(mismatches)} agents)")
    print(f"{'='*100}")

    for agent, diffs in mismatches:
        print(f"\n  ** {agent} **")
        for col, mv, sv in diffs:
            if "TalkTime" in col:
                print(f"      {col:15s}  Manual={fmt_time(mv):>10}  SB={fmt_time(sv):>10}  Delta={sv-mv}s")
            elif "Premium" in col:
                print(f"      {col:15s}  Manual=${mv:>10,.0f}  SB=${sv:>10,.0f}  Delta=${sv-mv:,.0f}")
            else:
                print(f"      {col:15s}  Manual={mv:>10}  SB={sv:>10}  Delta={sv-mv}")

    matched = len(all_agents) - len(mismatches)
    print(f"\n\n{'='*100}")
    print(f"  SUMMARY")
    print(f"{'='*100}")
    print(f"  Agents matched:     {matched}/{len(all_agents)}")
    print(f"  Agents mismatched:  {len(mismatches)}/{len(all_agents)}")
    print(f"  Items MTD:   Manual={m_items}  SB={s_items}  Delta={s_items-m_items}")
    print(f"  Premium MTD: Manual=${m_prem:,.0f}  SB=${s_prem:,.0f}  Delta=${s_prem-m_prem:,.0f}")


if __name__ == "__main__":
    main()
