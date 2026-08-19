from playwright.sync_api import sync_playwright
import time
from collections import defaultdict

def extract_chart_data(fpage):
    try:
        fpage.locator('a:has-text("Charts")').first.click(timeout=3000)
        time.sleep(1)
    except Exception as e:
        print("    [WARN] Could not click Charts tab:", e)
        
    try:
        data = fpage.evaluate('''() => {
            if (typeof Highcharts === 'undefined' || !Highcharts.charts) return null;
            let chart = null;
            for (let c of Highcharts.charts) {
                if (c && c.series && c.series.length > 0) {
                    chart = c;
                    break;
                }
            }
            if (!chart) return null;
            const series = chart.series[0];
            return series.data.map(point => ({
                agent: point.name || point.category,
                count: point.y
            }));
        }''')
        
        agent_counts = defaultdict(int)
        if data:
            print(f"    Extracted {len(data)} agents from Highcharts instantly!")
            for item in data:
                agent = item['agent'].strip()
                if agent and agent.lower() not in ["", "total", "totals"]:
                    agent_counts[agent] = item['count']
            return agent_counts
    except:
        pass
    return {}

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp('http://localhost:9222')
    eagent_page = None
    for ctx in browser.contexts:
        for pg in ctx.pages:
            if 'eagent' in pg.url.lower():
                eagent_page = pg; break
        if eagent_page: break
        
    fpage = eagent_page.frame('fPage')
    fpage.goto('https://eagent1.allstate.com/report/report_comment.aspx')
    eagent_page.wait_for_timeout(3000)
    
    fpage.locator("#tbStartDate").fill('06/04/2026')
    fpage.locator("#tbEndDate").fill('06/04/2026')
    fpage.locator("#tbcomment").fill('#pivot')
    
    print("Running Pivot Comments Report...")
    fpage.locator("#bRun:visible").click()
    
    for _ in range(30):
        time.sleep(2)
        if fpage.locator(".report-row:visible").count() > 0:
            print("Results loaded!")
            break
        if "no records" in fpage.locator("body").inner_text().lower() or "no results" in fpage.locator("body").inner_text().lower():
            print("No results!")
            break
            
    data = extract_chart_data(fpage)
    print("PIVOTS:")
    for a, c in data.items():
        print(f"{a}: {c}")
