"""
Quick test: Download NB report 3 times using column 16, 17, and 18
for the Disposition filter, to find the correct column index.
"""
import json
import sys
import time
from pathlib import Path
from datetime import datetime, timedelta

sys.path.insert(0, str(Path(__file__).parent / "src"))
from dash_downloader import (
    _is_login_page, _perform_login, _is_mfa_page, _wait_for_mfa_completion,
    _select_primary_agency, _expand_pc_nb, _set_date_range,
    _type_in_column_search, _click_go, _click_download, _debug_screenshot,
    DEFAULT_TIMEOUT_MS,
)

config_path = Path("config/config.json")
with open(config_path) as f:
    config = json.load(f)

dash = config.get("allstate_dash", {})
url = dash.get("url", "https://dash.allstate.com/Home/Dash/")
username = dash.get("username", "")
password = dash.get("password", "")
profile_dir = Path(dash.get("profile_dir", "data/dash_playwright_profile")).resolve()
target_date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

COLUMNS_TO_TEST = [16, 17, 18]

from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        user_data_dir=str(profile_dir),
        channel="msedge",
        headless=False,
        accept_downloads=True,
        viewport={"width": 1400, "height": 900},
    )
    page = ctx.new_page()
    page.set_default_timeout(DEFAULT_TIMEOUT_MS)

    # Navigate and handle login/MFA
    print(f"[test] Navigating to {url}")
    page.goto(url, wait_until="domcontentloaded", timeout=60000)
    time.sleep(3)

    if _is_login_page(page):
        print("[test] Login page detected, signing in...")
        _perform_login(page, username, password)
        time.sleep(3)

    if _is_mfa_page(page):
        print("[test] MFA required — please enter code and press Login")
        if not _wait_for_mfa_completion(page):
            print("[test] MFA failed, exiting")
            ctx.close()
            sys.exit(1)

    time.sleep(3)
    _select_primary_agency(page)

    # Wait for dashboard
    print("[test] Waiting for dashboard to load...")
    try:
        page.locator('text="P&C Quotes"').first.wait_for(state="visible", timeout=120000)
    except Exception:
        pass

    for col in COLUMNS_TO_TEST:
        print(f"\n{'='*60}")
        print(f"  TESTING COLUMN {col} for 'New Policy Issued'")
        print(f"{'='*60}")

        # Navigate to NB
        expanded = _expand_pc_nb(page)
        if not expanded:
            print(f"[test] Could not expand P&C NB card for column {col}")
            # Try navigating back home
            page.goto("https://dash.allstate.com/Home/Dash/")
            time.sleep(5)
            continue

        # Click NB Details
        selectors = [
            'a:has-text("NB Details"):visible',
            'a:has-text("NB Detail"):visible',
        ]
        for sel in selectors:
            loc = page.locator(sel)
            if loc.count() > 0:
                loc.first.click()
                break

        # Wait for page
        try:
            page.locator('text="Start Date"').first.wait_for(state="visible", timeout=45000)
        except Exception:
            pass
        time.sleep(2)

        # Set dates
        _set_date_range(page, target_date)

        # Type into the test column
        _type_in_column_search(page, col, "New Policy Issued", f"Disposition (column {col})")
        time.sleep(1)

        # Click Go
        _click_go(page)
        time.sleep(3)

        # Screenshot to see the result
        _debug_screenshot(page, f"nb_col_{col}_result")
        print(f"[test] Screenshot saved for column {col}")

        # Download
        result = _click_download(page, f"nb_col{col}")
        if result:
            print(f"[test] [OK] Column {col} downloaded: {result}")
        else:
            print(f"[test] [WARN] Column {col} — no download")

        # Go back to main page for next test
        page.goto("https://dash.allstate.com/Home/Dash/")
        time.sleep(5)
        _select_primary_agency(page)
        try:
            page.locator('text="P&C Quotes"').first.wait_for(state="visible", timeout=30000)
        except Exception:
            pass

    ctx.close()
    print("\n[test] Done! Check screenshots: nb_col_16_result.png, nb_col_17_result.png, nb_col_18_result.png")
