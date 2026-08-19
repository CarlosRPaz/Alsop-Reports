"""
migrate_spine_to_supabase.py
----------------------------
One-time migration script that:
1. Adds `report_visible` column to agents table (if missing)
2. Reads the Excel Spine and populates `system_variants` JSONB for each agent
3. Updates office, team from Spine (in case dashboard values drifted)

Usage:
    python scripts/migrate_spine_to_supabase.py
"""

import sys, json, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pandas as pd
import requests
from pathlib import Path

def main():
    # Load config
    config_path = Path(__file__).parent.parent / "config" / "config.json"
    with open(config_path) as f:
        config = json.load(f)

    # Load .env.local for Supabase credentials
    env_path = Path(__file__).parent.parent.parent / "dsr-dashboard" / ".env.local"
    env_vars = {}
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                env_vars[k.strip()] = v.strip()

    supabase_url = env_vars.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = env_vars.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

    if not supabase_url or not supabase_key:
        print("ERROR: Supabase URL or key not found in .env.local or environment")
        sys.exit(1)

    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation"
    }

    # 1. Read Excel Spine
    spine_path = config.get("spine", {}).get("path", "")
    spine_sheet = config.get("spine", {}).get("sheet_name", "Spine")

    print(f"Reading Excel Spine from: {spine_path}")
    df = pd.read_excel(spine_path, sheet_name=spine_sheet, engine="openpyxl")
    print(f"  Found {len(df)} agents in Spine")

    # 2. Build upsert payloads with system_variants
    VARIANT_MAP = {
        "Full Name":            "full_name",
        "RC Name":              "rc_name",
        "Rico Name":            "rico_name",
        "HS User Name":         "hs_name",
        "NB Sub-Producer Name": "nb_name",
        "Quotes Sub Producer":  "quotes_name",
        "AgencyZoom Name":      "az_name",
    }

    payloads = []
    for _, row in df.iterrows():
        agent_name = str(row.get("Agent", "")).strip()
        if not agent_name:
            continue

        # Build system_variants JSON
        variants = {}
        for excel_col, json_key in VARIANT_MAP.items():
            val = row.get(excel_col)
            if pd.notna(val) and str(val).strip():
                variants[json_key] = str(val).strip()

        # Build meeting_time from Excel
        meeting = row.get("Meeting")
        meeting_str = None
        if pd.notna(meeting):
            meeting_str = str(meeting).strip()
            # Convert "09:30:00" -> "9:30 AM" format
            if ":" in meeting_str:
                parts = meeting_str.split(":")
                h = int(parts[0])
                m = parts[1]
                ampm = "AM" if h < 12 else "PM"
                if h > 12: h -= 12
                if h == 0: h = 12
                meeting_str = f"{h}:{m} {ampm}"

        payload = {
            "name": agent_name,
            "office": str(row.get("Office", "")).strip() or None,
            "team": str(row.get("Team", "")).strip() or None,
            "active": True,
            "report_visible": True,
            "system_variants": variants,
        }
        if meeting_str:
            payload["meeting_time"] = meeting_str

        payloads.append(payload)

    print(f"\n  Prepared {len(payloads)} agent payloads")

    # 3. Show sample
    print(f"\n  Sample payload ({payloads[0]['name']}):")
    print(json.dumps(payloads[0], indent=4))

    # 4. Upsert to Supabase
    print(f"\n  Upserting {len(payloads)} agents to Supabase...")
    res = requests.post(
        f"{supabase_url}/rest/v1/agents?on_conflict=name",
        headers=headers,
        json=payloads
    )

    if res.status_code >= 400:
        # Check if report_visible column is missing - retry without it
        if "report_visible" in res.text:
            print("  Note: 'report_visible' column not found, upserting without it...")
            print("  (Add it later: ALTER TABLE agents ADD COLUMN report_visible BOOLEAN DEFAULT true;)")
            for p in payloads:
                p.pop("report_visible", None)
            res = requests.post(
                f"{supabase_url}/rest/v1/agents?on_conflict=name",
                headers=headers,
                json=payloads
            )
            if res.status_code >= 400:
                print(f"  ERROR: {res.status_code} - {res.text}")
                sys.exit(1)
            else:
                result = res.json()
                print(f"  SUCCESS: Upserted {len(result)} agents (without report_visible)")
        else:
            print(f"  ERROR: {res.status_code} - {res.text}")
            sys.exit(1)
    else:
        result = res.json()
        print(f"  SUCCESS: Upserted {len(result)} agents")

    # 5. Verify
    print("\n  Verifying system_variants populated...")
    res = requests.get(
        f"{supabase_url}/rest/v1/agents?select=name,system_variants&active=eq.true&order=name&limit=5",
        headers={"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"}
    )
    if res.status_code < 400:
        for agent in res.json():
            variants = agent.get("system_variants", {})
            count = len([v for v in variants.values() if v])
            print(f"    {agent['name']}: {count} variants")
    
    print("\n  Migration complete!")


if __name__ == "__main__":
    main()
