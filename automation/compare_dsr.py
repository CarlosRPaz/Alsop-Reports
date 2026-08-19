"""Compare manual Daily Standup Report vs auto DSR_Master."""
import pandas as pd
from datetime import date

TARGET = date(2026, 4, 16)

m = pd.read_csv("dsr_manual_2026-04-16.csv")
a = pd.read_csv("dsr_auto_2026-04-16.csv")

# Drop junk cols
for df in (m, a):
    for c in list(df.columns):
        if c.startswith("Unnamed"):
            df.drop(columns=[c], inplace=True)

# Clean
m["Agent"] = m["Agent"].astype(str).str.strip()
a["Agent"] = a["Agent"].astype(str).str.strip()

cols_to_compare = [
    "Calls", "Inbound", "Outbound", "Talk Time",
    "Texts", "OutTexts", "Opt-Ins", "Opt-Outs",
    "Quotes", "NB", "Total Premium", "Items", "Items MTD",
    "Contact", "Quoted", "Hot", "x-sale",
    "Dismissed To-Do's", "Past Due To-Do's",
]

merged = m[["Agent"] + cols_to_compare].merge(
    a[["Agent"] + cols_to_compare], on="Agent", how="outer", suffixes=(" (m)", " (a)")
)

print("=" * 110)
print(f"Comparison for 2026-04-16 — {len(merged)} agents in union")
print("=" * 110)

# Print diff table: only show columns that differ, per agent
def fmt(v):
    if pd.isna(v):
        return "-"
    if isinstance(v, float):
        return f"{v:.2f}"
    return str(v)

for _, row in merged.sort_values("Agent").iterrows():
    diffs = []
    for c in cols_to_compare:
        vm, va = row[f"{c} (m)"], row[f"{c} (a)"]
        # Treat NaN as 0 for ints; keep for talk time
        if c != "Talk Time":
            if pd.isna(vm): vm = 0
            if pd.isna(va): va = 0
        # Compare
        try:
            if abs(float(vm) - float(va)) > 0.01:
                diffs.append(f"{c}: m={fmt(vm)} / a={fmt(va)}")
        except (ValueError, TypeError):
            if str(vm) != str(va):
                diffs.append(f"{c}: m={fmt(vm)} / a={fmt(va)}")
    if diffs:
        print(f"\n{row['Agent']:12}")
        for d in diffs:
            print(f"  {d}")
    else:
        print(f"{row['Agent']:12}  [MATCH]")
