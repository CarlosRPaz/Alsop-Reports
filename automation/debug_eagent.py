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
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace', line_buffering=True)
target_date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
target_obj = datetime.strptime(target_date, "%Y-%m-%d")
target_display = target_obj.strftime("%m/%d/%Y")
print(f"Target: {target_date} ({target_display})")


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


def run_dismissed_report(eagent_page, target_display):
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
    print("    To-Do State: Dismissed")
    
    eagent_page.screenshot(path="data/eagent_v4_dismissed_filters.png")
    
    # Click Run Report
    print("    Running report...")
    fpage.locator("#bRun:visible").click()
    
    # Wait for results
    return wait_and_scrape(fpage, eagent_page, "dismissed")


def run_pastdue_report(eagent_page, target_display):
    """Set filters for past due (active, due date before today) and scrape."""
    fpage = goto_todo_report(eagent_page)
    
    # Date Range = Custom
    fpage.locator("select:visible").first.select_option(value="Custom")
    time.sleep(1)
    print("    Date Range: Custom")
    
    # Due Date radio (index 0 — default)
    radios = fpage.locator("input[type='radio']:visible")
    if radios.count() >= 1:
        radios.nth(0).click(force=True)
        time.sleep(0.5)
        print("    Radio: Due Date")
    
    # Dates: leave start date blank, fill target date for end date
    date_inputs = fpage.locator("input[type='text']:visible")
    dp_ids = []
    for i in range(date_inputs.count()):
        iid = date_inputs.nth(i).get_attribute("id") or ""
        if iid.startswith("dp"):
            dp_ids.append(iid)
    
    if len(dp_ids) >= 2:
        fill_date_field(fpage, eagent_page, f"#{dp_ids[0]}", "")
        fill_date_field(fpage, eagent_page, f"#{dp_ids[1]}", target_display)
    print(f"    Dates: (blank) to {target_display}")
    
    # To-Do State = Active
    fpage.locator("#ddDisposition:visible").select_option(label="Active")
    print("    To-Do State: Active")
    
    eagent_page.screenshot(path="data/eagent_v4_pastdue_filters.png")
    
    # Click Run Report
    print("    Running report...")
    fpage.locator("#bRun:visible").click()
    
    return wait_and_scrape(fpage, eagent_page, "pastdue")


def wait_and_scrape(fpage, eagent_page, label):
    """Wait for results table, then scrape all pages."""
    print("    Waiting for results...")
    
    for w in range(45):  # up to 90 seconds
        time.sleep(2)
        
        # Check for result rows
        rows = fpage.locator(".report-row:visible")
        if rows.count() > 0:
            print(f"    Results loaded after {(w+1)*2}s ({rows.count()} rows)")
            eagent_page.screenshot(path=f"data/eagent_v4_{label}_results.png")
            return scrape_all_pages(fpage, eagent_page)
        
        # Check for "no records"
        try:
            body = fpage.locator("body").inner_text().lower()
            if "no records" in body or "no results" in body:
                print(f"    No records found after {(w+1)*2}s")
                return {}
        except:
            pass
    
    print("    [WARN] Timeout waiting for results")
    eagent_page.screenshot(path=f"data/eagent_v4_{label}_timeout.png")
    return {}


def scrape_all_pages(fpage, eagent_page):
    """Scrape the Assigned To column across all pages."""
    agent_counts = defaultdict(int)
    
    # Find total pages
    body = fpage.locator("body").inner_text()
    match = re.search(r"of\s+(\d+)", body)
    total_pages = int(match.group(1)) if match else 1
    print(f"    Pages: {total_pages}")
    
    for pg_num in range(1, total_pages + 1):
        if pg_num > 1:
            # Click the forward arrow (the circle/play button icons)
            try:
                # The pager uses small circle icons for navigation
                # Try clicking the next page forward button
                # Use JavaScript to find the forward link
                fpage.evaluate(f"""() => {{
                    var links = document.querySelectorAll('a');
                    for (var l of links) {{
                        var img = l.querySelector('img');
                        if (img && (img.src.includes('forward') || img.src.includes('next') || img.alt === 'Next')) {{
                            l.click();
                            return;
                        }}
                    }}
                    // Fallback: click the page number text
                    var spans = document.querySelectorAll('a, span');
                    for (var s of spans) {{
                        if (s.textContent.trim() === '{pg_num}' && s.tagName === 'A') {{
                            s.click();
                            return;
                        }}
                    }}
                }}""")
                time.sleep(3)
            except Exception as e:
                print(f"    [WARN] Pagination to page {pg_num} failed: {e}")
                break
        
        # Find the Assigned To column index
        headers = fpage.locator(".report-column-header:visible")
        agent_col = -1
        for h in range(headers.count()):
            try:
                if "assigned to" in headers.nth(h).inner_text().lower():
                    agent_col = h
                    break
            except:
                pass
        
        if agent_col == -1:
            print(f"    Page {pg_num}: 'Assigned To' column not found")
            continue
            
        rows = fpage.locator(".report-row:visible")
        row_count = rows.count()
        scraped = 0
        for r in range(row_count):
            try:
                cells = rows.nth(r).locator(".report-cell")
                if cells.count() > agent_col:
                    agent = cells.nth(agent_col).inner_text().strip()
                    if agent and agent.lower() not in ["", "total", "totals"]:
                        agent_counts[agent] += 1
                        scraped += 1
            except:
                pass
        print(f"    Page {pg_num}: {scraped} rows")
    
    return dict(agent_counts)


# ============================================================
with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp("http://localhost:9222")
    
    eagent_page = None
    for ctx in browser.contexts:
        for pg in ctx.pages:
            if "eagent" in pg.url.lower():
                eagent_page = pg; break
        if eagent_page: break
    
    if not eagent_page:
        print("[FAIL] No eAgent tab"); exit(1)
    
    # ==================== DISMISSED ====================
    print("\n=== DISMISSED TO-DOS ===")
    dismissed = run_dismissed_report(eagent_page, target_display)
    
    print(f"\n    DISMISSED PER AGENT:")
    for agent, count in sorted(dismissed.items()):
        print(f"      {agent}: {count}")
    print(f"    Total: {sum(dismissed.values())}")
    
    # ==================== PAST DUE ====================
    print("\n\n=== PAST DUE TO-DOS ===")
    pastdue = run_pastdue_report(eagent_page, target_display)
    
    print(f"\n    PAST DUE PER AGENT:")
    for agent, count in sorted(pastdue.items()):
        print(f"      {agent}: {count}")
    print(f"    Total: {sum(pastdue.values())}")
    
    # ==================== COMBINED ====================
    print("\n\n=== COMBINED RESULTS ===")
    all_agents = sorted(set(list(dismissed.keys()) + list(pastdue.keys())))
    print(f"{'Agent':<25} {'Dismissed':>10} {'Past Due':>10}")
    print("-" * 47)
    for agent in all_agents:
        d = dismissed.get(agent, 0)
        pd_val = pastdue.get(agent, 0)
        print(f"{agent:<25} {d:>10} {pd_val:>10}")
    print("-" * 47)
    print(f"{'TOTAL':<25} {sum(dismissed.values()):>10} {sum(pastdue.values()):>10}")
    
    print("\n[DONE]")
