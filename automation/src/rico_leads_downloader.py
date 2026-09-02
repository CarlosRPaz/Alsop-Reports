"""
rico_leads_downloader.py — Auto-download the Ricochet LeadSwami Report.

Uses Playwright to navigate to the Ricochet reports page and performs a direct,
authenticated download of the LeadSwami snapshot CSV.
"""

from __future__ import annotations

import json
import time
import os
from datetime import datetime, timedelta
from pathlib import Path


DEFAULT_TIMEOUT_MS = 45_000


def download_rico_leads(
    config: dict | str,
    target_date: str | None = None,
    headless: bool = True,
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

    if not username or not password:
        raise ValueError("Ricochet credentials (username/password) are not set in config/config.json")

    if save_to is None:
        save_to = config.get("downloads_folder", "C:/Users/phoeb/Downloads")

    Path(save_to).mkdir(parents=True, exist_ok=True)

    print(f"[rico_leads_downloader] Starting automated fetch for LeadSwami snapshot...")

    with sync_playwright() as p:
        browser = None
        try:
            browser = p.chromium.launch(channel="msedge", headless=headless)
        except Exception as e:
            print(f"[rico_leads_downloader] Could not launch msedge ({e}), launching bundled chromium...")
            browser = p.chromium.launch(headless=headless)

        ctx = browser.new_context(accept_downloads=True, viewport={"width": 1400, "height": 900})
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
                print("[rico_leads_downloader] Already signed in")

            print("[rico_leads_downloader] Waiting for reports table...")
            try:
                page.wait_for_load_state("networkidle", timeout=DEFAULT_TIMEOUT_MS)
            except Exception:
                pass
            time.sleep(2)

            # Expand Leads Report Card
            _expand_leads_card(page)

            # Find matching LeadSwami Report row
            target_row = _find_target_row(page, target_date)
            if not target_row:
                print("[rico_leads_downloader] No LeadSwami Report rows available.")
                return None

            # Extract direct download link href
            link_el = target_row.locator("a[href*='download']").first
            href = None
            if link_el.count() > 0:
                href = link_el.get_attribute("href")

            if not href:
                all_links = target_row.locator("a").all()
                for l in all_links:
                    h = l.get_attribute("href")
                    if h and ("download" in h.lower() or "report" in h.lower()):
                        href = h
                        break

            if not href:
                raise ValueError("Could not find download URL in LeadSwami row.")

            # Resolve full download URL
            if href.startswith("http"):
                download_url = href
            elif href.startswith("/"):
                download_url = "https://admin-allstate-mt3.ricochet.me" + href
            else:
                download_url = "https://admin-allstate-mt3.ricochet.me/alsop/" + href

            print(f"[rico_leads_downloader] Downloading LeadSwami CSV directly via authenticated stream...")
            t0 = time.time()
            resp = page.request.get(download_url, timeout=120000)
            if resp.status != 200:
                raise RuntimeError(f"HTTP download failed with status {resp.status}")

            filename = f"leads_report_{int(time.time())}.csv"
            if "name=" in download_url:
                filename = download_url.split("name=")[1].split("&")[0]

            save_file = Path(save_to) / filename
            data_bytes = resp.body()
            if len(data_bytes) < 1000:
                raise RuntimeError("Downloaded file is too small or invalid.")

            save_file.write_bytes(data_bytes)
            print(f"[rico_leads_downloader] [OK] Successfully saved {len(data_bytes):,} bytes to {save_file} in {time.time() - t0:.2f}s")
            return str(save_file)

        except Exception as e:
            print(f"[rico_leads_downloader] Error during download: {e}")
            return None
        finally:
            try:
                browser.close()
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


def _expand_leads_card(page) -> None:
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


def _find_target_row(page, target_date: str | None = None):
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

        return target_row
    except Exception as e:
        print(f"[rico_leads_downloader] Error finding target row: {e}")
        return None
