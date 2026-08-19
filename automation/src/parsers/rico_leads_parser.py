"""
rico_leads_parser.py — Ricochet LeadSwami Report (lead status snapshot).

Source: admin-allstate-mt3.ricochet.me/alsop/reports → "LeadSwami Report" CSV.

The report is a LIVE SNAPSHOT of every lead in the system — one row per lead,
current status. We don't filter by date; we just count per agent per status.

Counts these 4 statuses per agent (Lead Owner):
    Contact = "2.0 CONTACTED - Follow Up"
    Quoted  = "3.0 QUOTED"
    Hot     = "3.1 QUOTED - HOT!!!!"
    XDate   = "3.3 XDATE - Task Set"   (named "x-sale" historically)

File columns expected: "Lead Owner" (First Last), "Lead Status" (literal status name).

The file can be very large (60K+ rows) — use chunked read + filter early.

Usage:
    df = parse_downloads("C:/Users/scag3s29/Downloads", spine)
    # returns DataFrame with columns: Agent, Contact, Quoted, Hot, XDate
"""

from __future__ import annotations

from pathlib import Path
from glob import glob

import pandas as pd


# Map DSR output column → exact "Lead Status" literal value in the report
STATUS_MAP = {
    "Contact": "2.0 CONTACTED - Follow Up",
    "Quoted":  "3.0 QUOTED",
    "Hot":     "3.1 QUOTED - HOT!!!!",
    # NOTE: actual literal in the CSV has no space before the hyphen:
    # "3.3 XDATE- Task Set" (NOT "3.3 XDATE - Task Set").
    # Spec said otherwise but we match what Ricochet actually emits.
    "XDate":   "3.3 XDATE- Task Set",
}

# What we keep from the CSV — everything else is dropped to save memory
USECOLS = ["Lead Owner", "Lead Status"]


def parse_downloads(
    downloads_folder: str,
    spine,
    target_date=None,  # accepted but ignored — this source is a live snapshot
    file_glob: str = "leads_report_*.csv",
) -> pd.DataFrame:
    """
    Find the newest leads_report_*.csv in downloads_folder, parse it, and
    return per-agent counts for each tracked status.

    Returns columns: Agent, Contact, Quoted, Hot, XDate
    (Agent is the canonical Spine nickname.)
    """
    path = _newest_leads_csv(downloads_folder, file_glob)
    if not path:
        return pd.DataFrame(columns=["Agent", "Contact", "Quoted", "Hot", "XDate"])

    return parse(path, spine, target_date=target_date)


def parse(file_path: str, spine, target_date=None) -> pd.DataFrame:
    """
    Parse a single leads_report CSV.

    Returns DataFrame: Agent, Contact, Quoted, Hot, XDate (int counts).
    """
    try:
        df = _read_csv_safely(file_path)
    except Exception as e:
        print(f"[rico_leads_parser] Read failed: {e}")
        return pd.DataFrame(columns=["Agent", "Contact", "Quoted", "Hot", "XDate"])

    # Sanity check — required columns present?
    missing = [c for c in USECOLS if c not in df.columns]
    if missing:
        print(f"[rico_leads_parser] Missing column(s) {missing} in {Path(file_path).name}")
        print(f"[rico_leads_parser] Available columns: {list(df.columns)[:15]}")
        return pd.DataFrame(columns=["Agent", "Contact", "Quoted", "Hot", "XDate"])

    # Keep only the 4 statuses we care about — drops ~90% of rows instantly
    wanted_statuses = set(STATUS_MAP.values())
    df = df[df["Lead Status"].isin(wanted_statuses)].copy()

    if df.empty:
        print(f"[rico_leads_parser] No rows matched the 4 tracked statuses in {Path(file_path).name}")
        return pd.DataFrame(columns=["Agent", "Contact", "Quoted", "Hot", "XDate"])

    # Resolve Lead Owner → canonical agent via Spine
    df["Agent"] = df["Lead Owner"].astype(str).map(lambda n: spine.resolve_agent(n))

    unresolved = df[df["Agent"].isna()]["Lead Owner"].unique()
    if len(unresolved) > 0:
        dropped = df["Agent"].isna().sum()
        # Flag unresolved owners — usually non-roster people, but could be a Spine gap.
        preview = ", ".join(sorted(str(x) for x in unresolved)[:5])
        print(f"[rico_leads_parser] {dropped} rows from {len(unresolved)} unresolved Lead Owners "
              f"(not on Spine): {preview}{'...' if len(unresolved) > 5 else ''}")
        df = df[df["Agent"].notna()]

    if df.empty:
        print(f"[rico_leads_parser] No tracked agents found among Lead Owners.")
        return pd.DataFrame(columns=["Agent", "Contact", "Quoted", "Hot", "XDate"])

    # Pivot: rows = Agent, cols = each status count
    pivot = (
        df.groupby(["Agent", "Lead Status"])
          .size()
          .unstack(fill_value=0)
          .reset_index()
    )

    # Rename status literal → DSR column name, fill missing columns
    rename_map = {v: k for k, v in STATUS_MAP.items()}
    pivot = pivot.rename(columns=rename_map)

    for col in ["Contact", "Quoted", "Hot", "XDate"]:
        if col not in pivot.columns:
            pivot[col] = 0

    result = pivot[["Agent", "Contact", "Quoted", "Hot", "XDate"]].copy()
    for col in ["Contact", "Quoted", "Hot", "XDate"]:
        result[col] = result[col].astype(int)

    print(f"[rico_leads_parser] Parsed {Path(file_path).name}: {len(result)} agents")
    return result


def _newest_leads_csv(folder: str, pattern: str) -> str | None:
    folder_path = Path(folder)
    if not folder_path.exists():
        return None
    matches = sorted(folder_path.glob(pattern), key=lambda f: f.stat().st_mtime, reverse=True)
    return str(matches[0]) if matches else None


def _read_csv_safely(file_path: str) -> pd.DataFrame:
    """
    Read CSV using only the columns we need. Tries utf-8 then latin-1.
    """
    for enc in ("utf-8", "utf-8-sig", "latin-1"):
        try:
            return pd.read_csv(
                file_path,
                usecols=lambda c: c in USECOLS,
                encoding=enc,
                low_memory=False,
            )
        except UnicodeDecodeError:
            continue
        except ValueError as e:
            # usecols may fail if column names don't match — fall back to full read
            if "Usecols" in str(e) or "columns expected" in str(e):
                return pd.read_csv(file_path, encoding=enc, low_memory=False)
            raise
    # Last-ditch: full read with utf-8 ignoring errors
    return pd.read_csv(file_path, encoding="utf-8", encoding_errors="ignore", low_memory=False)
