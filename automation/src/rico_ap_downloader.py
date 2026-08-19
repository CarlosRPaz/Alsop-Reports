"""
rico_ap_downloader.py — Auto-download Ricochet Agent Performance report.

Uses the same persistent Edge profile as rico_ch_downloader so login session
is shared. Navigates to Reports → Agent Performance, sets both date inputs
to the target date (single day), and downloads the XLSX file.

Usage:
    python src/rico_ap_downloader.py [YYYY-MM-DD]
    # Defaults to yesterday if no date supplied.
"""

from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path


DEFAULT_TIMEOUT_MS = 30_000
DOWNLOAD_TIMEOUT_MS = 60_000


def download_rico_agent_performance(
    config: dict,
    target_date: str | None = None,
    headless: bool = False,
) -> str | None:
    """
    Launch Edge via Playwright, navigate to Ricochet Agent Performance,
    set date range to a single day, and download the XLSX report.

    Returns the path to the downloaded file, or None on failure.
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("[rico_ap] Playwright not installed. Run: pip install playwright && playwright install msedge")
        return None

    rico = config.get("ricochet_ch", {})
    if not rico:
        print("[rico_ap] No 'ricochet_ch' section in config.json")
        return None

    dashboard_url = rico.get("dashboard_url", "https://alsop.ricochet.me/dashboard/")
    username = rico.get("username", "")
    password = rico.get("password", "")
    org = rico.get("org", "Alsop")
    # Share the same profile as rico_ch so login session is reused
    profile_dir = Path(rico.get("profile_dir", "data/rico_ch_playwright_profile")).resolve()
    mfa_sender = rico.get("mfa_sender_filter", "ricochet")
    mfa_subject = rico.get("mfa_subject_filter", "")

    # Default to yesterday
    if target_date is None:
        target_date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

    print(f"[rico_ap] Target date: {target_date}")

    profile_dir.mkdir(parents=True, exist_ok=True)

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
            # Step 1: Navigate to dashboard
            print(f"[rico_ap] Navigating to {dashboard_url}")
            page.goto(dashboard_url, wait_until="domcontentloaded")
            time.sleep(3)

            # Step 2: Login if needed
            if _is_login_page(page):
                print("[rico_ap] Login page detected — signing in...")
                _perform_login(page, org, username, password)
                time.sleep(3)

                if _is_mfa_page(page):
                    print("[rico_ap] MFA detected — fetching code from Outlook...")
                    _handle_mfa(page, mfa_sender, mfa_subject)
                    time.sleep(3)
            else:
                print("[rico_ap] Already signed in (reusing profile session)")

            # Step 3: Navigate to Reports → Agent Performance
            print("[rico_ap] Navigating to Agent Performance...")
            page.wait_for_load_state("networkidle", timeout=15000)

            # Handle "logged in from another computer" modal
            try:
                ignore_btn = page.locator('button:has-text("Ignore"):visible, a:has-text("Ignore"):visible')
                if ignore_btn.count() > 0:
                    ignore_btn.first.click()
                    time.sleep(2)
                    print("[rico_ap] [OK] Dismissed 'another session' modal")
                    page.wait_for_load_state("networkidle", timeout=15000)
            except Exception:
                pass

            _debug_screenshot(page, "rico_ap_dashboard")

            # Expand sidebar if collapsed (hamburger menu)
            try:
                hamburger = page.locator('.navbar-toggle:visible, button.navbar-toggle:visible, .sidebar-toggle:visible')
                if hamburger.count() > 0:
                    hamburger.first.click()
                    time.sleep(1)
                    print("[rico_ap] [OK] Toggled sidebar")
            except Exception:
                pass

            # Expand Reports menu
            reports_link = page.locator('a[href="#reports"]')
            if reports_link.count() > 0:
                reports_link.first.click()
                time.sleep(2)
                print("[rico_ap] [OK] Expanded Reports menu")
            else:
                # Try visible version
                reports_vis = page.locator('a:has-text("Reports"):visible')
                if reports_vis.count() > 0:
                    reports_vis.first.click()
                    time.sleep(2)
                    print("[rico_ap] [OK] Expanded Reports menu (visible)")

            # Click Agent Performance
            ap_selectors = [
                'a:has-text("Agent Performance"):visible',
                'a:has-text("Agents Performance"):visible',
                'a[href*="agent-performance"]:visible',
                'a[href*="agent_performance"]:visible',
                'a[href*="agentperformance"]:visible',
            ]
            ap_found = False
            for sel in ap_selectors:
                try:
                    link = page.locator(sel)
                    if link.count() > 0:
                        link.first.click()
                        time.sleep(3)
                        ap_found = True
                        print(f"[rico_ap] [OK] Navigated to Agent Performance via: {sel}")
                        break
                except Exception:
                    continue

            if not ap_found:
                print("[rico_ap] [WARN] Could not find Agent Performance link")
                _dump_nav_links(page)
                return None

            _debug_screenshot(page, "rico_ap_page")

            # Step 4: Set both date inputs to target_date
            print(f"[rico_ap] Setting date range to {target_date}...")
            date_inputs = page.locator('input[type="date"]:visible')
            date_count = date_inputs.count()
            print(f"[rico_ap] Found {date_count} date input(s)")

            if date_count >= 2:
                # From date
                date_inputs.nth(0).fill(target_date)
                time.sleep(0.5)
                # To date
                date_inputs.nth(1).fill(target_date)
                time.sleep(0.5)
                print(f"[rico_ap] [OK] Set both dates to {target_date}")

                # Press Enter or click a refresh/submit button to reload
                date_inputs.nth(1).press("Enter")
                time.sleep(1)

                # Also look for a refresh button
                refresh_btn = page.locator('button:has(i.fa-refresh):visible, button:has(i.fa-sync):visible, a.refresh:visible, button[title*="Refresh"]:visible')
                if refresh_btn.count() > 0:
                    refresh_btn.first.click()
                    time.sleep(3)
                    print("[rico_ap] [OK] Clicked refresh")
                else:
                    # Try the reload icon visible in the screenshot
                    reload_icon = page.locator('.fa-refresh:visible, .fa-sync:visible, .glyphicon-refresh:visible')
                    if reload_icon.count() > 0:
                        reload_icon.first.click()
                        time.sleep(3)
                        print("[rico_ap] [OK] Clicked reload icon")
            elif date_count == 1:
                date_inputs.nth(0).fill(target_date)
                print(f"[rico_ap] [OK] Set single date to {target_date}")
            else:
                # Try text inputs
                print("[rico_ap] No date inputs found, trying text inputs...")
                text_inputs = page.locator('input[type="text"]:visible')
                for i in range(text_inputs.count()):
                    val = text_inputs.nth(i).input_value() or ""
                    if "-" in val and len(val) == 10:  # YYYY-MM-DD format
                        text_inputs.nth(i).fill(target_date)
                        print(f"[rico_ap] Set text input {i} to {target_date}")

            # Wait for report to update
            page.wait_for_load_state("networkidle", timeout=15000)
            time.sleep(2)
            _debug_screenshot(page, "rico_ap_date_set")

            # Step 5: Download XLSX
            print("[rico_ap] Downloading XLSX...")
            download_path = _click_xlsx_download(page)

            if download_path:
                print(f"[rico_ap] [OK] Downloaded: {download_path}")
            else:
                print("[rico_ap] [WARN] Download may not have completed")
                _debug_screenshot(page, "rico_ap_download_fail")

            return download_path

        except Exception as e:
            print(f"[rico_ap] Error: {e}")
            _debug_screenshot(page, "rico_ap_error")
            import traceback
            traceback.print_exc()
            return None
        finally:
            ctx.close()


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------

def _click_xlsx_download(page) -> str | None:
    """Click the XLSX download icon at the top right of the report."""
    download_selectors = [
        'a:has-text("XLSX"):visible',
        'a[title*="XLSX" i]:visible',
        'a[href*="xlsx"]:visible',
        'a[href*="export"][href*="xlsx"]:visible',
        'button:has-text("XLSX"):visible',
        # Icon-based (the screenshot shows file icons)
        'a:has(img[alt*="xlsx" i]):visible',
        'a:has(img[title*="xlsx" i]):visible',
        # Try by position — XLSX is usually the middle download icon
    ]

    for sel in download_selectors:
        try:
            loc = page.locator(sel)
            if loc.count() > 0:
                print(f"[rico_ap] Found XLSX button via: {sel}")
                with page.expect_download(timeout=DOWNLOAD_TIMEOUT_MS) as dl_info:
                    loc.first.click()
                download = dl_info.value
                save_dir = Path("C:/Users/scag3s29/Downloads")
                suggested = download.suggested_filename or f"agent_performance_{int(time.time())}.xlsx"
                target = save_dir / suggested
                download.save_as(str(target))
                return str(target)
        except Exception:
            continue

    # Fallback: look for any download-looking links near the top of the page
    print("[rico_ap] Trying generic download selectors...")
    generic_selectors = [
        'a:has-text("XLS"):visible',
        'a:has-text("CSV"):visible',
        'a[href*="download"]:visible',
        'a[href*="export"]:visible',
        'button:has-text("Download"):visible',
        'button:has-text("Export"):visible',
    ]

    for sel in generic_selectors:
        try:
            loc = page.locator(sel)
            if loc.count() > 0:
                print(f"[rico_ap] Found download via: {sel}")
                with page.expect_download(timeout=DOWNLOAD_TIMEOUT_MS) as dl_info:
                    loc.first.click()
                download = dl_info.value
                save_dir = Path("C:/Users/scag3s29/Downloads")
                suggested = download.suggested_filename or f"agent_performance_{int(time.time())}.xlsx"
                target = save_dir / suggested
                download.save_as(str(target))
                return str(target)
        except Exception:
            continue

    # Last resort: dump all links for debugging
    print("[rico_ap] [WARN] No download button found. Dumping page links...")
    _dump_nav_links(page)
    _debug_screenshot(page, "rico_ap_no_download")
    return None


# ---------------------------------------------------------------------------
# Login helpers (shared with rico_ch_downloader)
# ---------------------------------------------------------------------------

def _is_login_page(page) -> bool:
    url = page.url.lower()
    if "login" in url or "signin" in url:
        return True
    try:
        if page.locator('input[type="password"]:visible').count() > 0:
            return True
    except Exception:
        pass
    return False


def _perform_login(page, org: str, username: str, password: str) -> None:
    text_inputs = page.locator('input[type="text"]:visible, input[type="email"]:visible, input:not([type]):visible')
    pw_inputs = page.locator('input[type="password"]:visible')
    count = text_inputs.count()
    pw_count = pw_inputs.count()

    if count >= 2 and pw_count >= 1:
        text_inputs.nth(0).fill(org)
        text_inputs.nth(1).fill(username)
        pw_inputs.nth(0).fill(password)
    elif count >= 1 and pw_count >= 1:
        text_inputs.nth(0).fill(username)
        pw_inputs.nth(0).fill(password)

    submit = page.locator('button[type="submit"]:visible, button:has-text("Log In"):visible, button:has-text("Sign In"):visible')
    if submit.count() > 0:
        submit.first.click()
    else:
        pw_inputs.first.press("Enter")
    page.wait_for_load_state("domcontentloaded", timeout=DEFAULT_TIMEOUT_MS)
    time.sleep(3)


def _is_mfa_page(page) -> bool:
    url = page.url.lower()
    if "verify" in url or "mfa" in url or "code" in url:
        return True
    try:
        body_text = page.locator("body").inner_text().lower()
        for kw in ["verification code", "enter code", "authentication code"]:
            if kw in body_text:
                return True
    except Exception:
        pass
    return False


def _handle_mfa(page, sender_filter: str, subject_filter: str) -> None:
    import sys as _sys
    project_root = str(Path(__file__).resolve().parent.parent)
    if project_root not in _sys.path:
        _sys.path.insert(0, project_root)
    from src.email_watcher import get_recent_mfa_code

    code = get_recent_mfa_code(sender_filter=sender_filter, subject_filter=subject_filter)
    if not code:
        code = input("[rico_ap] Enter 6-digit code manually: ").strip()
    if code:
        code_input = page.locator('input[type="text"]:visible, input[type="number"]:visible, input[type="tel"]:visible')
        if code_input.count() > 0:
            code_input.first.fill(code)
            verify = page.locator('button:has-text("Verify"):visible, button[type="submit"]:visible')
            if verify.count() > 0:
                verify.first.click()
            else:
                code_input.first.press("Enter")
            page.wait_for_load_state("domcontentloaded", timeout=DEFAULT_TIMEOUT_MS)
            time.sleep(3)


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def _dump_nav_links(page) -> None:
    try:
        links = page.locator("a:visible")
        count = links.count()
        print(f"[rico_ap] Found {count} visible links:")
        for i in range(min(count, 30)):
            try:
                text = links.nth(i).inner_text().strip().replace("\n", " ")[:60]
                href = links.nth(i).get_attribute("href") or ""
                print(f"  Link {i}: text='{text}' href='{href}'")
            except Exception:
                pass
    except Exception:
        pass


def _debug_screenshot(page, label: str) -> None:
    try:
        ts = int(time.time())
        path = Path("data") / f"{label}_{ts}.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(path))
        print(f"[rico_ap] Screenshot saved: {path}")
    except Exception:
        pass


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    config_path = Path("config/config.json")
    if not config_path.exists():
        print(f"Config not found at {config_path}")
        sys.exit(1)

    with open(config_path) as f:
        config = json.load(f)

    target = sys.argv[1] if len(sys.argv) > 1 else None

    result = download_rico_agent_performance(config, target_date=target)
    if result:
        print(f"\n[OK] Success: {result}")
    else:
        print("\n[FAIL] Download failed")
        sys.exit(1)
