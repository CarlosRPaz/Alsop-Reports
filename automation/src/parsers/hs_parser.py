"""
hs_parser.py — HiSales/Hearsay messaging data parser.

Handles two input formats:
  1. Multi-date Excel export (hs_export.xlsx) — has Date column, all workspaces in one file
  2. Daily CSV downloads from Hearsay — one CSV per workspace, no Date column.
     Filename: "Performance Breakdown Report 2026-03-23T0823 (N).csv"
     Date is extracted from filename (report date = generation date - 1 day,
     since the report is for "yesterday").

Output: DataFrame with columns:
  Date, Agent, Texts, OutTexts, OptIns, OptOuts
"""

import re
import pandas as pd
from pathlib import Path
from datetime import date as date_type, timedelta
from glob import glob

from src.spine import Spine


# Column mapping (same for both formats)
_COL_MAP = {
    "Date": "Date",
    "User Name": "UserName",
    "Number of Total Messages": "Texts",
    "Number of Outbound Messages": "OutTexts",
    "Number of Opt-Ins": "OptIns",
    "Number of Opt-Outs": "OptOuts",
}


def parse(file_path: str, spine: Spine, target_date=None, sheet_name=0) -> pd.DataFrame:
    """Parse a single HS export file (Excel or CSV)."""
    path = Path(file_path)

    if path.suffix.lower() == ".csv":
        df = pd.read_csv(file_path)
    else:
        df = pd.read_excel(file_path, engine="openpyxl", sheet_name=sheet_name)

    df = df.rename(columns={k: v for k, v in _COL_MAP.items() if k in df.columns})

    # If no Date column, extract from filename or use target_date
    if "Date" not in df.columns:
        report_date = _date_from_filename(path) or target_date
        df["Date"] = report_date
    elif target_date is not None:
        df["Date"] = pd.to_datetime(df["Date"])
        df = df[df["Date"].dt.date == pd.Timestamp(target_date).date()]

    # HS uses uppercase names matching the HS User Name column in Spine
    df["Agent"] = df["UserName"].apply(spine.resolve_agent)
    df = df.dropna(subset=["Agent"])

    return _aggregate(df, Path(file_path).name)


def parse_downloads(
    downloads_folder: str,
    spine: Spine,
    target_date: date_type | None = None,
) -> pd.DataFrame:
    """
    Scan a folder (e.g. user's Downloads) for Hearsay Performance Breakdown
    CSVs, combine them all, and return aggregated data.

    Files are matched by name pattern: "Performance Breakdown Report *.csv"
    If target_date is given, only files matching that date are included.
    The report's data date = filename date - 1 day (reports are for "yesterday").
    """
    folder = Path(downloads_folder)
    if not folder.exists():
        print(f"[hs_parser] Downloads folder not found: {folder}")
        return pd.DataFrame()

    # Find all matching CSVs
    all_csvs = list(folder.glob("Performance Breakdown Report*.csv"))

    if not all_csvs:
        print(f"[hs_parser] No Hearsay CSVs found in {folder}")
        return pd.DataFrame()

    # Filter by target date if specified
    if target_date is not None:
        matching = []
        for csv_path in all_csvs:
            file_date = _date_from_filename(csv_path)
            if file_date == target_date:
                matching.append(csv_path)
        all_csvs = matching

    if not all_csvs:
        print(f"[hs_parser] No Hearsay CSVs found for date {target_date}")
        return pd.DataFrame()

    print(f"[hs_parser] Found {len(all_csvs)} Hearsay CSVs to combine")

    # Read and combine all CSVs
    frames = []
    for csv_path in all_csvs:
        try:
            df = pd.read_csv(csv_path)
            df = df.rename(columns={k: v for k, v in _COL_MAP.items() if k in df.columns})

            # Set date from filename
            report_date = _date_from_filename(csv_path) or target_date
            df["Date"] = report_date

            # Resolve agent names
            df["Agent"] = df["UserName"].apply(spine.resolve_agent)
            df = df.dropna(subset=["Agent"])

            # Only include non-zero rows (skip all-zero agents)
            numeric_cols = ["Texts", "OutTexts", "OptIns", "OptOuts"]
            existing_cols = [c for c in numeric_cols if c in df.columns]
            if existing_cols:
                df = df[df[existing_cols].sum(axis=1) > 0]

            if len(df) > 0:
                frames.append(df)
        except Exception as e:
            print(f"[hs_parser] Skipping {csv_path.name}: {e}")

    if not frames:
        print("[hs_parser] No non-zero data found in any CSV")
        return pd.DataFrame()

    combined = pd.concat(frames, ignore_index=True)

    # Dedup Edge's "(N)"-suffix duplicate downloads. When the user re-runs the
    # pipeline on the same day, Edge keeps the existing CSVs and appends (1),
    # (2), ... to new downloads — inflating every metric by the re-run count.
    # Same UserName with identical metrics on the same date = duplicate.
    dedup_cols = ["Date", "UserName", "Texts", "OutTexts", "OptIns", "OptOuts"]
    existing_dedup = [c for c in dedup_cols if c in combined.columns]
    before = len(combined)
    combined = combined.drop_duplicates(subset=existing_dedup, keep="first")
    after = len(combined)
    if before != after:
        print(f"[hs_parser] Deduplicated {before - after} duplicate rows "
              f"(Edge (N)-suffix re-download artifacts)")

    return _aggregate(combined, f"{len(all_csvs)} CSVs")


def _aggregate(df: pd.DataFrame, source_name: str = "") -> pd.DataFrame:
    """Aggregate per agent per date (agent may appear in multiple workspaces)."""
    if len(df) == 0:
        return df

    numeric_cols = ["Texts", "OutTexts", "OptIns", "OptOuts"]
    for col in numeric_cols:
        if col not in df.columns:
            df[col] = 0

    result = (
        df.groupby(["Date", "Agent"])[numeric_cols]
        .sum()
        .reset_index()
    )
    for col in numeric_cols:
        result[col] = result[col].astype(int)

    print(f"[hs_parser] Parsed {len(result)} rows from {source_name}")
    return result


def _date_from_filename(path: Path) -> date_type | None:
    """
    Extract the data date from a Hearsay CSV filename.
    Filename format: "Performance Breakdown Report 2026-03-23T0823 (N).csv"
    The date in the filename is the generation date.
    The actual data date = generation date - 1 day (report is for "yesterday").
    """
    match = re.search(r'(\d{4}-\d{2}-\d{2})T', path.name)
    if match:
        gen_date = date_type.fromisoformat(match.group(1))
        return gen_date - timedelta(days=1)  # data is for yesterday
    return None
