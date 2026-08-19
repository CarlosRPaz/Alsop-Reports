import sys
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        user_data_dir="data/dash_playwright_profile",
        headless=True,
        args=["--disable-blink-features=AutomationControlled"]
    )
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.goto("https://dash.allstate.com/Home/Dash/")
    page.wait_for_load_state("domcontentloaded")
    page.wait_for_timeout(5000)
    
    html = page.content()
    with open("dash_main.html", "w", encoding="utf-8") as f:
        f.write(html)
    
    print("Saved HTML to dash_main.html")
    ctx.close()
