import sys
from playwright.sync_api import sync_playwright
import time
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        user_data_dir="data/dash_playwright_profile",
        headless=True,
        args=["--disable-blink-features=AutomationControlled"]
    )
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.goto("https://dash.allstate.com/Home/Dash/")
    time.sleep(2)
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    time.sleep(1)
    
    # Expand NB
    title_el = page.locator('h1, h2, h3, h4, h5, span, div.card-title, div.panel-title').locator('text="P&C New Business"').first
    card_container = title_el.locator("xpath=ancestor::div[contains(@class, 'card') or contains(@class, 'panel') or contains(@class, 'widget') or position()=4]")
    if card_container.count() == 0:
        card_container = title_el.locator("xpath=../../..")
    links = card_container.first.locator('a[href*="Permalink"]:visible')
    if links.count() > 0:
        page.goto("https://dash.allstate.com" + links.last.get_attribute("href"), wait_until="domcontentloaded")
    time.sleep(4)
    
    # Click NB details
    page.locator('a:has-text("NB Details"):visible').first.click()
    time.sleep(4)
    
    # Get table HTML
    table = page.locator("table, .rt-table, .ReactTable").last
    if table.count() > 0:
        print("TABLE HTML:")
        print(table.inner_html()[:2000]) # First 2k chars
        print("... [TRUNCATED] ...")
        
        # Get headers
        headers = table.locator("th, .rt-th")
        print(f"Found {headers.count()} headers")
        for i in range(min(headers.count(), 30)):
            print(f"Header {i}: {headers.nth(i).text_content()}")
            
        # Get search inputs
        inputs = table.locator('input')
        print(f"Found {inputs.count()} inputs inside table")
        for i in range(min(inputs.count(), 30)):
            print(f"Input {i}: aria-label='{inputs.nth(i).get_attribute('aria-label')}' class='{inputs.nth(i).get_attribute('class')}'")
    else:
        print("No table found!")
    browser.close()
