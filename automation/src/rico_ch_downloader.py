"""
rico_ch_downloader.py — Auto-download Ricochet Call History reports.

Uses Playwright with a persistent Edge profile so login survives between runs.
If a fresh login is required, the script:
  1. Fills in org/email/password on the Ricochet login page
  2. Detects the MFA verification code prompt
  3. Uses email_watcher.get_recent_mfa_code() to pull the code from Outlook
  4. Fills the code and completes login

Then navigates to Call History, sets the date range, and triggers the CSV/ZIP
download.

Usage:
    python src/rico_ch_downloader.py [YYYY-MM-DD]
    # Defaults to yesterday if no date supplied.
"""

from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path


DEFAULT_TIMEOUT_MS = 30_000
DOWNLOAD_TIMEOUT_MS = 120_000


def download_rico_call_history(
    config: dict,
    target_date: str | None = None,
    headless: bool = False,
) -> str | None:
    """
    Launch Edge via Playwright, log into Ricochet (with auto MFA),
    navigate to Call History, set date range, and download the report.

    Returns the path to the downloaded file, or None on failure.
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("[rico_ch] Playwright not installed. Run: pip install playwright && playwright install msedge")
        return None

    rico = config.get("ricochet_ch", {})
    if not rico:
        print("[rico_ch] No 'ricochet_ch' section in config.json")
        return None

    login_url = rico.get("login_url", "https://alsop.ricochet.me/login")
    dashboard_url = rico.get("dashboard_url", "https://alsop.ricochet.me/dashboard/")
    username = rico.get("username", "")
    password = rico.get("password", "")
    org = rico.get("org", "Alsop")
    profile_dir = Path(rico.get("profile_dir", "data/rico_ch_playwright_profile")).resolve()
    mfa_sender = rico.get("mfa_sender_filter", "ricochet")
    mfa_subject = rico.get("mfa_subject_filter", "")

    # Default to yesterday
    if target_date is None:
        target_date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    target_obj = datetime.strptime(target_date, "%Y-%m-%d")

    print(f"[rico_ch] Target date: {target_date}")

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
            # Step 1: Navigate to dashboard (will redirect to login if needed)
            print(f"[rico_ch] Navigating to {dashboard_url}")
            page.goto(dashboard_url, wait_until="domcontentloaded")
            time.sleep(3)
            _debug_screenshot(page, "rico_ch_initial_page")

            # Step 2: Check if we need to log in
            if _is_login_page(page):
                print("[rico_ch] Login page detected — signing in...")
                _perform_login(page, org, username, password)
                time.sleep(3)
                _debug_screenshot(page, "rico_ch_after_login")

                # Step 3: Check for MFA prompt
                if _is_mfa_page(page):
                    print("[rico_ch] MFA verification page detected — fetching code from Outlook...")
                    _handle_mfa(page, mfa_sender, mfa_subject)
                    time.sleep(3)
                    _debug_screenshot(page, "rico_ch_after_mfa")
            else:
                print("[rico_ch] Already signed in (reusing profile session)")

            # Step 4: Find Call History via Reports menu
            print("[rico_ch] Expanding Reports menu...")
            _debug_screenshot(page, "rico_ch_dashboard")

            # First, try to expand the sidebar if collapsed (hamburger menu)
            try:
                hamburger = page.locator('.navbar-toggle:visible, button.hamburger:visible, .sidebar-toggle:visible')
                if hamburger.count() > 0:
                    hamburger.first.click()
                    time.sleep(1)
            except Exception:
                pass

            # Click the "Reports" menu to expand its submenu
            ch_found = False
            try:
                reports_link = page.locator('a[href="#reports"]:visible, a:has-text("Reports"):visible')
                if reports_link.count() > 0:
                    reports_link.first.click()
                    time.sleep(2)
                    print("[rico_ch] [OK] Expanded Reports menu")
                    _debug_screenshot(page, "rico_ch_reports_expanded")

                    # Now look for Call History in the expanded submenu
                    ch_selectors = [
                        'a:has-text("Call History"):visible',
                        'a[href*="call-history"]:visible',
                        'a[href*="call_history"]:visible',
                        'a[href*="callhistory"]:visible',
                        'a[href*="call-log"]:visible',
                    ]
                    for sel in ch_selectors:
                        try:
                            link = page.locator(sel)
                            if link.count() > 0:
                                link.first.click()
                                time.sleep(3)
                                ch_found = True
                                print(f"[rico_ch] [OK] Navigated to Call History via: {sel}")
                                break
                        except Exception:
                            continue

                    if not ch_found:
                        # Dump the submenu links
                        print("[rico_ch] [INFO] Call History not found in Reports submenu. Dumping submenu...")
                        _dump_nav_links(page)
            except Exception as e:
                print(f"[rico_ch] Error expanding Reports: {e}")

            if not ch_found:
                print("[rico_ch] [WARN] Could not find Call History link")
            
            _debug_screenshot(page, "rico_ch_call_history_page")

            # Step 5: Set Call Type filter to "All Call Types"
            print("[rico_ch] Setting Call Type to 'All Call Types'...")
            _set_call_type_filter(page)
            time.sleep(1)
            _debug_screenshot(page, "rico_ch_call_type_set")

            # Step 6: Set date range
            print(f"[rico_ch] Setting date range to {target_date}...")
            _set_date_range(page, target_date, target_date)
            time.sleep(2)
            _debug_screenshot(page, "rico_ch_date_set")

            # Step 7: Download the report
            print("[rico_ch] Triggering download...")
            download_path = _trigger_download(page)

            if download_path:
                print(f"[rico_ch] [OK] Downloaded: {download_path}")
            else:
                print("[rico_ch] [WARN] Download may not have completed")
                _debug_screenshot(page, "rico_ch_download_fail")

            return download_path

        except Exception as e:
            print(f"[rico_ch] Error: {e}")
            _debug_screenshot(page, "rico_ch_error")
            import traceback
            traceback.print_exc()
            return None
        finally:
            ctx.close()


# ---------------------------------------------------------------------------
# Login helpers
# ---------------------------------------------------------------------------

def _is_login_page(page) -> bool:
    """Check if we're on a Ricochet login page."""
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
    """
    Fill in Ricochet's login form.
    Ricochet uses: Org, Email, Password inputs.
    """
    # Try to find labeled inputs
    text_inputs = page.locator('input[type="text"]:visible, input[type="email"]:visible, input:not([type]):visible')
    pw_inputs = page.locator('input[type="password"]:visible')

    count = text_inputs.count()
    pw_count = pw_inputs.count()
    print(f"[rico_ch] Found {count} text inputs, {pw_count} password inputs")

    if count >= 2 and pw_count >= 1:
        # 3-field form: org, email, password
        text_inputs.nth(0).fill(org)
        text_inputs.nth(1).fill(username)
        pw_inputs.nth(0).fill(password)
    elif count >= 1 and pw_count >= 1:
        # 2-field form: email + password
        text_inputs.nth(0).fill(username)
        pw_inputs.nth(0).fill(password)
    else:
        # Fallback: fill all visible inputs
        all_inputs = page.locator("input:visible")
        vals = [org, username, password]
        for i in range(min(all_inputs.count(), 3)):
            try:
                all_inputs.nth(i).fill(vals[i])
            except Exception:
                pass

    # Click submit button
    submit = page.locator('button[type="submit"]:visible, input[type="submit"]:visible, button:has-text("Log In"):visible, button:has-text("Sign In"):visible')
    if submit.count() > 0:
        submit.first.click()
    else:
        pw_inputs.first.press("Enter")

    page.wait_for_load_state("domcontentloaded", timeout=DEFAULT_TIMEOUT_MS)
    time.sleep(3)


def _is_mfa_page(page) -> bool:
    """Check if we're on a verification/MFA code entry page."""
    url = page.url.lower()
    if "verify" in url or "mfa" in url or "code" in url or "auth" in url:
        return True

    # Check for text indicators
    try:
        body_text = page.locator("body").inner_text().lower()
        mfa_keywords = ["verification code", "enter code", "authentication code",
                        "enter the code", "verify your", "two-factor", "2fa"]
        for keyword in mfa_keywords:
            if keyword in body_text:
                return True
    except Exception:
        pass

    return False


def _handle_mfa(page, sender_filter: str, subject_filter: str) -> None:
    """
    Auto-handle email-based MFA by extracting code from Outlook.
    """
    # Add project root to path so we can import email_watcher
    import sys as _sys
    project_root = str(Path(__file__).resolve().parent.parent)
    if project_root not in _sys.path:
        _sys.path.insert(0, project_root)
    from src.email_watcher import get_recent_mfa_code

    code = get_recent_mfa_code(
        sender_filter=sender_filter,
        subject_filter=subject_filter,
        lookback_minutes=5,
        max_retries=12,
        retry_delay=5.0,
    )

    if not code:
        print("[rico_ch] [FAIL] Could not retrieve MFA code from Outlook")
        # Fallback: prompt the user
        code = input("[rico_ch] Enter the 6-digit verification code manually: ").strip()
        if not code:
            return

    # Find the verification code input field and fill it
    code_input = page.locator('input[type="text"]:visible, input[type="number"]:visible, input[type="tel"]:visible')
    if code_input.count() > 0:
        code_input.first.fill(code)
        time.sleep(0.5)

        # Click verify/submit button
        verify_btn = page.locator(
            'button:has-text("Verify"):visible, '
            'button:has-text("Submit"):visible, '
            'button:has-text("Continue"):visible, '
            'button[type="submit"]:visible'
        )
        if verify_btn.count() > 0:
            verify_btn.first.click()
        else:
            code_input.first.press("Enter")

        page.wait_for_load_state("domcontentloaded", timeout=DEFAULT_TIMEOUT_MS)
        time.sleep(3)
        print("[rico_ch] [OK] MFA code submitted")
    else:
        print("[rico_ch] [WARN] No code input field found on MFA page")


# ---------------------------------------------------------------------------
# Date range & download
# ---------------------------------------------------------------------------

def _set_call_type_filter(page) -> None:
    """
    Set the Call Type dropdown to 'All Call Types' on the Call History page.
    
    The Call History page has a dropdown/select for filtering by call type
    (Inbound, Outbound, Missed, etc.). We need 'All Call Types' or the
    equivalent 'all' option to get complete data.
    """
    try:
        # Strategy 1: Look for a <select> element with call type options
        selects = page.locator('select:visible')
        for i in range(selects.count()):
            sel = selects.nth(i)
            try:
                options_text = sel.inner_text().lower()
                if any(kw in options_text for kw in ["all call", "inbound", "outbound", "missed"]):
                    # Found the call type select — pick "All" or first option
                    options = sel.locator('option')
                    for j in range(options.count()):
                        opt_text = options.nth(j).inner_text().strip().lower()
                        opt_val = options.nth(j).get_attribute('value') or ''
                        if 'all' in opt_text or opt_val == '' or opt_val == 'all':
                            sel.select_option(index=j)
                            print(f"[rico_ch] [OK] Set call type to: {options.nth(j).inner_text().strip()}")
                            return
                    # If no 'all' option, select the first one
                    sel.select_option(index=0)
                    print(f"[rico_ch] [OK] Set call type to first option: {options.nth(0).inner_text().strip()}")
                    return
            except Exception:
                continue

        # Strategy 2: Look for a custom dropdown (div-based)
        # Find labels or spans containing "Call Type" and click the adjacent dropdown
        call_type_labels = page.locator(
            'label:has-text("Call Type"):visible, '
            'span:has-text("Call Type"):visible, '
            'div:has-text("Call Type"):visible'
        )
        if call_type_labels.count() > 0:
            # Click the label area to open the dropdown
            label = call_type_labels.first
            # Look for a sibling or nearby select/dropdown
            parent = label.locator('..') 
            dropdown = parent.locator('select, .dropdown-toggle, [data-toggle="dropdown"]')
            if dropdown.count() > 0:
                dropdown.first.click()
                time.sleep(1)
                # Look for "All" option
                all_opt = page.locator(
                    '.dropdown-menu li:has-text("All"):visible, '
                    '.dropdown-menu a:has-text("All"):visible'
                )
                if all_opt.count() > 0:
                    all_opt.first.click()
                    print("[rico_ch] [OK] Set call type to 'All' via custom dropdown")
                    return

        # Strategy 3: Try setting via jQuery/JS if it's a select2 or similar widget
        result = page.evaluate("""() => {
            // Look for select elements
            const selects = document.querySelectorAll('select');
            for (const sel of selects) {
                const opts = Array.from(sel.options).map(o => o.text.toLowerCase());
                if (opts.some(o => o.includes('inbound') || o.includes('outbound') || o.includes('call type'))) {
                    // Found call type select — set to first option (usually 'All')
                    sel.selectedIndex = 0;
                    sel.dispatchEvent(new Event('change', { bubbles: true }));
                    return 'Set to: ' + sel.options[0].text;
                }
            }
            return null;
        }""")
        if result:
            print(f"[rico_ch] [OK] {result}")
            return

        print("[rico_ch] [WARN] Could not find Call Type filter — may default to current selection")
    except Exception as e:
        print(f"[rico_ch] [WARN] Error setting call type filter: {e}")


def _set_date_range(page, start_date: str, end_date: str) -> None:
    """
    Set the date range on Ricochet Call History page.
    
    The page has a 'From/To:' input that's a daterangepicker. Clicking it opens
    a calendar popup with shortcuts (Today, Yesterday, etc.) and an Apply button.
    Format: MM/DD/YYYY HH:MM:SS AM - MM/DD/YYYY HH:MM:SS PM
    """
    start_obj = datetime.strptime(start_date, "%Y-%m-%d")
    end_obj = datetime.strptime(end_date, "%Y-%m-%d")
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday = today - timedelta(days=1)

    # Find the daterangepicker input
    drp_input = page.locator('input:visible').first  # fallback
    try:
        all_inputs = page.locator('input[type="text"]:visible')
        for i in range(all_inputs.count()):
            val = all_inputs.nth(i).input_value() or ""
            if "AM" in val and "PM" in val and "/" in val:
                drp_input = all_inputs.nth(i)
                print(f"[rico_ch] Found daterangepicker input: '{val[:50]}...'")
                break
    except Exception:
        pass

    drp_input.click()
    time.sleep(1)
    _debug_screenshot(page, "rico_ch_datepicker_open")

    # Check for shortcuts (Yesterday / Today)
    if start_date == end_date:
        if start_obj.date() == yesterday.date():
            try:
                yday = page.locator('li:has-text("Yesterday"):visible, button:has-text("Yesterday"):visible, a:has-text("Yesterday"):visible')
                if yday.count() > 0:
                    yday.first.click()
                    time.sleep(1)
                    print("[rico_ch] [OK] Selected 'Yesterday' shortcut")
                    _click_apply_on_picker(page)
                    _click_search(page)
                    return
            except Exception:
                pass

        if start_obj.date() == today.date():
            try:
                tday = page.locator('li:has-text("Today"):visible, button:has-text("Today"):visible, a:has-text("Today"):visible')
                if tday.count() > 0:
                    tday.first.click()
                    time.sleep(1)
                    print("[rico_ch] [OK] Selected 'Today' shortcut")
                    _click_apply_on_picker(page)
                    _click_search(page)
                    return
            except Exception:
                pass

    # For any date: set via the daterangepicker left/right calendar inputs
    # The picker has two sets of inputs: left (start) and right (end) calendars
    # with individual month/day/year/hour fields, OR a combined input.
    start_display = start_obj.strftime("%m/%d/%Y") + " 12:00:00 AM"
    end_display = end_obj.strftime("%m/%d/%Y") + " 11:59:59 PM"
    new_value = f"{start_display} - {end_display}"

    # Try the jQuery daterangepicker API first (most reliable)
    try:
        api_result = page.evaluate(f"""() => {{
            // Method 1: jQuery daterangepicker API
            if (typeof $ !== 'undefined' || typeof jQuery !== 'undefined') {{
                const jq = $ || jQuery;
                const drpInput = jq('input').filter(function() {{
                    return this.value && this.value.includes('AM') && this.value.includes('PM');
                }}).first();
                if (drpInput.length && drpInput.data('daterangepicker')) {{
                    const drp = drpInput.data('daterangepicker');
                    const moment = window.moment;
                    if (moment) {{
                        drp.setStartDate(moment('{start_date}', 'YYYY-MM-DD').startOf('day'));
                        drp.setEndDate(moment('{end_date}', 'YYYY-MM-DD').endOf('day'));
                        drpInput.trigger('apply.daterangepicker', drp);
                        return 'API_SET';
                    }}
                }}
            }}
            return null;
        }}""")
        if api_result == 'API_SET':
            print(f"[rico_ch] [OK] Set date range via daterangepicker API: {start_date}")
            _click_apply_on_picker(page)
            _click_search(page)
            return
    except Exception:
        pass

    # Fallback: manually type into the left/right calendar inputs
    try:
        # Try to find and fill the left (start) and right (end) calendar inputs
        left_inputs = page.locator('.daterangepicker .left input:visible, .calendar.left input:visible')
        right_inputs = page.locator('.daterangepicker .right input:visible, .calendar.right input:visible')
        
        if left_inputs.count() > 0 and right_inputs.count() > 0:
            left_inputs.first.fill(start_display)
            right_inputs.first.fill(end_display)
            print(f"[rico_ch] [OK] Filled calendar inputs: {start_display} / {end_display}")
            _click_apply_on_picker(page)
            _click_search(page)
            return
    except Exception:
        pass

    # Last resort: directly set the input value via JS
    try:
        page.evaluate(f"""() => {{
            const inputs = document.querySelectorAll('input[type="text"]');
            for (const inp of inputs) {{
                if (inp.value.includes('AM') && inp.value.includes('PM')) {{
                    inp.value = '{new_value}';
                    inp.dispatchEvent(new Event('change', {{ bubbles: true }}));
                    inp.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    return true;
                }}
            }}
            return false;
        }}""")
        print(f"[rico_ch] [OK] Set date range to: {new_value}")
    except Exception as e:
        print(f"[rico_ch] Error setting date: {e}")

    # Close the picker if it's still open
    try:
        apply = page.locator('button:has-text("Apply"):visible, .applyBtn:visible')
        if apply.count() > 0:
            apply.first.click()
            time.sleep(1)
    except Exception:
        pass

    _click_search(page)


def _click_apply_on_picker(page) -> None:
    """Click Apply on the daterangepicker."""
    try:
        apply = page.locator('button:has-text("Apply"):visible, .applyBtn:visible')
        if apply.count() > 0:
            apply.first.click()
            time.sleep(1)
            print("[rico_ch] [OK] Clicked Apply on date picker")
    except Exception:
        pass


def _click_search(page) -> None:
    """Click the Search button to reload results with new date range."""
    try:
        search = page.locator('button:has-text("Search"):visible, a:has-text("Search"):visible')
        if search.count() > 0:
            search.first.click()
            time.sleep(5)  # Give time for results to load
            print("[rico_ch] [OK] Clicked Search button")
            return
    except Exception:
        pass
    print("[rico_ch] [WARN] No Search button found")


def _trigger_download(page) -> str | None:
    """
    Click the Export button, then click "Export Data Only" in the modal.
    Ricochet emails the ZIP rather than browser-downloading it, so we
    just trigger the export and return a sentinel value.
    """
    # Step 1: Click the Export button to open the modal
    export_btn = page.locator('a:has-text("Export"):visible, button:has-text("Export"):visible')
    if export_btn.count() == 0:
        print("[rico_ch] [WARN] No Export button found")
        _debug_screenshot(page, "rico_ch_no_export_btn")
        return None

    print("[rico_ch] Clicking Export button to open modal...")
    export_btn.first.click()
    time.sleep(2)
    _debug_screenshot(page, "rico_ch_export_modal")

    # Step 2: Click "Export Data Only" in the modal
    export_data_btn = page.locator(
        'button:has-text("Export Data Only"):visible, '
        'a:has-text("Export Data Only"):visible'
    )
    if export_data_btn.count() == 0:
        print("[rico_ch] [WARN] 'Export Data Only' button not found in modal")
        _debug_screenshot(page, "rico_ch_modal_no_export_data")
        return None

    print("[rico_ch] Clicking 'Export Data Only'...")
    export_data_btn.first.click()
    time.sleep(3)
    _debug_screenshot(page, "rico_ch_after_export_click")

    # The ZIP will be emailed — return a sentinel indicating export was triggered
    print("[rico_ch] [OK] Export triggered — ZIP will be emailed to your inbox")
    return "EXPORT_TRIGGERED"


def retrieve_ch_from_email(
    config: dict,
    save_to: str | None = None,
    max_retries: int = 20,
    retry_delay: float = 30.0,
) -> str | None:
    """
    Poll Outlook for the Ricochet Call History ZIP email.
    Called after the export has been triggered and some time has passed.

    Returns the path to the saved ZIP, or None.
    """
    import sys as _sys
    project_root = str(Path(__file__).resolve().parent.parent)
    if project_root not in _sys.path:
        _sys.path.insert(0, project_root)
    from src.email_watcher import fetch_source_attachments

    if save_to is None:
        save_to = config.get("email_sources", {}).get("rico_ch", {}).get(
            "downloads_folder", "C:/Users/scag3s29/Downloads"
        )

    # Use the existing email_watcher to fetch the CH attachment
    # We need a config entry for rico_ch email source
    ch_email_config = {
        "sender_filter": "ricochet",
        "subject_filter": "call history",
        "folder": "Inbox",
        "lookback_days": 1,
    }

    import win32com.client
    import pythoncom
    import re

    for attempt in range(1, max_retries + 1):
        print(f"[rico_ch] Checking Outlook for CH export email (attempt {attempt}/{max_retries})...")
        pythoncom.CoInitialize()
        try:
            outlook = win32com.client.DispatchEx("Outlook.Application")
            namespace = outlook.GetNamespace("MAPI")
            inbox = namespace.GetDefaultFolder(6)  # Inbox

            cutoff = datetime.now() - timedelta(hours=2)
            cutoff_str = cutoff.strftime("%m/%d/%Y %H:%M %p")

            items = inbox.Items
            items.Sort("[ReceivedTime]", True)
            filtered = items.Restrict(f"[ReceivedTime] >= '{cutoff_str}'")

            for item in filtered:
                try:
                    subject = (getattr(item, "Subject", "") or "").lower()
                    sender = (getattr(item, "SenderEmailAddress", "") or "").lower()

                    if "call history" not in subject and "call-history" not in subject:
                        continue

                    if item.Attachments.Count == 0:
                        continue

                    # Found a matching email with attachments
                    for j in range(1, item.Attachments.Count + 1):
                        att = item.Attachments.Item(j)
                        fname = att.FileName
                        if fname.lower().endswith(".zip"):
                            out_path = Path(save_to) / fname
                            att.SaveAsFile(str(out_path))
                            print(f"[rico_ch] [OK] Saved CH ZIP from email: {out_path}")
                            return str(out_path)
                except Exception:
                    continue

        except Exception as e:
            print(f"[rico_ch] Outlook error: {e}")
        finally:
            pythoncom.CoUninitialize()

        if attempt < max_retries:
            print(f"[rico_ch] CH email not found yet, waiting {retry_delay}s...")
            time.sleep(retry_delay)

    print("[rico_ch] [WARN] CH export email not found after all retries")
    return None


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def _dump_nav_links(page) -> None:
    """Dump all navigation links on the page for debugging."""
    try:
        links = page.locator("a:visible")
        count = links.count()
        print(f"[rico_ch] Found {count} visible links:")
        for i in range(min(count, 30)):
            try:
                text = links.nth(i).inner_text().strip().replace("\n", " ")[:60]
                href = links.nth(i).get_attribute("href") or ""
                print(f"  Link {i}: text='{text}' href='{href}'")
            except Exception:
                pass
    except Exception as e:
        print(f"[rico_ch] Error dumping links: {e}")


def _debug_screenshot(page, label: str) -> None:
    """Save a debug screenshot."""
    try:
        ts = int(time.time())
        path = Path("data") / f"{label}_{ts}.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(path))
        print(f"[rico_ch] Screenshot saved: {path}")
    except Exception:
        pass


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    config_path = Path("config/config.json")
    if not config_path.exists():
        print(f"Config not found at {config_path}")
        sys.exit(1)

    with open(config_path) as f:
        config = json.load(f)

    target = sys.argv[1] if len(sys.argv) > 1 else None

    result = download_rico_call_history(config, target_date=target)
    if result:
        print(f"\n[OK] Success: {result}")
    else:
        print("\n[FAIL] Download failed")
        sys.exit(1)
