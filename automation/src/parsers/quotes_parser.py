"""
quotes_parser.py — Auto quotes data parser.

Handles two formats:
  1. Excel from workbook data sheet (quotes_export.xlsx) — clean headers at row 0,
     column "Date"
  2. Allstate portal download (Quotes Detail Report__*.xlsx) — 6 metadata rows,
     header at row 6, data from row 7, column "Production Date" (MM/DD/YYYY)

Output: DataFrame with columns:
  Date, Agent, QuoteCount
"""

import pandas as pd
from pathlib import Path
from datetime import date as date_type

from src.spine import Spine


def parse(file_path: str, spine: Spine, target_date=None, sheet_name=0, return_records=False) -> pd.DataFrame | tuple[pd.DataFrame, list[dict]]:
    """Parse a single quotes file. Auto-detects header row."""
    path = Path(file_path)
    df = _read_with_header_detection(file_path, sheet_name)

    # Portal downloads use "Production Date"; workbook exports use "Date"
    date_col = "Production Date" if "Production Date" in df.columns else "Date"

    if date_col in df.columns:
        df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
        if target_date is not None:
            df = df[df[date_col].dt.date == pd.Timestamp(target_date).date()]

    # Rename for consistency
    if date_col != "Date":
        df = df.rename(columns={date_col: "Date"})

    # Map Sub Producer through Spine (fallback to "Other" so agency totals are accurate)
    df["Agent"] = df["Sub Producer"].apply(spine.resolve_agent)
    unmapped = df["Agent"].isna().sum()
    df["Agent"] = df["Agent"].fillna("Other")
    if unmapped > 0:
        print(f"[quotes_parser] {unmapped} rows mapped to 'Other' (unresolved agents)")

    # Prepare raw quote records if requested
    records = []
    if return_records:
        import numpy as np
        # Convert timestamp to YYYY-MM-DD string
        for _, row in df.iterrows():
            q_date = row["Date"]
            date_str = q_date.strftime("%Y-%m-%d") if pd.notna(q_date) else ""
            
            # Premium
            prem_val = row.get("Quoted Premium($)")
            if pd.isna(prem_val):
                prem_val = None
            else:
                try:
                    prem_val = float(prem_val)
                except ValueError:
                    prem_val = None

            records.append({
                "quote_control_number": str(row["Quote Control Number"]) if pd.notna(row.get("Quote Control Number")) else "",
                "agent": row["Agent"],
                "report_date": date_str,
                "product": str(row["Product"]).strip() if "Product" in row and pd.notna(row["Product"]) else None,
                "premium": prem_val,
                "sub_producer": str(row["Sub Producer"]).strip() if "Sub Producer" in row and pd.notna(row["Sub Producer"]) else None,
            })

    result = (
        df.groupby(["Date", "Agent"])
        .agg(QuoteCount=("Quote Control Number", "nunique"))
        .reset_index()
    )

    print(f"[quotes_parser] Parsed {len(result)} rows from {path.name}")
    if return_records:
        return result, records
    return result


def parse_downloads(
    downloads_folder: str,
    spine: Spine,
    target_date: date_type | None = None,
) -> pd.DataFrame:
    """Scan Downloads folder for Quotes Detail Report files.

    When *target_date* is given, iterate through all available Quotes files
    and pick the one whose Start Date / End Date range covers that date.
    Falls back to the most-recently-modified file when no date match is found
    or when *target_date* is ``None``.
    """
    folder = Path(downloads_folder)
    files = sorted(folder.glob("Quotes Detail Report*.xlsx"),
                   key=lambda f: f.stat().st_mtime, reverse=True)

    if not files:
        print("[quotes_parser] No Quotes Detail Report files found in Downloads")
        return pd.DataFrame()

    # Try to find a file whose date range covers target_date
    if target_date is not None:
        td = pd.Timestamp(target_date).date()
        for qf in files:
            try:
                meta = pd.read_excel(qf, header=None, nrows=5)
                start_str = str(meta.iloc[2, 1]).strip() if len(meta) > 2 else ""
                end_str = str(meta.iloc[3, 1]).strip() if len(meta) > 3 else ""
                start_dt = pd.to_datetime(start_str, errors="coerce")
                end_dt = pd.to_datetime(end_str, errors="coerce")
                if pd.notna(start_dt) and pd.notna(end_dt):
                    if start_dt.date() <= td <= end_dt.date():
                        print(f"[quotes_parser] Using: {qf.name} (covers {start_dt.date()} to {end_dt.date()})")
                        return parse(str(qf), spine, target_date)
            except Exception:
                continue
        print(f"[quotes_parser] No Quotes file found covering {td}, using newest")

    quotes_file = files[0]
    print(f"[quotes_parser] Using: {quotes_file.name}")
    return parse(str(quotes_file), spine, target_date)


def parse_auto_deduped(file_path: str, spine: Spine, target_date=None, sheet_name=0) -> tuple[pd.DataFrame, list[dict]]:
    """
    Parses quotes from file_path:
      1. Filters to 'Standard Auto'
      2. Resolves agent name (falls back to 'Other' if unmapped)
      3. Deduplicates on a rolling 30-day window per client/producer
      4. Returns aggregated count (Date, Agent, QuotesDeduped) and audit duplicates list.
    """
    path = Path(file_path)
    df = _read_with_header_detection(file_path, sheet_name)

    # 1. Normalize Date column
    date_col = "Production Date" if "Production Date" in df.columns else "Date"
    if date_col in df.columns:
        df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
        if target_date is not None:
            df = df[df[date_col].dt.date == pd.Timestamp(target_date).date()]
    if date_col != "Date":
        df = df.rename(columns={date_col: "Date"})

    # 2. Filter strictly for Standard Auto
    if "Product" in df.columns:
        df = df[df["Product"].fillna("").astype(str).str.strip() == "Standard Auto"]
    else:
        print("[quotes_parser] WARNING: 'Product' column not found, skipping Standard Auto filter!")

    # Helper function to extract name and resolve agent
    def extract_agent_name(sub_producer):
        if not sub_producer:
            return None
        parts = str(sub_producer).split("-", 1)
        return parts[1].strip() if len(parts) > 1 else parts[0].strip()

    def resolve_agent(sub_producer_raw):
        excel_name = extract_agent_name(sub_producer_raw)
        if excel_name:
            resolved = spine.resolve_agent(excel_name)
            if resolved:
                return resolved
        return "Other"

    # 3. Resolve agents (fallback to "Other" instead of dropping)
    df["Agent"] = df["Sub Producer"].apply(resolve_agent)

    if len(df) == 0:
        print(f"[quotes_parser] No Standard Auto quotes found in {path.name}")
        return pd.DataFrame(columns=["Date", "Agent", "QuotesDeduped"]), []

    # 4. Perform Rolling 30-day Deduplication
    df["first_clean"] = df["Customer First Name"].fillna("").astype(str).str.strip().str.upper()
    df["last_clean"] = df["Customer Last Name"].fillna("").astype(str).str.strip().str.upper()
    df["address_clean"] = df["Customer Street Address"].fillna("").astype(str).str.strip().str.upper().str.replace("\n", "").str.replace("\r", "")
    df["sub_producer_clean"] = df["Sub Producer"].fillna("").astype(str).str.strip()

    df["dedup_key"] = df["sub_producer_clean"] + "|" + df["first_clean"] + "|" + df["last_clean"] + "|" + df["address_clean"]

    # Sort chronologically for rolling deduplication
    df_sorted = df.sort_values(by=["dedup_key", "Date"]).copy()

    is_kept = []
    last_kept_dates = {}  # {key: last_kept_date}

    for idx, row in df_sorted.iterrows():
        key = row["dedup_key"]
        curr_date = row["Date"]

        if pd.isna(curr_date):
            is_kept.append(False)
            continue

        if key not in last_kept_dates:
            is_kept.append(True)
            last_kept_dates[key] = curr_date
        else:
            last_date = last_kept_dates[key]
            diff_days = (curr_date - last_date).days
            if diff_days <= 30:
                is_kept.append(False)
            else:
                is_kept.append(True)
                last_kept_dates[key] = curr_date

    df_sorted["is_kept"] = is_kept

    # Build duplicates list for Supabase quote_duplicates
    duplicates_list = []
    groups = df_sorted.groupby("dedup_key")
    for key, group in groups:
        if len(group) > 1:
            for _, r in group.iterrows():
                duplicates_list.append({
                    "report_month": r["Date"].strftime("%Y-%m") if not pd.isna(r["Date"]) else "",
                    "dedup_key": key,
                    "sub_producer": r["Sub Producer"],
                    "first_name": r["Customer First Name"],
                    "last_name": r["Customer Last Name"],
                    "address": r["Customer Street Address"].replace("\n", "").replace("\r", "") if r["Customer Street Address"] else "",
                    "quote_date": r["Date"].strftime("%Y-%m-%d") if not pd.isna(r["Date"]) else "",
                    "agent_number": r["Agent Number"] if "Agent Number" in r else "",
                    "quote_control_number": r["Quote Control Number"] if "Quote Control Number" in r else "",
                    "premium": float(r["Quoted Premium($)"]) if "Quoted Premium($)" in r and pd.notna(r["Quoted Premium($)"]) else 0.0,
                    "product": r["Product"] if "Product" in r else "",
                    "is_kept": bool(r["is_kept"])
                })

    # 5. Aggregate kept quotes count per Date and Agent
    df_kept = df_sorted[df_sorted["is_kept"]]
    
    # Format Date back to datetime date (or keep Timestamp, merge_all_data handles it)
    result = (
        df_kept.groupby(["Date", "Agent"])
        .agg(QuotesDeduped=("Quote Control Number", "count"))
        .reset_index()
    )

    print(f"[quotes_parser] Standard Auto deduped: {len(df_kept)} kept, {len(df_sorted) - len(df_kept)} duplicates removed from {path.name}")
    return result, duplicates_list


def _read_with_header_detection(file_path: str, sheet_name=0) -> pd.DataFrame:
    """
    Read a Quotes Excel file, auto-detecting the header row.
    Allstate portal downloads have 6 metadata rows; workbook sheets don't.
    """
    probe = pd.read_excel(file_path, engine="openpyxl", sheet_name=sheet_name,
                          header=None, nrows=10)

    # Look for the header row containing "Sub Producer"
    header_row = 0
    for i in range(min(10, len(probe))):
        row_vals = [str(v).strip() for v in probe.iloc[i] if pd.notna(v)]
        if any("Sub Producer" in v for v in row_vals):
            header_row = i
            break

    df = pd.read_excel(file_path, engine="openpyxl", sheet_name=sheet_name,
                       header=header_row)

    # Clean column names
    df.columns = [str(c).strip() for c in df.columns]

    return df
