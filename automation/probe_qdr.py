"""Probe the QDR file structure - just dump first 10 rows of key sheets."""
import pandas as pd

QDR_PATH = r"c:\Users\scag3s29\Documents\Claude Scope\Quotes Detail Report__New Business Detail.xlsx"

for sheet in ["P&C Total Serious Quotes Detail", "New Business"]:
    print(f"\n{'=' * 60}")
    print(f"Sheet: '{sheet}'")
    print(f"{'=' * 60}")
    df = pd.read_excel(QDR_PATH, sheet_name=sheet, header=None, nrows=10, engine="openpyxl")
    for i in range(len(df)):
        vals = [str(v)[:40] if pd.notna(v) else "" for v in df.iloc[i]]
        non_empty = [(j, v) for j, v in enumerate(vals) if v]
        print(f"  Row {i}: {non_empty[:8]}")
