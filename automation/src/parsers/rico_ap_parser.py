"""
rico_ap_parser.py — Ricochet Agent Performance parser.

Parses "Agent Performance (N).xlsx" files downloaded from Ricochet.
These contain pre-aggregated daily call counts per agent.

Note: These xlsx files cause openpyxl to crash due to a page-margin bug,
so we read them directly via zipfile + xml.etree.ElementTree.

Input: Agent Performance (N).xlsx with columns:
  Name, Contacts, Real Time Calls, Live Queue Calls, Evening Queue Calls,
  Drip-Dial Calls, Boost Queue Calls, Email Queue Calls, Campaign Queue Calls,
  Direct Dial Calls, Inbound Calls, Total Outbound Calls, Total Queue Calls,
  Total Non Queue Calls, Total Calls, Total transfers in, Total transfers out

Output: DataFrame with columns:
  Agent, Calls, Inbound, Outbound
  (TalkTimeSeconds is NOT included — that comes from Rico CH zips)
"""

import re
import zipfile
import xml.etree.ElementTree as ET
import pandas as pd
from pathlib import Path
from datetime import date as date_type, datetime, timedelta

from src.spine import Spine


# Column letters in the xlsx for the fields we need:
#   A = Name, K = Inbound Calls, L = Total Outbound Calls, O = Total Calls
_COL_MAP = {
    "A": "Name",
    "K": "Inbound",
    "L": "Outbound",
    "O": "Calls",
}

# Names to skip (dialers, owners, etc.)
_SKIP_NAMES = {"LM Dialer 1", "LM Dialer 2", "LM Dialer 3", "Total"}


def parse_downloads(
    downloads_folder: str,
    spine: Spine,
    target_date: date_type | None = None,
    batch_selector=None,
) -> pd.DataFrame:
    """
    Scan Downloads folder for Agent Performance xlsx files.

    Two modes of operation:

    1. Batch mode (batch_selector provided):
       Uses the pre-computed file assignment from BatchSelector.
       This handles Monday catch-ups where multiple files share the same
       download day. See batch_selector.py for the assignment algorithm.

    2. Single mode (no batch_selector):
       Finds a file whose mtime matches target_date + 1 (the expected
       download day for a normal weekday). Falls back to target_date
       mtime if the next-day file isn't found.
    """
    folder = Path(downloads_folder)

    # --- Batch mode: use pre-assigned file ---
    if batch_selector is not None:
        selected = batch_selector.get_file(target_date)
        if selected is None:
            print(f"[rico_ap_parser] No Agent Performance file assigned for {target_date}")
            return pd.DataFrame()
        print(f"[rico_ap_parser] Batch: using {selected.name} for {target_date}")
        return _parse_xlsx(selected, spine, target_date)

    # --- Single mode: find by mtime ---
    all_files = sorted(
        folder.glob("Agent Performance*.xlsx"),
        key=lambda f: f.stat().st_mtime,
        reverse=True,
    )

    if not all_files:
        print("[rico_ap_parser] No Agent Performance xlsx files found in Downloads")
        return pd.DataFrame()

    # Try to find a file downloaded the day after target_date
    selected = None
    if target_date is not None:
        next_day = target_date + timedelta(days=1)
        for f in all_files:
            mtime_date = datetime.fromtimestamp(f.stat().st_mtime).date()
            if mtime_date == next_day:
                selected = f
                break
        if selected is None:
            # Also check if there's a file from the target date itself
            for f in all_files:
                mtime_date = datetime.fromtimestamp(f.stat().st_mtime).date()
                if mtime_date == target_date:
                    selected = f
                    break

    if selected is None:
        # No file for the expected download date — don't silently use wrong data
        if target_date:
            print(
                f"[rico_ap_parser] No Agent Performance file for {target_date}. "
                f"Expected a file downloaded on {target_date + timedelta(days=1)} or {target_date}. "
                f"For weekend catch-ups, use --batch mode."
            )
            return pd.DataFrame()
        else:
            # No target date specified — just use newest
            selected = all_files[0]

    print(f"[rico_ap_parser] Using: {selected.name} (for target {target_date})")
    return _parse_xlsx(selected, spine, target_date)


def _parse_xlsx(
    file_path: Path,
    spine: Spine,
    target_date: date_type | None = None,
) -> pd.DataFrame:
    """Read Agent Performance xlsx via zipfile (bypasses openpyxl page-margin bug)."""
    try:
        strings = _read_shared_strings(file_path)
        rows_data = _read_sheet_rows(file_path, strings)
    except Exception as e:
        print(f"[rico_ap_parser] Error reading {file_path.name}: {e}")
        return pd.DataFrame()

    if not rows_data:
        return pd.DataFrame()

    # Skip header row (index 0)
    records = []
    for row in rows_data[1:]:
        name = row.get("A", "").strip()
        if not name or name in _SKIP_NAMES:
            continue

        # Resolve through spine
        agent = spine.resolve_agent(name)
        if not agent:
            continue

        calls = _to_int(row.get("O", "0"))
        inbound = _to_int(row.get("K", "0"))
        outbound = _to_int(row.get("L", "0"))

        records.append({
            "Agent": agent,
            "Calls": calls,
            "Inbound": inbound,
            "Outbound": outbound,
        })

    df = pd.DataFrame(records)

    if len(df) > 0:
        # Some agents may appear multiple times if spine maps collide; aggregate
        df = df.groupby("Agent").agg(
            Calls=("Calls", "sum"),
            Inbound=("Inbound", "sum"),
            Outbound=("Outbound", "sum"),
        ).reset_index()

        if target_date is not None:
            df["Date"] = target_date

    print(f"[rico_ap_parser] Parsed {len(df)} agents from {file_path.name}")
    return df


def _read_shared_strings(xlsx_path: Path) -> list[str]:
    """Read the shared strings table from an xlsx file."""
    ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    strings = []
    with zipfile.ZipFile(xlsx_path) as zf:
        if "xl/sharedStrings.xml" not in zf.namelist():
            return strings
        tree = ET.parse(zf.open("xl/sharedStrings.xml"))
        for si in tree.findall(f".//{{{ns}}}si"):
            texts = si.findall(f".//{{{ns}}}t")
            strings.append("".join(t.text or "" for t in texts))
    return strings


def _read_sheet_rows(xlsx_path: Path, strings: list[str]) -> list[dict]:
    """Read all rows from sheet1, returning list of {col_letter: value} dicts."""
    ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    rows_data = []
    with zipfile.ZipFile(xlsx_path) as zf:
        tree = ET.parse(zf.open("xl/worksheets/sheet1.xml"))
        for row in tree.findall(f".//{{{ns}}}row"):
            row_dict = {}
            for cell in row.findall(f"{{{ns}}}c"):
                ref = cell.get("r", "")
                cell_type = cell.get("t")
                v_elem = cell.find(f"{{{ns}}}v")
                val = v_elem.text if v_elem is not None else ""
                if cell_type == "s" and val:
                    val = strings[int(val)]
                # Extract column letter(s)
                col = "".join(ch for ch in ref if ch.isalpha())
                row_dict[col] = val
            rows_data.append(row_dict)
    return rows_data


def _to_int(val: str) -> int:
    """Safely convert a string to int."""
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return 0
