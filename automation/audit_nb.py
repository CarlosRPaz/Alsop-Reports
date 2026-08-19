"""
Quick check: what does the actual NB Downloads file look like for 4/29?
And compare with the DSR workbook NB sheet.
"""
import pandas as pd
import warnings, sys, os, json
warnings.filterwarnings("ignore")
sys.stdout.reconfigure(encoding='utf-8')

# Check what the NB Downloads file has
from pathlib import Path

downloads = Path("C:/Users/scag3s29/Downloads")
nb_files = sorted(downloads.glob("New Business Details*.xlsx"), key=lambda f: f.stat().st_mtime, reverse=True)
print(f"NB Download files found: {len(nb_files)}")
for f in nb_files[:3]:
    print(f"  {f.name} (modified: {f.stat().st_mtime})")

if nb_files:
    nb_dl = pd.read_excel(str(nb_files[0]), header=None, nrows=10)
    print(f"\nFirst NB Download file preview:")
    for i in range(min(10, len(nb_dl))):
        print(f"  Row {i}: {nb_dl.iloc[i].tolist()[:15]}")

# Now check DSR workbook NB sheet columns
DSR_PATH = r"C:\Users\scag3s29\Documents\Claude Scope\Daily Standup Report.xlsx"
nb_wb = pd.read_excel(DSR_PATH, sheet_name="NB")
print(f"\nDSR Workbook NB columns: {nb_wb.columns.tolist()}")

# Check if Item Count exists
if "Item Count" in nb_wb.columns:
    print("  'Item Count' column EXISTS in workbook NB")
else:
    print("  'Item Count' column MISSING from workbook NB")
    # Look for similar columns
    for c in nb_wb.columns:
        if "item" in c.lower():
            print(f"    Found similar: '{c}'")

# Filter to 4/29
from datetime import date
nb_wb["DateOnly"] = pd.to_datetime(nb_wb["Date"]).dt.date
nb_429 = nb_wb[nb_wb["DateOnly"] == date(2026, 4, 29)]
print(f"\nNB workbook rows for 4/29: {len(nb_429)}")
for _, row in nb_429.iterrows():
    print(f"  {row.get('Sub-Producer Name', '?')}: Product={row.get('Product', '?')}")

# Count how items break down
print(f"\nNB workbook 4/29 by agent (1 row = 1 policy):")
agent_counts = nb_429.groupby("Sub-Producer Name").size()
for name, count in agent_counts.items():
    print(f"  {name}: {count} policies")

# Check the Supabase items source
# The pipeline uses nb_parser which sums "Item Count" for items
# If Item Count doesn't exist in the workbook, what happens?
print(f"\n\nChecking if NB Allstate download has Item Count:")
if nb_files:
    # Try reading with header detection
    probe = pd.read_excel(str(nb_files[0]), header=None, nrows=10)
    for i in range(min(10, len(probe))):
        row_vals = [str(v).strip() for v in probe.iloc[i] if pd.notna(v)]
        if any("Item Count" in v for v in row_vals):
            print(f"  Found 'Item Count' header at row {i}")
            # Read with this header
            nb_dl_full = pd.read_excel(str(nb_files[0]), header=i)
            print(f"  Columns: {nb_dl_full.columns.tolist()}")
            nb_dl_full["DateOnly"] = pd.to_datetime(nb_dl_full.get("Issued Date") or nb_dl_full.get("Date"), errors="coerce").dt.date
            nb_dl_429 = nb_dl_full[nb_dl_full["DateOnly"] == date(2026, 4, 29)]
            print(f"  Rows for 4/29: {len(nb_dl_429)}")
            if "Item Count" in nb_dl_full.columns:
                for _, row in nb_dl_429.iterrows():
                    print(f"    {row.get('Sub-Producer Name', '?')}: Items={row.get('Item Count', '?')}, Product={row.get('Product', '?')}")
                # Total items
                print(f"  Total Item Count for 4/29: {nb_dl_429['Item Count'].sum()}")
            break
