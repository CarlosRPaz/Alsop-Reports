import sys
with open('src/eagent_downloader.py', 'r', encoding='utf-8') as f:
    content = f.read()

new_bottom = '''
def scrape_eagent_data(browser_context, target_date_str):
    """
    Scrapes eAgent for Dismissed and Past Due To-Dos for a specific date.
    target_date_str: 'YYYY-MM-DD'
    Returns a dictionary of agent -> { 'dismissed': X, 'past_due': Y }
    """
    target_obj = datetime.strptime(target_date_str, "%Y-%m-%d")
    target_display = target_obj.strftime("%m/%d/%Y")
    print(f"[eAgent Scraper] Target: {target_date_str} ({target_display})")
    
    eagent_page = None
    for pg in browser_context.pages:
        if "eagent" in pg.url.lower():
            eagent_page = pg
            break
            
    if not eagent_page:
        print("[FAIL] No eAgent tab found in Edge. Please ensure eAgent is open.")
        return None
        
    print("\\n=== DISMISSED TO-DOS ===")
    dismissed = run_dismissed_report(eagent_page, target_display, target_obj)
    
    print("\\n=== PAST DUE TO-DOS ===")
    pastdue = run_pastdue_report(eagent_page, target_display, target_obj)
    
    results = {}
    all_agents = sorted(set(list(dismissed.keys()) + list(pastdue.keys())))
    for agent in all_agents:
        results[agent] = {
            'dismissed': dismissed.get(agent, 0),
            'past_due': pastdue.get(agent, 0)
        }
    return results
'''

idx = content.find('# ============================================================')
if idx != -1:
    content = content[:idx] + new_bottom

content = content.replace('def run_dismissed_report(eagent_page, target_display):', 'def run_dismissed_report(eagent_page, target_display, target_obj):')
content = content.replace('def run_pastdue_report(eagent_page, target_display):', 'def run_pastdue_report(eagent_page, target_display, target_obj):')

lines = content.split('\n')
final_lines = []
for line in lines:
    if line.startswith('sys.stdout = io.TextIOWrapper'): continue
    if line.startswith('target_date ='): continue
    if line.startswith('target_obj ='): continue
    if line.startswith('target_display ='): continue
    if line.startswith('print(f"Target:'): continue
    final_lines.append(line)

with open('src/eagent_downloader.py', 'w', encoding='utf-8') as f:
    f.write('\n'.join(final_lines))

print('Transformed src/eagent_downloader.py')
