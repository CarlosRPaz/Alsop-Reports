"""
command_center.py — Daily DSR Command Center.

Double-click `DSR Command Center.bat` (or run this file) each morning to launch
a menu-driven workflow. No need to remember CLI flags.

Default target date = yesterday (the day we're reporting on).
"""

import json
import os
import re
import sys
import subprocess
import time
import webbrowser
from datetime import date, timedelta, datetime
from pathlib import Path

# --- Config ----------------------------------------------------------------

PROJECT_DIR = Path(__file__).parent.resolve()
MASTER_PATH = Path.home() / "Documents" / "Claude Scope" / "DSR_Master.xlsx"
if not MASTER_PATH.exists():
    MASTER_PATH = PROJECT_DIR / "DSR_Master.xlsx"
PYTHON_EXE = sys.executable
STATE_FILE = PROJECT_DIR / "data" / "command_center_state.json"

# Logins to check off each morning before running.
# RingCentral and Ricochet are intentionally excluded — RC data arrives via
# Outlook email and Rico files land in Downloads automatically.
# `match` is a substring we look for in running msedge.exe command lines to
# decide if the portal already has a tab open (so we don't re-open it).
LOGIN_CHECKLIST = [
    {
        "name":  "Allstate / eAgent",
        "url":   "https://agents.allstate.com",
        "match": "allstate.com",
    },
    {
        "name":  "Hearsay Social",
        "url":   "https://login.hearsaysocial.com",
        "match": "hearsaysocial.com",
    },
    {
        "name":  "AgencyZoom",
        "url":   "https://app.agencyzoom.com",
        "match": "agencyzoom.com",
    },
    {
        "name":  "Ricochet Admin (DeerDama / LeadSwami)",
        "url":   "https://admin-allstate-mt3.ricochet.me/alsop/reports",
        "match": "ricochet.me",
    },
]

# --- SOURCE REGISTRY ---
# Authoritative list of every data source the DSR pipeline needs, with:
#   - where the file should live
#   - how to recognize it
#   - step-by-step instructions to fix it if missing
# The pre-flight check and post-run feedback both read this.
DOWNLOADS = Path.home() / "Downloads"

SOURCES = {
    "RC": {
        "label":       "RingCentral (Calls, Talk Time)",
        "location":    "Outlook -> Inbox/Daily Reports",
        "kind":        "outlook",
        "outlook_subject": "Scheduled Reports from RingCentral",
        "outlook_sender":  "analytics.portal@ringcentral.com",
        "how_to_get": [
            "Open Outlook and check 'Inbox/Daily Reports' folder.",
            "Look for the email from analytics.portal@ringcentral.com",
            "  covering the TARGET date (not today's run date).",
            "If missing, log into RingCentral -> Analytics Portal and",
            "re-send / re-schedule the Office Performance Users report.",
        ],
    },
    "Hearsay": {
        "label":       "Hearsay (Texts)",
        "location":    f"{DOWNLOADS}",
        "kind":        "downloads_glob",
        "patterns":    ["Performance Breakdown Report*.csv"],
        "min_count":   20,  # expect ~23 per day
        "date_check":  "hs_filename",  # filename is (target + 1 day)
        "how_to_get": [
            "Log into Hearsay Social in Edge (option [1] opens it).",
            "Return to command center and run option [2] or [4].",
            "It will auto-open 44 download tabs in Edge.",
            "Wait for all CSVs to land in Downloads before continuing.",
        ],
    },
    "Rico CH": {
        "label":       "Ricochet CH Dialer (Talk Time)",
        "location":    f"{DOWNLOADS}",
        "kind":        "rico_ch_zip",
        "patterns":    ["ch-*.zip"],
        "how_to_get": [
            "Log into Ricochet360.",
            "Go to Reports -> CH Dialer Export for the target date.",
            "Download the zip file — it will land in your Downloads.",
            "File name looks like: ch-8-YYMMDD-YYMMDD.csv-<id>.zip",
        ],
    },
    "Rico AP": {
        "label":       "Ricochet Agent Performance (Calls)",
        "location":    f"{DOWNLOADS}",
        "kind":        "downloads_glob",
        "patterns":    ["Agent Performance*.xlsx"],
        "min_count":   1,
        "date_check":  "mtime",
        "max_age_hrs": 48,
        "how_to_get": [
            "Log into Ricochet360 in Edge.",
            "Go to Reports -> Agent Performance for the target date.",
            "Download the xlsx — it lands in Downloads.",
            "File name looks like: Agent Performance (N).xlsx",
            "Always use the newest file if multiple exist.",
        ],
    },
    "New Business": {
        "label":       "New Business (NB items + premium)",
        "location":    f"{DOWNLOADS}",
        "kind":        "downloads_glob",
        "patterns":    ["New Business Details*.xlsx"],
        "min_count":   1,
        "date_check":  "excel",
        # Portal file has both "Issued Date" and "Date Written" — we treat
        # "Issued Date" as authoritative.
        "date_cols":   ["Issued Date", "Date Written", "Date"],
        "how_to_get": [
            "You download this manually from the Allstate reports site.",
            "Pull the 'New Business Details' export so the TARGET date is",
            "  included in the Issued Date column range.",
            "Save/leave the .xlsx in Downloads — the pipeline reads from there.",
            "File name starts with: New Business Details_",
        ],
    },
    "Quotes": {
        "label":       "Quotes Detail",
        "location":    f"{DOWNLOADS}",
        "kind":        "downloads_glob",
        "patterns":    ["Quotes Detail Report*.xlsx"],
        "min_count":   1,
        "date_check":  "excel",
        # Portal Quotes file uses "Production Date".
        "date_cols":   ["Production Date", "Date"],
        "how_to_get": [
            "You download this manually from the Allstate reports site.",
            "Pull the 'Quotes Detail Report' covering the TARGET date",
            "  (Production Date column).",
            "Save/leave the .xlsx in Downloads — the pipeline reads from there.",
            "File name starts with: Quotes Detail Report__",
        ],
    },
    "Premium": {
        "label":       "Premium / AgencyZoom Sales",
        "location":    f"{DOWNLOADS}",
        "kind":        "downloads_glob",
        "patterns":    ["sales-report - *T*.csv"],
        "min_count":   1,
        # AgencyZoom CSV has no internal Date column. The pull date is in
        # the filename: sales-report - YYYY-MM-DDThhmmss.mmm.csv.
        # Data in that file is for (pull_date - 1 day), so for target_date
        # we want a file whose filename date = target_date + 1.
        "date_check":  "filename_date",
        "offset_days": 1,
        "how_to_get": [
            "You pull this manually from AgencyZoom — one file per target day.",
            "Pulled on day X, the file contains data for day X-1.",
            "So for target 2026-04-16, pull on 2026-04-17 -> filename dated 4-17.",
            "Monday note: pull 3 files — Sat (Fri data), Sun (Sat data), Mon (Sun data).",
            "All files live in Downloads — the pipeline picks the one whose",
            "  filename date = target + 1.",
        ],
    },
    "Rico Leads": {
        "label":       "Rico Leads (Contact/Quoted/Hot/XDate — live snapshot)",
        "location":    f"{DOWNLOADS}",
        "kind":        "downloads_glob",
        "patterns":    ["leads_report_*.csv"],
        "min_count":   1,
        "date_check":  "mtime",         # snapshot — only care that file was pulled today
        "max_age_hrs": 24,
        "how_to_get": [
            "The pipeline auto-downloads this via Playwright.",
            "If it fails, manually pull:",
            "  https://admin-allstate-mt3.ricochet.me/alsop/reports",
            "  -> newest 'LeadSwami Report' row -> blue download icon.",
            "The CSV lands in Downloads as leads_report_*.csv.",
        ],
    },
}

# --- UI helpers ------------------------------------------------------------

BANNER = r"""
===========================================================
        DSR COMMAND CENTER  —  Allstate Agency
===========================================================
"""

def clear():
    os.system("cls" if os.name == "nt" else "clear")


def _load_state() -> dict:
    if not STATE_FILE.exists():
        return {}
    try:
        return json.loads(STATE_FILE.read_text())
    except Exception:
        return {}


def _save_state(state: dict):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2, default=str))


def _record_run(kind: str, target_date: date, duration_sec: float, status: str):
    """Persist timestamp of most recent run so it can be shown in the header."""
    state = _load_state()
    state["last_run"] = {
        "kind": kind,                       # 'dsr', 'reports', 'full', 'monday_catchup'
        "target_date": target_date.isoformat() if target_date else None,
        "at": datetime.now().isoformat(timespec="seconds"),
        "duration_sec": round(duration_sec, 1),
        "status": status,                   # 'ok', 'warn', 'fail'
    }
    _save_state(state)


def _format_last_run() -> str:
    state = _load_state()
    lr = state.get("last_run")
    if not lr:
        return "Last run:     (never)"
    try:
        ts = datetime.fromisoformat(lr["at"])
        when = ts.strftime("%a %b %d, %I:%M %p").replace(" 0", " ")
    except Exception:
        when = str(lr.get("at", ""))
    kind_labels = {
        "dsr":            "DSR pipeline",
        "reports":        "Weekly/Monthly/CR",
        "full":           "Full run",
        "monday_catchup": "Monday catch-up",
    }
    kind = kind_labels.get(lr.get("kind", ""), lr.get("kind", "?"))
    status_map = {"ok": "[OK]", "warn": "[!!]", "fail": "[XX]"}
    status = status_map.get(lr.get("status", ""), "[  ]")
    dur = lr.get("duration_sec", 0)
    td = lr.get("target_date", "")
    return f"Last run:     {status} {kind} for {td}  ({dur}s)  @ {when}"


def _fmt_duration(seconds: float) -> str:
    """Format seconds as '1m 23s' or '45.2s'."""
    if seconds < 60:
        return f"{seconds:.1f}s"
    mins = int(seconds // 60)
    secs = int(seconds % 60)
    return f"{mins}m {secs}s"


def header(target_date: date):
    clear()
    today = date.today()
    print(BANNER)
    print(f"  Today:        {today.strftime('%A, %B %d, %Y')}")
    print(f"  Reporting on: {target_date.strftime('%A, %B %d, %Y')}")
    print(f"  Master file:  {MASTER_PATH.name}")
    print(f"  {_format_last_run()}")
    print("-" * 59)


def pause():
    input("\n  Press ENTER to return to menu...")


# --- File peek helpers (verify target_date is actually inside files) -----

def _peek_excel_date(file_path: Path, date_cols: list[str], target: date) -> tuple[bool, str]:
    """Check if target date appears in the given date columns of an Excel file."""
    try:
        import pandas as pd
        # Auto-detect header row. Allstate portal files have metadata rows
        # with things like "Download Date" / "Start Date" etc. — those would
        # false-match on substring searches, so we require EXACT equality to
        # one of our target date-column names. Check up to row 10 (Quotes
        # header is at row 6).
        probe = pd.read_excel(file_path, engine="openpyxl", header=None, nrows=10)
        header_row = None
        for i in range(min(10, len(probe))):
            row_vals = {str(v).strip() for v in probe.iloc[i] if pd.notna(v)}
            if row_vals & set(date_cols):
                header_row = i
                break
        if header_row is None:
            return False, f"no row with {'/'.join(date_cols)} as a column header"
        df = pd.read_excel(file_path, engine="openpyxl", header=header_row)
        df.columns = [str(c).strip() for c in df.columns]
        actual_col = next((dc for dc in date_cols if dc in df.columns), None)
        if not actual_col:
            return False, f"no {'/'.join(date_cols)} column found"
        dates = pd.to_datetime(df[actual_col], errors="coerce").dt.date.dropna()
        if len(dates) == 0:
            return False, "file has no valid dates"
        if target in set(dates):
            count = (dates == target).sum()
            return True, f"{count} rows for {target}"
        unique = sorted(set(dates))
        return False, f"covers {unique[0]}..{unique[-1]}, {target} NOT present"
    except Exception as e:
        return False, f"read error: {type(e).__name__}"


def _peek_csv_date(file_path: Path, date_cols: list[str], target: date) -> tuple[bool, str]:
    """Check if target date appears in the given date columns of a CSV file."""
    try:
        import pandas as pd
        df = pd.read_csv(file_path, nrows=10000, on_bad_lines="skip")
        df.columns = [str(c).strip() for c in df.columns]
        actual_col = next((dc for dc in date_cols if dc in df.columns), None)
        if not actual_col:
            return False, f"no {'/'.join(date_cols)} column found"
        dates = pd.to_datetime(df[actual_col], errors="coerce").dt.date.dropna()
        if len(dates) == 0:
            return False, "file has no valid dates"
        if target in set(dates):
            count = (dates == target).sum()
            return True, f"{count} rows for {target}"
        unique = sorted(set(dates))
        return False, f"covers {unique[0]}..{unique[-1]}, {target} NOT present"
    except Exception as e:
        return False, f"read error: {type(e).__name__}"


def _check_hs_filename_date(files: list[Path], target: date) -> tuple[bool, str]:
    """
    HS CSV filenames encode data date as (filename_date - 1 day).
    So to cover target 2026-04-13, we want files dated 2026-04-14.
    """
    wanted_file_date = target + timedelta(days=1)
    wanted_str = wanted_file_date.strftime("%Y-%m-%d")
    matches = [f for f in files if wanted_str in f.name]
    if matches:
        return True, f"{len(matches)} file(s) dated {wanted_str} (covers {target})"
    return False, f"no files dated {wanted_str} — HS data for {target} missing"


# --- Source scanning (pre-flight check) -----------------------------------

def _scan_downloads(patterns: list[str], target_date: date) -> list[Path]:
    """Return files in Downloads matching any of the patterns, sorted newest first."""
    if not DOWNLOADS.exists():
        return []
    found = []
    for pat in patterns:
        found.extend(DOWNLOADS.glob(pat))
    found.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return found


def _scan_rico_ch(target_date: date) -> list[Path]:
    """
    Rico CH zips have date range in filename:  ch-N-YYMMDD-YYMMDD.csv-<id>.zip
    We want files whose range *contains* target_date.
    """
    if not DOWNLOADS.exists():
        return []
    yymmdd = target_date.strftime("%y%m%d")
    matches = []
    for p in DOWNLOADS.glob("ch-*.zip"):
        m = re.search(r"ch-\d+-(\d{6})-(\d{6})", p.name)
        if not m:
            continue
        start, end = m.group(1), m.group(2)
        if start <= yymmdd <= end:
            matches.append(p)
    matches.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return matches


def _scan_outlook_rc(target_date: date) -> tuple[bool, str]:
    """
    Check Outlook for today's RC email. Returns (found, detail).
    We don't parse — just confirm an email exists for the target date.
    """
    try:
        import win32com.client
        import pythoncom
        pythoncom.CoInitialize()
        try:
            outlook = win32com.client.Dispatch("Outlook.Application")
            ns = outlook.GetNamespace("MAPI")
            inbox = ns.GetDefaultFolder(6)
            folder = inbox
            try:
                folder = inbox.Folders("Daily Reports")
            except Exception:
                pass  # fall back to Inbox root

            items = folder.Items
            items.Sort("[ReceivedTime]", True)
            # Look at the 20 most recent for an RC match
            count_checked = 0
            for item in items:
                if count_checked > 50:
                    break
                count_checked += 1
                try:
                    subj = (getattr(item, "Subject", "") or "").lower()
                    if "ringcentral" not in subj:
                        continue
                    received = getattr(item, "ReceivedTime", None)
                    if received is not None:
                        r_date = date(received.year, received.month, received.day)
                        # RC email for target_date usually arrives next morning
                        if r_date >= target_date:
                            return True, f"found (received {r_date})"
                except Exception:
                    continue
            return False, "no RC email in last 50 items"
        finally:
            pythoncom.CoUninitialize()
    except Exception as e:
        return False, f"Outlook error: {type(e).__name__}"


def preflight_check(target_date: date) -> dict:
    """
    Scan for each expected data source and report what's found vs missing.
    Returns {source_name: {status: 'ok'|'warn'|'missing', detail: str, files: [...] }}
    """
    results = {}
    for name, spec in SOURCES.items():
        kind = spec["kind"]
        if kind == "outlook":
            ok, detail = _scan_outlook_rc(target_date)
            results[name] = {
                "status":  "ok" if ok else "missing",
                "detail":  detail,
                "files":   [],
            }
        elif kind == "downloads_glob":
            files = _scan_downloads(spec["patterns"], target_date)
            min_count = spec.get("min_count", 1)
            if len(files) == 0:
                status, detail = "missing", "no matching files in Downloads"
            elif len(files) < min_count:
                status, detail = "warn", f"only {len(files)} file(s), expected >= {min_count}"
            else:
                # Base status from file count
                status, detail = "ok", f"{len(files)} file(s), newest: {files[0].name[:50]}"

                # Deep check: peek inside the newest file for target_date
                date_check = spec.get("date_check")
                if date_check == "excel":
                    ok, msg = _peek_excel_date(files[0], spec["date_cols"], target_date)
                    if ok:
                        detail = f"{msg} in {files[0].name[:40]}"
                    else:
                        status, detail = "warn", msg
                elif date_check == "csv":
                    ok, msg = _peek_csv_date(files[0], spec["date_cols"], target_date)
                    if ok:
                        detail = f"{msg} in {files[0].name[:40]}"
                    else:
                        status, detail = "warn", msg
                elif date_check == "hs_filename":
                    ok, msg = _check_hs_filename_date(files, target_date)
                    if ok:
                        detail = msg
                    else:
                        status, detail = "warn", msg
                elif date_check == "mtime":
                    # Snapshot source — only care that it was downloaded recently.
                    max_age_hrs = spec.get("max_age_hrs", 24)
                    import time as _t
                    age_hrs = (_t.time() - files[0].stat().st_mtime) / 3600
                    if age_hrs <= max_age_hrs:
                        detail = f"snapshot from {age_hrs:.1f}h ago: {files[0].name[:50]}"
                    else:
                        status = "warn"
                        detail = f"snapshot is {age_hrs:.1f}h old (max {max_age_hrs}h): {files[0].name[:50]}"
                elif date_check == "filename_date":
                    # Filename contains the pull date; look for filename date =
                    # target_date + offset_days.
                    import re as _re
                    from datetime import timedelta as _td
                    offset = spec.get("offset_days", 0)
                    expected = (target_date + _td(days=offset)).isoformat()
                    match = None
                    for f in files:
                        m = _re.search(r"(\d{4}-\d{2}-\d{2})", f.name)
                        if m and m.group(1) == expected:
                            match = f
                            break
                    if match:
                        detail = f"found {match.name[:55]} (pull-date {expected})"
                    else:
                        status = "warn"
                        detail = f"no file with pull-date {expected} — newest: {files[0].name[:40]}"

            results[name] = {"status": status, "detail": detail, "files": files}
        elif kind == "rico_ch_zip":
            files = _scan_rico_ch(target_date)
            if not files:
                status, detail = "missing", f"no CH zip covering {target_date}"
            else:
                status, detail = "ok", f"{len(files)} file(s), newest: {files[0].name[:50]}"
            results[name] = {"status": status, "detail": detail, "files": files}
    return results


def print_preflight(target_date: date, results: dict) -> bool:
    """Print pre-flight results. Returns True if all sources are OK."""
    print("-" * 59)
    print(f"  PRE-FLIGHT CHECK for {target_date}")
    print("-" * 59)
    all_ok = True
    for name, r in results.items():
        st = r["status"]
        mark = {"ok": "[OK]", "warn": "[!!]", "missing": "[XX]"}[st]
        if st != "ok":
            all_ok = False
        print(f"  {mark}  {name:<14} {r['detail']}")
    print("-" * 59)
    if all_ok:
        print("  [OK] All sources ready. Safe to run pipeline.")
    else:
        print("  [!!] Some sources are missing or incomplete.")
    print()
    return all_ok


def show_fix_instructions(results: dict):
    """For any source that is missing/warn, show how-to-fix steps."""
    problems = [(n, r) for n, r in results.items() if r["status"] != "ok"]
    if not problems:
        return
    print("=" * 59)
    print("  WHAT TO DO NEXT")
    print("=" * 59)
    for name, r in problems:
        spec = SOURCES[name]
        mark = "[!!]" if r["status"] == "warn" else "[XX]"
        print(f"\n  {mark} {name} — {spec['label']}")
        print(f"     Issue: {r['detail']}")
        print(f"     Where: {spec['location']}")
        print("     Steps:")
        for step in spec["how_to_get"]:
            print(f"       > {step}")
    print("=" * 59)
    print()


# --- Run summary parser ----------------------------------------------------

# Each source maps to (label, success_pat, warn_pat, log_grep_pat, hint_on_empty).
# - success_pat: regex for "parser succeeded with N rows" — shows [OK] N
# - warn_pat:    regex for "parser ran but nothing useful" — shows [--] skipped
# - log_grep:    regex for ALL log lines relevant to this source (for diagnostics)
# - hint:        one-liner shown in "WHY / WHAT TO DO" section when source is [--]
_SOURCE_PATTERNS = [
    ("RC",
        r"RC:\s+(\d+)\s+rows",
        r"RC:\s+(no |0 |error)",
        r"(\[rc_parser\]|  RC:)",
        "RC email may be absent or the attachment filter didn't match. "
        "Check Outlook 'Inbox/Daily Reports' for today's RingCentral email.",
    ),
    ("Hearsay",
        r"HS:\s+(\d+)\s+agents",
        r"HS:\s+(no |0 |error)",
        r"(\[hs_parser\]|\[hs_downloader\]|  HS:)",
        "Hearsay parser found no CSVs for target date. "
        "Re-open HS tabs via option [1] and wait for downloads to finish.",
    ),
    ("Rico CH",
        r"Rico CH:\s+(\d+)\s+agents",
        r"Rico CH:\s+(no |0 |error)",
        r"(\[rico_ch_parser\]|  Rico CH:)",
        "Rico CH zip for this date is missing or malformed. "
        "Re-download the CH Dialer Export from Ricochet.",
    ),
    ("Rico AP",
        r"Rico AP:\s+(\d+)\s+agents",
        r"Rico AP:\s+(no |0 |error)",
        r"(\[rico_ap_parser\]|  Rico AP:)",
        "Agent Performance xlsx is missing or the wrong date. "
        "Re-download from Ricochet -> Reports -> Agent Performance.",
    ),
    ("New Business",
        r"NB:\s+(\d+)\s+agents",
        r"NB:\s+(no |0 |error)",
        r"(\[nb_parser\]|  NB:)",
        "NB file exists but has no rows matching the target date. "
        "Re-export 'New Business Details' from eAgent covering the target day.",
    ),
    ("Quotes",
        r"Quotes:\s+(\d+)\s+agents",
        r"Quotes:\s+(no |0 |error)",
        r"(\[quotes_parser\]|  Quotes:)",
        "Quotes file exists but has no rows matching the target date. "
        "Re-export 'Quotes Detail Report' from eAgent covering the target day.",
    ),
    ("Premium",
        r"Premium:\s+(\d+)\s+agents",
        r"Premium:\s+(no |0 |error)",
        r"(\[premium_parser\]|  Premium:)",
        "Premium file exists but has no rows matching the target date. "
        "Re-export 'Sales Report' from AgencyZoom with the target day included.",
    ),
    ("Rico Leads",
        r"Rico Leads:\s+(\d+)\s+agents",
        r"Rico Leads:\s+(no |0 |error|auto-download)",
        r"(\[rico_leads_parser\]|\[rico_leads_downloader\]|  Rico Leads:)",
        "Rico Leads snapshot missing or Playwright auto-pull failed. "
        "Manually download from https://admin-allstate-mt3.ricochet.me/alsop/reports "
        "(newest LeadSwami Report, blue download icon) and re-run.",
    ),
    ("DSR write",
        r"Inserted (\d+) rows",
        r"dsr_master.*(error|failed)",
        r"\[dsr_master\]",
        "Master workbook write failed. Check that DSR_Master.xlsx isn't open in Excel.",
    ),
    ("Weekly",
        r"Weekly:\s+(\d+) agents",
        r"master_sheets.*(error|failed)",
        r"\[master_sheets\].*(Weekly|week)",
        "Weekly sheet build failed. See errors above.",
    ),
    ("Monthly",
        r"Monthly:\s+(\d+) agents",
        r"master_sheets.*(error|failed)",
        r"\[master_sheets\].*(Monthly|month)",
        "Monthly sheet build failed. See errors above.",
    ),
    ("CR",
        r"CR:\s+YTD (\d+) agents,\s+Monthly (\d+)",
        r"master_sheets.*(error|failed)",
        r"\[master_sheets\].*CR",
        "CR sheet build failed. See errors above.",
    ),
]


def _stream_and_capture(cmd: list[str]) -> tuple[int, list[str]]:
    """Run a subprocess, echo each line live, and return (returncode, all_lines)."""
    proc = subprocess.Popen(
        cmd,
        cwd=str(PROJECT_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        encoding="utf-8",
        errors="replace",
    )
    lines: list[str] = []
    assert proc.stdout is not None
    for line in proc.stdout:
        print(line, end="")
        lines.append(line.rstrip("\n"))
    proc.wait()
    return proc.returncode, lines


def _summarize(
    lines: list[str],
    returncode: int,
    duration_sec: float = 0.0,
    preflight_results: dict | None = None,
) -> str:
    """
    Parse captured output and print a clean success/failure summary.
    For any source that's not OK, show the actual log lines that
    explain why, plus a specific hint for what to do about it.
    Returns 'ok', 'warn', or 'fail'.
    """
    blob = "\n".join(lines)

    print()
    print("=" * 59)
    print("  RUN SUMMARY")
    print("=" * 59)

    any_errors = returncode != 0
    problem_sources: list[tuple[str, str, str]] = []  # (label, status_mark, hint)
    rows = []

    for label, success_pat, warn_pat, log_grep, hint in _SOURCE_PATTERNS:
        m = re.search(success_pat, blob, re.IGNORECASE)
        if m:
            nums = " / ".join(m.groups())
            rows.append((label, "[OK]", nums))
            continue
        w = re.search(warn_pat, blob, re.IGNORECASE) if warn_pat else None
        if w:
            rows.append((label, "[--]", "ran but no data"))
            problem_sources.append((label, "[--]", hint))
        else:
            rows.append((label, "[  ]", "not run"))
            # "not run" on a known parser is a real problem — surface it too
            if label in ("RC", "Hearsay", "Rico CH", "New Business", "Quotes", "Premium"):
                problem_sources.append((label, "[  ]", hint))

    # Aligned table
    for label, status, detail in rows:
        print(f"  {status}  {label:<14} {detail}")

    # Explicit error lines
    error_lines = [
        l for l in lines
        if re.search(r"(traceback|error:|exception|failed)", l, re.IGNORECASE)
        and "warning" not in l.lower()
    ]
    if error_lines:
        any_errors = True
        print("\n  ERRORS / WARNINGS:")
        for el in error_lines[-10:]:
            print(f"    > {el.strip()}")

    print("-" * 59)
    dur_str = f"   (took {_fmt_duration(duration_sec)})" if duration_sec else ""
    if returncode == 0 and not any_errors and not problem_sources:
        print(f"  [OK] Run completed cleanly.{dur_str}")
        status = "ok"
    elif returncode == 0:
        print(f"  [!!] Run finished but had warnings — see details below.{dur_str}")
        status = "warn"
    else:
        print(f"  [XX] Run FAILED with exit code {returncode}.{dur_str}")
        status = "fail"
    print("=" * 59)

    # --- Diagnostics: WHY did each problem source fail? ---
    if problem_sources:
        print()
        print("=" * 59)
        print("  WHY / WHAT TO DO")
        print("=" * 59)
        for label, mark, hint in problem_sources:
            # Find the log_grep pattern for this label
            log_grep = next(
                (lg for lbl, _, _, lg, _ in _SOURCE_PATTERNS if lbl == label),
                None,
            )
            print(f"\n  {mark} {label}")
            # Show relevant log lines
            if log_grep:
                matching = [l for l in lines if re.search(log_grep, l, re.IGNORECASE)]
                if matching:
                    print("     Log:")
                    for ml in matching[-5:]:  # last 5 matching lines max
                        print(f"       | {ml.strip()}")
                else:
                    print("     Log: (no matching log lines — parser may not have been invoked)")
            print(f"     Hint: {hint}")
        print()
        print("=" * 59)

    return status


# --- Actions ---------------------------------------------------------------

def _check_outlook() -> tuple[bool, str]:
    """Verify we can talk to Outlook via COM. Returns (ok, detail)."""
    try:
        import win32com.client
        import pythoncom
        pythoncom.CoInitialize()
        try:
            outlook = win32com.client.Dispatch("Outlook.Application")
            ns = outlook.GetNamespace("MAPI")
            inbox = ns.GetDefaultFolder(6)
            count = inbox.Items.Count
            return True, f"Inbox: {count} items"
        finally:
            pythoncom.CoUninitialize()
    except Exception as e:
        return False, f"failed: {type(e).__name__}"


def _check_edge() -> tuple[bool, str]:
    path = _find_edge()
    if path:
        return True, os.path.basename(os.path.dirname(path)) + "\\msedge.exe"
    return False, "not found"


def _check_downloads() -> tuple[bool, str]:
    p = Path.home() / "Downloads"
    if p.exists():
        try:
            count = sum(1 for _ in p.iterdir())
            return True, f"{count} items in Downloads"
        except Exception:
            return True, "accessible"
    return False, "no Downloads folder"


def _check_master() -> tuple[bool, str]:
    if MASTER_PATH.exists():
        size_kb = MASTER_PATH.stat().st_size / 1024
        return True, f"{size_kb:.0f} KB"
    return False, f"not found at {MASTER_PATH}"


def _is_edge_running() -> bool:
    """True if any msedge.exe process is running at all."""
    try:
        result = subprocess.run(
            ["tasklist", "/FI", "IMAGENAME eq msedge.exe", "/FO", "CSV", "/NH"],
            capture_output=True, text=True, timeout=5,
        )
        return "msedge.exe" in result.stdout.lower()
    except Exception:
        return False


# Portals are considered "still open" if we opened them within this window.
# Reset if Edge is fully closed.
PORTAL_SESSION_HOURS = 8


def _portal_last_opened(state: dict, match_key: str) -> datetime | None:
    """Return the datetime we last opened this portal, or None."""
    record = state.get("portals_opened", {}).get(match_key)
    if not record:
        return None
    try:
        return datetime.fromisoformat(record)
    except Exception:
        return None


def _mark_portal_opened(state: dict, match_key: str):
    state.setdefault("portals_opened", {})
    state["portals_opened"][match_key] = datetime.now().isoformat(timespec="seconds")


def _check_spine() -> tuple[bool, str]:
    """Check the spine config + sheet loads."""
    try:
        cfg_path = PROJECT_DIR / "config" / "config.json"
        if not cfg_path.exists():
            return False, "config.json missing"
        cfg = json.loads(cfg_path.read_text())
        spine_path = Path(cfg.get("spine", {}).get("path", ""))
        if not spine_path.exists():
            return False, f"spine file missing"
        return True, spine_path.name
    except Exception as e:
        return False, f"failed: {type(e).__name__}"


def do_login_check():
    clear()
    print(BANNER)
    print("  MORNING STARTUP CHECK")
    print("-" * 59)
    print("  Verifying local connections...\n")

    # --- System / connection checks ---
    checks = [
        ("Outlook app",       _check_outlook),
        ("Microsoft Edge",    _check_edge),
        ("Downloads folder",  _check_downloads),
        ("DSR_Master.xlsx",   _check_master),
        ("Spine config",      _check_spine),
    ]

    all_ok = True
    for label, fn in checks:
        ok, detail = fn()
        mark = "[OK]" if ok else "[XX]"
        if not ok:
            all_ok = False
        print(f"    {mark}  {label:<20} {detail}")

    if not all_ok:
        print("\n  [!!] One or more connections failed. Fix before running.")
    else:
        print("\n  [OK] All system checks passed.")

    # --- Portal detection ---
    print()
    print("-" * 59)
    print("  Checking portal login tabs in Edge...")
    print("-" * 59)

    edge = _find_edge()
    state = _load_state()

    # If Edge isn't running at all, our "opened" tracking is stale — wipe it.
    edge_running = _is_edge_running()
    if not edge_running:
        state["portals_opened"] = {}
        _save_state(state)

    now = datetime.now()
    session_cutoff = now - timedelta(hours=PORTAL_SESSION_HOURS)

    missing = []  # portals that need to be opened
    for portal in LOGIN_CHECKLIST:
        name = portal["name"]
        last = _portal_last_opened(state, portal["match"])
        is_open = edge_running and last is not None and last >= session_cutoff

        if is_open:
            when = last.strftime("%I:%M %p").lstrip("0")
            print(f"    [OK]  {name:20} opened at {when}")
        else:
            reason = "(Edge not running)" if not edge_running else "(no record)"
            print(f"    [--]  {name:20} not open {reason}")
            missing.append(portal)

    if not missing:
        print("\n  [OK] All portals already open. No action needed.")
    else:
        print(f"\n  Opening {len(missing)} missing portal(s) in Edge...")
        for portal in missing:
            print(f"    -> {portal['url']}")
            if edge:
                subprocess.Popen([edge, portal["url"]])
            else:
                webbrowser.open(portal["url"])
            _mark_portal_opened(state, portal["match"])

        state["last_portal_check"] = now.isoformat(timespec="seconds")
        _save_state(state)
        print()
        print("  Log into each newly-opened tab, then return here.")

    print()
    print("  Tip: Hearsay MUST be logged in before the pipeline runs")
    print("  (the 44 download tabs need an authenticated session).")
    print()
    print(f"  Session window: portals are remembered for {PORTAL_SESSION_HOURS} hours")
    print("  (or until Edge is fully closed).")

    pause()


def do_close_hs_tabs():
    """
    Close the Edge tabs that were opened for Hearsay downloads.
    Uses taskkill to close the Edge process matched by the hearsay URL in
    its command line. Safer approach: close ONLY windows launched via
    subprocess by terminating matching child processes.

    For simplicity we use a Windows approach: enumerate Edge processes that
    were launched with a hearsaysocial.com URL in their command line.
    """
    clear()
    print(BANNER)
    print("  CLOSE HEARSAY TABS")
    print("-" * 59)
    print("  This closes Edge processes that were opened with a")
    print("  hearsaysocial.com URL on the command line. Your other")
    print("  Edge windows/tabs are left alone.\n")

    try:
        # Query PIDs of msedge processes with hearsaysocial in command line
        ps_cmd = (
            "Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" | "
            "Where-Object { $_.CommandLine -like '*hearsaysocial*' } | "
            "Select-Object -ExpandProperty ProcessId"
        )
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps_cmd],
            capture_output=True, text=True, timeout=10,
        )
        pids = [p.strip() for p in result.stdout.splitlines() if p.strip().isdigit()]

        if not pids:
            print("  [--] No Hearsay Edge tabs found (already closed?).")
        else:
            print(f"  Found {len(pids)} Hearsay tab processes. Closing...")
            for pid in pids:
                subprocess.run(
                    ["taskkill", "/PID", pid, "/F"],
                    capture_output=True,
                )
            print(f"  [OK] Closed {len(pids)} processes.")
    except Exception as e:
        print(f"  [XX] Error: {e}")

    pause()


def do_run_dsr(target_date: date):
    clear()
    print(BANNER)
    print(f"  RUNNING DSR PIPELINE  for  {target_date}")
    print("-" * 59)

    results = preflight_check(target_date)
    all_ok = print_preflight(target_date, results)
    if not all_ok:
        show_fix_instructions(results)
        ans = input("  Continue anyway? [y/N]: ").strip().lower()
        if ans != "y":
            print("\n  Run cancelled. Fix the missing sources and try again.")
            pause()
            return

    t0 = time.time()
    rc, lines = _stream_and_capture(
        [PYTHON_EXE, "main.py", "--date", target_date.isoformat(), "--skip-screenshots"]
    )
    dur = time.time() - t0
    status = _summarize(lines, rc, dur, preflight_results=results)
    _record_run("dsr", target_date, dur, status)
    pause()


def do_run_reports(target_date: date):
    clear()
    print(BANNER)
    print(f"  BUILDING WEEKLY / MONTHLY / CR  for  {target_date}")
    print("-" * 59)
    t0 = time.time()
    rc, lines = _stream_and_capture(
        [PYTHON_EXE, "main.py", "--report", "all", "--date", target_date.isoformat()]
    )
    dur = time.time() - t0
    status = _summarize(lines, rc, dur)
    _record_run("reports", target_date, dur, status)
    pause()


def do_monday_catchup():
    """
    Run the DSR pipeline for Friday, Saturday, and Sunday back-to-back,
    then build Weekly/Monthly/CR once at the end.

    Uses the most recent Fri/Sat/Sun relative to today (so you can run
    this any day of the week and it backfills the last weekend).
    """
    today = date.today()
    # Monday = 0. Distance back to last Sunday:
    days_to_last_sun = (today.weekday() + 1) % 7 or 7  # Mon->1, Tue->2, ... Sun->7
    last_sun = today - timedelta(days=days_to_last_sun)
    last_sat = last_sun - timedelta(days=1)
    last_fri = last_sun - timedelta(days=2)
    dates = [last_fri, last_sat, last_sun]

    clear()
    print(BANNER)
    print("  MONDAY CATCH-UP  (weekend backfill)")
    print("-" * 59)
    print("  Will run DSR pipeline for:")
    for d in dates:
        print(f"    - {d.strftime('%A, %b %d')}")
    print(f"\n  Then build Weekly/Monthly/CR referenced to {last_sun}.")
    print()
    confirm = input("  Proceed? [Y/n]: ").strip().lower()
    if confirm == "n":
        return

    all_lines: list[str] = []
    final_rc = 0
    t0 = time.time()
    for i, d in enumerate(dates, 1):
        print("\n" + "-" * 59)
        print(f"  [{i}/3] DSR pipeline for {d}")
        print("-" * 59)
        rc, lines = _stream_and_capture(
            [PYTHON_EXE, "main.py", "--date", d.isoformat(), "--skip-screenshots"]
        )
        all_lines.extend(lines)
        if rc != 0:
            final_rc = rc
            dur = time.time() - t0
            print(f"\n  [!] DSR for {d} failed (code {rc}). Stopping.")
            status = _summarize(all_lines, final_rc, dur)
            _record_run("monday_catchup", last_sun, dur, status)
            pause()
            return

    print("\n" + "-" * 59)
    print(f"  [Reports] Weekly / Monthly / CR for week ending {last_sun}")
    print("-" * 59)
    rc, lines = _stream_and_capture(
        [PYTHON_EXE, "main.py", "--report", "all", "--date", last_sun.isoformat()]
    )
    all_lines.extend(lines)
    dur = time.time() - t0
    status = _summarize(all_lines, rc if rc != 0 else final_rc, dur)
    _record_run("monday_catchup", last_sun, dur, status)
    pause()


def do_full_run(target_date: date):
    """Run DSR then reports back-to-back, single combined summary."""
    clear()
    print(BANNER)
    print(f"  FULL RUN  for  {target_date}")
    print("-" * 59)

    results = preflight_check(target_date)
    all_ok = print_preflight(target_date, results)
    if not all_ok:
        show_fix_instructions(results)
        ans = input("  Continue anyway? [y/N]: ").strip().lower()
        if ans != "y":
            print("\n  Run cancelled. Fix the missing sources and try again.")
            pause()
            return

    print("\n" + "-" * 59)
    print("  Step 1/2: DSR pipeline")
    print("-" * 59)
    t0 = time.time()
    rc1, lines1 = _stream_and_capture(
        [PYTHON_EXE, "main.py", "--date", target_date.isoformat(), "--skip-screenshots"]
    )
    if rc1 != 0:
        dur = time.time() - t0
        status = _summarize(lines1, rc1, dur, preflight_results=results)
        _record_run("full", target_date, dur, status)
        print("\n  [!] DSR step failed. Skipping reports.")
        pause()
        return

    print("\n" + "-" * 59)
    print("  Step 2/2: Weekly / Monthly / CR")
    print("-" * 59)
    rc2, lines2 = _stream_and_capture(
        [PYTHON_EXE, "main.py", "--report", "all", "--date", target_date.isoformat()]
    )
    dur = time.time() - t0
    combined_rc = rc2 if rc1 == 0 else rc1
    status = _summarize(lines1 + lines2, combined_rc, dur, preflight_results=results)
    _record_run("full", target_date, dur, status)
    pause()


def do_open_master():
    if not MASTER_PATH.exists():
        print(f"\n  [!] Master file not found: {MASTER_PATH}")
        pause()
        return
    os.startfile(str(MASTER_PATH))


def do_change_date(current: date) -> date:
    clear()
    print(BANNER)
    print(f"  CHANGE REPORTING DATE")
    print("-" * 59)
    print(f"  Current: {current}")
    print("  Enter new date as YYYY-MM-DD, or press ENTER to keep.")
    raw = input("\n  > ").strip()
    if not raw:
        return current
    try:
        return datetime.strptime(raw, "%Y-%m-%d").date()
    except ValueError:
        print("\n  [!] Bad format. Keeping current date.")
        pause()
        return current


# --- Edge detection --------------------------------------------------------

def _find_edge() -> str | None:
    candidates = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"),
    ]
    for p in candidates:
        if p and os.path.exists(p):
            return p
    return None


# --- Main loop -------------------------------------------------------------

def _smart_default_date() -> date:
    """
    Smart default reporting date:
      - Mon  -> last Friday  (so managers see Friday on the weekly run day)
      - Tue..Fri -> yesterday
      - Sat/Sun  -> yesterday (rare, but works)
    """
    today = date.today()
    if today.weekday() == 0:  # Monday
        return today - timedelta(days=3)
    return today - timedelta(days=1)


def main():
    target = _smart_default_date()

    while True:
        header(target)
        print("""
  [1]  Morning startup check  (connections + open portals in Edge)
  [2]  Run DSR pipeline        (step 1 — pull & parse daily data)
  [3]  Run Weekly/Monthly/CR   (step 2 — build summary sheets)
  [4]  FULL RUN                (steps 1 + 2 back-to-back)
  [5]  MONDAY CATCH-UP         (Fri + Sat + Sun, then reports)
  [6]  Close Hearsay tabs      (cleanup after HS downloads)
  [7]  Open DSR_Master.xlsx
  [8]  Change reporting date
  [Q]  Quit
""")
        choice = input("  Select: ").strip().lower()

        if choice == "1":
            do_login_check()
        elif choice == "2":
            do_run_dsr(target)
        elif choice == "3":
            do_run_reports(target)
        elif choice == "4":
            do_full_run(target)
        elif choice == "5":
            do_monday_catchup()
        elif choice == "6":
            do_close_hs_tabs()
        elif choice == "7":
            do_open_master()
        elif choice == "8":
            target = do_change_date(target)
        elif choice in ("q", "quit", "exit"):
            print("\n  Goodbye.\n")
            return
        else:
            print("\n  [!] Invalid choice.")
            pause()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n  Interrupted. Goodbye.\n")
