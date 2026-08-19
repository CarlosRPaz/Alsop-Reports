import pandas as pd, warnings
warnings.filterwarnings("ignore")
df = pd.read_excel(r"C:\Users\scag3s29\Documents\Claude Scope\Daily Standup Report.xlsx", sheet_name="DSR", header=2)
df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
df2026 = df[df["Date"].dt.year == 2026]
print(f"Latest date in DSR: {df['Date'].max()}")
print(f"Total 2026 rows: {len(df2026)}")
print(f"Unique 2026 dates: {df2026['Date'].nunique()}")
