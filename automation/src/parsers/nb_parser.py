"""
nb_parser.py — New Business policy data parser.

Handles two formats:
  1. Excel from workbook data sheet (nb_export.xlsx) — clean headers at row 0
  2. Allstate portal download (New Business Details_*.xlsx) — 4 metadata rows,
     then header at row 4, data from row 5.

Output: DataFrame with columns:
  Date, Agent, NBCount (policies), Items, WrittenPremium
"""

import pandas as pd
from pathlib import Path
from datetime import date as date_type

from src.spine import Spine


def parse(file_path: str, spine: Spine, target_date=None, sheet_name=0) -> pd.DataFrame:
    """Parse a single NB file. Auto-detects header row."""
    path = Path(file_path)
    df = _read_with_header_detection(file_path, sheet_name)

    # ── Exclude cancelled policies ──
    df = _exclude_cancelled(df, path.name)

    # The Allstate portal NB file has "Issued Date" — that's the authoritative
    # date. It also has "Date Written" which can differ (bind-date vs issue-date).
    # Workbook exports may just have "Date". Prefer in this order:
    if "Date" in df.columns:
        date_col = "Date"
    elif "Issued Date" in df.columns:
        date_col = "Issued Date"
    elif "Date Written" in df.columns:
        date_col = "Date Written"
    else:
        date_col = "Date"

    if date_col in df.columns:
        df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
        if target_date is not None:
            df = df[df[date_col].dt.date == pd.Timestamp(target_date).date()]

    # Rename for consistency
    if date_col != "Date":
        df = df.rename(columns={date_col: "Date"})

    # Map Sub-Producer Name through Spine, falling back to Bind ID Name
    df["Agent"] = df.apply(lambda row: _resolve_agent_with_fallback(row, spine), axis=1)
    df = df.dropna(subset=["Agent"])

    result = (
        df.groupby(["Date", "Agent"])
        .agg(
            NBCount=("Policy No", "nunique"),
            Items=("Item Count", "sum"),
            WrittenPremium=("Written Premium", "sum"),
        )
        .reset_index()
    )
    result["Items"] = result["Items"].astype(int)

    print(f"[nb_parser] Parsed {len(result)} rows from {path.name}")
    return result


def parse_mtd(file_path: str, spine: Spine, month_start, month_end, sheet_name=0) -> pd.DataFrame:
    """Parse NB data for an entire month to compute MTD items."""
    df = _read_with_header_detection(file_path, sheet_name)

    # ── Exclude cancelled policies ──
    df = _exclude_cancelled(df, Path(file_path).name)

    if "Date" in df.columns:
        date_col = "Date"
    elif "Issued Date" in df.columns:
        date_col = "Issued Date"
    elif "Date Written" in df.columns:
        date_col = "Date Written"
    else:
        date_col = "Date"
    df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
    df = df[(df[date_col] >= pd.Timestamp(month_start)) & (df[date_col] <= pd.Timestamp(month_end))]

    df["Agent"] = df.apply(lambda row: _resolve_agent_with_fallback(row, spine), axis=1)
    df = df.dropna(subset=["Agent"])

    result = (
        df.groupby("Agent")
        .agg(ItemsMTD=("Item Count", "sum"), PremiumMTD=("Written Premium", "sum"))
        .reset_index()
    )
    result["ItemsMTD"] = result["ItemsMTD"].astype(int)
    return result


def parse_downloads(
    downloads_folder: str,
    spine: Spine,
    target_date: date_type | None = None,
) -> pd.DataFrame:
    """Scan Downloads folder for New Business Details files.

    When *target_date* is given, iterate through available NB files and pick
    one whose data date range covers that date.  Falls back to the most
    recently modified file when no date match is found or when *target_date*
    is ``None``.
    """
    folder = Path(downloads_folder)
    files = sorted(folder.glob("New Business Details*.xlsx"),
                   key=lambda f: f.stat().st_mtime, reverse=True)

    if not files:
        print("[nb_parser] No New Business Details files found in Downloads")
        return pd.DataFrame()

    # Try to find a file whose data covers target_date
    if target_date is not None:
        td = pd.Timestamp(target_date).date()
        for nf in files:
            try:
                df = _read_with_header_detection(str(nf))
                # Determine date column
                if "Date" in df.columns:
                    dc = "Date"
                elif "Issued Date" in df.columns:
                    dc = "Issued Date"
                elif "Date Written" in df.columns:
                    dc = "Date Written"
                else:
                    continue
                dates = pd.to_datetime(df[dc], errors="coerce").dropna()
                if len(dates) > 0 and dates.min().date() <= td <= dates.max().date():
                    print(f"[nb_parser] Using: {nf.name} (covers {dates.min().date()} to {dates.max().date()})")
                    return parse(str(nf), spine, target_date)
            except Exception:
                continue
        print(f"[nb_parser] No NB file found covering {td}, using newest")

    nb_file = files[0]
    print(f"[nb_parser] Using: {nb_file.name}")
    return parse(str(nb_file), spine, target_date)


def parse_mtd_downloads(
    downloads_folder: str,
    spine: Spine,
    month_start,
    month_end,
) -> pd.DataFrame:
    """Scan Downloads for most recent NB file and compute MTD."""
    folder = Path(downloads_folder)
    files = sorted(folder.glob("New Business Details*.xlsx"),
                   key=lambda f: f.stat().st_mtime, reverse=True)

    if not files:
        print("[nb_parser] No New Business Details files found for MTD")
        return pd.DataFrame()

    return parse_mtd(str(files[0]), spine, month_start, month_end)


def parse_auto(file_path: str, spine: Spine, target_date=None, sheet_name=0) -> pd.DataFrame:
    """
    Parses NB data from file_path for Quotes & NB report page:
      1. Filters to 'Standard Auto' (Product)
      2. Filters to 'New Policy Issued' (Disposition Code)
      3. Resolves agent name (falls back to 'Other' if unmapped)
      4. Excludes duplicate policy numbers
      5. Returns aggregated count (Date, Agent, NBAutoCount, NBAutoItems)
    """
    path = Path(file_path)
    df = _read_with_header_detection(file_path, sheet_name)

    # 1. Normalize Date column
    if "Date" in df.columns:
        date_col = "Date"
    elif "Issued Date" in df.columns:
        date_col = "Issued Date"
    elif "Date Written" in df.columns:
        date_col = "Date Written"
    else:
        date_col = "Date"

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
        print("[nb_parser] WARNING: 'Product' column not found, skipping Standard Auto filter!")

    # 3. Filter strictly for New Policy Issued
    if "Disposition Code" in df.columns:
        df = df[df["Disposition Code"].fillna("").astype(str).str.strip() == "New Policy Issued"]
    else:
        print("[nb_parser] WARNING: 'Disposition Code' column not found, skipping New Policy filter!")

    # 4. Resolve agent names (fallback to "Other" instead of dropping)
    def resolve_agent(row):
        resolved = _resolve_agent_with_fallback(row, spine)
        if resolved:
            return resolved
        return "Other"

    df["Agent"] = df.apply(resolve_agent, axis=1)

    if len(df) == 0:
        print(f"[nb_parser] No Standard Auto New Policies found in {path.name}")
        return pd.DataFrame(columns=["Date", "Agent", "NBAutoCount", "NBAutoItems"])

    # 5. Exclude duplicate policy numbers
    if "Policy No" in df.columns:
        initial_len = len(df)
        df = df.drop_duplicates(subset=["Policy No"], keep="first")
        removed_count = initial_len - len(df)
        if removed_count > 0:
            print(f"[nb_parser] Excluded {removed_count} duplicate policy rows from {path.name}")
    else:
        print("[nb_parser] WARNING: 'Policy No' column not found, skipping policy number deduplication!")

    # 6. Aggregate by Date and Agent
    df["Item Count"] = df["Item Count"].fillna(0).astype(int)
    result = (
        df.groupby(["Date", "Agent"])
        .agg(
            NBAutoCount=("Policy No", "count"),
            NBAutoItems=("Item Count", "sum")
        )
        .reset_index()
    )

    print(f"[nb_parser] Standard Auto NB parsed: {result['NBAutoCount'].sum()} policies, {result['NBAutoItems'].sum()} items from {path.name}")
    return result


def _resolve_agent_with_fallback(row, spine) -> str | None:
    """
    Resolve agent name from a NB row.
    Primary:  Sub-Producer Name (standard field)
    Fallback: Bind ID Name (used when Sub-Producer Name is blank,
              e.g. for rewrites / Sub Producer code 006)
    """
    import pandas as pd

    # Try primary field
    sub_name = row.get("Sub-Producer Name", "")
    if pd.notna(sub_name) and str(sub_name).strip():
        result = spine.resolve_agent(sub_name)
        if result is not None:
            return result

    # Fallback to Bind ID Name
    bind_name = row.get("Bind ID Name", "")
    if pd.notna(bind_name) and str(bind_name).strip():
        result = spine.resolve_agent(bind_name)
        if result is not None:
            sub_code = row.get("Sub Producer", "")
            print(f"[nb_parser] Fallback: resolved '{bind_name}' via Bind ID Name (Sub Producer={sub_code})")
            return result

    return None


def _read_with_header_detection(file_path: str, sheet_name=0) -> pd.DataFrame:
    """
    Read an NB Excel file, auto-detecting the header row.
    Allstate portal downloads have metadata rows; workbook sheets don't.
    """
    # Try reading raw to check if first cell looks like metadata
    probe = pd.read_excel(file_path, engine="openpyxl", sheet_name=sheet_name,
                          header=None, nrows=6)

    # Look for the header row containing "Sub-Producer Name"
    header_row = 0
    for i in range(min(6, len(probe))):
        row_vals = [str(v).strip() for v in probe.iloc[i] if pd.notna(v)]
        if any("Sub-Producer Name" in v for v in row_vals):
            header_row = i
            break

    df = pd.read_excel(file_path, engine="openpyxl", sheet_name=sheet_name,
                       header=header_row)

    # Clean column names (strip whitespace)
    df.columns = [str(c).strip() for c in df.columns]

    return df


def _exclude_cancelled(df: pd.DataFrame, filename: str = "") -> pd.DataFrame:
    """
    Exclude cancelled policies from NB data.
    The Allstate portal NB file uses 'Disposition Code' to indicate status.
    We only want 'New Policy Issued' — anything marked 'Cancelled' is excluded.
    """
    if "Disposition Code" not in df.columns:
        return df

    cancelled = df["Disposition Code"].str.strip().str.lower() == "cancelled"
    n_cancelled = cancelled.sum()
    if n_cancelled > 0:
        print(f"[nb_parser] Excluded {n_cancelled} cancelled polic{'y' if n_cancelled == 1 else 'ies'} from {filename}")
    return df[~cancelled].copy()
