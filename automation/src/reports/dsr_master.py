"""
dsr_master.py — Write DSR data into the master workbook via Excel COM.

Uses win32com to open the actual Excel application, which preserves:
  - Slicers, pivot table connections
  - Table definitions (DSR table with auto-filter)
  - Conditional formatting
  - Row banding (TableStyleMedium18)
  - All visual formatting

The master file is the original Daily Standup Report.xlsx (or a copy).
Each run adds/replaces rows for the target date in the DSR table.
"""

import win32com.client
import pythoncom
from datetime import date, time, datetime as _datetime
from pathlib import Path

from src.spine import Spine


# DSR table column order (B through Z) — must match the table exactly
DSR_COLUMNS = [
    "Date", "Team", "Agent", "Office", "Full Name",
    "Calls", "Inbound", "Outbound", "Talk Time",
    "Texts", "OutTexts", "Opt-Ins", "Opt-Outs",
    "Quotes", "NB", "Total Premium", "Items",
    "MonthStart", "Items MTD",
    "Contact", "Quoted", "Hot", "XDate",
    "Dismissed To-Do's", "Past Due To-Do's",
]


def write_to_master(
    master_path: str,
    report_date: date,
    rows: list[dict],
    sheet_name: str = "DSR",
    table_name: str = "DSR",
) -> Path:
    """
    Open the master workbook in Excel, remove existing rows for report_date,
    and insert new data rows. Preserves all formatting, slicers, etc.

    Parameters
    ----------
    master_path : str
        Full path to the master workbook.
    report_date : date
        The date for the data being written.
    rows : list[dict]
        Data rows (same format as dsr_builder uses).
    sheet_name : str
        Name of the worksheet containing the DSR table.
    table_name : str
        Name of the Excel table (ListObject).

    Returns
    -------
    Path to the saved master file.
    """
    master = Path(master_path).resolve()
    if not master.exists():
        raise FileNotFoundError(f"Master workbook not found: {master}")

    print(f"[dsr_master] Opening master workbook in Excel...")

    # Initialize COM in this thread
    pythoncom.CoInitialize()

    excel = None
    wb = None
    try:
        # Kill any stale Excel COM zombie processes that may lock the file
        import subprocess
        _stale = subprocess.run(
            ["tasklist", "//fi", "imagename eq EXCEL.EXE"],
            capture_output=True, text=True
        )
        if "EXCEL.EXE" in _stale.stdout:
            subprocess.run(["taskkill", "//f", "//im", "EXCEL.EXE"],
                           capture_output=True, text=True)
            import time as _time
            _time.sleep(1)
            print("[dsr_master] Killed stale Excel processes")

        # Use DispatchEx to create a fresh Excel instance
        excel = win32com.client.DispatchEx("Excel.Application")
        import time as _time
        _time.sleep(1)
        excel.Visible = False
        excel.DisplayAlerts = False
        excel.ScreenUpdating = False

        wb = excel.Workbooks.Open(str(master))

        # Verify file is not read-only (can happen if another process had it locked)
        if wb.ReadOnly:
            wb.Close(False)
            excel.Quit()
            raise RuntimeError(
                f"Master workbook opened as read-only. Close Excel and any apps "
                f"using {master.name}, then retry."
            )
        ws = wb.Sheets(sheet_name)

        # Find the DSR table (ListObject)
        table = None
        for i in range(1, ws.ListObjects.Count + 1):
            if ws.ListObjects(i).Name == table_name:
                table = ws.ListObjects(i)
                break

        if table is None:
            raise ValueError(f"Table '{table_name}' not found on sheet '{sheet_name}'")

        # Get table dimensions
        header_row = table.HeaderRowRange.Row  # Should be row 3
        data_start_row = header_row + 1
        col_start = table.HeaderRowRange.Column  # Should be col 2 (B)

        # Build column index map from table headers
        col_map = {}  # column_name -> column offset (0-based)
        for j in range(1, table.ListColumns.Count + 1):
            col_map[table.ListColumns(j).Name] = j - 1

        # --- Clear ALL filters (slicers + auto-filter) so we can modify rows ---
        # Slicers apply their own filters on top of auto-filter
        try:
            for i in range(1, wb.SlicerCaches.Count + 1):
                try:
                    wb.SlicerCaches(i).ClearAllFilters()
                except Exception:
                    pass
            print("[dsr_master] Cleared slicer filters")
        except Exception as e:
            print(f"[dsr_master] Slicer clear note: {e}")

        try:
            if ws.AutoFilterMode:
                ws.AutoFilterMode = False
                print("[dsr_master] Disabled auto-filter")
        except Exception as e:
            print(f"[dsr_master] Auto-filter note: {e}")

        # Also try ShowAllData as a fallback
        try:
            table.AutoFilter.ShowAllData()
        except Exception:
            pass

        # --- Step 1: Delete existing rows for this date ---
        date_col_offset = col_map.get("Date", 0)

        rows_deleted = 0
        if table.ListRows.Count > 0:
            # Walk backwards to safely delete rows
            for i in range(table.ListRows.Count, 0, -1):
                cell_val = table.ListRows(i).Range.Cells(1, date_col_offset + 1).Value
                if cell_val is not None:
                    # Excel COM returns dates as datetime or pytime objects
                    try:
                        if hasattr(cell_val, 'date'):
                            cell_date = cell_val.date()
                        elif hasattr(cell_val, 'year'):
                            cell_date = date(cell_val.year, cell_val.month, cell_val.day)
                        else:
                            continue
                        if cell_date == report_date:
                            table.ListRows(i).Delete()
                            rows_deleted += 1
                    except (AttributeError, ValueError, TypeError):
                        continue

        if rows_deleted > 0:
            print(f"[dsr_master] Removed {rows_deleted} existing rows for {report_date}")

        # --- Step 2: Append new rows ---
        for row_data in rows:
            # Add a new row to the table
            new_row = table.ListRows.Add()

            for col_name, col_offset in col_map.items():
                value = row_data.get(col_name)
                if value is None:
                    continue

                cell = new_row.Range.Cells(1, col_offset + 1)

                # Convert Python types to Excel-compatible values
                if isinstance(value, date):
                    # Convert to datetime for COM (date objects don't serialize properly)
                    cell.Value = _datetime(value.year, value.month, value.day)
                    cell.NumberFormat = "m/d, ddd" if col_name == "Date" else "mm-dd-yy"
                elif isinstance(value, time):
                    # Convert time to fraction of day for Excel
                    total_seconds = value.hour * 3600 + value.minute * 60 + value.second
                    cell.Value = total_seconds / 86400.0
                    cell.NumberFormat = "hh:mm"
                elif col_name == "Total Premium":
                    cell.Value = float(value)
                    cell.NumberFormat = '"$"#,##0.00'
                else:
                    cell.Value = value

        print(f"[dsr_master] Inserted {len(rows)} rows for {report_date}")

        # --- Step 2b: Set Items MTD formulas on newly inserted rows ---
        items_mtd_offset = col_map.get("Items MTD")
        if items_mtd_offset is not None:
            # Walk the table to find rows for this date and set SUMIFS formula
            for i in range(1, table.ListRows.Count + 1):
                cell_val = table.ListRows(i).Range.Cells(1, date_col_offset + 1).Value
                if cell_val is not None:
                    try:
                        if hasattr(cell_val, 'date'):
                            cell_date = cell_val.date()
                        elif hasattr(cell_val, 'year'):
                            cell_date = date(cell_val.year, cell_val.month, cell_val.day)
                        else:
                            continue
                        if cell_date == report_date:
                            mtd_cell = table.ListRows(i).Range.Cells(1, items_mtd_offset + 1)
                            # Row number in the sheet for this cell
                            r = mtd_cell.Row
                            # SUMIFS: sum Items (R) where Date >= MonthStart (S) and Date <= this row's Date (B), same Agent (D)
                            mtd_cell.Formula = f"=SUMIFS(R:R,B:B,\">=\"&S{r},B:B,\"<=\"&B{r},D:D,D{r})"
                    except (AttributeError, ValueError, TypeError):
                        continue

        # --- Step 3: Sort by Date (descending) then Team then Agent ---
        try:
            sort_range = table.Range
            ws.Sort.SortFields.Clear()
            # Sort by Date column
            date_col_range = table.ListColumns("Date").DataBodyRange
            ws.Sort.SortFields.Add(Key=date_col_range, Order=2)  # 2 = xlDescending
            # Then by Team
            team_col_range = table.ListColumns("Team").DataBodyRange
            ws.Sort.SortFields.Add(Key=team_col_range, Order=1)  # 1 = xlAscending
            # Then by Agent
            agent_col_range = table.ListColumns("Agent").DataBodyRange
            ws.Sort.SortFields.Add(Key=agent_col_range, Order=1)
            ws.Sort.SetRange(sort_range)
            ws.Sort.Header = 1  # xlYes
            ws.Sort.Apply()
        except Exception as e:
            print(f"[dsr_master] Sort warning: {e}")

        # --- Step 4: Update subtotal row (row 2) ---
        # The SUBTOTAL formulas in row 2 auto-update, but ensure the range covers all data
        last_data_row = header_row + table.ListRows.Count
        subtotal_cols = {
            "G": "General", "H": "General", "I": "General",
            "J": "d\\.hh:mm:ss",
            "K": "General", "L": "General", "M": "General", "N": "General",
            "O": "General", "P": "General",
            "Q": '"$"#,##0.00',
            "R": "0", "T": "0",
        }
        for col_letter, fmt in subtotal_cols.items():
            cell = ws.Range(f"{col_letter}2")
            cell.Formula = f"=SUBTOTAL(109,{col_letter}{data_start_row}:{col_letter}{last_data_row})"

        # --- Step 5: Re-enable auto-filter on the table ---
        try:
            if not ws.AutoFilterMode:
                # Re-enable auto-filter on the table range
                table.Range.AutoFilter()
                print("[dsr_master] Re-enabled auto-filter")
        except Exception as e:
            print(f"[dsr_master] Auto-filter restore note: {e}")

        # --- Step 6: Save ---
        wb.Save()
        print(f"[dsr_master] Saved master workbook: {master}")

        wb.Close(False)
        excel.ScreenUpdating = True
        excel.DisplayAlerts = True
        excel.Quit()

    except Exception:
        # On error, try to close without saving to avoid partial writes
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
        # Release COM references
        wb = None
        excel = None
        pythoncom.CoUninitialize()

    return master


def prepare_rows(
    spine: Spine,
    report_date: date,
    merged_data,  # pd.DataFrame from build pipeline
) -> list[dict]:
    """
    Convert the merged DataFrame into row dicts ready for write_to_master().
    Same logic as dsr_builder but returns dicts instead of writing to openpyxl.
    """
    import pandas as pd

    merged_data = merged_data.fillna(0)
    rows = []
    month_start = report_date.replace(day=1)

    for _, row in merged_data.sort_values(["team", "agent"]).iterrows():
        talk_seconds = int(row.get("TalkTimeSeconds", 0))
        rows.append({
            "Date": report_date,
            "Team": row.get("team", ""),
            "Agent": row.get("agent", ""),
            "Office": row.get("office", ""),
            "Full Name": row.get("full_name", ""),
            "Calls": int(row.get("Calls", 0)),
            "Inbound": int(row.get("Inbound", 0)),
            "Outbound": int(row.get("Outbound", 0)),
            "Talk Time": _seconds_to_time(talk_seconds),
            "Texts": int(row.get("Texts", 0)),
            "OutTexts": int(row.get("OutTexts", 0)),
            "Opt-Ins": int(row.get("OptIns", 0)),
            "Opt-Outs": int(row.get("OptOuts", 0)),
            "Quotes": int(row.get("Quotes", 0)),
            "NB": int(row.get("NB", 0)),
            # Use AgencyZoom PremPremium if available, fall back to NB WrittenPremium
            "Total Premium": round(float(row.get("PremPremium", 0) or row.get("WrittenPremium", 0)), 2),
            "Items": int(row.get("Items", 0)),
            "MonthStart": month_start,
            "Items MTD": None,  # Will be set as SUMIFS formula in write_to_master
            "Contact": int(row.get("contact", 0)),
            "Quoted": int(row.get("quoted", 0)),
            "Hot": int(row.get("hot", 0)),
            "XDate": int(row.get("xsale", 0)),
            "Dismissed To-Do's": int(row.get("dismissed_todos", 0)),
            "Past Due To-Do's": int(row.get("past_due_todos", 0)),
        })

    return rows


def _seconds_to_time(seconds: int) -> time:
    """Convert total seconds to a time object (capped at 23:59:59)."""
    if seconds <= 0:
        return time(0, 0, 0)
    hours = min(seconds // 3600, 23)
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    return time(hours, minutes, secs)
