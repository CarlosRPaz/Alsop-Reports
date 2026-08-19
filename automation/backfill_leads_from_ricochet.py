"""
backfill_leads_from_ricochet.py — Bulk-download missing LeadSwami Reports from
Ricochet and push them to Supabase.

Opens one Playwright browser session, navigates to the Ricochet Reports page,
and downloads the LeadSwami Report CSV for each missing date. Then parses each
CSV and upserts the leads data into the leads_snapshot table.

Usage:
    python backfill_leads_from_ricochet.py              # Download + push all missing
    python backfill_leads_from_ricochet.py --dry-run    # Preview missing dates only
    python backfill_leads_from_ricochet.py --parse-only # Skip download, just parse existing CSVs
"""

import os
import sys
import json
import argparse
import time
import math
import requests
import pandas as pd
import warnings
from datetime import date, datetime, timedelta
from pathlib import Path

warnings.filterwarnings("ignore")
sys.stdout.reconfigure(encoding="utf-8")

DOWNLOAD_DIR = Path("data/leads_backfill")
BATCH_SIZE = 50
DEFAULT_TIMEOUT_MS = 30_000
DOWNLOAD_TIMEOUT_MS = 120_000


def load_config():
    with open("config/config.json") as f:
        return json.load(f)


def get_missing_dates(config):
    """Query Supabase to find dates with no leads data."""
    url = config["supabase"]["url"]
    key = config["supabase"]["key"]
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}

    # Get all existing leads_snapshot rows
    all_leads = []
    offset = 0
    while True:
        r = requests.get(
            f"{url}/rest/v1/leads_snapshot?select=report_date,contact,quoted,hot,xsale"
            f"&report_date=gte.2026-01-01&report_date=lte.2026-06-11&offset={offset}&limit=1000",
            headers=headers
        )
        batch = r.json()
        if not batch:
            break
        all_leads.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000

    # Dates with non-zero data
    dates_with_data = set()
    dates_with_any = set()
    for row in all_leads:
        dates_with_any.add(row["report_date"])
        if any((row.get(k, 0) or 0) > 0 for k in ("contact", "quoted", "hot", "xsale")):
            dates_with_data.add(row["report_date"])

    # All calendar days Jan 1 - Jun 11
    all_dates = []
    d = date(2026, 1, 1)
    end = date(2026, 6, 11)
    while d <= end:
        all_dates.append(d.isoformat())
        d += timedelta(days=1)

    # Missing = no rows OR all-zero rows
    missing_no_rows = set(all_dates) - dates_with_any
    zero_rows = dates_with_any - dates_with_data
    return sorted(missing_no_rows | zero_rows)


def download_all_missing(config, missing_dates):
    """Open Playwright, navigate to Ricochet, download CSVs for each missing date."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("ERROR: Playwright not installed. Run: pip install playwright && playwright install msedge")
        return []

    rico = config.get("ricochet", {})
    reports_url = rico.get("reports_url")
    username = rico.get("username")
    password = rico.get("password")
    org = rico.get("org", "")
    profile_dir = Path(rico.get("profile_dir", "data/playwright_profile")).resolve()

    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
    profile_dir.mkdir(parents=True, exist_ok=True)

    # Check which ones we already have downloaded
    already_downloaded = set()
    for f in DOWNLOAD_DIR.glob("leads_*.csv"):
        # Extract date from filename like leads_2026-01-03.csv
        name = f.stem
        if name.startswith("leads_") and len(name) == 16:
            already_downloaded.add(name[6:])

    to_download = [d for d in missing_dates if d not in already_downloaded]
    if already_downloaded:
        print(f"  Already downloaded: {len(already_downloaded)} files")
    print(f"  Still need to download: {len(to_download)} files")

    if not to_download:
        return list(DOWNLOAD_DIR.glob("leads_*.csv"))

    downloaded_files = []

    print(f"\nLaunching Edge browser (profile: {profile_dir.name})...")
    print("  NOTE: If MFA/CAPTCHA appears, handle it manually in the browser window.\n")

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

        try:
            # Navigate to reports page
            print(f"Navigating to {reports_url}")
            page.goto(reports_url, wait_until="domcontentloaded")
            time.sleep(3)

            # Handle login if needed
            if _is_login_page(page):
                print("Login page detected - signing in...")
                _perform_login(page, org, username, password)
                if "reports" not in page.url.lower():
                    page.goto(reports_url, wait_until="domcontentloaded")
                time.sleep(3)
            else:
                print("Already signed in (reusing session)")

            # Wait for reports table
            page.wait_for_load_state("networkidle", timeout=DEFAULT_TIMEOUT_MS)
            time.sleep(2)

            # Expand the "Leads Report" card
            print("Expanding 'Leads Report' card...")
            try:
                leads_toolbar = page.locator('text="Leads Report"').first
                if leads_toolbar.count() > 0:
                    leads_toolbar.click()
                    time.sleep(3)
                    print("  Expanded!")
            except Exception as e:
                print(f"  Warning expanding card: {e}")

            # Try to show ALL rows by changing the pagination
            _maximize_rows_per_page(page)
            time.sleep(2)

            # Download each missing date
            total = len(to_download)
            for idx, report_date in enumerate(to_download, 1):
                # The snapshot for report_date is the row dated report_date + 1 day
                snapshot_date = datetime.strptime(report_date, "%Y-%m-%d") + timedelta(days=1)
                date_needle = snapshot_date.strftime("%b ") + str(snapshot_date.day)  # "Jun 4"
                date_needle_padded = snapshot_date.strftime("%b %d")  # "Jun 04"

                print(f"\n[{idx}/{total}] Downloading leads for {report_date} "
                      f"(looking for row dated '{date_needle}')...")

                result = _download_for_date(page, report_date, date_needle, date_needle_padded)

                if result:
                    downloaded_files.append(result)
                    print(f"  OK: {result.name}")
                else:
                    print(f"  SKIP: No matching row found for {date_needle}")

                # Small delay between downloads
                time.sleep(1)

        except Exception as e:
            print(f"ERROR: {e}")
            try:
                page.screenshot(path=str(DOWNLOAD_DIR / "error_screenshot.png"))
            except:
                pass
        finally:
            ctx.close()

    # Include previously downloaded files
    all_files = list(DOWNLOAD_DIR.glob("leads_*.csv"))
    print(f"\nTotal CSV files available: {len(all_files)}")
    return all_files


def _maximize_rows_per_page(page):
    """Try to set the Vuetify data table to show all rows."""
    try:
        # Look for the rows-per-page selector (Vuetify v-select or dropdown)
        selectors = [
            '.v-data-footer__select .v-select',
            '.v-data-footer .v-input',
            'div.v-data-footer__select',
        ]
        for sel in selectors:
            element = page.locator(sel).first
            if element.count() > 0:
                element.click()
                time.sleep(1)
                # Try clicking "All" or the highest number option
                all_option = page.locator('text="All"').first
                if all_option.count() > 0:
                    all_option.click()
                    print("  Set rows per page to 'All'")
                    time.sleep(3)
                    return
                # Try 100 or -1
                for opt_text in ["100", "250", "500"]:
                    opt = page.locator(f'.v-list-item:has-text("{opt_text}")').first
                    if opt.count() > 0:
                        opt.click()
                        print(f"  Set rows per page to {opt_text}")
                        time.sleep(3)
                        return
                break
        print("  Could not change rows per page - will navigate pages as needed")
    except Exception as e:
        print(f"  Rows per page change failed: {e}")


def _download_for_date(page, report_date, date_needle, date_needle_padded):
    """Find the LeadSwami row matching the date and click download."""
    # Search across all visible rows and any pages
    max_pages = 20
    for page_num in range(max_pages):
        rows = page.locator('tr:has-text("LeadSwami Report"):visible')
        row_count = rows.count()

        for i in range(row_count):
            try:
                row_text = rows.nth(i).inner_text()
                if date_needle in row_text or date_needle_padded in row_text:
                    # Found the right row! Click download button
                    target_row = rows.nth(i)

                    # Find the download button - try multiple selectors
                    # Looking for a download icon button (typically the last or 3rd action btn)
                    download_btn = None

                    # Try: buttons with download-related icons
                    btns = target_row.locator("button")
                    btn_count = btns.count()

                    if btn_count >= 3:
                        # Download is typically the 3rd button (edit=0, refresh=1, download=2, delete=3)
                        # But could also be identified by icon
                        download_btn = btns.nth(2)
                    elif btn_count >= 1:
                        download_btn = btns.last

                    if download_btn and download_btn.count() > 0:
                        try:
                            with page.expect_download(timeout=DOWNLOAD_TIMEOUT_MS) as dl_info:
                                download_btn.click()

                            download = dl_info.value
                            # Save with date-stamped name
                            save_path = DOWNLOAD_DIR / f"leads_{report_date}.csv"
                            download.save_as(str(save_path))
                            return save_path
                        except Exception as e:
                            print(f"    Download click failed: {e}")
                            return None
                    else:
                        print(f"    Found row but no download button (btns={btn_count})")
                        return None
            except Exception:
                continue

        # Try navigating to next page
        next_btn = page.locator('.v-data-footer__icons-after button:not([disabled])').first
        if next_btn.count() > 0:
            next_btn.click()
            time.sleep(2)
        else:
            break

    return None


def _is_login_page(page):
    url = page.url.lower()
    if "login" in url or "signin" in url:
        return True
    try:
        if page.locator('input[type="password"]').count() > 0:
            return True
    except:
        pass
    return False


def _perform_login(page, org, username, password):
    text_inputs = page.locator('input[type="text"]:visible, input[type="email"]:visible, input:not([type]):visible')
    pw_inputs = page.locator('input[type="password"]:visible')

    if text_inputs.count() >= 2 and pw_inputs.count() >= 1:
        text_inputs.nth(0).fill(org)
        text_inputs.nth(1).fill(username)
        pw_inputs.nth(0).fill(password)
    elif text_inputs.count() >= 1:
        text_inputs.nth(0).fill(username)
        pw_inputs.nth(0).fill(password)

    submit = page.locator('button[type="submit"], input[type="submit"]').first
    if submit.count() > 0:
        submit.click()
    else:
        pw_inputs.nth(0).press("Enter")

    page.wait_for_load_state("domcontentloaded", timeout=DEFAULT_TIMEOUT_MS)
    time.sleep(3)


def parse_and_push(config, csv_files, missing_dates):
    """Parse each CSV and push leads data to Supabase."""
    from src.spine import Spine
    from src.parsers.rico_leads_parser import parse

    url = config["supabase"]["url"]
    key = config["supabase"]["key"]
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
    }

    # Get agent ID map
    r = requests.get(f"{url}/rest/v1/agents?select=id,name", headers=headers)
    agent_id_map = {a["name"]: a["id"] for a in r.json()}

    # Build spine for name resolution
    spine = Spine(config["spine"]["path"], excluded_agents=config["spine"].get("excluded_agents", []))

    # Filter to only files for missing dates
    missing_set = set(missing_dates)
    relevant_files = []
    for f in csv_files:
        # Extract date from filename
        name = f.stem  # e.g. "leads_2026-01-03"
        if name.startswith("leads_"):
            file_date = name[6:]
            if file_date in missing_set:
                relevant_files.append((file_date, f))

    relevant_files.sort()
    print(f"\nParsing {len(relevant_files)} CSV files...")

    all_payloads = []
    for report_date, csv_path in relevant_files:
        try:
            leads_df = parse(str(csv_path), spine)
            if leads_df.empty:
                print(f"  {report_date}: No data parsed")
                continue

            count = 0
            for _, row in leads_df.iterrows():
                agent_name = row["Agent"]
                agent_id = agent_id_map.get(agent_name)
                if not agent_id:
                    continue

                all_payloads.append({
                    "agent_id": agent_id,
                    "report_date": report_date,
                    "contact": int(row.get("Contact", 0)),
                    "quoted": int(row.get("Quoted", 0)),
                    "hot": int(row.get("Hot", 0)),
                    "xsale": int(row.get("XDate", 0)),
                })
                count += 1

            print(f"  {report_date}: {count} agent records")
        except Exception as e:
            print(f"  {report_date}: ERROR - {e}")

    if not all_payloads:
        print("No leads data to push!")
        return

    # Push to Supabase in batches
    n_batches = math.ceil(len(all_payloads) / BATCH_SIZE)
    print(f"\nUpserting {len(all_payloads)} leads_snapshot rows ({n_batches} batches)...")

    success = 0
    errors = 0
    for i in range(0, len(all_payloads), BATCH_SIZE):
        batch = all_payloads[i:i + BATCH_SIZE]
        batch_num = (i // BATCH_SIZE) + 1
        r = requests.post(
            f"{url}/rest/v1/leads_snapshot?on_conflict=agent_id,report_date",
            headers=headers,
            json=batch
        )
        if r.status_code < 400:
            success += len(batch)
            if batch_num % 10 == 0 or batch_num == n_batches:
                print(f"    Batch {batch_num}/{n_batches}: OK ({success} total)")
        else:
            errors += len(batch)
            print(f"    Batch {batch_num}/{n_batches}: ERROR - {r.text[:200]}")

    print(f"\nDone! {success} upserted, {errors} errors")


def main():
    parser = argparse.ArgumentParser(description="Backfill missing leads from Ricochet")
    parser.add_argument("--dry-run", action="store_true", help="Preview missing dates only")
    parser.add_argument("--parse-only", action="store_true", help="Skip download, parse existing CSVs")
    args = parser.parse_args()

    config = load_config()

    print("=" * 72)
    print("  LEADS BACKFILL: Ricochet LeadSwami Reports -> Supabase")
    print("=" * 72)

    # Step 1: Find missing dates
    print("\n[1] Finding dates with missing leads data...")
    missing_dates = get_missing_dates(config)
    print(f"  {len(missing_dates)} dates need backfilling")

    if not missing_dates:
        print("  No gaps found! All dates have leads data.")
        return

    if args.dry_run:
        print("\n  Missing dates:")
        for d in missing_dates:
            print(f"    {d}")
        print("\n  *** DRY RUN -- no downloads or writes ***")
        return

    # Step 2: Download CSVs
    if args.parse_only:
        print("\n[2] SKIP download (--parse-only)")
        csv_files = list(DOWNLOAD_DIR.glob("leads_*.csv"))
        print(f"  Found {len(csv_files)} existing CSV files")
    else:
        print(f"\n[2] Downloading {len(missing_dates)} LeadSwami Reports from Ricochet...")
        csv_files = download_all_missing(config, missing_dates)

    # Step 3: Parse and push
    print(f"\n[3] Parsing CSVs and pushing to Supabase...")
    parse_and_push(config, csv_files, missing_dates)

    print("\nLeads backfill complete!")


if __name__ == "__main__":
    main()
