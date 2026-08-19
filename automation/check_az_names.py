"""Check which agents have NB but no AZ Premium data."""
import pandas as pd, sys, warnings
warnings.filterwarnings("ignore")
sys.stdout.reconfigure(encoding='utf-8')

DSR_PATH = r"C:\Users\scag3s29\Documents\Claude Scope\Daily Standup Report.xlsx"

prem_df = pd.read_excel(DSR_PATH, sheet_name="Premium")
spine_df = pd.read_excel(DSR_PATH, sheet_name="Spine")

# All AZ producers
all_producers = prem_df["Producer"].dropna().unique()
print(f"All AZ Premium producers ({len(all_producers)}):")
for p in sorted(all_producers):
    print(f"  {p}")

# Spine AZ name mappings
print(f"\nSpine AgencyZoom Name column:")
for _, row in spine_df.iterrows():
    az = row.get("AgencyZoom Name", "")
    agent = row["Agent"]
    match = "YES" if str(az) in all_producers else "NO" if pd.notna(az) else "BLANK"
    print(f"  {agent:20s} -> {str(az):30s} AZ Match={match}")

# Find producers NOT in Spine
spine_az_names = set(str(row["AgencyZoom Name"]).strip() for _, row in spine_df.iterrows() if pd.notna(row.get("AgencyZoom Name")))
unmatched = [p for p in all_producers if p not in spine_az_names]
print(f"\nAZ Producers NOT in Spine ({len(unmatched)}):")
for p in sorted(unmatched):
    print(f"  {p}")
