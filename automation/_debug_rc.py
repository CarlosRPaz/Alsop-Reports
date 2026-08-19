from src.parsers import rc_parser
from src.spine import Spine
from datetime import date

spine = Spine('C:/Users/scag3s29/Documents/Claude Scope/Daily Standup Report.xlsx', sheet_name='Spine', excluded_agents=['Teyssy','Elizabeth'])

# File pulled on 5/8 -> data for 5/7
f1 = 'C:/Users/scag3s29/Downloads/Office_Perf_Users_05_08_2026_6_03_20_AM.xlsx'
d1 = rc_parser.parse(f1, spine, target_date=date(2026, 5, 7))
print(f"5/8 file (for Thu 5/7): {len(d1)} agents")
for _, r in d1.iterrows():
    if r['Agent'] in ['Ariana', 'Charmaine', 'Eddie', 'Claudia']:
        print(f"  {r['Agent']}: Calls={r['Calls']}")

print()

# File pulled on 5/9 -> data for 5/8
f2 = 'C:/Users/scag3s29/Downloads/Office_Perf_Users_05_09_2026_6_04_32_AM.xlsx'
d2 = rc_parser.parse(f2, spine, target_date=date(2026, 5, 8))
print(f"5/9 file (for Fri 5/8): {len(d2)} agents")
for _, r in d2.iterrows():
    if r['Agent'] in ['Ariana', 'Charmaine', 'Eddie', 'Claudia']:
        print(f"  {r['Agent']}: Calls={r['Calls']}")
