"""Quick diagnostic: dump the AgencyZoom filter panel DOM structure."""
import json, time
from pathlib import Path
from playwright.sync_api import sync_playwright

config = json.load(open("config/config.json"))
az = config["agencyzoom"]
profile_dir = Path(az.get("profile_dir", "data/az_playwright_profile")).resolve()

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        str(profile_dir), channel="msedge", headless=False,
        viewport={"width": 1400, "height": 900}
    )
    page = ctx.new_page()
    page.set_default_timeout(30000)

    # Navigate to login first
    page.goto("https://app.agencyzoom.com/login", wait_until="domcontentloaded")
    time.sleep(4)

    # Check if we need to log in
    url = page.url.lower()
    if "login" in url or "www.agencyzoom.com" in url:
        print(f"Need to log in... current URL: {page.url}")
        # Navigate to login
        if "www.agencyzoom.com" in url:
            page.goto("https://app.agencyzoom.com/login", wait_until="domcontentloaded")
            time.sleep(3)
        # Fill login
        email_input = page.locator('input[type="email"]:visible, input[name="email"]:visible, input[type="text"]:visible').first
        email_input.fill(az["username"])
        time.sleep(0.5)
        pw_input = page.locator('input[type="password"]:visible').first
        pw_input.fill(az["password"])
        time.sleep(0.5)
        pw_input.press("Enter")
        time.sleep(5)

    print(f"After login: {page.url}")

    # Navigate to sales report
    page.goto("https://app.agencyzoom.com/sales-report/index", wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle", timeout=30000)
    time.sleep(3)
    print(f"On reports page: {page.url}")

    # Click Filter - try both button and a tags
    filter_clicked = False
    for sel in ['button:has-text("Filter")', 'a:has-text("Filter")']:
        try:
            loc = page.locator(sel)
            if loc.count() > 0:
                loc.first.click()
                filter_clicked = True
                print(f"Clicked filter via: {sel}")
                break
        except Exception:
            continue

    if not filter_clicked:
        print("Could not click Filter button")
        ctx.close()
        exit(1)

    time.sleep(2)

    # Dump the filter dock body HTML
    html = page.evaluate("""() => {
        const dock = document.querySelector('#filterDock');
        if (!dock) return 'NO #filterDock FOUND';
        const body = dock.querySelector('.dock-body');
        if (!body) return dock.innerHTML.substring(0, 8000);
        return body.innerHTML.substring(0, 8000);
    }""")
    print("=== FILTER DOCK BODY HTML ===")
    print(html)
    print("=== END ===")

    ctx.close()
