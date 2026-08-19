"""
premium_parser.py — AgencyZoom Premium/Points data parser.

Handles two formats:
  1. Excel export (premium_export.xlsx) — has Date column, from workbook data sheet
  2. AgencyZoom CSV download (sales-report*.csv) — no Date column, has "$" in Premium
     First row is "Total" (skip it).

Output: DataFrame with columns:
  Date, Agent, PremItems, PremPremium, PremPoints
"""

import re
import pandas as pd
from pathlib import Path
from datetime import date as date_type

from src.spine import Spine


def parse(file_path: str, spine: Spine, target_date=None, sheet_name=0) -> pd.DataFrame:
    """Parse a single premium file (Excel or CSV)."""
    path = Path(file_path)

    if path.suffix.lower() == ".csv":
        return _parse_csv(file_path, spine, target_date)
    else:
        return _parse_excel(file_path, spine, target_date, sheet_name)


def parse_downloads(
    downloads_folder: str,
    spine: Spine,
    target_date: date_type | None = None,
    batch_selector=None,
) -> pd.DataFrame:
    """
    Scan Downloads folder for the sales-report CSV matching target_date.

    Two modes of operation:

    1. Batch mode (batch_selector provided):
       Uses the pre-computed file assignment from BatchSelector.
       This handles Monday catch-ups where multiple CSVs share the
       same pull-date. See batch_selector.py for the assignment algorithm.

    2. Single mode (no batch_selector):
       Finds the CSV whose FILENAME pull-date = target_date + 1 day.
       Filename convention: sales-report - YYYY-MM-DDThhmmss.mmm.csv
       The date in the filename is the PULL date (data date + 1).
    """
    from datetime import timedelta as _td
    import re as _re

    folder = Path(downloads_folder)

    # --- Batch mode: use pre-assigned file ---
    if batch_selector is not None:
        selected = batch_selector.get_file(target_date)
        if selected is None:
            print(f"[premium_parser] No sales-report file assigned for {target_date}")
            return pd.DataFrame()
        print(f"[premium_parser] Batch: using {selected.name} for {target_date}")
        return _parse_csv(str(selected), spine, target_date)

    # --- Single mode: find by pull-date in filename ---
    all_dated = sorted(
        folder.glob("sales-report - *T*.csv"),
        key=lambda f: f.stat().st_mtime, reverse=True,
    )

    if not all_dated:
        # Fall back to any sales-report*.csv
        all_dated = sorted(
            folder.glob("sales-report*.csv"),
            key=lambda f: f.stat().st_mtime, reverse=True,
        )
    if not all_dated:
        print("[premium_parser] No sales-report CSVs found in Downloads")
        return pd.DataFrame()

    selected = None
    if target_date is not None:
        expected_pull_date = (pd.Timestamp(target_date) + pd.Timedelta(days=1)).date()
        expected_str = expected_pull_date.isoformat()  # "2026-04-17"
        for f in all_dated:
            # Filename contains the pull date: "sales-report - 2026-04-17T..."
            m = _re.search(r"(\d{4}-\d{2}-\d{2})T", f.name)
            if m and m.group(1) == expected_str:
                selected = f
                break
        if selected is None:
            # Check if multiple files share the expected pull date
            # (Monday catch-up scenario) — suggest --batch mode
            same_day_count = sum(
                1 for f in all_dated
                if (_re.search(r"(\d{4}-\d{2}-\d{2})T", f.name) or _re.Match)
                and _re.search(r"(\d{4}-\d{2}-\d{2})T", f.name)
                and _re.search(r"(\d{4}-\d{2}-\d{2})T", f.name).group(1) == expected_str
            ) if expected_str else 0

            print(f"[premium_parser] No file with pull-date {expected_str} "
                  f"(for target {target_date}). "
                  f"For weekend catch-ups, use --batch mode.")
            return pd.DataFrame()

    if selected is None:
        selected = all_dated[0]

    print(f"[premium_parser] Using: {selected.name} (for target {target_date})")
    return _parse_csv(str(selected), spine, target_date)


def _parse_csv(file_path: str, spine: Spine, target_date=None) -> pd.DataFrame:
    """Parse AgencyZoom sales-report CSV."""
    df = pd.read_csv(file_path)

    # Skip "Total" row
    df = df[df["Producer"] != "Total"]

    # Clean Premium column: remove "$" and commas
    if "Premium" in df.columns:
        df["Premium"] = df["Premium"].apply(_clean_currency)

    # Resolve producer names through Spine
    df["Agent"] = df["Producer"].apply(spine.resolve_agent)
    df = df.dropna(subset=["Agent"])

    # Set date
    df["Date"] = target_date

    result = df[["Date", "Agent"]].copy()
    result["PremItems"] = df["Items"].fillna(0).astype(float).astype(int)
    result["PremPremium"] = df["Premium"].fillna(0).astype(float)
    result["PremPoints"] = df["Points"].fillna(0).astype(int)

    print(f"[premium_parser] Parsed {len(result)} rows from {Path(file_path).name}")
    return result


def _parse_excel(file_path: str, spine: Spine, target_date=None, sheet_name=0) -> pd.DataFrame:
    """Parse Excel premium export (from workbook data sheet)."""
    df = pd.read_excel(file_path, engine="openpyxl", sheet_name=sheet_name)

    if target_date is not None and "Date" in df.columns:
        df["Date"] = pd.to_datetime(df["Date"])
        df = df[df["Date"].dt.date == pd.Timestamp(target_date).date()]

    df["Agent"] = df["Producer"].apply(spine.resolve_agent)
    df = df.dropna(subset=["Agent"])

    result = df[["Date", "Agent"]].copy()
    result["PremItems"] = df["Items"].fillna(0).astype(int)
    result["PremPremium"] = df["Premium"].fillna(0)
    result["PremPoints"] = df["Points"].fillna(0).astype(int)

    print(f"[premium_parser] Parsed {len(result)} rows from {Path(file_path).name}")
    return result


def _clean_currency(val) -> float:
    """Convert '$1,234.56' or '$1,234' to float."""
    if pd.isna(val):
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).replace("$", "").replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return 0.0
