"""
rico_leads_parser.py — Ricochet LeadSwami Report (lead status snapshot) Parser.

Counts ONLY the 4 exact statuses per agent (Lead Owner):
    Contact = "2.0 CONTACTED - Follow Up"
    Quoted  = "3.0 QUOTED"
    Hot     = "3.1 QUOTED - HOT!!!!"
    XDate   = "3.3 XDATE- Task Set" / "3.3 XDATE - Task Set"
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Dict, Any, List
import pandas as pd

STATUS_MAP = {
    "2.0 CONTACTED - Follow Up": "contact",
    "3.0 QUOTED": "quoted",
    "3.1 QUOTED - HOT!!!!": "hot",
    "3.3 XDATE- Task Set": "xsale",
    "3.3 XDATE - Task Set": "xsale",
}

USECOLS = ["Lead Owner", "Lead Status"]

def parse_rico_leads_csv(file_path: str, agents_list: List[Dict[str, Any]] = None, report_date: str = None) -> List[Dict[str, Any]]:
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Leads CSV not found at: {file_path}")

    # Read CSV
    df = None
    for enc in ("utf-8", "utf-8-sig", "latin-1"):
        try:
            df = pd.read_csv(file_path, encoding=enc, low_memory=False)
            break
        except UnicodeDecodeError:
            continue
    
    if df is None:
        df = pd.read_csv(file_path, encoding="utf-8", encoding_errors="ignore", low_memory=False)

    # Normalize columns
    col_map = {}
    for c in df.columns:
        c_clean = str(c).strip()
        if c_clean.lower() in ["lead owner", "owner", "agent", "user"]:
            col_map[c] = "Lead Owner"
        elif c_clean.lower() in ["lead status", "status", "stage"]:
            col_map[c] = "Lead Status"
    
    df = df.rename(columns=col_map)
    
    if "Lead Owner" not in df.columns or "Lead Status" not in df.columns:
        print(f"[rico_leads_parser] Warning: Could not find required columns in CSV. Available: {list(df.columns)}")
        return []

    # Map agents by name & system_variants
    name_to_agent_id = {}
    if agents_list:
        for a in agents_list:
            aid = a.get("id")
            name = a.get("name", "")
            if name:
                name_to_agent_id[name.lower().strip()] = aid
            
            # Check system variants
            variants = a.get("system_variants") or {}
            if isinstance(variants, dict):
                for v in variants.values():
                    if isinstance(v, str) and v:
                        name_to_agent_id[v.lower().strip()] = aid
                    elif isinstance(v, list):
                        for item in v:
                            if isinstance(item, str) and item:
                                name_to_agent_id[item.lower().strip()] = aid

    # Filter to ONLY exact statuses
    df_filtered = df[df["Lead Status"].isin(STATUS_MAP.keys())].copy()
    df_filtered["status_key"] = df_filtered["Lead Status"].map(STATUS_MAP)

    if df_filtered.empty:
        print("[rico_leads_parser] No rows matched the 4 exact target statuses.")
        return []

    # Aggregate by Lead Owner
    grouped = df_filtered.groupby(["Lead Owner", "status_key"]).size().unstack(fill_value=0).reset_index()

    for k in ["contact", "quoted", "hot", "xsale"]:
        if k not in grouped.columns:
            grouped[k] = 0

    results = []
    for _, row in grouped.iterrows():
        owner_name = str(row["Lead Owner"]).strip()
        owner_lower = owner_name.lower()
        
        # Skip dialer queues or non-human accounts unless explicitly an agent
        if "dialer" in owner_lower or "admin" in owner_lower or "system" in owner_lower:
            agent_id = name_to_agent_id.get(owner_lower)
            if not agent_id:
                continue

        # Match agent ID
        agent_id = name_to_agent_id.get(owner_lower)
        if not agent_id and agents_list:
            for a in agents_list:
                a_name = a.get("name", "").lower()
                if a_name and a_name == owner_lower:
                    agent_id = a.get("id")
                    break

        if agent_id:
            results.append({
                "agent_id": agent_id,
                "agent_name": owner_name,
                "report_date": report_date,
                "contact": int(row["contact"]),
                "quoted": int(row["quoted"]),
                "hot": int(row["hot"]),
                "xsale": int(row["xsale"]),
            })
        else:
            print(f"[rico_leads_parser] Ignored unmapped/non-roster owner: '{owner_name}'")

    print(f"[rico_leads_parser] Successfully parsed exact status metrics for {len(results)} roster agents.")
    return results
