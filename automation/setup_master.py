"""
setup_master.py — One-time setup to create the master DSR workbook.

Copies the original Daily Standup Report.xlsx, disconnects the Power Query
connection on the DSR table (so we can write data directly), and saves it
as the master workbook that the pipeline writes to daily.

The master keeps: slicers, formatting, conditional formatting, table style,
auto-filter — everything visual. It just removes the Power Query link so
Python can inject data.

Usage:
    python setup_master.py
"""

import shutil
import win32com.client
import pythoncom
from pathlib import Path
import json


def create_master():
    # Load config
    config_path = Path("config/config.json")
    if not config_path.exists():
        print("ERROR: config/config.json not found. Set it up first.")
        return

    with open(config_path) as f:
        config = json.load(f)

    original = Path(config["spine"]["path"])
    if not original.exists():
        print(f"ERROR: Original workbook not found: {original}")
        return

    # Create the master in the same folder as the original
    master = original.parent / "DSR_Master.xlsx"

    # Step 1: Copy the original
    print(f"[setup] Copying original workbook...")
    print(f"  From: {original}")
    print(f"  To:   {master}")
    shutil.copy2(str(original), str(master))

    # Step 2: Open in Excel and disconnect Power Query on DSR table
    print(f"\n[setup] Opening in Excel to disconnect Power Query...")
    pythoncom.CoInitialize()

    try:
        # Kill stale Excel processes that may lock the file
        import subprocess, time as _time
        _stale = subprocess.run(
            ["tasklist", "//fi", "imagename eq EXCEL.EXE"],
            capture_output=True, text=True
        )
        if "EXCEL.EXE" in _stale.stdout:
            subprocess.run(["taskkill", "//f", "//im", "EXCEL.EXE"],
                           capture_output=True, text=True)
            _time.sleep(1)
            print("[setup] Killed stale Excel processes")

        excel = win32com.client.DispatchEx("Excel.Application")
        _time.sleep(1)
        excel.Visible = False
        excel.DisplayAlerts = False
        excel.ScreenUpdating = False

        wb = excel.Workbooks.Open(str(master.resolve()))

        # Find DSR sheet and table
        ws = wb.Sheets("DSR")
        dsr_table = None
        for i in range(1, ws.ListObjects.Count + 1):
            lo = ws.ListObjects(i)
            print(f"  Found table: {lo.Name} (range: {lo.Range.Address})")
            if lo.Name == "DSR":
                dsr_table = lo

        if dsr_table is None:
            print("  WARNING: DSR table not found!")
            wb.Close(False)
            excel.Quit()
            return

        # Check if it has a query table connection
        try:
            qt = dsr_table.QueryTable
            print(f"  DSR table has Power Query connection: {qt.Connection}")
            # Disconnect: Unlink the query table but keep the data + table
            qt.Delete()
            print("  Power Query connection removed successfully!")
        except Exception as e:
            print(f"  No Power Query to disconnect (or already disconnected): {e}")

        # Verify the table still exists and has data
        row_count = dsr_table.ListRows.Count
        col_count = dsr_table.ListColumns.Count
        print(f"\n  DSR table: {row_count} data rows, {col_count} columns")
        print(f"  Table range: {dsr_table.Range.Address}")

        # List column headers
        headers = [dsr_table.ListColumns(j).Name for j in range(1, col_count + 1)]
        print(f"  Columns: {headers}")

        # Check slicers are still there
        try:
            slicer_count = wb.SlicerCaches.Count
            print(f"\n  Slicers: {slicer_count} slicer cache(s)")
            for i in range(1, slicer_count + 1):
                sc = wb.SlicerCaches(i)
                print(f"    - {sc.Name}: source={sc.SourceName}")
        except Exception as e:
            print(f"  Slicer check: {e}")

        # Save
        wb.Save()
        print(f"\n[setup] Master workbook saved: {master}")

        wb.Close(False)
        excel.ScreenUpdating = True
        excel.DisplayAlerts = True
        excel.Quit()

    finally:
        pythoncom.CoUninitialize()

    # Step 3: Update config to point to the master
    config["report"]["master_path"] = str(master).replace("\\", "/")
    with open(config_path, "w") as f:
        json.dump(config, f, indent=2)
    print(f"\n[setup] Updated config.json with master_path: {master}")

    print("\n" + "=" * 60)
    print("  Master workbook ready!")
    print("  You can now run: python main.py --date YYYY-MM-DD --skip-email --skip-screenshots")
    print("  Data will be written directly into the master (with slicers preserved).")
    print("=" * 60)


if __name__ == "__main__":
    create_master()
