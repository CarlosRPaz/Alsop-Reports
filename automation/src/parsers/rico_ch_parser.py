"""
rico_ch_parser.py — Rico Call History parser.

Parses Ricochet Call History ZIP exports (ch-N-YYMMDD-YYMMDD.csv-HASH.zip).
These contain individual call records for Sales/EA agents using the Rico dialer.

Input: ZIP file containing a CSV with columns:
  Date, Full name, User, From, To, Call Duration, Call Duration In Seconds,
  Current Status, Call Type, Call Status, Vendor Name, Team

Output: DataFrame with columns:
  Date, Agent, Calls, Inbound, Outbound, TalkTimeSeconds
"""

import zipfile
import re
import pandas as pd
from pathlib import Path
from datetime import date as date_type

from src.spine import Spine


def parse(file_path: str, spine: Spine, target_date=None) -> pd.DataFrame:
    """Parse a single Rico Call History ZIP file."""
    path = Path(file_path)

    if path.suffix.lower() == ".zip":
        df = _read_zip_csv(path)
    else:
        df = pd.read_csv(file_path)

    return _process_df(df, spine, target_date, source_name=path.name)


def parse_downloads(
    downloads_folder: str,
    spine: Spine,
    target_date: date_type | None = None,
) -> pd.DataFrame:
    """Scan Downloads folder for Rico Call History ZIPs matching the target date."""
    folder = Path(downloads_folder)
    all_zips = list(folder.glob("ch-*.zip"))

    if not all_zips:
        print("[rico_ch_parser] No Rico Call History ZIPs found in Downloads")
        return pd.DataFrame()

    files = []
    if target_date is not None:
        # Check if target_date falls within the date range in each filename
        for zp in all_zips:
            start, end = _date_range_from_filename(zp)
            if start and end and start <= target_date <= end:
                files.append(zp)
        if files:
            print(f"[rico_ch_parser] Found {len(files)} CH file(s) covering {target_date}")
    else:
        # No target date — use newest
        files = sorted(all_zips, key=lambda f: f.stat().st_mtime, reverse=True)

    if not files:
        # No CH file covers the target date — report clearly, don't use wrong data
        print(f"[rico_ch_parser] No CH zip covering {target_date} "
              f"({len(all_zips)} zips available but none match)")
        return pd.DataFrame()

    # Use the most recent matching file
    ch_file = files[0]
    df = _read_zip_csv(ch_file)
    return _process_df(df, spine, target_date, source_name=ch_file.name)


def _read_zip_csv(zip_path: Path) -> pd.DataFrame:
    """Extract and read the CSV from inside a Rico CH ZIP."""
    with zipfile.ZipFile(zip_path) as zf:
        csv_names = [n for n in zf.namelist() if n.endswith(".csv")]
        if not csv_names:
            raise ValueError(f"No CSV found in {zip_path.name}")
        with zf.open(csv_names[0]) as f:
            return pd.read_csv(f)


def _process_df(
    df: pd.DataFrame,
    spine: Spine,
    target_date: date_type | None,
    source_name: str = "",
) -> pd.DataFrame:
    """Aggregate call records into per-agent daily stats."""

    # Parse dates if filtering
    if "Date" in df.columns:
        df["_date"] = pd.to_datetime(df["Date"], errors="coerce").dt.date
        if target_date is not None:
            df = df[df["_date"] == target_date]

    # Map agent names through Spine
    df["Agent"] = df["User"].apply(
        lambda x: spine.resolve_agent(str(x)) if pd.notna(x) else None
    )
    df = df.dropna(subset=["Agent"])

    # Classify call direction
    def _is_inbound(call_type):
        if pd.isna(call_type):
            return False
        return "inbound" in str(call_type).lower()

    df["_inbound"] = df["Call Type"].apply(_is_inbound)

    # Talk time from Call Duration In Seconds
    if "Call Duration In Seconds" in df.columns:
        df["_seconds"] = pd.to_numeric(df["Call Duration In Seconds"], errors="coerce").fillna(0).astype(int)
    else:
        df["_seconds"] = 0

    # Aggregate per agent (per date if multi-date mode)
    group_cols = ["Agent"]
    has_dates = "_date" in df.columns and df["_date"].notna().any()

    if target_date is None and has_dates:
        # Multi-date mode: preserve per-day granularity
        group_cols = ["_date", "Agent"]

    result = df.groupby(group_cols).agg(
        Calls=("Agent", "size"),
        Inbound=("_inbound", "sum"),
        TalkTimeSeconds=("_seconds", "sum"),
    ).reset_index()

    result["Outbound"] = result["Calls"] - result["Inbound"]
    result["Inbound"] = result["Inbound"].astype(int)

    # Add/rename date column
    if "_date" in result.columns:
        result = result.rename(columns={"_date": "Date"})
    elif target_date is not None:
        result["Date"] = target_date
    elif has_dates:
        result["Date"] = df["_date"].mode().iloc[0]
    else:
        result["Date"] = None

    print(f"[rico_ch_parser] Parsed {len(result)} agents from {source_name}")
    return result


def _date_from_filename(path: Path) -> date_type | None:
    """Extract start date from CH filename: ch-N-YYMMDD-YYMMDD.csv-HASH.zip"""
    m = re.search(r"ch-\d+-(\d{6})-\d{6}", path.name)
    if m:
        d = m.group(1)  # YYMMDD
        try:
            return date_type(2000 + int(d[:2]), int(d[2:4]), int(d[4:6]))
        except ValueError:
            return None
    return None


def _date_range_from_filename(path: Path) -> tuple[date_type | None, date_type | None]:
    """Extract start and end dates from CH filename: ch-N-YYMMDD-YYMMDD.csv-HASH.zip"""
    m = re.search(r"ch-\d+-(\d{6})-(\d{6})", path.name)
    if m:
        try:
            s = m.group(1)
            e = m.group(2)
            start = date_type(2000 + int(s[:2]), int(s[2:4]), int(s[4:6]))
            end = date_type(2000 + int(e[:2]), int(e[2:4]), int(e[4:6]))
            return start, end
        except ValueError:
            return None, None
    return None, None
