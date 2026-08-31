"""
rico_leads_downloader.py — Auto-download the Ricochet LeadSwami Report.

Uses Playwright with a persistent Edge profile so login survives between runs.
Includes automatic recovery for browser downloads.
"""

from __future__ import annotations

import json
import shutil
import time
import os
from datetime import datetime, timedelta
from pathlib import Path


DEFAULT_TIMEOUT_MS = 45_000
DOWNLOAD_TIMEOUT_MS = 180_000  # large file, give it time


def download_rico_leads(
    config: dict | str,
    target_date: str | None = None,
    headless: bool = False,
    save_to: str | None = None,
) -> str | None:
    if isinstance(config, str):
        with open(config, "r", encoding="utf-8") as f:
            config = json.load(f)

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("[rico_leads_downloader] Playwright not installed. Run: pip install playwright && playwright install msedge")
        return None

    rico = config.get("ricochet", {})
    if not rico:
        print("[rico_leads_downloader] No 'ricochet' section in config.json")
        return None

    reports_url = rico.get("reports_url", "https://admin-allstate-mt3.ricochet.me/alsop/reports")
    username    = rico.get("username")
    password    = rico.get("password")
    org         = rico.get("org", "Alsop")
    profile_dir = Path(rico.get("profile_dir", config.get("playwright_profile_dir", "data/playwright_profile"))).resolve()

    if not username or not password:
        raise ValueError("Ricochet credentials (username/password) are not set in config/config.json")

    if save_to is None:
        save_to = config.get("downloads_folder", "C:/Users/phoeb/Downloads")

    profile_dir.mkdir(parents=True, exist_ok=True)
    Path(save_to).mkdir(parents=True, exist_ok=True)

    print(f"[rico_leads_downloader] Starting browser automation for LeadSwami snapshot...")

    with sync_playwright() as p:
        ctx = None
        browser_obj = None

        # 1. Try launching persistent Edge context
        try:
            ctx = p.chromium.launch_persistent_context(
                user_data_dir=str(profile_dir),
                channel="msedge",
                headless=headless,
                accept_downloads=True,
                viewport={"width": 1400, "height": 900},
            )
            print("[rico_leads_downloader] Launched persistent Edge context.")
        except Exception as e1:
            print(f"[rico_leads_downloader] Persistent Edge unavailable ({e1}). Trying bundled Chromium...")
            try:
                # 2. Try launching bundled Chromium with persistent context
                ctx = p.chromium.launch_persistent_context(
                    user_data_dir=str(profile_dir),
                    headless=headless,
                    accept_downloads=True,
                    viewport={"width": 1400, "height": 900},
                )
                print("[rico_leads_downloader] Launched persistent Chromium context.")
            except Exception as e2:
                print(f"[rico_leads_downloader] Profile directory locked ({e2}). Launching fresh non-persistent session...")
                # 3. Fall back to standard browser
                try:
                    browser_obj = p.chromium.launch(channel="msedge", headless=headless)
                except Exception:
                    browser_obj = p.chromium.launch(headless=headless)
                ctx = browser_obj.new_context(
                    accept_downloads=True,
                    viewport={"width": 1400, "height": 900},
                )
                print("[rico_leads_downloader] Launched fresh browser session.")

        page = ctx.new_page()
        page.set_default_timeout(DEFAULT_TIMEOUT_MS)

        try:
            print(f"[rico_leads_downloader] Navigating to {reports_url}")
            page.goto(reports_url, wait_until="domcontentloaded")
            time.sleep(2)

            if _is_login_page(page):
                print("[rico_leads_downloader] Login page detected — signing in...")
                _perform_login(page, org, username, password)
                if "reports" not in page.url.lower():
                    page.goto(reports_url, wait_until="domcontentloaded")
                time.sleep(2)
            else:
                print("[rico_leads_downloader] Already signed in (reusing session)")

            print("[rico_leads_downloader] Waiting for reports table...")
            try:
                page.wait_for_load_state("networkidle", timeout=DEFAULT_TIMEOUT_MS)
            except Exception:
                pass
            time.sleep(2)

            download_path = _click_newest_download(page, save_to, target_date)

            if not download_path:
                # Check fallback in downloads folder
                recent = sorted(Path(save_to).glob("leads_report_*.csv"), key=lambda f: f.stat().st_mtime, reverse=True)
                if recent and (time.time() - recent[0].stat().st_mtime) < 300 and recent[0].stat().st_size > 100_000:
                    download_path = str(recent[0])
                    print(f"[rico_leads_downloader] Recovered recently downloaded file from folder: {download_path}")

            if download_path:
                print(f"[rico_leads_downloader] Downloaded: {download_path}")
            else:
                print("[rico_leads_downloader] Download button click did not produce a file.")

            return download_path

        except Exception as e:
            print(f"[rico_leads_downloader] Error: {e}")
            recent = sorted(Path(save_to).glob("leads_report_*.csv"), key=lambda f: f.stat().st_mtime, reverse=True)
            if recent and (time.time() - recent[0].stat().st_mtime) < 300 and recent[0].stat().st_size > 100_000:
                recovered = str(recent[0])
                print(f"[rico_leads_downloader] Recovered recent download from disk after error: {recovered}")
                return recovered
            return None
        finally:
            try:
                ctx.close()
            except Exception:
                pass
            if browser_obj:
                try:
                    browser_obj.close()
                except Exception:
                    pass


def _is_login_page(page) -> bool:
    url = page.url.lower()
    if "login" in url or "signin" in url or "sign_in" in url:
        return True
    try:
        if page.locator('input[type="password"]').count() > 0:
            return True
    except Exception:
        pass
    return False


def _perform_login(page, org: str, username: str, password: str) -> None:
    inputs = page.locator("input:visible")
    count  = inputs.count()
    print(f"[rico_leads_downloader] Found {count} visible inputs")

    text_inputs = page.locator('input[type="text"]:visible, input[type="email"]:visible, input:not([type]):visible')
    pw_inputs   = page.locator('input[type="password"]:visible')

    if text_inputs.count() >= 2 and pw_inputs.count() >= 1:
        text_inputs.nth(0).fill(org)
        text_inputs.nth(1).fill(username)
        pw_inputs.nth(0).fill(password)
    elif text_inputs.count() >= 1 and pw_inputs.count() >= 1:
        text_inputs.nth(0).fill(username)
        pw_inputs.nth(0).fill(password)
    else:
        vals = [org, username, password]
        for i in range(min(count, 3)):
            try:
                inputs.nth(i).fill(vals[i])
            except Exception:
                pass

    submit_btn = page.locator('button[type="submit"], input[type="submit"]').first
    if submit_btn.count() > 0:
        submit_btn.click()
    else:
        pw_inputs.nth(0).press("Enter")

    try:
        page.wait_for_load_state("domcontentloaded", timeout=DEFAULT_TIMEOUT_MS)
    except Exception:
        pass
    time.sleep(2)


def _click_newest_download(page, save_to: str, target_date: str | None = None) -> str | None:
    print("[rico_leads_downloader] Expanding 'Leads Report' card...")
    try:
        leads_toolbar = page.locator('text="Leads Report"').first
        if leads_toolbar.count() > 0:
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

        target_row = None
        if target_date:
            snapshot_date = datetime.strptime(target_date, "%Y-%m-%d") + timedelta(days=1)
            date_needle = snapshot_date.strftime("%b %#d") if hasattr(snapshot_date, "strftime") else snapshot_date.strftime("%b %d").replace(" 0", " ")
            date_needle_padded = snapshot_date.strftime("%b %d")
            print(f"[rico_leads_downloader] Looking for snapshot dated '{date_needle}' (report_date={target_date} + 1 day)")

            for i in range(row_count):
                row_text = rows.nth(i).inner_text()
                if date_needle in row_text or date_needle_padded in row_text:
                    target_row = rows.nth(i)
                    print(f"[rico_leads_downloader] [OK] Matched row {i}: {row_text.strip().replace(chr(10), ' | ')[:120]}")
                    break

            if target_row is None:
                print(f"[rico_leads_downloader] [WARN] No row matching '{date_needle}' found — falling back to newest")

        if target_row is None:
            target_row = rows.first
            row_text = target_row.inner_text().strip().replace("\n", " | ")[:120]
            print(f"[rico_leads_downloader] Using newest row: {row_text}")

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

            try:
                with page.expect_download(timeout=DOWNLOAD_TIMEOUT_MS) as dl_info:
                    download_btn.click()

                download = dl_info.value
                result_path = _save_download(download, save_to)
                print(f"[rico_leads_downloader] [OK] Download complete: {result_path}")
                return result_path
            except Exception as dl_err:
                print(f"[rico_leads_downloader] Warning during expect_download: {dl_err}")
                time.sleep(3)
                recent = sorted(Path(save_to).glob("leads_report_*.csv"), key=lambda f: f.stat().st_mtime, reverse=True)
                if recent and (time.time() - recent[0].stat().st_mtime) < 300 and recent[0].stat().st_size > 100_000:
                    print(f"[rico_leads_downloader] Successfully found downloaded file on disk: {recent[0]}")
                    return str(recent[0])
                raise dl_err
        else:
            print(f"[rico_leads_downloader] [WARN] Expected >=3 buttons but found {btn_count}")
            _debug_screenshot(page, "rico_leads_wrong_btn_count")
            return None

    except Exception as e:
        print(f"[rico_leads_downloader] Error during download: {e}")
        _debug_screenshot(page, "rico_leads_download_error")
        return None


def _debug_screenshot(page, label: str) -> None:
    try:
        ts = int(time.time())
        path = Path("data") / f"{label}_{ts}.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(path))
    except Exception:
        pass


def _save_download(download, save_to: str) -> str:
    suggested = download.suggested_filename or f"leads_report_{int(time.time())}.csv"
    target = Path(save_to) / suggested
    try:
        download.save_as(str(target))
        return str(target)
    except Exception as e:
        print(f"[rico_leads_downloader] save_as exception ({e}), checking fallback...")
        if target.exists() and target.stat().st_size > 100_000:
            return str(target)
        try:
            dl_path = download.path()
            if dl_path and Path(dl_path).exists():
                shutil.copy2(dl_path, str(target))
                return str(target)
        except Exception:
            pass
        recent = sorted(Path(save_to).glob("leads_report_*.csv"), key=lambda f: f.stat().st_mtime, reverse=True)
        if recent and (time.time() - recent[0].stat().st_mtime) < 300 and recent[0].stat().st_size > 100_000:
            return str(recent[0])
        raise
