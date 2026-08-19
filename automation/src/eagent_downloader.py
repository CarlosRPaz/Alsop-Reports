"""
eAgent To-Do scraper v4: fix date input + use fill() + handle navigation properly.
"""
import time
import sys
import io
import re
from datetime import datetime, timedelta
from collections import defaultdict
from playwright.sync_api import sync_playwright


def goto_todo_report(eagent_page):
    """Force-navigate to the To-Do report page via iframe src."""
    # Set the fPage iframe src directly
    eagent_page.main_frame.evaluate("""() => {
        var f = document.querySelector('iframe[name="fPage"]');
        if (f) f.src = '/report/report_todo.aspx';
    }""")
    time.sleep(4)
    
    fpage = eagent_page.frame("fPage")
    print(f"    fPage: {fpage.url}")
    
    # Expand filters
    for attempt in range(5):
        visible_selects = fpage.locator("select:visible")
        if visible_selects.count() >= 3:
            print(f"    Filters expanded ({visible_selects.count()} selects)")
            return fpage
        
        # Click Show Filters / Filters / Hide Filters area
        try:
            el = fpage.locator("text=/Show Filters/i, text=/Filters/")
            if el.count() > 0:
                el.first.click()
                time.sleep(2)
        except:
            pass
    
    print(f"    [WARN] Only {fpage.locator('select:visible').count()} visible selects after expand")
    return fpage


def fill_date_field(fpage, eagent_page, selector, date_str):
    """Properly clear and fill a date field."""
    inp = fpage.locator(selector)
    if inp.count() == 0:
        return False
    
    inp.click()
    time.sleep(0.1)
    eagent_page.keyboard.press("Control+a")
    time.sleep(0.1)
    eagent_page.keyboard.press("Backspace")
    time.sleep(0.1)
    
    # Type raw digits without slashes
    raw_digits = date_str.replace("/", "")
    if raw_digits:
        inp.type(raw_digits, delay=100)
    time.sleep(0.2)
    eagent_page.keyboard.press("Tab")
    time.sleep(0.3)
    return True


def run_dismissed_report(eagent_page, target_display, target_obj):
    """Set filters for dismissed and scrape results."""
    fpage = goto_todo_report(eagent_page)
    
    # Date Range = Custom
    fpage.locator("select:visible").first.select_option(value="Custom")
    time.sleep(1)
    print("    Date Range: Custom")
    
    # Dismissed Date radio
    radios = fpage.locator("input[type='radio']:visible")
    if radios.count() >= 2:
        radios.nth(1).click(force=True)
        time.sleep(0.5)
        print("    Radio: Dismissed Date")
    
    # Fill Start Date and End Date using id pattern
    date_inputs = fpage.locator("input[type='text']:visible")
    dp_ids = []
    for i in range(date_inputs.count()):
        iid = date_inputs.nth(i).get_attribute("id") or ""
        if iid.startswith("dp"):
            dp_ids.append(iid)
    
    print(f"    Date picker IDs: {dp_ids}")
    
    for iid in dp_ids[:2]:
        fill_date_field(fpage, eagent_page, f"#{iid}", target_display)
    print(f"    Dates: {target_display} to {target_display}")
    
    # Verify dates were filled correctly
    for iid in dp_ids[:2]:
        val = fpage.locator(f"#{iid}").input_value()
        print(f"    Verify {iid}: '{val}'")
    
    # To-Do State = Dismissed (id=ddDisposition)
    fpage.locator("#ddDisposition:visible").select_option(label="Dismissed")
    try:
        eagent_page.screenshot(path="data/eagent_v4_dismissed_filters.png", timeout=5000)
    except Exception as e:
        print(f"    [Warning] Could not take screenshot: {e}")
    print("    To-Do State: Dismissed")
    
    # Click Run Report
    print("    Running report...")
    fpage.locator("#bRun:visible").click()
    
    # Wait for results
    return wait_and_scrape(fpage, eagent_page, "dismissed")


def run_pastdue_report(eagent_page, target_display, target_obj):
    """Run report for Past Due To-Dos (End Date only, leave Start Date blank)."""
    fpage = goto_todo_report(eagent_page)
    
    # The past due report's default view has a single end-date text input
    # (no dp-prefixed IDs like the Custom date range). Find all visible text inputs.
    date_inputs = fpage.locator("input[type='text']:visible")
    dp_ids = []
    text_inputs = []
    for i in range(date_inputs.count()):
        iid = date_inputs.nth(i).get_attribute("id") or ""
        if iid.startswith("dp"):
            dp_ids.append(iid)
        elif iid != "bRun":
            text_inputs.append(i)
    
    if dp_ids:
        # Custom date range mode — fill only the end date (2nd field)
        print(f"    Date picker IDs: {dp_ids}")
        if len(dp_ids) >= 2:
            fill_date_field(fpage, eagent_page, f"#{dp_ids[1]}", target_display)
            print(f"    End Date: {target_display} (start date left blank)")
    elif text_inputs:
        # Default mode — single text input for end date
        idx = text_inputs[-1]  # use last text input (end date)
        el = date_inputs.nth(idx)
        el.click()
        eagent_page.keyboard.press("Control+a")
        eagent_page.keyboard.press("Backspace")
        raw = target_display.replace("/", "")
        el.type(raw, delay=100)
        eagent_page.keyboard.press("Tab")
        import time as _t; _t.sleep(0.3)
        print(f"    End Date filled: {target_display}")
    else:
        print("    [WARN] No date fields found, running with defaults")
    
    # Click Run Report
    print("    Running report...")
    fpage.locator("#bRun:visible").click()
    
    # Wait for results
    return wait_and_scrape(fpage, eagent_page, "pastdue")

def run_pivot_comments_report(eagent_page, target_display, target_obj):
    """Run the Comments report searching for #pivot."""
    print("    Running Pivot Comments Report...")
    fpage = eagent_page.frame("fPage")
    
    # Navigate directly to the Comments report
    fpage.goto("https://eagent1.allstate.com/report/report_comment.aspx")
    eagent_page.wait_for_timeout(2000)
    
    # Fill the form based on user's manual process using JS to bypass datepicker overlays
    fpage.evaluate(f'''() => {{
        document.getElementById('tbStartDate').value = '{target_display}';
        document.getElementById('tbEndDate').value = '{target_display}';
        document.getElementById('tbcomment').value = '#pivot';
        document.getElementById('bRun').click();
    }}''')
    
    # Wait for results
    print("    Waiting for Pivot results...")
    time.sleep(4)
    for _ in range(15):
        if fpage.locator(".grid_report_alt, .grid_report_normal").count() > 0:
            break
        try:
            body = fpage.locator("body").inner_text().lower()
            if "no records" in body or "no results" in body:
                print("    No records found.")
                return {}
        except:
            pass
        time.sleep(2)
        
    pivots = {}
    rows = fpage.locator(".grid_report_alt, .grid_report_normal")
    count = rows.count()
    print(f"    Found {count} rows in Pivot Comments report.")
    for i in range(count):
        text = rows.nth(i).inner_text().lower()
        if "#pivot" in text:
            # Agent name is the 6th td (index 5)
            tds = rows.nth(i).locator("td")
            if tds.count() > 5:
                agent = tds.nth(5).inner_text().strip()
                pivots[agent] = pivots.get(agent, 0) + 1
    return pivots



def wait_and_scrape(fpage, eagent_page, label):
    """Wait for results table, then scrape all pages."""
    print("    Waiting for results...")
    
    for w in range(45):  # up to 90 seconds
        time.sleep(2)
        
        # Check for result rows
        rows = fpage.locator(".report-row:visible")
        if rows.count() > 0:
            print(f"    Results loaded after {(w+1)*2}s ({rows.count()} rows on first page)")
            return extract_chart_data(fpage)
        
        # Check for "no records"
        try:
            body = fpage.locator("body").inner_text().lower()
            if "no records" in body or "no results" in body:
                print(f"    No records found after {(w+1)*2}s")
                return {}
        except:
            pass
    
    print("    [WARN] Timeout waiting for results")
    try:
        eagent_page.screenshot(path=f"data/eagent_v4_{label}_timeout.png", timeout=5000)
    except Exception as e:
        print(f"    [Warning] Could not take screenshot: {e}")
    return {}

def extract_chart_data(fpage):
    """Extract agent counts directly from the Highcharts Javascript object."""
    agent_counts = defaultdict(int)
    
    # Click Charts tab just to ensure the chart renders (though data might exist regardless)
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
        
        if data:
            print(f"    Extracted {len(data)} agents from Highcharts instantly!")
            for item in data:
                agent = item['agent'].strip()
                if agent and agent.lower() not in ["", "total", "totals"]:
                    agent_counts[agent] = item['count']
        else:
            print("    [WARN] Highcharts object found but returned no data.")
    except Exception as e:
        print("    [ERROR] Failed to extract Highcharts data:", e)
        
    return dict(agent_counts)


from playwright.sync_api import sync_playwright

def scrape_eagent_data(target_date_str):
    """
    Scrapes eAgent for Dismissed and Past Due To-Dos for a specific date.
    target_date_str: 'YYYY-MM-DD'
    Returns a dictionary of agent -> { 'dismissed': X, 'past_due': Y }
    """
    target_obj = datetime.strptime(target_date_str, "%Y-%m-%d")
    target_display = target_obj.strftime("%m/%d/%Y")
    print(f"[eAgent Scraper] Target: {target_date_str} ({target_display})")
    
    with sync_playwright() as p:
        try:
            browser = p.chromium.connect_over_cdp("http://localhost:9222")
        except Exception as e:
            print(f"[FAIL] Could not connect to Edge. Ensure it is running with --remote-debugging-port=9222. Error: {e}")
            return None
            
        eagent_page = None
        for ctx in browser.contexts:
            for pg in ctx.pages:
                if "eagent" in pg.url.lower():
                    eagent_page = pg
                    break
            if eagent_page: break
                
        if not eagent_page:
            print("[FAIL] No eAgent tab found in Edge. Please ensure eAgent is open.")
            return None
        
        print("\n=== DISMISSED TO-DOS ===")
        dismissed = run_dismissed_report(eagent_page, target_display, target_obj)
        
        print("\n=== PAST DUE TO-DOS ===")
        pastdue = run_pastdue_report(eagent_page, target_display, target_obj)
        
        print("\n=== PIVOT COMMENTS ===")
        pivots = run_pivot_comments_report(eagent_page, target_display, target_obj)
        
        results = {}
        all_agents = sorted(set(list(dismissed.keys()) + list(pastdue.keys()) + list(pivots.keys())))
        for agent in all_agents:
            results[agent] = {
                'dismissed': dismissed.get(agent, 0),
                'past_due': pastdue.get(agent, 0),
                'pivots': pivots.get(agent, 0)
            }
        return results
