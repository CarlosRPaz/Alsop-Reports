"""
rico_parser.py — Ricochet CRM call data parser.

Handles two input formats:
  1. Multi-date Excel export (rico_export.xlsx) — has Date column
  2. Daily ZIP downloads from Ricochet (no Date column, CSV inside ZIP)
     Filename: "agents-performance-ap-{id}-d-{YYMMDD}-{YYMMDD}-{hash}.zip"
     Date is extracted from filename.

Output: DataFrame with columns:
  Date, Agent, RicoContacts, RicoTotalCalls, RicoInbound, RicoOutbound,
  RicoQueueCalls, RicoDirectDial
"""

import re
import zipfile
import io
import pandas as pd
from pathlib import Path
from datetime import date as date_type

from src.spine import Spine


def parse(file_path: str, spine: Spine, target_date=None, sheet_name=0) -> pd.DataFrame:
    """Parse a single Rico file (Excel, CSV, or ZIP containing CSV)."""
    path = Path(file_path)

    if path.suffix.lower() == ".zip":
        df = _read_zip_csv(path)
        report_date = _date_from_filename(path) or target_date
        df["Date"] = report_date
    elif path.suffix.lower() == ".csv":
        df = pd.read_csv(file_path)
        report_date = _date_from_filename(path) or target_date
        df["Date"] = report_date
    else:
        df = pd.read_excel(file_path, engine="openpyxl", sheet_name=sheet_name)
        if target_date is not None and "Date" in df.columns:
            df["Date"] = pd.to_datetime(df["Date"])
            df = df[df["Date"].dt.date == pd.Timestamp(target_date).date()]

    return _process_df(df, spine, Path(file_path).name)


def parse_downloads(
    downloads_folder: str,
    spine: Spine,
    target_date: date_type | None = None,
) -> pd.DataFrame:
    """
    Scan a folder for Rico agents-performance ZIP files,
    extract CSVs, and return aggregated data.

    Filename pattern: agents-performance-ap-*-d-{YYMMDD}-{YYMMDD}-*.zip
    """
    folder = Path(downloads_folder)
    if not folder.exists():
        print(f"[rico_parser] Downloads folder not found: {folder}")
        return pd.DataFrame()

    # Find agents-performance ZIPs
    all_zips = list(folder.glob("agents-performance-ap-*.zip"))

    if not all_zips:
        print(f"[rico_parser] No Rico agents-performance ZIPs found in {folder}")
        return pd.DataFrame()

    # Filter by target date if specified
    if target_date is not None:
        matching = []
        for zp in all_zips:
            file_date = _date_from_filename(zp)
            if file_date == target_date:
                matching.append(zp)
        # If duplicates (e.g. "(1).zip"), take the first one
        all_zips = matching[:1] if matching else []

    if not all_zips:
        print(f"[rico_parser] No Rico ZIPs found for date {target_date}")
        return pd.DataFrame()

    # Read the ZIP (should be just one per day for agents-performance)
    zp = all_zips[0]
    try:
        df = _read_zip_csv(zp)
        report_date = _date_from_filename(zp) or target_date
        df["Date"] = report_date
        result = _process_df(df, spine, zp.name)
        return result
    except Exception as e:
        print(f"[rico_parser] Error reading {zp.name}: {e}")
        return pd.DataFrame()


def _read_zip_csv(zip_path: Path) -> pd.DataFrame:
    """Extract and read the CSV from inside a ZIP file."""
    with zipfile.ZipFile(str(zip_path)) as z:
        csv_files = [n for n in z.namelist() if n.lower().endswith(".csv")]
        if not csv_files:
            raise ValueError(f"No CSV found in {zip_path.name}")
        with z.open(csv_files[0]) as f:
            return pd.read_csv(f)


def _process_df(df: pd.DataFrame, spine: Spine, source_name: str = "") -> pd.DataFrame:
    """Common processing for both formats."""
    df["Agent"] = df["Name"].apply(spine.resolve_agent)
    df = df.dropna(subset=["Agent"])

    # Filter out "LM Dialer" rows (automated dialer, not an agent)
    df = df[df["Agent"] != "LM Dialer"]

    result = df[["Date", "Agent"]].copy()
    result["RicoContacts"] = df.get("Contacts", pd.Series(0)).fillna(0).astype(int)
    result["RicoTotalCalls"] = df.get("Total Calls", pd.Series(0)).fillna(0).astype(int)
    result["RicoInbound"] = df.get("Inbound Calls", pd.Series(0)).fillna(0).astype(int)
    result["RicoOutbound"] = df.get("Total Outbound Calls", pd.Series(0)).fillna(0).astype(int)
    result["RicoQueueCalls"] = df.get("Total Queue Calls", pd.Series(0)).fillna(0).astype(int)
    result["RicoDirectDial"] = df.get("Direct Dial Calls", pd.Series(0)).fillna(0).astype(int)

    result = result.fillna(0)
    print(f"[rico_parser] Parsed {len(result)} rows from {source_name}")
    return result


def _date_from_filename(path: Path) -> date_type | None:
    """
    Extract date from Rico ZIP/CSV filename.
    Pattern: agents-performance-ap-{id}-d-{YYMMDD}-{YYMMDD}-{hash}.zip
    or: call-history-ch-{id}-d-{YYMMDD}-{YYMMDD}-{hash}.zip
    """
    # Match the date portion: -d-YYMMDD-YYMMDD-
    match = re.search(r'-d-(\d{6})-\d{6}-', path.name)
    if match:
        date_str = match.group(1)  # e.g. "251211"
        try:
            yy = int(date_str[:2])
            mm = int(date_str[2:4])
            dd = int(date_str[4:6])
            year = 2000 + yy
            return date_type(year, mm, dd)
        except ValueError:
            return None
    return None
