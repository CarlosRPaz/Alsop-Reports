"""
az_downloader.py -- Auto-download AgencyZoom Sales Report.

Uses Playwright with a persistent Edge profile so login survives between runs.
First run: logs in with creds from config.json.
Subsequent runs: session cookies reused, no login prompt.

Flow:
  1. Navigate to AgencyZoom
  2. Log in if needed (no MFA required)
  3. Go to Reports
  4. Set Lead Source to "All Lead Sources"
  5. Set date range to the target date (single day)
  6. Export CSV

Usage:
    from src.az_downloader import download_az_report
    path = download_az_report(config, target_date="2026-05-18")
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta
from pathlib import Path


DEFAULT_TIMEOUT_MS = 30_000
DOWNLOAD_TIMEOUT_MS = 60_000


def download_az_report(
    config: dict,
    target_date: str | None = None,
    headless: bool = False,
    save_to: str | None = None,
) -> str | None:
    """
    Launch Edge via Playwright, log into AgencyZoom, navigate to Reports,
    configure filters, and export the sales report CSV.

    Parameters
    ----------
    config : dict
        Loaded config.json.
    target_date : str | None
        Date string in YYYY-MM-DD format. Defaults to yesterday.
    headless : bool
        Run headless. Default False for debugging.
    save_to : str | None
        Override download folder. Defaults to Downloads.

    Returns
    -------
    str | None : Path to downloaded file, or None on failure.
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("[az_downloader] Playwright not installed. Run: pip install playwright && playwright install msedge")
        return None

    az = config.get("agencyzoom", {})
    if not az:
        print("[az_downloader] No 'agencyzoom' section in config.json")
        return None

    login_url   = az.get("login_url", "https://app.agencyzoom.com")
    username    = az.get("username")
    password    = az.get("password")
    profile_dir = Path(az.get("profile_dir", "data/az_playwright_profile")).resolve()

    if not username or not password:
        print("[az_downloader] Missing username or password in config.json agencyzoom section")
        return None

    # Default target date = yesterday
    if target_date is None:
        target_date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

    if save_to is None:
        save_to = config.get("email_sources", {}).get("premium", {}).get(
            "downloads_folder", "C:/Users/scag3s29/Downloads"
        )

    profile_dir.mkdir(parents=True, exist_ok=True)
    Path(save_to).mkdir(parents=True, exist_ok=True)

    print(f"[az_downloader] Target date: {target_date}")
    print(f"[az_downloader] Launching Edge (profile: {profile_dir.name})...")

    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=str(profile_dir),
            channel="msedge",
            headless=headless,
            accept_downloads=True,
            viewport={"width": 1400, "height": 900},
        )

        page = ctx.new_page()
        page.set_default_timeout(DEFAULT_TIMEOUT_MS)

        try:
            # -- Step 1: Navigate to AgencyZoom app --
            # Go directly to the login page; app.agencyzoom.com often
            # redirects to the marketing site if not authenticated.
            app_url = login_url.rstrip("/")
            if "/login" not in app_url:
                app_url += "/login"
            print(f"[az_downloader] Navigating to {app_url}")
            page.goto(app_url, wait_until="domcontentloaded")
            time.sleep(4)

            # -- Step 2: Log in if needed --
            if _needs_login(page):
                print("[az_downloader] Login page detected -- signing in...")
                _perform_login(page, username, password)
                time.sleep(4)
            else:
                print("[az_downloader] Already signed in (reusing profile session)")

            # Take a screenshot of the main page so we can see the nav structure
            _debug_screenshot(page, "az_main_page")

            # -- Step 3: Navigate to Reports page directly via URL --
            reports_url = "https://app.agencyzoom.com/sales-report/index"
            print(f"[az_downloader] Navigating directly to {reports_url}")
            page.goto(reports_url, wait_until="domcontentloaded")
            page.wait_for_load_state("networkidle", timeout=DEFAULT_TIMEOUT_MS)
            time.sleep(3)

            # Confirm we're on the reports page
            print(f"[az_downloader] Current URL: {page.url}")
            _debug_screenshot(page, "az_reports_page")

            # -- Step 4: Click the blue Filter button to open filter panel --
            print("[az_downloader] Opening filter panel...")
            _open_filter_panel(page)
            time.sleep(2)
            _debug_screenshot(page, "az_filter_panel_open")

            # -- Step 5: Set Lead Source to All Lead Sources --
            print("[az_downloader] Setting Lead Source to All Lead Sources...")
            _set_filter_select(page, "Lead Source", "All Lead Sources")
            time.sleep(1)

            # -- Step 6: Set Timeframe to Date Range and enter dates --
            print(f"[az_downloader] Setting date range to {target_date}...")
            _set_filter_select(page, "Timeframe", "Date Range")
            time.sleep(2)
            _debug_screenshot(page, "az_after_timeframe_select")

            # Fill in the date range inputs that appear after selecting "Date Range"
            _fill_date_inputs(page, target_date, target_date)
            time.sleep(2)

            # Screenshot after filters are set
            _debug_screenshot(page, "az_filters_set")

            # -- Step 7: Close the filter panel so Export button is clickable --
            print("[az_downloader] Closing filter panel...")
            _close_filter_panel(page)
            time.sleep(2)

            # Wait for report data to reload
            print("[az_downloader] Waiting for report to reload...")
            page.wait_for_load_state("networkidle", timeout=DEFAULT_TIMEOUT_MS)
            time.sleep(3)
            _debug_screenshot(page, "az_report_reloaded")

            # -- Step 8: Export --
            print("[az_downloader] Exporting report...")
            download_path = _click_export(page, save_to)

            if download_path:
                print(f"[az_downloader] [OK] Downloaded: {download_path}")
            else:
                print("[az_downloader] [FAIL] Export did not produce a file.")
                _debug_screenshot(page, "az_export_failed")

            return download_path

        except Exception as e:
            print(f"[az_downloader] Error: {e}")
            import traceback
            traceback.print_exc()
            _debug_screenshot(page, "az_error")
            return None
        finally:
            ctx.close()


def _needs_login(page) -> bool:
    """Detect if we need to log in."""
    url = page.url.lower()
    # Explicitly on a login/auth page
    if any(kw in url for kw in ("login", "signin", "sign-in", "sign_in", "auth")):
        return True
    # Redirected to the marketing site instead of the app
    if "www.agencyzoom.com" in url and "app.agencyzoom.com" not in url:
        return True
    # Has a password field visible
    try:
        if page.locator('input[type="password"]:visible').count() > 0:
            return True
    except Exception:
        pass
    return False


def _perform_login(page, username: str, password: str, login_url: str = "https://app.agencyzoom.com/login") -> None:
    """Fill in AgencyZoom's login form (email + password)."""
    # If we got redirected to the marketing site, go to login page first
    if "www.agencyzoom.com" in page.url and "app.agencyzoom.com" not in page.url:
        print("[az_downloader] On marketing site -- navigating to login page...")
        page.goto(login_url, wait_until="domcontentloaded")
        time.sleep(3)

    # Look for email/username field
    email_selectors = [
        'input[type="email"]:visible',
        'input[name="email"]:visible',
        'input[name="username"]:visible',
        'input[placeholder*="email" i]:visible',
        'input[placeholder*="user" i]:visible',
        'input[type="text"]:visible',
    ]

    email_input = None
    for sel in email_selectors:
        loc = page.locator(sel)
        if loc.count() > 0:
            email_input = loc.first
            break

    if email_input is None:
        print("[az_downloader] Could not find email input field")
        _debug_screenshot(page, "az_login_no_email")
        return

    # Fill email
    email_input.fill(username)
    time.sleep(0.5)

    # Fill password
    pw_input = page.locator('input[type="password"]:visible').first
    pw_input.fill(password)
    time.sleep(0.5)

    # Submit -- try button first, then Enter
    submit_selectors = [
        'button[type="submit"]:visible',
        'button:has-text("Sign In"):visible',
        'button:has-text("Log In"):visible',
        'button:has-text("Login"):visible',
        'input[type="submit"]:visible',
    ]

    submitted = False
    for sel in submit_selectors:
        loc = page.locator(sel)
        if loc.count() > 0:
            loc.first.click()
            submitted = True
            break

    if not submitted:
        pw_input.press("Enter")

    page.wait_for_load_state("domcontentloaded", timeout=DEFAULT_TIMEOUT_MS)
    time.sleep(3)

    # Verify login succeeded
    if _needs_login(page):
        print("[az_downloader] [WARN] Still on login page after submit -- credentials may be wrong")
        _debug_screenshot(page, "az_login_failed")
    else:
        print("[az_downloader] [OK] Login successful")


def _open_filter_panel(page) -> None:
    """Click the blue Filter button in the top toolbar to open the filter panel."""
    # The reports page has a toolbar with: [Filter] [Export] [Print] [+ Add]
    # The Filter button is blue and contains a magnifying glass icon + "Filter" text
    filter_selectors = [
        'button:has-text("Filter"):visible',
        'a:has-text("Filter"):visible',
        # The button might have an icon class
        'button:has(svg):has-text("Filter"):visible',
    ]

    for sel in filter_selectors:
        try:
            loc = page.locator(sel)
            if loc.count() > 0:
                loc.first.click()
                time.sleep(1)
                print("[az_downloader] [OK] Opened filter panel")
                return
        except Exception:
            continue

    print("[az_downloader] [WARN] Could not find Filter button")
    _debug_screenshot(page, "az_no_filter_button")


def _set_filter_select(page, label_text: str, option_label: str) -> None:
    """
    Set a Bootstrap dropdown filter in the AgencyZoom filter panel.

    DOM structure (from inspection):
        <div class="az-form-group">
            <label class="dropdown-category">Lead Source</label>
            <div class="dropdown">
                <button class="dropdown-toggle">New Business Leads</button>
                <div class="dropdown-menu">
                    <a class="dropdown-item" data-id="...">All Lead Sources</a>
                    ...
                </div>
            </div>
        </div>
    """
    # Step 1: Find the .az-form-group that contains a label matching our text
    form_groups = page.locator(".az-form-group")
    count = form_groups.count()
    print(f"[az_downloader] Found {count} .az-form-group elements")

    target_group = None
    for i in range(count):
        group = form_groups.nth(i)
        try:
            label = group.locator("label.dropdown-category, label")
            if label.count() > 0:
                lbl_text = label.first.inner_text().strip()
                if label_text.lower() in lbl_text.lower():
                    target_group = group
                    print(f"[az_downloader] Found form group for '{label_text}' (label='{lbl_text}')")
                    break
        except Exception:
            continue

    if target_group is None:
        print(f"[az_downloader] [WARN] Could not find form group for '{label_text}'")
        # Dump all form group labels for debugging
        for i in range(count):
            try:
                lbl = form_groups.nth(i).locator("label").first.inner_text().strip()
                print(f"  Group {i}: label='{lbl}'")
            except Exception:
                pass
        _debug_screenshot(page, f"az_filter_{label_text.lower().replace(' ', '_')}")
        return

    # Step 2: Click the dropdown toggle button to open the menu
    toggle = target_group.locator("button.dropdown-toggle, .dropdown-toggle")
    if toggle.count() == 0:
        print(f"[az_downloader] [WARN] No dropdown toggle found in '{label_text}' group")
        return

    current_value = toggle.first.inner_text().strip()
    print(f"[az_downloader] Current value of '{label_text}': '{current_value}'")

    if current_value.lower() == option_label.lower():
        print(f"[az_downloader] [OK] '{label_text}' already set to '{option_label}'")
        return

    toggle.first.click()
    time.sleep(1)

    # Step 3: Click the dropdown item with matching text
    menu = target_group.locator(".dropdown-menu")
    if menu.count() == 0:
        print(f"[az_downloader] [WARN] No dropdown menu found for '{label_text}'")
        return

    items = menu.locator(".dropdown-item, a")
    item_count = items.count()
    print(f"[az_downloader] Dropdown menu has {item_count} items")

    for j in range(item_count):
        item_text = items.nth(j).inner_text().strip()
        if item_text.lower() == option_label.lower():
            items.nth(j).click()
            time.sleep(1)
            print(f"[az_downloader] [OK] Set '{label_text}' to '{option_label}'")
            return

    # If exact match not found, try partial match
    for j in range(item_count):
        item_text = items.nth(j).inner_text().strip()
        if option_label.lower() in item_text.lower():
            items.nth(j).click()
            time.sleep(1)
            print(f"[az_downloader] [OK] Set '{label_text}' to '{item_text}' (partial match)")
            return

    # Dump available items for debugging
    available = []
    for j in range(min(item_count, 15)):
        available.append(items.nth(j).inner_text().strip())
    print(f"[az_downloader] [WARN] '{option_label}' not found in dropdown. Available: {available}")
    _debug_screenshot(page, f"az_filter_{label_text.lower().replace(' ', '_')}")


def _fill_date_inputs(page, start_date: str, end_date: str) -> None:
    """
    Interact with the calendar date picker that appears after selecting
    'Select Date Range' in the Timeframe dropdown.
    """
    start_obj = datetime.strptime(start_date, "%Y-%m-%d")
    end_obj = datetime.strptime(end_date, "%Y-%m-%d")
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday = today - timedelta(days=1)

    # Check for shortcut options first
    if start_date == end_date:
        if start_obj.date() == yesterday.date():
            try:
                yday = page.locator('text="Yesterday"')
                if yday.count() > 0 and yday.first.is_visible():
                    yday.first.click()
                    time.sleep(1)
                    print("[az_downloader] [OK] Selected 'Yesterday' shortcut")
                    _click_calendar_apply(page)
                    return
            except Exception:
                pass

        if start_obj.date() == today.date():
            try:
                tday = page.locator('text="Today"')
                if tday.count() > 0 and tday.first.is_visible():
                    tday.first.click()
                    time.sleep(1)
                    print("[az_downloader] [OK] Selected 'Today' shortcut")
                    _click_calendar_apply(page)
                    return
            except Exception:
                pass

    # Arbitrary dates: navigate and click
    start_side = _navigate_calendar_to_month(page, start_obj)
    if start_side:
        _click_calendar_day(page, start_obj, start_side)
    else:
        print("[az_downloader] [WARN] Could not find start month")

    if start_date != end_date:
        end_side = _navigate_calendar_to_month(page, end_obj)
        if end_side:
            _click_calendar_day(page, end_obj, end_side)
    else:
        # Same day: click again to set end = start
        if start_side:
            _click_calendar_day(page, end_obj, start_side)

    _click_calendar_apply(page)


def _navigate_calendar_to_month(page, target_date: datetime) -> str:
    """Navigate calendar and return 'left' or 'right' indicating where target is."""
    max_clicks = 24
    for click_num in range(max_clicks):
        try:
            cal_info = page.evaluate("""() => {
                const picker = document.querySelector('.daterangepicker');
                if (!picker) return { found: false };
                const headers = picker.querySelectorAll('th.month');
                return {
                    found: true,
                    months: Array.from(headers).map(h => h.textContent.trim())
                };
            }""")

            if not cal_info.get("found"):
                return ""

            months = cal_info.get("months", [])
            if not months:
                return ""

            left_month_str = months[0]
            try:
                displayed = datetime.strptime(left_month_str, "%b %Y")
            except ValueError:
                return ""

            target_ym = (target_date.year, target_date.month)
            displayed_ym = (displayed.year, displayed.month)
            right_ym = (displayed.year + (1 if displayed.month == 12 else 0),
                       (displayed.month % 12) + 1)

            if target_ym == displayed_ym:
                print(f"[az_downloader] Calendar target in left pane ({left_month_str})")
                return "left"
            if target_ym == right_ym:
                print(f"[az_downloader] Calendar target in right pane")
                return "right"

            if target_ym > right_ym:
                page.evaluate("document.querySelector('.daterangepicker th.next')?.click()")
                time.sleep(0.3)
            else:
                page.evaluate("document.querySelector('.daterangepicker th.prev')?.click()")
                time.sleep(0.3)
        except Exception:
            return ""
    return ""


def _click_calendar_day(page, target_date: datetime, side: str) -> None:
    """Click a day in the specified calendar pane ('left' or 'right')."""
    day_str = str(target_date.day)
    try:
        # Get all valid (not off) cells in the target pane
        cells = page.locator(f".drp-calendar.{side} td.available:not(.off), .drp-calendar.{side} td:not(.off)")
        for i in range(cells.count()):
            cell = cells.nth(i)
            if cell.inner_text().strip() == day_str:
                # Use playwright click so event handlers fire properly
                cell.click()
                time.sleep(0.3)
                print(f"[az_downloader] [OK] Clicked day {day_str} in {side} pane")
                return
        print(f"[az_downloader] [WARN] Day {day_str} not found in {side} pane")
    except Exception as e:
        print(f"[az_downloader] Error clicking day {day_str}: {e}")


def _click_calendar_apply(page) -> None:
    """Click the Apply button on the date range picker."""
    try:
        apply = page.locator('button:has-text("Apply"):visible, .applyBtn:visible')
        if apply.count() > 0:
            apply.first.click()
            time.sleep(2)
            print("[az_downloader] [OK] Clicked Apply on date picker")
            return
    except Exception:
        pass
    print("[az_downloader] [WARN] Could not find Apply button on date picker")


def _close_filter_panel(page) -> None:
    """Close the filter dock panel by clicking the X or clicking outside."""
    # Try the X close button in the filter panel header
    close_selectors = [
        '#filterDock button.close:visible',
        '#filterDock .dock-close:visible',
        '#filterDock button:has(svg):visible',  # X icon button
        '.dock-wrapper button.close:visible',
        'button[aria-label="Close"]:visible',
    ]

    for sel in close_selectors:
        try:
            loc = page.locator(sel)
            if loc.count() > 0:
                loc.first.click()
                time.sleep(1)
                print("[az_downloader] [OK] Closed filter panel via close button")
                return
        except Exception:
            continue

    # Fallback: click the dim overlay to close
    try:
        dim = page.locator(".dock-dim:visible")
        if dim.count() > 0:
            dim.first.click(force=True)
            time.sleep(1)
            print("[az_downloader] [OK] Closed filter panel via overlay click")
            return
    except Exception:
        pass

    # Fallback: press Escape
    page.keyboard.press("Escape")
    time.sleep(1)
    print("[az_downloader] [OK] Closed filter panel via Escape key")


def _click_export(page, save_to: str) -> str | None:
    """Click the Export button in the top toolbar and save the downloaded file."""
    # The Export button is in the toolbar next to Filter, with text "Export"
    export_selectors = [
        'button:has-text("Export"):visible',
        'a:has-text("Export"):visible',
        'button:has-text("Download"):visible',
        'a:has-text("Download"):visible',
    ]

    for sel in export_selectors:
        try:
            loc = page.locator(sel)
            if loc.count() > 0:
                print(f"[az_downloader] Found export button via: {sel}")
                with page.expect_download(timeout=DOWNLOAD_TIMEOUT_MS) as dl_info:
                    loc.first.click()
                download = dl_info.value
                suggested = download.suggested_filename or f"sales-report-{int(time.time())}.csv"
                target = Path(save_to) / suggested
                download.save_as(str(target))
                return str(target)
        except Exception as e:
            print(f"[az_downloader] Export attempt with '{sel}' did not trigger download: {e}")
            continue

    print("[az_downloader] [WARN] Could not find or trigger Export button")
    _debug_screenshot(page, "az_export_not_found")
    return None


def _debug_screenshot(page, label: str) -> None:
    """Save a debug screenshot for troubleshooting."""
    try:
        shot = Path("data") / f"{label}_{int(time.time())}.png"
        shot.parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(shot))
        print(f"[az_downloader] Screenshot saved: {shot}")
    except Exception:
        pass


# -- CLI entry point for standalone testing --
if __name__ == "__main__":
    import json
    import sys

    config_path = Path(__file__).resolve().parent.parent / "config" / "config.json"
    with open(config_path) as f:
        config = json.load(f)

    target = sys.argv[1] if len(sys.argv) > 1 else None
    result = download_az_report(config, target_date=target, headless=False)

    if result:
        print(f"\n[OK] Success: {result}")
    else:
        print("\n[FAIL] Download failed. Check screenshots in data/ folder.")
