"""
master_sheets.py — Write Weekly, Monthly, and CR sheets into the DSR Master workbook.

Uses win32com to add/update sheets in the master Excel file alongside the DSR sheet,
preserving all existing slicers, tables, conditional formatting, etc.

All three report sheets read from the existing DSR data in the master workbook.
"""

import win32com.client
import pythoncom
import pandas as pd
from datetime import date, timedelta, datetime as _datetime
from calendar import monthrange
from pathlib import Path

from src.spine import Spine


# ── Excel COM constants ─────────────────────────────────────────────────────
# (win32com constants - defined here so we don't need makepy/gencache)
xlCenter = -4108
xlLeft = -4131
xlRight = -4152
xlTop = -4160
xlBottom = -4107
xlAscending = 1
xlDescending = 2
xlContinuous = 1
xlMedium = -4138
xlThin = 2
xlNone = -4142
xlCalculationManual = -4135
xlCalculationAutomatic = -4105


def _rgb(hex_color: str) -> int:
    """Convert hex color 'RRGGBB' to Excel RGB integer (BGR order)."""
    r = int(hex_color[0:2], 16)
    g = int(hex_color[2:4], 16)
    b = int(hex_color[4:6], 16)
    return r + (g * 256) + (b * 65536)


def _delete_sheet_if_exists(wb, name: str):
    """Delete a worksheet by name if it exists."""
    for i in range(1, wb.Sheets.Count + 1):
        if wb.Sheets(i).Name == name:
            wb.Sheets(i).Delete()
            return True
    return False


def _add_sheet(wb, name: str, after_sheet: str = None) -> object:
    """Add a new sheet, optionally after a specific sheet."""
    if after_sheet:
        for i in range(1, wb.Sheets.Count + 1):
            if wb.Sheets(i).Name == after_sheet:
                ws = wb.Sheets.Add(After=wb.Sheets(i))
                ws.Name = name
                return ws
    # Default: add at end
    ws = wb.Sheets.Add(After=wb.Sheets(wb.Sheets.Count))
    ws.Name = name
    return ws


def _business_days_in_range(start: date, end: date) -> int:
    """Count business days (Mon-Fri) between start and end, inclusive."""
    count = 0
    current = start
    while current <= end:
        if current.weekday() < 5:
            count += 1
        current += timedelta(days=1)
    return count


# ═════════════════════════════════════════════════════════════════════════════
#  PUBLIC API
# ═════════════════════════════════════════════════════════════════════════════

def write_all_reports(
    master_path: str,
    spine: Spine,
    target_date: date,
    reports: list[str] = None,
):
    """
    Write Weekly, Monthly, and/or CR sheets into the master workbook.

    Parameters
    ----------
    master_path : str
        Path to DSR_Master.xlsx
    spine : Spine
        Agent name resolver
    target_date : date
        Reference date (determines which week/month/YTD to compute)
    reports : list[str]
        Which reports to write: ["weekly", "monthly", "cr"]. Default: all three.
    """
    if reports is None:
        reports = ["weekly", "monthly", "cr"]

    master = Path(master_path).resolve()
    if not master.exists():
        raise FileNotFoundError(f"Master workbook not found: {master}")

    print(f"[master_sheets] Opening master workbook...")

    pythoncom.CoInitialize()
    excel = None
    wb = None

    try:
        # Kill stale Excel processes
        import subprocess, time as _time
        _stale = subprocess.run(
            ["tasklist", "//fi", "imagename eq EXCEL.EXE"],
            capture_output=True, text=True
        )
        if "EXCEL.EXE" in _stale.stdout:
            subprocess.run(["taskkill", "//f", "//im", "EXCEL.EXE"],
                           capture_output=True, text=True)
            _time.sleep(1)

        excel = win32com.client.DispatchEx("Excel.Application")
        _time.sleep(1)
        excel.Visible = False
        excel.DisplayAlerts = False
        excel.ScreenUpdating = False

        wb = excel.Workbooks.Open(str(master))

        # Set calculation to manual for speed (after opening workbook)
        try:
            excel.Calculation = xlCalculationManual
        except Exception:
            pass  # Some Excel versions don't support this

        if wb.ReadOnly:
            wb.Close(False)
            excel.Quit()
            raise RuntimeError(f"Master workbook is read-only. Close Excel first.")

        # Read DSR data from the DSR sheet
        dsr_data = _read_dsr_data(wb)
        print(f"[master_sheets] Read {len(dsr_data)} DSR rows")

        # Delete report sheets that will be recreated
        for name in ["Weekly", "Monthly", "CR"]:
            if name.lower() in reports:
                _delete_sheet_if_exists(wb, name)

        # Create sheets in order (each after the previous)
        if "weekly" in reports:
            print("[master_sheets] Writing Weekly sheet...")
            _write_weekly_sheet(wb, dsr_data, spine, target_date)

        if "monthly" in reports:
            print("[master_sheets] Writing Monthly sheet...")
            _write_monthly_sheet(wb, dsr_data, spine, target_date)

        if "cr" in reports:
            print("[master_sheets] Writing CR sheets...")
            _write_cr_sheets(wb, dsr_data, spine, target_date)

        # Restore auto calculation
        try:
            excel.Calculation = xlCalculationAutomatic
        except Exception:
            pass

        # Select DSR sheet so it's the active tab when user opens
        try:
            wb.Sheets("DSR").Activate()
        except Exception:
            pass

        wb.Save()
        print(f"[master_sheets] Saved: {master}")

        wb.Close(False)
        excel.ScreenUpdating = True
        excel.DisplayAlerts = True
        excel.Quit()

    except Exception:
        try:
            if wb is not None:
                wb.Close(False)
        except Exception:
            pass
        try:
            if excel is not None:
                excel.Quit()
        except Exception:
            pass
        raise
    finally:
        wb = None
        excel = None
        pythoncom.CoUninitialize()

    return master


def _read_dsr_data(wb) -> pd.DataFrame:
    """Read all DSR data from the DSR sheet via COM into a DataFrame."""
    ws = wb.Sheets("DSR")

    # Find the DSR table
    table = None
    for i in range(1, ws.ListObjects.Count + 1):
        if ws.ListObjects(i).Name == "DSR":
            table = ws.ListObjects(i)
            break

    if table is None:
        raise ValueError("DSR table not found in master workbook")

    # Read headers
    headers = []
    for j in range(1, table.ListColumns.Count + 1):
        headers.append(table.ListColumns(j).Name)

    # Read data body
    if table.ListRows.Count == 0:
        return pd.DataFrame(columns=headers)

    # Use Range.Value to get all data at once (much faster than cell-by-cell)
    data_range = table.DataBodyRange
    raw_data = data_range.Value  # Returns tuple of tuples

    # Find which column index is "Date" so we can convert pytime objects immediately
    date_col_idx = None
    for j, h in enumerate(headers):
        if h == "Date":
            date_col_idx = j
            break

    rows = []
    for row_tuple in raw_data:
        row_dict = {}
        for j, header in enumerate(headers):
            val = row_tuple[j] if j < len(row_tuple) else None
            # Convert COM pytime dates to Python datetime immediately
            if j == date_col_idx and val is not None:
                if hasattr(val, 'year') and hasattr(val, 'month') and hasattr(val, 'day'):
                    try:
                        val = _datetime(val.year, val.month, val.day)
                    except Exception:
                        val = None
            row_dict[header] = val
        rows.append(row_dict)

    df = pd.DataFrame(rows)

    # Now Date column should be plain Python datetime, safe for pandas
    if "Date" in df.columns:
        df["Date"] = pd.to_datetime(df["Date"], errors="coerce")

    return df


# ═════════════════════════════════════════════════════════════════════════════
#  WEEKLY SHEET
# ═════════════════════════════════════════════════════════════════════════════

def _get_week_range(target_date: date) -> tuple[date, date]:
    monday = target_date - timedelta(days=target_date.weekday())
    sunday = monday + timedelta(days=6)
    return monday, sunday


def _get_week_label(monday: date, sunday: date) -> str:
    return f"{monday.strftime('%m.%d')}-{sunday.strftime('%m.%d')}"


def _write_weekly_sheet(wb, dsr_data: pd.DataFrame, spine: Spine, target_date: date):
    """Write the Weekly Production sheet matching original styling exactly."""
    week_start, week_end = _get_week_range(target_date)
    week_label = _get_week_label(week_start, week_end)

    # Add after DSR sheet (deletion handled by caller)
    ws = _add_sheet(wb, "Weekly", after_sheet="DSR")

    # Filter DSR data to this week
    df = dsr_data.copy()
    df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    mask = (df["Date"].dt.date >= week_start) & (df["Date"].dt.date <= week_end)
    df = df[mask]

    # Convert Talk Time to seconds
    if "Talk Time" in df.columns:
        df["TalkTimeSec"] = df["Talk Time"].apply(_to_seconds_com)
    else:
        df["TalkTimeSec"] = 0

    # Fill missing columns
    for col in ["Calls", "Inbound", "Outbound", "Texts", "Quotes", "NB", "Items",
                "Total Premium", "Contact", "Quoted", "Hot", "XDate",
                "Dismissed To-Do's", "Past Due To-Do's"]:
        if col not in df.columns:
            df[col] = 0
        else:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    # Aggregate per agent
    if len(df) == 0:
        print("[master_sheets] No weekly data found")
        return

    agg = df.groupby("Agent").agg(
        Office=("Office", "first"),
        Team=("Team", "first"),
        InCalls=("Inbound", "sum"),
        OutCalls=("Outbound", "sum"),
        TotalCalls=("Calls", "sum"),
        TalkTimeSec=("TalkTimeSec", "sum"),
        Texts=("Texts", "sum"),
        Quotes=("Quotes", "sum"),
        NB=("NB", "sum"),
        Items=("Items", "sum"),
        TotalPremium=("Total Premium", "sum"),
        DismissedTodos=("Dismissed To-Do's", "last"),
        PastDueTodos=("Past Due To-Do's", "last"),
        Hot=("Hot", "sum"),
    ).reset_index()

    agg = agg.sort_values(["Team", "Agent"]).reset_index(drop=True)

    # Calculate MTD values
    month_start = week_end.replace(day=1)
    mtd_mask = (dsr_data["Date"].dt.date >= month_start) & (dsr_data["Date"].dt.date <= week_end)
    mtd_df = dsr_data[mtd_mask].copy()
    for col in ["Total Premium", "Items"]:
        if col in mtd_df.columns:
            mtd_df[col] = pd.to_numeric(mtd_df[col], errors="coerce").fillna(0)
    mtd_premium = mtd_df.groupby("Agent")["Total Premium"].sum().to_dict() if "Total Premium" in mtd_df.columns else {}
    mtd_items = mtd_df.groupby("Agent")["Items"].sum().to_dict() if "Items" in mtd_df.columns else {}

    # ── Column definitions matching original Weekly sheet exactly ──
    # (header, width, hidden, header_fill_hex, number_format)
    COLS = [
        # A: Week label ref (hidden in original, but we use it for B ref)
        # B: date ref (formula in original)
        # C: Office (hidden)
        # D: Name
        # Actual visible columns start from A in our sheet:
        ("",              10.1,  False, None,     None),        # A: spacer
        ("",              18.1,  False, None,     None),        # B: week date ref
        ("Office",         9.3,  True,  None,     None),        # C: hidden
        ("Name",          13.7,  False, None,     None),        # D
        ("In Calls",       7.3,  False, "196B24", None),        # E
        ("Out Calls",     13.0,  False, "196B24", None),        # F
        ("Total Calls",   13.0,  False, "196B24", None),        # G
        ("Talk Time",      7.7,  False, "196B24", "[h]:mm"),    # H
        ("Texts",          7.3,  False, None,     None),        # I
        ("Unique Leads",  13.0,  False, "FF552D", None),        # J
        ("Rico Hot Pipeline", 10.1, False, "FF552D", None),     # K
        ("#PIVOT",         7.3,  False, None,     None),        # L
        ("#SAVED",        12.7,  False, None,     None),        # M
        ("eAgent Dismissed To-do's", 10.3, False, None, None),  # N
        ("eAgent Past Due To-Do's", 12.4, False, None, None),   # O
        ("Rico Past Due Tasks", 13.0, False, None, None),       # P
        ("Life Leads",    12.3,  True,  None,     None),        # Q (hidden)
        ("Auto Quotes",   13.0,  False, "FFC000", None),        # R
        ("Total Written Premium Wk", 18.3, False, "FFC000", '"$"#,##0'),  # S
        ("MTD  Total Premium", 15.6, False, "FFC000", '"$"#,##0'),        # T
        ("Auto Pts Wk",    9.3,  False, "FFC000", None),        # U
        ("Prev Mo Auto Pts", 20.9, False, "FFC000", None),      # V
        ("MTD Auto Items", 13.0,  False, "FFC000", None),       # W
    ]

    # ── Row 1: Title ──
    ws.Range("A1").Value = "Week:"
    ws.Range("A1").Font.Name = "Aptos Narrow"
    ws.Range("A1").Font.Size = 16
    ws.Range("A1").Font.Bold = True
    ws.Rows(1).RowHeight = 21.75

    ws.Range("B1").Value = week_label
    ws.Range("B1").Font.Name = "Aptos Narrow"
    ws.Range("B1").Font.Size = 16
    ws.Range("B1").Font.Bold = True
    ws.Range("B1").Interior.Color = _rgb("FFFF00")
    ws.Range("B1").Borders.Weight = xlMedium

    # Merged title D1:W2
    ws.Range("D1:W2").Merge()
    ws.Range("D1").Value = "Weekly Production"
    ws.Range("D1").Font.Name = "Aptos Narrow"
    ws.Range("D1").Font.Size = 36
    ws.Range("D1").Font.Bold = True
    ws.Range("D1").HorizontalAlignment = xlCenter

    # ── Row 2: Subtitle ──
    ws.Rows(2).RowHeight = 24
    ws.Range("B2").Value = "Mon - Sun"
    ws.Range("B2").Font.Name = "Aptos Narrow"
    ws.Range("B2").Font.Size = 11

    # ── Row 3: Headers ──
    ws.Rows(3).RowHeight = 69

    for col_idx, (header, width, hidden, fill_hex, fmt) in enumerate(COLS):
        col_num = col_idx + 1  # 1-based
        cell = ws.Cells(3, col_num)
        if header:
            cell.Value = header

        cell.Font.Name = "Aptos Narrow"
        cell.WrapText = True
        cell.HorizontalAlignment = xlCenter

        # Default header font: 11pt normal
        cell.Font.Size = 11
        cell.Font.Bold = False

        # Special overrides
        if col_num == 3:  # C: Office
            cell.Font.Size = 14
            cell.Font.Bold = True
        elif col_num == 4:  # D: Name
            cell.Font.Size = 14
            cell.Font.Bold = True
        elif col_num == 9:  # I: Texts
            cell.Font.Size = 12
            cell.Font.Bold = True
            cell.HorizontalAlignment = xlLeft

        if fill_hex:
            cell.Interior.Color = _rgb(fill_hex)

        # Column width
        ws.Columns(col_num).ColumnWidth = width
        if hidden:
            ws.Columns(col_num).Hidden = True

    # ── Data rows (row 4+) ──
    data_start = 4
    for row_idx, (_, row) in enumerate(agg.iterrows()):
        r = data_start + row_idx
        agent = row["Agent"]
        talk_sec = int(row.get("TalkTimeSec", 0))
        talk_fraction = talk_sec / 86400.0 if talk_sec > 0 else 0

        values = [
            None,                                   # A: spacer
            None,                                   # B: date ref
            row.get("Office", ""),                  # C: Office
            agent,                                  # D: Name
            int(row.get("InCalls", 0)),             # E: In Calls
            int(row.get("OutCalls", 0)),            # F: Out Calls
            int(row.get("TotalCalls", 0)),          # G: Total Calls
            talk_fraction,                          # H: Talk Time
            int(row.get("Texts", 0)),               # I: Texts
            0,                                      # J: Unique Leads (manual)
            int(row.get("Hot", 0)),                 # K: Rico Hot Pipeline
            int(row.get("pivot_count", 0)),         # L: #PIVOT (eAgent/screenshot)
            0,                                      # M: #SAVED (manual)
            int(row.get("DismissedTodos", 0)),      # N: Dismissed To-Do's
            int(row.get("PastDueTodos", 0)),        # O: Past Due To-Do's
            0,                                      # P: Rico Past Due Tasks (manual)
            0,                                      # Q: Life Leads (manual/hidden)
            int(row.get("Quotes", 0)),              # R: Auto Quotes
            float(row.get("TotalPremium", 0)),      # S: Written Premium Wk
            float(mtd_premium.get(agent, 0)),       # T: MTD Total Premium
            0,                                      # U: Auto Pts Wk (manual)
            0,                                      # V: Prev Mo Auto Pts (manual)
            int(mtd_items.get(agent, 0)),           # W: MTD Auto Items
        ]

        ws.Rows(r).RowHeight = 15.6

        for col_idx, val in enumerate(values):
            col_num = col_idx + 1
            cell = ws.Cells(r, col_num)
            if val is not None:
                cell.Value = val

            cell.Font.Name = "Aptos Narrow"
            cell.Font.Size = 12
            cell.Font.Bold = True

            # Apply number format for specific columns
            _, _, _, _, fmt = COLS[col_idx]
            if fmt:
                cell.NumberFormat = fmt

    last_data = data_start + len(agg) - 1

    # ── Freeze panes ──
    ws.Range("E4").Select()
    wb.Windows(1).FreezePanes = True

    print(f"[master_sheets] Weekly: {len(agg)} agents, week {week_label}")


# ═════════════════════════════════════════════════════════════════════════════
#  MONTHLY SHEET
# ═════════════════════════════════════════════════════════════════════════════

def _write_monthly_sheet(wb, dsr_data: pd.DataFrame, spine: Spine, target_date: date):
    """Write the Monthly Performance sheet."""
    month_start = target_date.replace(day=1)
    _, last_day = monthrange(target_date.year, target_date.month)
    month_end = date(target_date.year, target_date.month, last_day)
    month_label = month_start.strftime("%B %Y")

    ws = _add_sheet(wb, "Monthly", after_sheet="Weekly")

    df = dsr_data.copy()
    df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    mask = (df["Date"].dt.date >= month_start) & (df["Date"].dt.date <= month_end)
    df = df[mask]

    if len(df) == 0:
        ws.Range("A1").Value = f"Monthly Performance - {month_label}"
        ws.Range("A2").Value = "No data for this month"
        print("[master_sheets] No monthly data")
        return

    # Convert Talk Time
    if "Talk Time" in df.columns:
        df["TalkTimeSec"] = df["Talk Time"].apply(_to_seconds_com)
    else:
        df["TalkTimeSec"] = 0

    for col in ["Calls", "Inbound", "Outbound", "Texts", "OutTexts", "Opt-Ins", "Opt-Outs",
                "Quotes", "NB", "Items", "Total Premium", "Contact", "Quoted", "Hot", "XDate"]:
        if col not in df.columns:
            df[col] = 0
        else:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    agg = df.groupby("Agent").agg(
        Team=("Team", "first"),
        Office=("Office", "first"),
        DaysWorked=("Date", "nunique"),
        TotalCalls=("Calls", "sum"),
        Inbound=("Inbound", "sum"),
        Outbound=("Outbound", "sum"),
        TalkTimeSec=("TalkTimeSec", "sum"),
        Texts=("Texts", "sum"),
        OutTexts=("OutTexts", "sum"),
        OptIns=("Opt-Ins", "sum"),
        OptOuts=("Opt-Outs", "sum"),
        Quotes=("Quotes", "sum"),
        NB=("NB", "sum"),
        Items=("Items", "sum"),
        TotalPremium=("Total Premium", "sum"),
        Contact=("Contact", "sum"),
        Quoted_pipeline=("Quoted", "sum"),
        Hot=("Hot", "sum"),
        Xsale=("XDate", "sum"),
    ).reset_index()

    agg["AvgCalls"] = (agg["TotalCalls"] / agg["DaysWorked"]).round(1)
    agg["AvgTalkSec"] = (agg["TalkTimeSec"] / agg["DaysWorked"]).astype(int)
    agg["AvgTexts"] = (agg["Texts"] / agg["DaysWorked"]).round(1)
    agg["CloseRate"] = (agg["NB"] / agg["Quotes"].replace(0, float("nan"))).fillna(0)
    agg["AvgPremium"] = (agg["TotalPremium"] / agg["DaysWorked"]).round(0)

    agg = agg.sort_values(["Team", "Agent"]).reset_index(drop=True)

    # Column definitions (header, width, format, header_fill_hex)
    MCOLS = [
        ("Team",              7,   None,       "4472C4"),
        ("Office",            8,   None,       "4472C4"),
        ("Agent",            14,   None,       "4472C4"),
        ("Days Worked",      10,   "#,##0",    "4472C4"),
        ("Total Calls",      11,   "#,##0",    "4472C4"),
        ("Avg Calls/Day",    12,   "#,##0.0",  "4472C4"),
        ("Inbound",           9,   "#,##0",    "4472C4"),
        ("Outbound",         10,   "#,##0",    "4472C4"),
        ("Talk Time",        11,   "[h]:mm:ss","4472C4"),
        ("Avg Talk/Day",     11,   "[h]:mm:ss","4472C4"),
        ("Texts",             8,   "#,##0",    "7030A0"),
        ("Avg Texts/Day",    12,   "#,##0.0",  "7030A0"),
        ("Out Texts",        10,   "#,##0",    "7030A0"),
        ("Opt-Ins",           8,   "#,##0",    "7030A0"),
        ("Opt-Outs",          9,   "#,##0",    "7030A0"),
        ("Quotes",            8,   "#,##0",    "BF8F00"),
        ("NB",                5,   "#,##0",    "BF8F00"),
        ("Close Rate",       10,   "0.0%",     "BF8F00"),
        ("Items",             7,   "#,##0",    "BF8F00"),
        ("Total Premium",    14,   '"$"#,##0', "BF8F00"),
        ("Avg Premium/Day",  14,   '"$"#,##0', "BF8F00"),
        ("Contact",           8,   "#,##0",    "7030A0"),
        ("Quoted",            8,   "#,##0",    "7030A0"),
        ("Hot",               5,   "#,##0",    "7030A0"),
        ("XDate",            7,   "#,##0",    "7030A0"),
    ]

    team_fill_map = {"CSR": "E2EFDA", "Sales": "FCE4D6", "EA": "D6DCE4"}

    # ── Row 1: Title ──
    ws.Range("A1:F1").Merge()
    ws.Range("A1").Value = f"Monthly Performance Report - {month_label}"
    ws.Range("A1").Font.Name = "Aptos Narrow"
    ws.Range("A1").Font.Size = 14
    ws.Range("A1").Font.Bold = True

    # ── Row 2: Date range ──
    ws.Range("A2").Value = f"{month_start.strftime('%m/%d/%Y')} - {month_end.strftime('%m/%d/%Y')}"
    ws.Range("A2").Font.Name = "Aptos Narrow"
    ws.Range("A2").Font.Size = 10
    ws.Range("A2").Font.Italic = True

    # ── Row 3: Headers ──
    for col_idx, (header, width, fmt, fill_hex) in enumerate(MCOLS):
        col_num = col_idx + 1
        cell = ws.Cells(3, col_num)
        cell.Value = header
        cell.Font.Name = "Aptos Narrow"
        cell.Font.Size = 10
        cell.Font.Bold = True
        cell.Font.Color = _rgb("FFFFFF")
        cell.Interior.Color = _rgb(fill_hex)
        cell.HorizontalAlignment = xlCenter
        cell.WrapText = True
        ws.Columns(col_num).ColumnWidth = width

    # ── Data rows ──
    data_start = 4
    r = data_start
    current_team = None

    for _, row in agg.iterrows():
        team = row["Team"]

        # Team subtotal when team changes
        if team != current_team and current_team is not None:
            r = _write_monthly_team_subtotal(ws, r, agg, current_team, MCOLS)
            r += 1  # blank row

        current_team = team
        talk_frac = row["TalkTimeSec"] / 86400.0
        avg_talk_frac = row["AvgTalkSec"] / 86400.0

        values = [
            team, row.get("Office", ""), row["Agent"],
            int(row["DaysWorked"]), int(row["TotalCalls"]), row["AvgCalls"],
            int(row["Inbound"]), int(row["Outbound"]),
            talk_frac, avg_talk_frac,
            int(row["Texts"]), row["AvgTexts"],
            int(row["OutTexts"]), int(row["OptIns"]), int(row["OptOuts"]),
            int(row["Quotes"]), int(row["NB"]), row["CloseRate"],
            int(row["Items"]), float(row["TotalPremium"]), float(row["AvgPremium"]),
            int(row.get("Contact", 0)), int(row.get("Quoted_pipeline", 0)),
            int(row.get("Hot", 0)), int(row.get("Xsale", 0)),
        ]

        team_fill = team_fill_map.get(team)

        for col_idx, val in enumerate(values):
            col_num = col_idx + 1
            cell = ws.Cells(r, col_num)
            cell.Value = val
            cell.Font.Name = "Aptos Narrow"
            cell.Font.Size = 10

            _, _, fmt, _ = MCOLS[col_idx]
            if fmt:
                cell.NumberFormat = fmt

            if team_fill and col_num <= 3:
                cell.Interior.Color = _rgb(team_fill)

        r += 1

    # Final team subtotal
    if current_team is not None:
        r = _write_monthly_team_subtotal(ws, r, agg, current_team, MCOLS)

    # Grand total
    r += 1
    ws.Cells(r, 1).Value = "GRAND TOTAL"
    for col_num in range(1, len(MCOLS) + 1):
        cell = ws.Cells(r, col_num)
        cell.Interior.Color = _rgb("375623")
        cell.Font.Color = _rgb("FFFFFF")
        cell.Font.Name = "Aptos Narrow"
        cell.Font.Size = 10
        cell.Font.Bold = True

    _set_monthly_grand_totals(ws, r, agg, MCOLS)

    # Freeze
    ws.Range("D4").Select()
    wb.Windows(1).FreezePanes = False
    ws.Range("D4").Select()
    wb.Windows(1).FreezePanes = True

    print(f"[master_sheets] Monthly: {len(agg)} agents, {month_label}")


def _write_monthly_team_subtotal(ws, r, agg, team, MCOLS) -> int:
    """Write team subtotal row. Returns next row."""
    team_data = agg[agg["Team"] == team]

    ws.Cells(r, 1).Value = f"{team} Total"

    total_quotes = team_data["Quotes"].sum()
    total_nb = team_data["NB"].sum()

    col_map = {
        4: int(team_data["DaysWorked"].sum()),
        5: int(team_data["TotalCalls"].sum()),
        6: round(team_data["AvgCalls"].mean(), 1),
        7: int(team_data["Inbound"].sum()),
        8: int(team_data["Outbound"].sum()),
        9: team_data["TalkTimeSec"].sum() / 86400.0,
        10: team_data["AvgTalkSec"].mean() / 86400.0,
        11: int(team_data["Texts"].sum()),
        12: round(team_data["AvgTexts"].mean(), 1),
        13: int(team_data["OutTexts"].sum()),
        14: int(team_data["OptIns"].sum()),
        15: int(team_data["OptOuts"].sum()),
        16: int(total_quotes),
        17: int(total_nb),
        18: total_nb / total_quotes if total_quotes > 0 else 0,
        19: int(team_data["Items"].sum()),
        20: float(team_data["TotalPremium"].sum()),
        21: round(team_data["AvgPremium"].mean(), 0),
        22: int(team_data["Contact"].sum()),
        23: int(team_data["Quoted_pipeline"].sum()),
        24: int(team_data["Hot"].sum()),
        25: int(team_data["Xsale"].sum()),
    }

    for col_num in range(1, len(MCOLS) + 1):
        cell = ws.Cells(r, col_num)
        cell.Interior.Color = _rgb("F2F2F2")
        cell.Font.Name = "Aptos Narrow"
        cell.Font.Size = 10
        cell.Font.Bold = True

        if col_num in col_map:
            cell.Value = col_map[col_num]
            _, _, fmt, _ = MCOLS[col_num - 1]
            if fmt:
                cell.NumberFormat = fmt

    return r + 1


def _set_monthly_grand_totals(ws, r, agg, MCOLS):
    """Set grand total numeric values."""
    total_quotes = agg["Quotes"].sum()
    total_nb = agg["NB"].sum()

    values = {
        4: int(agg["DaysWorked"].sum()),
        5: int(agg["TotalCalls"].sum()),
        6: round(agg["AvgCalls"].mean(), 1),
        7: int(agg["Inbound"].sum()),
        8: int(agg["Outbound"].sum()),
        9: agg["TalkTimeSec"].sum() / 86400.0,
        10: agg["AvgTalkSec"].mean() / 86400.0,
        11: int(agg["Texts"].sum()),
        12: round(agg["AvgTexts"].mean(), 1),
        13: int(agg["OutTexts"].sum()),
        14: int(agg["OptIns"].sum()),
        15: int(agg["OptOuts"].sum()),
        16: int(total_quotes),
        17: int(total_nb),
        18: total_nb / total_quotes if total_quotes > 0 else 0,
        19: int(agg["Items"].sum()),
        20: float(agg["TotalPremium"].sum()),
        21: round(agg["AvgPremium"].mean(), 0),
        22: int(agg["Contact"].sum()),
        23: int(agg["Quoted_pipeline"].sum()),
        24: int(agg["Hot"].sum()),
        25: int(agg["Xsale"].sum()),
    }

    for col_num, val in values.items():
        cell = ws.Cells(r, col_num)
        cell.Value = val
        _, _, fmt, _ = MCOLS[col_num - 1]
        if fmt:
            cell.NumberFormat = fmt


# ═════════════════════════════════════════════════════════════════════════════
#  CR (CLOSE RATE) SHEETS
# ═════════════════════════════════════════════════════════════════════════════

def _write_cr_sheets(wb, dsr_data: pd.DataFrame, spine: Spine, target_date: date):
    """Write CR sheet with YTD and Monthly sub-sections (matching original layout)."""
    ws = _add_sheet(wb, "CR", after_sheet="Monthly")

    df = dsr_data.copy()
    df["Date"] = pd.to_datetime(df["Date"], errors="coerce")

    for col in ["Quotes", "NB", "Items"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    # ── YTD section ──
    year_start = date(target_date.year, 1, 1)
    ytd_mask = (df["Date"].dt.date >= year_start) & (df["Date"].dt.date <= target_date)
    ytd_df = df[ytd_mask]
    biz_days_ytd = _business_days_in_range(year_start, target_date)

    ytd_agg = _aggregate_cr(ytd_df)

    # ── Row 1: Info ──
    ws.Range("A1").Value = "Most Recent Data Through"
    ws.Range("A1").Font.Name = "Aptos Narrow"
    ws.Range("A1").Font.Size = 11
    ws.Range("A1").Font.Bold = True

    ws.Range("A4").Value = _datetime(target_date.year, target_date.month, target_date.day)
    ws.Range("A4").Font.Name = "Aptos Narrow"
    ws.Range("A4").Font.Size = 11
    ws.Range("A4").Font.Bold = True
    ws.Range("A4").Font.Color = _rgb("C00000")
    ws.Range("A4").NumberFormat = "mm/dd/yy;@"

    # ── Row 3: Duplicate note ──
    ws.Range("C3:E4").Merge()
    ws.Range("C3").Value = "Solution for duplicate quotes not implemented yet. This is raw quote count."
    ws.Range("C3").Font.Name = "Aptos Narrow"
    ws.Range("C3").Font.Size = 11
    ws.Range("C3").Font.Color = _rgb("9C0006")
    ws.Range("C3").Interior.Color = _rgb("FFC7CE")
    ws.Range("C3").WrapText = True

    # ── Row 5: Business days ──
    ws.Range("A5").Value = "Business Days Passed this yr"
    ws.Range("A5").Font.Name = "Aptos Narrow"
    ws.Range("A5").Font.Size = 11
    ws.Range("A5").Font.Bold = True

    ws.Range("A6").Value = biz_days_ytd
    ws.Range("A6").Font.Name = "Aptos Narrow"
    ws.Range("A6").Font.Size = 11

    # ── Row 7: On pace indicator ──
    ws.Range("C7").Value = "On pace"
    ws.Range("C7").Font.Name = "Aptos Narrow"
    ws.Range("C7").Font.Color = _rgb("006100")
    ws.Range("C7").Interior.Color = _rgb("C6EFCE")
    ws.Range("D7").Value = ">=15%"
    ws.Range("D7").Font.Name = "Aptos Narrow"
    ws.Range("D7").Font.Color = _rgb("006100")
    ws.Range("D7").Interior.Color = _rgb("C6EFCE")

    # ── Row 8: YTD Title ──
    ws.Range("A8:H8").Merge()
    ws.Range("A8").Value = "Auto YTD"
    ws.Range("A8").Font.Name = "Aptos Narrow"
    ws.Range("A8").Font.Size = 16
    ws.Range("A8").Font.Bold = True

    # Column widths (matching original)
    col_widths = [29.3, 13.0, 13.0, 13.0, 9.1, 10.3, 8.6, 9.3, 8.4, 18.4]
    for i, w in enumerate(col_widths):
        ws.Columns(i + 1).ColumnWidth = w

    # Hide Team + Office columns
    ws.Columns(9).Hidden = True
    ws.Columns(10).Hidden = True

    # ── Row 9: Totals ──
    _write_cr_totals_row(ws, 9, ytd_agg, biz_days_ytd)

    # ── Row 10: Headers ──
    cr_headers = ["Sub Producer", "Issued Pol. Cnt", "Quote Cnt", "Close Rate",
                   "Auto Items", "Monthly quotes for 30 autos ",
                   "Daily Quote Goal", "Daily Quote-Actual", "Team", "Office"]

    for col_idx, header in enumerate(cr_headers):
        col_num = col_idx + 1
        cell = ws.Cells(10, col_num)
        cell.Value = header
        cell.Font.Name = "Aptos Narrow"
        cell.Font.Size = 11
        cell.Font.Bold = True

    # Daily Quote-Actual header in red/pink
    ws.Cells(10, 8).Font.Bold = False
    ws.Cells(10, 8).Font.Color = _rgb("9C0006")
    ws.Cells(10, 8).Interior.Color = _rgb("FFC7CE")

    # ── YTD Data rows ──
    ytd_data_start = 11
    ytd_last = _write_cr_data_rows(ws, ytd_data_start, ytd_agg, biz_days_ytd, spine)

    # ── Monthly section (below YTD with gap) ──
    monthly_start_row = ytd_last + 3
    month_start = target_date.replace(day=1)
    mtd_mask = (df["Date"].dt.date >= month_start) & (df["Date"].dt.date <= target_date)
    mtd_df = df[mtd_mask]
    biz_days_mtd = _business_days_in_range(month_start, target_date)
    monthly_agg = _aggregate_cr(mtd_df)

    # Monthly title
    ws.Range(f"A{monthly_start_row}:H{monthly_start_row}").Merge()
    ws.Cells(monthly_start_row, 1).Value = f"Auto Monthly ({target_date.strftime('%B %Y')})"
    ws.Cells(monthly_start_row, 1).Font.Name = "Aptos Narrow"
    ws.Cells(monthly_start_row, 1).Font.Size = 16
    ws.Cells(monthly_start_row, 1).Font.Bold = True

    # Monthly biz days
    ws.Cells(monthly_start_row + 1, 1).Value = f"Business Days: {biz_days_mtd}"
    ws.Cells(monthly_start_row + 1, 1).Font.Name = "Aptos Narrow"
    ws.Cells(monthly_start_row + 1, 1).Font.Size = 11
    ws.Cells(monthly_start_row + 1, 1).Font.Bold = True

    # Monthly totals
    _write_cr_totals_row(ws, monthly_start_row + 2, monthly_agg, biz_days_mtd)

    # Monthly headers
    for col_idx, header in enumerate(cr_headers):
        cell = ws.Cells(monthly_start_row + 3, col_idx + 1)
        cell.Value = header
        cell.Font.Name = "Aptos Narrow"
        cell.Font.Size = 11
        cell.Font.Bold = True
    ws.Cells(monthly_start_row + 3, 8).Font.Bold = False
    ws.Cells(monthly_start_row + 3, 8).Font.Color = _rgb("9C0006")
    ws.Cells(monthly_start_row + 3, 8).Interior.Color = _rgb("FFC7CE")

    # Monthly data
    _write_cr_data_rows(ws, monthly_start_row + 4, monthly_agg, biz_days_mtd, spine)

    print(f"[master_sheets] CR: YTD {len(ytd_agg)} agents, Monthly {len(monthly_agg)} agents")


def _aggregate_cr(df: pd.DataFrame) -> pd.DataFrame:
    if len(df) == 0:
        return pd.DataFrame(columns=["Agent", "Team", "Office", "NB", "Quotes", "Items"])

    agg = df.groupby("Agent").agg(
        Team=("Team", "first"),
        Office=("Office", "first"),
        NB=("NB", "sum"),
        Quotes=("Quotes", "sum"),
        Items=("Items", "sum"),
    ).reset_index()

    agg = agg[(agg["NB"] > 0) | (agg["Quotes"] > 0)]
    return agg.sort_values("Agent")


def _write_cr_totals_row(ws, row, agg, biz_days):
    """Write the totals row for CR section."""
    ws.Cells(row, 1).Value = "Total"
    ws.Cells(row, 1).Font.Name = "Aptos Narrow"
    ws.Cells(row, 1).Font.Size = 11
    ws.Cells(row, 1).Font.Bold = True

    total_nb = int(agg["NB"].sum()) if len(agg) > 0 else 0
    total_quotes = int(agg["Quotes"].sum()) if len(agg) > 0 else 0
    total_cr = total_nb / total_quotes if total_quotes > 0 else 0

    ws.Cells(row, 2).Value = total_nb
    ws.Cells(row, 2).Font.Bold = True
    ws.Cells(row, 3).Value = total_quotes
    ws.Cells(row, 3).Font.Bold = True
    ws.Cells(row, 4).Value = total_cr
    ws.Cells(row, 4).Font.Bold = True
    ws.Cells(row, 4).NumberFormat = "0.00%"

    if biz_days > 0:
        ws.Cells(row, 8).Value = round(total_quotes / biz_days, 1)
        ws.Cells(row, 8).Font.Bold = True
        ws.Cells(row, 8).NumberFormat = "0.0"

    for c in range(1, 11):
        ws.Cells(row, c).Font.Name = "Aptos Narrow"


def _write_cr_data_rows(ws, start_row, agg, biz_days, spine) -> int:
    """Write CR data rows. Returns the last row written."""
    if len(agg) == 0:
        return start_row

    # Build Sub Producer name mapping from spine
    sub_producer_map = {}
    for record in spine.all_agents():
        agent = record["agent"]
        # Look up the Quotes Sub Producer name from the spine DataFrame
        matches = spine.df[spine.df["Agent"] == agent]
        if len(matches) > 0:
            sub_name = matches.iloc[0].get("Quotes Sub Producer", agent)
            if pd.notna(sub_name) and str(sub_name).strip():
                sub_producer_map[agent] = str(sub_name)
            else:
                sub_producer_map[agent] = agent

    r = start_row
    for _, row in agg.iterrows():
        agent = row["Agent"]
        nb = int(row["NB"])
        quotes = int(row["Quotes"])
        cr = nb / quotes if quotes > 0 else 0
        items = int(row["Items"])

        monthly_30 = int(round((30 / 1.25) / cr)) if cr > 0 else 0
        daily_goal = round(monthly_30 / 21, 1) if monthly_30 > 0 else 0
        daily_actual = round(quotes / biz_days, 1) if biz_days > 0 else 0

        sub_name = sub_producer_map.get(agent, agent)

        ws.Cells(r, 1).Value = sub_name
        ws.Cells(r, 2).Value = nb
        ws.Cells(r, 3).Value = quotes
        ws.Cells(r, 4).Value = cr
        ws.Cells(r, 4).NumberFormat = "0.00%"
        ws.Cells(r, 5).Value = items
        ws.Cells(r, 6).Value = monthly_30 if monthly_30 > 0 else "-"
        ws.Cells(r, 6).NumberFormat = "0"
        ws.Cells(r, 7).Value = daily_goal if daily_goal > 0 else "-"
        ws.Cells(r, 7).NumberFormat = "0.0"
        ws.Cells(r, 8).Value = daily_actual
        ws.Cells(r, 8).NumberFormat = "0.0"
        ws.Cells(r, 9).Value = row.get("Team", "")
        ws.Cells(r, 10).Value = row.get("Office", "")

        for c in range(1, 11):
            ws.Cells(r, c).Font.Name = "Aptos Narrow"
            ws.Cells(r, c).Font.Size = 11

        r += 1

    return r - 1


# ═════════════════════════════════════════════════════════════════════════════
#  UTILITY
# ═════════════════════════════════════════════════════════════════════════════

def _reorder_sheets(wb):
    """Reorder sheets: DSR, Weekly, Monthly, CR, then everything else."""
    desired_front = ["DSR", "Weekly", "Monthly", "CR"]
    try:
        for i, name in enumerate(desired_front):
            # Find it
            for j in range(1, wb.Sheets.Count + 1):
                if wb.Sheets(j).Name == name:
                    if i == 0:
                        wb.Sheets(j).Move(Before=wb.Sheets(1))
                    else:
                        # Move after position i (previous sheets already moved)
                        wb.Sheets(j).Move(After=wb.Sheets(i))
                    break
    except Exception as e:
        print(f"[master_sheets] Sheet reorder note: {e}")


def _to_seconds_com(val) -> int:
    """Convert a COM Talk Time value to seconds."""
    if val is None:
        return 0
    # COM often returns time as a float fraction of a day
    if isinstance(val, (int, float)):
        return int(abs(float(val)) * 86400)
    # Or as a datetime/pytime
    if hasattr(val, 'hour'):
        try:
            return val.hour * 3600 + val.minute * 60 + val.second
        except Exception:
            return 0
    # String fallback
    s = str(val)
    parts = s.split(":")
    try:
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
        elif len(parts) == 2:
            return int(parts[0]) * 60 + int(parts[1])
    except ValueError:
        return 0
    return 0
