from src.parsers import quotes_parser
from src.spine import Spine
from datetime import date

spine = Spine('C:/Users/scag3s29/Documents/Claude Scope/Daily Standup Report.xlsx', sheet_name='Spine', excluded_agents=['Teyssy','Elizabeth'])
f = 'C:/Users/scag3s29/Downloads/Quotes Detail Report__1778527480017.xlsx'

for d in [date(2026, 5, 9), date(2026, 5, 10)]:
    data = quotes_parser.parse(f, spine, target_date=d)
    if data is not None and not data.empty:
        print(f'{d}: {data["Quotes"].sum()} Quotes found in file')
    else:
        print(f'{d}: No quotes found in file')
