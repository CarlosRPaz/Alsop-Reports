"""
backfill_quotes_nb.py — Backfill missing quote and NB data from Dash.

TWO-STEP FLOW:
  Step 1: python backfill_quotes_nb.py open
           → Launches Edge with remote debugging on port 9222.
           → Navigate to Dash, approve MFA, then come back and run step 2.

  Step 2: python backfill_quotes_nb.py run
           → Connects to the already-open Edge, downloads quotes+NB
             for all missing days, parses, and pushes to Supabase.

Rules:
  - Quotes: Standard Auto only
  - NB: "New Policy Issued" disposition only
"""

from __future__ import annotations
import json
import sys
import time
import subprocess
from datetime import datetime, timedelta, date
from pathlib import Path
from collections import defaultdict

import requests
import pandas as pd

# ── Config ──
CONFIG_PATH = Path("config/config.json")
DOWNLOADS_FOLDER = Path("C:/Users/scag3s29/Downloads")
CDP_PORT = 9222
DASH_URL = "https://dash.allstate.com/Home/Dash/"

# Missing business days to backfill (May + June 2026)
MISSING_DAYS = [
    "2026-05-15",
    "2026-05-19", "2026-05-20", "2026-05-21", "2026-05-22",
    "2026-05-25", "2026-05-26",
    "2026-05-28", "2026-05-29",
    "2026-06-01", "2026-06-02",
]


def group_into_ranges(dates: list[str]) -> list[tuple[str, str]]:
    """Return a single range from the earliest to the latest date."""
    if not dates:
        return []
    sorted_dates = sorted(dates)
    return [(sorted_dates[0], sorted_dates[-1])]


# =====================================================================
# STEP 1: Open Edge with debugging port
# =====================================================================

def open_dash():
    """Launch Edge with remote-debugging-port so the script can attach later."""
    print("=" * 60)
    print("  STEP 1: Opening Edge with remote debugging")
    print("=" * 60)
    print()
    
    # Kill any existing Edge first
    subprocess.run(["taskkill", "/F", "/IM", "msedge.exe"], 
                   capture_output=True, text=True)
    time.sleep(2)
    
    edge_path = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
    if not Path(edge_path).exists():
        edge_path = r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"
    
    cmd = [
        edge_path,
        f"--remote-debugging-port={CDP_PORT}",
        DASH_URL,
    ]
    
    subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"  Edge launched on debugging port {CDP_PORT}")
    print(f"  Navigating to: {DASH_URL}")
    print()
    print("  >>> Log in and approve MFA in the browser window <<<")
    print("  >>> Once you see the Dash main page, run:        <<<")
    print()
    print("      python backfill_quotes_nb.py run")
    print()
    print("=" * 60)


# =====================================================================
# STEP 2: Connect to open Edge and do downloads
# =====================================================================

def run_backfill():
    """Connect to the already-open Edge and download/parse/push all missing data."""
    
    with open(CONFIG_PATH) as f:
        config = json.load(f)
    
    print("=" * 60)
    print("  STEP 2: Backfill Missing Quotes & NB Data")
    print(f"  Days to fill: {len(MISSING_DAYS)}")
    print("=" * 60)
    
    ranges = group_into_ranges(MISSING_DAYS)
    print(f"\nGrouped into {len(ranges)} download ranges:")
    for s, e in ranges:
        print(f"  {s} -> {e}")
    
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("[FAIL] Playwright not installed")
        sys.exit(1)
    
    all_quotes_files: list[tuple[str, str, str]] = []  # (filepath, start, end)
    all_nb_files: list[tuple[str, str, str]] = []
    
    with sync_playwright() as p:
        print(f"\n[backfill] Connecting to Edge on port {CDP_PORT}...")
        try:
            browser = p.chromium.connect_over_cdp(f"http://localhost:{CDP_PORT}")
        except Exception as e:
            print(f"[FAIL] Could not connect to Edge on port {CDP_PORT}.")
            print(f"  Error: {e}")
            print(f"\n  Did you run 'python backfill_quotes_nb.py open' first?")
            print(f"  Make sure Edge is still open and you've approved MFA.")
            sys.exit(1)
        
        print("[OK] Connected to Edge!")
        
        # Get the existing context and find/create a page
        ctx = browser.contexts[0]
        
        for start_date, end_date in ranges:
            # --- Download QUOTES ---
            print(f"\n{'='*50}")
            print(f"  QUOTES: {start_date} to {end_date}")
            print(f"{'='*50}")
            
            page = ctx.new_page()
            page.set_default_timeout(120000)
            qf = _download_quotes_for_range(page, config, start_date, end_date)
            if qf:
                all_quotes_files.append((qf, start_date, end_date))
                print(f"  [OK] Quotes downloaded: {qf}")
            else:
                print(f"  [WARN] No quotes file for {start_date}-{end_date}")
            page.close()
            
            time.sleep(2)
            
            # --- Download NB ---
            print(f"\n{'='*50}")
            print(f"  NB: {start_date} to {end_date}")
            print(f"{'='*50}")
            
            page = ctx.new_page()
            page.set_default_timeout(120000)
            nf = _download_nb_for_range(page, config, start_date, end_date)
            if nf:
                all_nb_files.append((nf, start_date, end_date))
                print(f"  [OK] NB downloaded: {nf}")
            else:
                print(f"  [WARN] No NB file for {start_date}-{end_date}")
            page.close()
            
            time.sleep(2)
        
        browser.close()
    
    # Parse and push
    print(f"\n{'='*60}")
    print("  PARSING & PUSHING TO SUPABASE")
    print(f"{'='*60}")
    
    from src.spine import Spine
    spine_path = config.get("spine", {}).get("path", "config/spine.xlsx")
    spine_sheet = config.get("spine", {}).get("sheet_name", "Spine")
    excluded_agents = config.get("spine", {}).get("excluded_agents", [])
    spine = Spine(spine_path, sheet_name=spine_sheet, excluded_agents=excluded_agents)
    
    for i, (start, end) in enumerate(ranges):
        qf = all_quotes_files[i][0] if i < len(all_quotes_files) else None
        nf = all_nb_files[i][0] if i < len(all_nb_files) else None
        range_days = [d for d in MISSING_DAYS if start <= d <= end]
        _parse_and_push(qf, nf, range_days, config, spine)
    
    print(f"\n{'='*60}")
    print("  BACKFILL COMPLETE!")
    print(f"{'='*60}")


def _download_quotes_for_range(page, config, start_date, end_date) -> str | None:
    """Navigate to Dash → P&C Quotes → Detail, set dates and filters, download."""
    from src.dash_downloader import _type_in_column_search, _debug_screenshot
    
    try:
        # Navigate to Dash home
        page.goto(DASH_URL, wait_until="domcontentloaded", timeout=60000)
        time.sleep(3)
        _wait_for_loading(page)
        
        # Handle agency selection if it pops up
        _try_agency_select(page)
        
        # Wait for P&C Quotes to appear
        try:
            page.locator('text="P&C Quotes"').first.wait_for(state="visible", timeout=60000)
        except Exception:
            print("  [WARN] P&C Quotes card not found, trying anyway...")
        
        time.sleep(2)
        
        # Expand P&C Quotes card (find and click the expand/permalink link)
        _expand_card(page, "P&C Quotes")
        _wait_for_loading(page)
        
        # Click through to the Detail view
        _wait_for_loading(page)
        try:
            detail_link = page.locator('a[href$="/quotes-tool/quotes"]').first
            if detail_link.count() > 0:
                print("  [OK] Found Quotes Detail link")
                detail_link.click()
            else:
                fallback = page.locator('a[href*="/quotes-tool/"]').nth(1)
                if fallback.count() > 0:
                    fallback.click()
                else:
                    print("  [WARN] Could not find Quotes Detail link")
                    return None
        except Exception as e:
            print(f"  [WARN] Navigation to Quotes Detail failed: {e}")
            return None
        
        # Wait for the date inputs to load
        try:
            page.locator('text="Start Date"').first.wait_for(state="visible", timeout=45000)
        except Exception:
            pass
        _wait_for_loading(page)
        _debug_screenshot(page, "backfill_quotes_page")
        
        # Set date range
        _set_dates(page, start_date, end_date)
        
        # Filter Product = Standard Auto (column 11)
        _type_in_column_search(page, 11, "Standard Auto", "Product (column 11)")
        time.sleep(1)
        
        # Click Go
        _click_go(page)
        _wait_for_loading(page)
        _debug_screenshot(page, "backfill_quotes_filtered")
        
        # Download
        return _click_download(page, f"quotes_{start_date}")
        
    except Exception as e:
        print(f"  [ERROR] Quotes download failed: {e}")
        import traceback
        traceback.print_exc()
        return None


def _download_nb_for_range(page, config, start_date, end_date) -> str | None:
    """Navigate to Dash → P&C NB → Details, set dates and filters, download."""
    from src.dash_downloader import _type_in_column_search, _debug_screenshot
    
    try:
        # Navigate to Dash home
        page.goto(DASH_URL, wait_until="domcontentloaded", timeout=60000)
        time.sleep(3)
        _wait_for_loading(page)
        
        _try_agency_select(page)
        
        # Wait for page to load
        try:
            page.locator('text="P&C Quotes"').first.wait_for(state="visible", timeout=60000)
        except Exception:
            pass
        
        # Scroll down to find P&C New Business
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        time.sleep(2)
        
        # Expand P&C New Business card
        _expand_card(page, "P&C New Business")
        _wait_for_loading(page)
        
        # Find NB Details link
        try:
            selectors = [
                'a:has-text("NB Details"):visible',
                'a:has-text("NB Detail"):visible',
                'a:has-text("New Business Details"):visible',
                'a[href*="/nb-tool/"]:visible',
            ]
            found = False
            for sel in selectors:
                loc = page.locator(sel)
                if loc.count() > 0:
                    print(f"  [OK] Found NB Details link via '{sel}'")
                    loc.first.click()
                    found = True
                    break
            if not found:
                print("  [WARN] Could not find NB Details link")
                return None
        except Exception as e:
            print(f"  [WARN] NB navigation failed: {e}")
            return None
        
        # Wait for date inputs
        try:
            page.locator('text="Start Date"').first.wait_for(state="visible", timeout=45000)
        except Exception:
            pass
        _wait_for_loading(page)
        _debug_screenshot(page, "backfill_nb_page")
        
        # Set date range
        _set_dates(page, start_date, end_date)
        
        # Click Go FIRST to load data
        _click_go(page)
        _wait_for_loading(page)
        _debug_screenshot(page, "backfill_nb_after_go")
        
        # Filter: Disposition Code = "New Policy Issued" (column 17)
        _type_in_column_search(page, 17, "New Policy Issued", "Disposition Code (column 17)")
        time.sleep(2)
        
        # NB Production Qualifier = Yes
        try:
            page.locator('button, label, div').locator('text="Yes"').first.click(force=True)
            print("  [OK] Clicked 'Yes' for Qualifier")
            time.sleep(1)
        except Exception as e:
            print(f"  [WARN] Failed to set Qualifier: {e}")
        
        _debug_screenshot(page, "backfill_nb_filtered")
        
        # Download
        return _click_download(page, f"nb_{start_date}")
        
    except Exception as e:
        print(f"  [ERROR] NB download failed: {e}")
        import traceback
        traceback.print_exc()
        return None


# ── Shared helpers ──

def _wait_for_loading(page, timeout_sec=120):
    """Wait for Dash's loading overlay to disappear."""
    overlay_sel = '.c-portal-loader-overlay, .c-loader-overlay'
    try:
        overlay = page.locator(overlay_sel).first
        if overlay.is_visible():
            print("  Waiting for Dash to finish loading...")
            overlay.wait_for(state="hidden", timeout=timeout_sec * 1000)
            print("  [OK] Loading complete")
        time.sleep(1)
    except Exception:
        # Overlay might not exist on this page, or already hidden
        time.sleep(2)


def _try_agency_select(page):
    """Click OK on the agency selection panel if it appears."""
    try:
        ok_btn = page.locator('button:has-text("OK"):visible, input[value="OK"]:visible')
        for _ in range(5):
            if ok_btn.count() > 0:
                # Try to select the right agency first
                dropdowns = page.locator('select:visible')
                for i in range(dropdowns.count()):
                    sel = dropdowns.nth(i)
                    try:
                        options = sel.locator('option:has-text("ALSOP")')
                        if options.count() > 0:
                            val = options.first.get_attribute("value")
                            sel.select_option(value=val)
                            print("  [OK] Selected agency")
                            break
                    except Exception:
                        pass
                ok_btn.first.click(force=True)
                print("  [OK] Clicked OK on agency panel")
                time.sleep(5)
                return
            time.sleep(1)
    except Exception:
        pass


def _expand_card(page, card_title: str):
    """Find a Dash card by title and click its expand/permalink link."""
    try:
        title_el = page.locator(f'h1, h2, h3, h4, h5, span, div.card-title, div.panel-title').locator(f'text="{card_title}"').first
        title_el.scroll_into_view_if_needed()
        time.sleep(1)
        
        card = title_el.locator("xpath=ancestor::div[contains(@class, 'card') or contains(@class, 'panel') or contains(@class, 'widget') or position()=4]")
        if card.count() == 0:
            card = title_el.locator("xpath=../../..")
        
        links = card.first.locator('a[href*="Permalink"]:visible')
        if links.count() > 0:
            href = links.last.get_attribute("href")
            if href:
                target_url = href if href.startswith("http") else f"https://dash.allstate.com{href}"
                print(f"  [OK] Found {card_title} link: navigating...")
                page.goto(target_url, wait_until="domcontentloaded", timeout=60000)
                time.sleep(3)
                return
        
        # Fallback: click near the title
        box = title_el.bounding_box()
        if box:
            page.mouse.click(box["x"] + box["width"] + 110, box["y"] + box["height"]/2)
            print(f"  [OK] Clicked {card_title} via mouse coordinates")
            time.sleep(3)
    except Exception as e:
        print(f"  [WARN] Could not expand {card_title}: {e}")


def _set_dates(page, start_date: str, end_date: str):
    """Set the start and end date inputs on the current Dash page."""
    start_obj = datetime.strptime(start_date, "%Y-%m-%d")
    end_obj = datetime.strptime(end_date, "%Y-%m-%d")
    
    # Try HTML date inputs
    date_inputs = page.locator('input[type="date"]:visible')
    if date_inputs.count() >= 2:
        date_inputs.nth(0).fill(start_date)
        time.sleep(0.3)
        date_inputs.nth(1).fill(end_date)
        print(f"  [OK] Set dates: {start_date} to {end_date}")
        return
    
    # Try text inputs
    text_inputs = page.locator('input[type="text"]:visible')
    date_like = []
    for i in range(text_inputs.count()):
        inp = text_inputs.nth(i)
        val = inp.input_value() or ""
        placeholder = (inp.get_attribute("placeholder") or "").lower()
        name = (inp.get_attribute("name") or "").lower()
        id_attr = (inp.get_attribute("id") or "").lower()
        if ("date" in name or "date" in id_attr or "date" in placeholder
                or "/" in val or "mm" in placeholder):
            date_like.append(inp)
    
    if len(date_like) >= 2:
        start_display = start_obj.strftime("%m/%d/%Y")
        end_display = end_obj.strftime("%m/%d/%Y")
        for inp, display in zip(date_like[:2], [start_display, end_display]):
            try:
                inp.click(click_count=3)
                page.keyboard.press("Backspace")
                inp.fill(display)
                page.keyboard.press("Enter")
                time.sleep(0.3)
            except Exception:
                pass
        print(f"  [OK] Set text dates: {start_display} to {end_display}")
    else:
        print("  [WARN] Could not find date inputs")


def _click_go(page):
    """Click Go/Search/Apply button."""
    selectors = [
        'button:has-text("Go"):visible',
        'input[value="Go"]:visible',
        'a:has-text("Go"):visible',
        'button:has-text("Search"):visible',
        'button:has-text("Apply"):visible',
        'button[type="submit"]:visible',
    ]
    for sel in selectors:
        try:
            loc = page.locator(sel)
            if loc.count() > 0:
                loc.first.click()
                time.sleep(6)
                print(f"  [OK] Clicked Go ({sel})")
                return
        except Exception:
            continue
    print("  [WARN] No Go button found")


def _click_download(page, report_name: str) -> str | None:
    """Click the download button and wait for a new file to appear in Downloads.
    
    CDP connections don't properly intercept downloads via expect_download,
    so instead we snapshot existing files, click download, then poll for
    a new file to appear.
    """
    # Snapshot existing files before clicking
    existing_files = set()
    for f in DOWNLOADS_FOLDER.glob("*.xlsx"):
        existing_files.add(f.name)
    
    selectors = [
        'a:has-text("Download"):visible',
        'button:has-text("Download"):visible',
        'a:has-text("Export"):visible',
        'button:has-text("Export"):visible',
        'a:has-text("CSV"):visible',
        'a:has-text("Excel"):visible',
        'a[href*="download"]:visible',
        'a[href*="export"]:visible',
        'button:has(i.fa-download):visible',
        'a:has(i.fa-download):visible',
        '.export-btn:visible',
        'a[title*="Download" i]:visible',
        'a[title*="Export" i]:visible',
    ]
    
    clicked = False
    for sel in selectors:
        try:
            loc = page.locator(sel)
            if loc.count() > 0:
                print(f"  Found download button via: {sel}")
                loc.first.click(force=True)
                clicked = True
                break
        except Exception:
            continue
    
    if not clicked:
        print(f"  [WARN] No download button found for {report_name}")
        return None
    
    # Poll for new file in Downloads (up to 60 seconds)
    print(f"  Waiting for download to complete...")
    for attempt in range(60):
        time.sleep(1)
        for f in DOWNLOADS_FOLDER.glob("*.xlsx"):
            if f.name not in existing_files and f.stat().st_size > 0:
                print(f"  [OK] Downloaded: {f.name} ({f.stat().st_size:,} bytes)")
                return str(f)
        # Also check for .crdownload (still downloading)
        downloading = list(DOWNLOADS_FOLDER.glob("*.crdownload"))
        if downloading and attempt % 10 == 9:
            print(f"  Still downloading...")
    
    print(f"  [WARN] Download timed out for {report_name}")
    return None



def _parse_and_push(quotes_file, nb_file, missing_dates, config, spine):
    """Parse downloaded files and push each day to Supabase."""
    from src.supabase_pusher import push_to_supabase
    
    for target_date_str in missing_dates:
        target_date = datetime.strptime(target_date_str, "%Y-%m-%d").date()
        print(f"\n--- Processing {target_date_str} ---")
        
        quotes_df = pd.DataFrame()
        if quotes_file:
            from src.parsers.quotes_parser import parse as quotes_parse
            try:
                raw = quotes_parse(quotes_file, spine, target_date=target_date)
                if not raw.empty:
                    quotes_df = raw.rename(columns={"QuoteCount": "Quotes"})
                    print(f"  Quotes: {len(quotes_df)} agents, total={quotes_df['Quotes'].sum()}")
            except Exception as e:
                print(f"  Quotes parse error: {e}")
        
        nb_df = pd.DataFrame()
        if nb_file:
            from src.parsers.nb_parser import parse as nb_parse
            try:
                raw = nb_parse(nb_file, spine, target_date=target_date)
                if not raw.empty:
                    nb_df = raw.rename(columns={"NBCount": "NB"})
                    print(f"  NB: {len(nb_df)} agents, NB={nb_df['NB'].sum()}, items={nb_df['Items'].sum()}")
            except Exception as e:
                print(f"  NB parse error: {e}")
        
        if quotes_df.empty and nb_df.empty:
            print(f"  [SKIP] No data for {target_date_str}")
            continue
        
        # Merge
        if not quotes_df.empty and not nb_df.empty:
            merged = pd.merge(
                quotes_df[["Agent", "Quotes"]], 
                nb_df[["Agent", "NB", "Items", "WrittenPremium"]], 
                on="Agent", how="outer"
            ).fillna(0)
        elif not quotes_df.empty:
            merged = quotes_df[["Agent", "Quotes"]].copy()
            merged["NB"] = 0; merged["Items"] = 0; merged["WrittenPremium"] = 0.0
        else:
            merged = nb_df[["Agent", "NB", "Items", "WrittenPremium"]].copy()
            merged["Quotes"] = 0
        
        merged = merged.rename(columns={"Agent": "agent"})
        # Add zero-value columns for other sources (partial push preserves existing)
        for col in ["Calls","Inbound","Outbound","TalkTimeSeconds","Texts","OutTexts",
                     "OptIns","OptOuts","PremPremium","PremItems","PremPoints"]:
            merged[col] = 0
        merged["team"] = ""
        merged["office"] = ""
        
        push_to_supabase(merged, target_date, config, upload_types=["quotes", "nb"])
        print(f"  [OK] Pushed {len(merged)} agents for {target_date_str}")


# =====================================================================
# CLI
# =====================================================================

if __name__ == "__main__":
    if not CONFIG_PATH.exists():
        print(f"Config not found at {CONFIG_PATH}")
        sys.exit(1)
    
    if len(sys.argv) < 2 or sys.argv[1] not in ("open", "run"):
        print("Usage:")
        print("  Step 1:  python backfill_quotes_nb.py open")
        print("           → Opens Edge. Log in and approve MFA.")
        print()
        print("  Step 2:  python backfill_quotes_nb.py run")
        print("           → Connects to Edge, downloads, parses, pushes.")
        sys.exit(0)
    
    if sys.argv[1] == "open":
        open_dash()
    elif sys.argv[1] == "run":
        run_backfill()
