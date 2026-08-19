"""
rc_parser.py — RingCentral phone data parser.

Handles two file formats:
  1. Multi-date export (has Date column) — used for historical data (rc_export.xlsx)
  2. Daily scheduled report from Outlook (no Date column, 3 sheets: Filters, KPIs, Users)
     - Date is extracted from the Filters sheet's "From Time" column
     - Data is on the "Users" sheet

Output: DataFrame with columns:
  Date, Agent, Calls, Inbound, Outbound, TalkTimeSeconds
"""

import re
import pandas as pd
from pathlib import Path
from datetime import timedelta, date as date_type

from src.spine import Spine


def parse(file_path: str, spine: Spine, target_date=None, sheet_name=None) -> pd.DataFrame:
    """
    Parse an RC export file.

    Parameters
    ----------
    file_path : str
        Path to the RC Excel file.
    spine : Spine
        Agent name resolver.
    target_date : date, optional
        Filter to this date only. For daily reports (no Date column),
        this is used as the date for all rows.
    sheet_name : str or int, optional
        Sheet to read. If None, auto-detects format.
    """
    path = Path(file_path)

    # Auto-detect format: check if "Users" sheet exists
    try:
        import openpyxl
        wb = openpyxl.load_workbook(str(path), read_only=True)
        sheets = wb.sheetnames
        wb.close()
    except Exception:
        sheets = []

    if "Users" in sheets and sheet_name is None:
        # Daily scheduled report format (from Outlook)
        return _parse_daily_report(file_path, spine, target_date)
    else:
        # Multi-date export format (historical)
        return _parse_multi_date(file_path, spine, target_date, sheet_name or 0)


def _parse_daily_report(file_path: str, spine: Spine, target_date=None) -> pd.DataFrame:
    """Parse the daily scheduled report (Filters + Users sheets)."""
    # Extract date from Filters sheet
    report_date = target_date
    try:
        filters_df = pd.read_excel(file_path, sheet_name="Filters", engine="openpyxl")
        if "From Time" in filters_df.columns:
            from_time = filters_df["From Time"].dropna().iloc[0]
            report_date = pd.to_datetime(from_time).date()
    except Exception:
        pass

    if report_date is None:
        # Try to extract date from filename (e.g. Office_Perf_Users_03_23_2026_...)
        import re
        match = re.search(r'(\d{2})_(\d{2})_(\d{4})', Path(file_path).name)
        if match:
            m, d, y = match.groups()
            report_date = date_type(int(y), int(m), int(d))
        else:
            from datetime import date
            report_date = date.today()

    # Read Users sheet
    df = pd.read_excel(file_path, sheet_name="Users", engine="openpyxl")
    return _process_df(df, spine, report_date, Path(file_path).name)


def _parse_multi_date(file_path: str, spine: Spine, target_date=None,
                      sheet_name=0) -> pd.DataFrame:
    """Parse the multi-date export format (has Date column)."""
    df = pd.read_excel(file_path, engine="openpyxl", sheet_name=sheet_name)

    if "Date" in df.columns:
        df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
        if target_date is not None:
            df = df[df["Date"].dt.date == pd.Timestamp(target_date).date()]

    report_date = target_date  # None means _process_df will keep per-row dates
    return _process_df(df, spine, report_date, Path(file_path).name)


def _process_df(df: pd.DataFrame, spine: Spine, report_date, source_name: str = "") -> pd.DataFrame:
    """Common processing for both formats."""
    col_map = {
        "Total Calls": "Calls",
        "# Inbound": "Inbound",
        "# Outbound": "Outbound",
        "Total Handle Time": "TalkTime",
    }
    df = df.rename(columns={k: v for k, v in col_map.items() if k in df.columns})

    # Resolve agent names
    df["Agent"] = df["Name"].apply(spine.resolve_agent)
    df = df.dropna(subset=["Agent"])

    # Convert TalkTime to total seconds
    df["TalkTimeSeconds"] = df["TalkTime"].apply(_to_seconds) if "TalkTime" in df.columns else 0

    # Set date (preserve per-row dates in multi-date mode)
    if report_date is not None:
        df["Date"] = report_date
    elif "Date" not in df.columns:
        df["Date"] = None

    # Build result
    for col in ["Calls", "Inbound", "Outbound"]:
        if col in df.columns:
            df[col] = df[col].fillna(0).astype(int)
        else:
            df[col] = 0

    result = df[["Date", "Agent", "Calls", "Inbound", "Outbound", "TalkTimeSeconds"]].copy()
    result = result.fillna(0)

    print(f"[rc_parser] Parsed {len(result)} rows{f' from {source_name}' if source_name else ''}")
    return result


def parse_for_date(
    raw_folder: str,
    spine: Spine,
    target_date: date_type,
) -> pd.DataFrame | None:
    """
    Find and parse the RC file whose DATA date matches target_date.

    RC filename convention: rc_YYYYMMDD_Office_Perf_Users_...
    The date in the filename is the PULL date (email arrival date).
    The actual DATA date = pull_date - 1 day.

    So rc_20260429 contains data for 2026-04-28.

    Returns DataFrame or None if no matching file exists.
    """
    folder = Path(raw_folder)
    if not folder.exists():
        return None

    rc_files = list(folder.glob("rc_*.xlsx")) + list(folder.glob("rc_*.xls"))
    if not rc_files:
        print(f"[rc_parser] No RC files found in {raw_folder}")
        return None

    # Find the file whose data date matches target_date
    for f in rc_files:
        data_date = _data_date_from_filename(f)
        if data_date == target_date:
            print(f"[rc_parser] Found RC file for {target_date}: {f.name}")
            return parse(str(f), spine, target_date=target_date)

    # No exact match — report clearly (don't fall back to wrong file)
    newest = max(rc_files, key=lambda f: f.stat().st_mtime)
    newest_data_date = _data_date_from_filename(newest)
    print(f"[rc_parser] No RC file for {target_date} "
          f"(newest has data for {newest_data_date}: {newest.name})")
    return None


def _data_date_from_filename(path: Path) -> date_type | None:
    """
    Extract the DATA date from an RC filename.

    Filename: rc_YYYYMMDD_Office_Perf_Users_...
    The YYYYMMDD is the PULL date. Data date = pull_date - 1 day.
    """
    m = re.search(r"rc_(\d{4})(\d{2})(\d{2})", path.name)
    if m:
        try:
            pull_date = date_type(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            return pull_date - timedelta(days=1)
        except ValueError:
            return None
    return None


def _to_seconds(val) -> int:
    """Convert timedelta or string duration to total seconds."""
    if isinstance(val, timedelta):
        return int(val.total_seconds())
    if pd.isna(val):
        return 0
    # Handle string format like "0 days 00:05:30"
    if isinstance(val, str):
        try:
            return int(pd.to_timedelta(val).total_seconds())
        except Exception:
            return 0
    return 0
