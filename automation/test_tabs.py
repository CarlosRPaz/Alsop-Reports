import sys, time
sys.stdout.reconfigure(line_buffering=True)
from src.eagent_downloader import extract_chart_data
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp('http://localhost:9222')
    eagent_page = None
    for ctx in browser.contexts:
        for pg in ctx.pages:
            if 'eagent' in pg.url.lower():
                eagent_page = pg
                break
    
    if eagent_page:
        fpage = eagent_page.frame('fPage')
        print('Available tabs:', fpage.locator('.rtsTxt').all_inner_texts())
        try:
            fpage.locator('.rtsTxt:has-text("Charts")').click(timeout=5000)
            print('Clicked Charts tab, waiting 5s...')
            time.sleep(5)
            res = extract_chart_data(fpage)
            print('Result:', res)
        except Exception as e:
            print('Failed to click Charts tab:', e)
