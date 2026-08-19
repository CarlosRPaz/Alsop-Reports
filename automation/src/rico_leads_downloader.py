"""
rico_leads_downloader.py — Auto-download the Ricochet LeadSwami Report.

Uses Playwright with a persistent Edge profile so login survives between runs.
First run: logs in with creds from config.json.
Subsequent runs: session cookies reused, no login prompt.

Usage:
    from src.rico_leads_downloader import download_rico_leads
    path = download_rico_leads(config)  # returns path to downloaded CSV
"""

from __future__ import annotations

import json
import shutil
import time
from datetime import datetime, timedelta
from pathlib import Path


DEFAULT_TIMEOUT_MS = 30_000
DOWNLOAD_TIMEOUT_MS = 120_000  # large file, give it time


def download_rico_leads(
    config: dict,
    headless: bool = False,
    save_to: str | None = None,
    target_date: str | None = None,
) -> str | None:
    """
    Launch Edge via Playwright, navigate to the Ricochet reports page,
    and download the correct LeadSwami Report CSV.

    Date logic: LeadSwami snapshots run at midnight, so the snapshot for
    report_date (e.g. June 4th) is the row dated the NEXT day (June 5th).
    If target_date is provided, we look for the row dated target_date + 1 day.
    If not provided, we grab the newest row.

    Parameters
    ----------
    config : dict
        Loaded config.json.
    headless : bool
        Run headless. Default False so user can see what's happening and
        handle MFA/CAPTCHA if it ever surfaces.
    save_to : str | None
        Override download folder. Defaults to config's rico_leads downloads_folder.

    Returns
    -------
    str | None : Path to downloaded file, or None on failure.
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("[rico_leads_downloader] Playwright not installed. Run: pip install playwright && playwright install msedge")
        return None

    rico = config.get("ricochet", {})
    if not rico:
        print("[rico_leads_downloader] No 'ricochet' section in config.json")
        return None

    reports_url = rico.get("reports_url")
    username    = rico.get("username")
    password    = rico.get("password")
    org         = rico.get("org", "")
    profile_dir = Path(rico.get("profile_dir", "data/playwright_profile")).resolve()

    if save_to is None:
        save_to = config.get("email_sources", {}).get("rico_leads", {}).get(
            "downloads_folder", "C:/Users/scag3s29/Downloads"
        )

    profile_dir.mkdir(parents=True, exist_ok=True)
    Path(save_to).mkdir(parents=True, exist_ok=True)

    print(f"[rico_leads_downloader] Launching Edge (profile: {profile_dir.name})...")

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
            print(f"[rico_leads_downloader] Navigating to {reports_url}")
            page.goto(reports_url, wait_until="domcontentloaded")
            time.sleep(2)

            # If we got redirected to a login screen, log in.
            if _is_login_page(page):
                print("[rico_leads_downloader] Login page detected — signing in...")
                _perform_login(page, org, username, password)
                # Navigate back to reports if not already there
                if "reports" not in page.url.lower():
                    page.goto(reports_url, wait_until="domcontentloaded")
                time.sleep(2)
            else:
                print("[rico_leads_downloader] Already signed in (reusing profile session)")

            # Wait for the reports table to render
            print("[rico_leads_downloader] Waiting for reports table...")
            page.wait_for_load_state("networkidle", timeout=DEFAULT_TIMEOUT_MS)
            time.sleep(1.5)

            # Click the download button on the matching row
            download_path = _click_newest_download(page, save_to, target_date)

            if download_path:
                print(f"[rico_leads_downloader] Downloaded: {download_path}")
            else:
                print("[rico_leads_downloader] Download button click did not produce a file.")

            return download_path

        except Exception as e:
            print(f"[rico_leads_downloader] Error: {e}")
            try:
                # Screenshot for debugging
                shot = Path("data") / f"rico_leads_error_{int(time.time())}.png"
                shot.parent.mkdir(parents=True, exist_ok=True)
                page.screenshot(path=str(shot))
                print(f"[rico_leads_downloader] Saved debug screenshot to {shot}")
            except Exception:
                pass
            return None
        finally:
            ctx.close()


def _is_login_page(page) -> bool:
    """Heuristic: look for common login field indicators."""
    url = page.url.lower()
    if "login" in url or "signin" in url or "sign_in" in url:
        return True
    # Check for password input
    try:
        if page.locator('input[type="password"]').count() > 0:
            return True
    except Exception:
        pass
    return False


def _perform_login(page, org: str, username: str, password: str) -> None:
    """
    Fill in Ricochet's 3-input login form.
    Input 1: Org, Input 2: Username (email), Input 3: Password.
    """
    inputs = page.locator("input:visible")
    count  = inputs.count()
    print(f"[rico_leads_downloader] Found {count} visible inputs")

    # Common case: 3 inputs — org, username, password
    text_inputs = page.locator('input[type="text"]:visible, input[type="email"]:visible, input:not([type]):visible')
    pw_inputs   = page.locator('input[type="password"]:visible')

    if text_inputs.count() >= 2 and pw_inputs.count() >= 1:
        text_inputs.nth(0).fill(org)
        text_inputs.nth(1).fill(username)
        pw_inputs.nth(0).fill(password)
    elif text_inputs.count() >= 1 and pw_inputs.count() >= 1:
        # Only 2 inputs — some login flows combine/skip org
        text_inputs.nth(0).fill(username)
        pw_inputs.nth(0).fill(password)
    else:
        # Fallback: fill all visible inputs in order
        vals = [org, username, password]
        for i in range(min(count, 3)):
            try:
                inputs.nth(i).fill(vals[i])
            except Exception:
                pass

    # Submit
    submit_btn = page.locator('button[type="submit"], input[type="submit"]').first
    if submit_btn.count() > 0:
        submit_btn.click()
    else:
        # Fallback: press Enter on the password field
        pw_inputs.nth(0).press("Enter")

    page.wait_for_load_state("domcontentloaded", timeout=DEFAULT_TIMEOUT_MS)
    time.sleep(2)


def _click_newest_download(page, save_to: str, target_date: str | None = None) -> str | None:
    """
    Expand the Leads Report card, find the correct LeadSwami Report row,
    and click its download button (3rd action button in the row).

    Date logic:
      LeadSwami snapshots run at ~midnight. The snapshot for a given
      report_date (e.g. June 4) is the row dated the NEXT day (June 5).
      If target_date is provided, we look for the row containing
      "Jun 5" (target_date + 1 day). If no match, fall back to newest.

    The Ricochet Reports page has collapsible blue cards (Vuetify toolbars).
    The "Leads Report" card expands to show a v-data-table with rows like:
        Report          | Date                      | Results | [edit] [refresh] [download] [delete]
        LeadSwami Report| Fri, Jun 5, 2026 12:05 AM | 83544   |   ✏️      🔄        ⬇️         🗑️

    The download button is the 3rd `button.table-btn` in each row.
    """
    # Step 1: Expand the "Leads Report" card
    print("[rico_leads_downloader] Expanding 'Leads Report' card...")
    try:
        leads_toolbar = page.locator('text="Leads Report"').first
        if leads_toolbar:
            parent = leads_toolbar.locator(
                "xpath=ancestor::*[contains(@class, 'toolbar-container') or contains(@class, 'feature-section')]"
            ).first
            expand_btn = parent.locator("button").first
            if expand_btn.count() > 0:
                expand_btn.click()
                time.sleep(3)
                print("[rico_leads_downloader] [OK] Expanded Leads Report card")
            else:
                leads_toolbar.click()
                time.sleep(3)
    except Exception as e:
        print(f"[rico_leads_downloader] Error expanding card: {e}")

    _debug_screenshot(page, "rico_leads_expanded")

    # Step 2: Find LeadSwami Report rows
    print("[rico_leads_downloader] Looking for LeadSwami Report rows...")
    try:
        rows = page.locator('tr:has-text("LeadSwami Report"):visible')
        row_count = rows.count()
        print(f"[rico_leads_downloader] Found {row_count} LeadSwami Report rows")

        if row_count == 0:
            time.sleep(3)
            rows = page.locator('tr:has-text("LeadSwami Report"):visible')
            row_count = rows.count()
            print(f"[rico_leads_downloader] After extra wait: {row_count} rows")

        if row_count == 0:
            print("[rico_leads_downloader] [WARN] No LeadSwami Report rows found")
            _debug_screenshot(page, "rico_leads_no_rows")
            return None

        # Step 2b: Pick the correct row based on target_date
        # Snapshot for report_date X is the row dated X+1
        target_row = None
        if target_date:
            snapshot_date = datetime.strptime(target_date, "%Y-%m-%d") + timedelta(days=1)
            # The date column shows e.g. "Thu, Jun 5, 2026 12:05 AM"
            # Match on "Mon, Jun 5" pattern — use abbreviated month + day
            date_needle = snapshot_date.strftime("%b %#d")  # e.g. "Jun 5" (Windows # removes leading zero)
            # Also try with leading zero for compatibility
            date_needle_padded = snapshot_date.strftime("%b %d")  # e.g. "Jun 05"
            print(f"[rico_leads_downloader] Looking for snapshot dated '{date_needle}' (report_date={target_date} + 1 day)")

            for i in range(row_count):
                row_text = rows.nth(i).inner_text()
                if date_needle in row_text or date_needle_padded in row_text:
                    target_row = rows.nth(i)
                    print(f"[rico_leads_downloader] [OK] Matched row {i}: {row_text.strip().replace(chr(10), ' | ')[:120]}")
                    break

            if target_row is None:
                print(f"[rico_leads_downloader] [WARN] No row matching '{date_needle}' found — falling back to newest")

        # Fall back to the first (newest) row
        if target_row is None:
            target_row = rows.first
            row_text = target_row.inner_text().strip().replace("\n", " | ")[:120]
            print(f"[rico_leads_downloader] Using newest row: {row_text}")

        # Step 3: Click the download button (3rd action button)
        action_btns = target_row.locator("button.table-btn")
        btn_count = action_btns.count()
        print(f"[rico_leads_downloader] Found {btn_count} action buttons in row")

        if btn_count < 3:
            action_btns = target_row.locator("button")
            btn_count = action_btns.count()
            print(f"[rico_leads_downloader] Fallback: {btn_count} total buttons in row")

        if btn_count >= 3:
            download_btn = action_btns.nth(2)
            print("[rico_leads_downloader] Clicking download button (3rd action button)...")

            with page.expect_download(timeout=DOWNLOAD_TIMEOUT_MS) as dl_info:
                download_btn.click()

            download = dl_info.value
            result_path = _save_download(download, save_to)
            print(f"[rico_leads_downloader] [OK] Download complete: {result_path}")
            return result_path
        else:
            print(f"[rico_leads_downloader] [WARN] Expected >=3 buttons but found {btn_count}")
            _debug_screenshot(page, "rico_leads_wrong_btn_count")
            return None

    except Exception as e:
        print(f"[rico_leads_downloader] Error during download: {e}")
        _debug_screenshot(page, "rico_leads_download_error")
        return None


def _debug_screenshot(page, label: str) -> None:
    """Save a debug screenshot."""
    try:
        ts = int(time.time())
        path = Path("data") / f"{label}_{ts}.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(path))
        print(f"[rico_leads_downloader] Screenshot: {path}")
    except Exception:
        pass


def _save_download(download, save_to: str) -> str:
    """Save the download to the target folder, keeping the suggested filename."""
    suggested = download.suggested_filename or f"leads_report_{int(time.time())}.csv"
    target = Path(save_to) / suggested
    download.save_as(str(target))
    return str(target)
