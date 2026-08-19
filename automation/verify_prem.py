"""Verify premium total using Spine resolver."""
import pandas as pd, sys, warnings
warnings.filterwarnings("ignore")
sys.stdout.reconfigure(encoding='utf-8')

DSR_PATH = r"C:\Users\scag3s29\Documents\Claude Scope\Daily Standup Report.xlsx"

from src.spine import Spine
spine = Spine(DSR_PATH, sheet_name="Spine", excluded_agents=["Teyssy", "Elizabeth"])

prem_df = pd.read_excel(DSR_PATH, sheet_name="Premium")
prem_df["DateOnly"] = pd.to_datetime(prem_df["Date"]).dt.date

from datetime import date
april_prem = prem_df[(prem_df["DateOnly"] >= date(2026, 4, 1)) & (prem_df["DateOnly"] <= date(2026, 4, 29))]

# Resolve all producers
total = 0
per_agent = {}
for _, row in april_prem.iterrows():
    producer = str(row.get("Producer", "")).strip()
    agent = spine.resolve_agent(producer)
    if agent:
        premium = float(row.get("Premium", 0) or 0)
        total += premium
        per_agent[agent] = per_agent.get(agent, 0) + premium

print(f"AZ Premium MTD (with Spine resolver): ${total:,.0f}")
print(f"\nPer-agent premium:")
for agent in sorted(per_agent.keys()):
    print(f"  {agent:20s} ${per_agent[agent]:>10,.0f}")
print(f"  {'TOTAL':20s} ${total:>10,.0f}")

# Compare with unresolved (exact match) total  
total_exact = 0
for _, row in april_prem.iterrows():
    producer = str(row.get("Producer", "")).strip()
    total_exact += float(row.get("Premium", 0) or 0)
print(f"\nTotal AZ Premium (all producers, no filter): ${total_exact:,.0f}")
print(f"Difference (excluded agents): ${total_exact - total:,.0f}")
