"""
dash_downloader.py — Auto-download Quotes and New Business reports from Allstate Dash.

Workflow:
  Quotes:  Dash → Expand P&C Quotes → P&C Total Serious Quotes Detail
           → Set dates → Product: "Standard Auto" → Go → Download
  NB:      Dash → Expand P&C Quotes → NB Details → Set dates
           → Disposition Code: "New Policy Issued" → Go
           → NB Production Qualifier for Variable Comp: Yes → Download

MFA: Microsoft Authenticator push notification (user taps Approve on phone).
Uses persistent Edge profile so MFA is only needed once per session.

Usage:
    python src/dash_downloader.py [quotes|nb|both] [YYYY-MM-DD]
"""

from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path


DEFAULT_TIMEOUT_MS = 30_000
DOWNLOAD_TIMEOUT_MS = 120_000
MFA_WAIT_TIMEOUT = 120  # seconds to wait for user to approve push


def download_dash_report(
    config: dict,
    report_type: str = "both",
    target_date: str | None = None,
    headless: bool = False,
) -> dict[str, str | None]:
    """
    Download Quotes and/or NB reports from Allstate Dash.

    Args:
        config: Parsed config.json
        report_type: "quotes", "nb", or "both"
        target_date: YYYY-MM-DD (defaults to yesterday)
        headless: Run browser headless

    Returns dict with keys 'quotes' and/or 'nb' → file paths (or None).
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("[dash] Playwright not installed.")
        return {}

    dash = config.get("allstate_dash", {})
    url = dash.get("url", "https://dash.allstate.com/Home/Dash/")
    username = dash.get("username", "")
    password = dash.get("password", "")
    profile_dir = Path(dash.get("profile_dir", "data/dash_playwright_profile")).resolve()

    if target_date is None:
        target_date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

    print(f"[dash] Target date: {target_date}")
    print(f"[dash] Report type: {report_type}")

    profile_dir.mkdir(parents=True, exist_ok=True)
    results: dict[str, str | None] = {}

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
            # Step 1: Navigate to Dash
            print(f"[dash] Navigating to {url}")
            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            time.sleep(3)
            _debug_screenshot(page, "dash_initial")

            # Step 2: Handle login if needed
            if _is_login_page(page):
                print("[dash] Login page detected — signing in...")
                _perform_login(page, username, password)
                time.sleep(3)
                _debug_screenshot(page, "dash_after_login")

                # Step 3: Handle MFA (Wait for manual input in browser)
                if _is_mfa_page(page):
                    print("[dash] ===========================================")
                    print("[dash]  MFA REQUIRED - Please enter the code")
                    print("[dash]  directly in the browser window.")
                    print("[dash]  Waiting up to 2 minutes...")
                    print("[dash] ===========================================")
                    _debug_screenshot(page, "dash_mfa_waiting")

                    if not _wait_for_mfa_completion(page):
                        print("[dash] [FAIL] MFA not completed in time")
                        return results
                    print("[dash] [OK] MFA completed!")
                    time.sleep(3)
            else:
                print("[dash] Already signed in (reusing session)")

            _debug_screenshot(page, "dash_logged_in")
            time.sleep(3)

            # Step 3.5: Select Primary Agency dropdown if present
            _select_primary_agency(page)

            # Step 4: Find and click the P&C Quotes expand button
            print("[dash] Waiting for Dash to load (spinner)...")
            try:
                page.locator('text="P&C Quotes"').first.wait_for(state="visible", timeout=120000)
            except Exception as e:
                print(f"[dash] [WARN] Timed out waiting for P&C Quotes to appear: {e}")
            
            print("[dash] Looking for P&C Quotes card...")
            _debug_screenshot(page, "dash_main_page")

            # Look for expand/detail button on P&C Quotes card
            if report_type in ("quotes", "both"):
                print("[dash] Looking for P&C Quotes card...")
                expanded = _expand_pc_quotes(page)
                if not expanded:
                    print("[dash] [WARN] Could not expand P&C Quotes card")
                else:
                    _debug_screenshot(page, "dash_quotes_expanded")
                    print("[dash] === Downloading QUOTES report ===")
                    results["quotes"] = _download_quotes(page, target_date)

            # Download NB report
            if report_type in ("nb", "both"):
                if report_type == "both":
                    print("[dash] Returning to Dash main page for NB report...")
                    page.goto("https://dash.allstate.com/Home/Dash/")
                    try:
                        page.wait_for_load_state("domcontentloaded", timeout=10000)
                    except Exception:
                        pass
                    _debug_screenshot(page, "dash_returned_home")
                
                print("[dash] Looking for P&C New Business card...")
                expanded = _expand_pc_nb(page)
                if not expanded:
                    print("[dash] [WARN] Could not expand P&C New Business card")
                else:
                    _debug_screenshot(page, "dash_nb_expanded")
                    print("[dash] === Downloading NB report ===")
                    results["nb"] = _download_nb(page, target_date)

            return results

        except Exception as e:
            print(f"[dash] Error: {e}")
            _debug_screenshot(page, "dash_error")
            import traceback
            traceback.print_exc()
            return results
        finally:
            ctx.close()


def _type_in_column_search(page, column_number: int, value: str, description: str = "") -> bool:
    """Type a value into the search box of the Nth column (1-indexed).
    
    Finds all visible <input> elements inside the table header/filter row
    and types into the one at position (column_number - 1).
    """
    desc = description or f"column {column_number}"
    try:
        # Find all search inputs in the table area — these are the "Search" boxes
        # under each column header
        search_inputs = page.locator('input[placeholder="Search"]:visible')
        count = search_inputs.count()
        print(f"[dash] Found {count} column search inputs")
        
        if count == 0:
            print(f"[dash] [WARN] No search inputs found for {desc}")
            return False
        
        idx = column_number - 1  # convert to 0-indexed
        if idx >= count:
            # The column might be off-screen; scroll the table right
            print(f"[dash] Column {column_number} is beyond visible inputs ({count}). Scrolling...")
            for scroll_attempt in range(10):
                page.evaluate("""() => {
                    const containers = document.querySelectorAll('.rt-table, .table-responsive, table, [style*="overflow"]');
                    containers.forEach(c => c.scrollLeft += 300);
                }""")
                time.sleep(0.5)
                search_inputs = page.locator('input[placeholder="Search"]:visible')
                count = search_inputs.count()
                if idx < count:
                    break
            
            if idx >= count:
                print(f"[dash] [WARN] Still only {count} search inputs after scrolling, need index {idx}")
                return False
        
        inp = search_inputs.nth(idx)
        inp.scroll_into_view_if_needed()
        inp.click()
        inp.fill("")
        inp.type(value, delay=50)
        page.keyboard.press("Enter")
        print(f"[dash] [OK] Typed '{value}' into {desc} (search input #{column_number})")
        return True
    except Exception as e:
        print(f"[dash] [WARN] Failed to type in {desc}: {e}")
        return False


# ---------------------------------------------------------------------------
# Report Downloads
# ---------------------------------------------------------------------------

def _download_quotes(page, target_date: str) -> str | None:
    """Navigate to P&C Total Serious Quotes Detail and download."""
    print("[dash] === Downloading QUOTES report ===")
    
    # The sidebar uses icon links without text. The "Detail" report usually maps 
    # to the endpoint ending in "/quotes" as opposed to the root or "/summary".
    try:
        # Find the link that ends with "/quotes"
        detail_link = page.locator('a[href$="/quotes-tool/quotes"]').first
        if detail_link.count() > 0:
            print("[dash] [OK] Found Quotes Detail icon link. Clicking...")
            detail_link.click()
        else:
            # Fallback: Click the second link in the sidebar (assuming index 1 is the Document icon)
            # Using a broad selector for links that have 'quotes-tool' in them
            fallback_link = page.locator('a[href*="/quotes-tool/"]').nth(1)
            if fallback_link.count() > 0:
                print("[dash] [WARN] Using fallback: clicking second sidebar icon...")
                fallback_link.click()
            else:
                print("[dash] [WARN] Could not find Quotes Detail sidebar link")
                _dump_page_info(page)
                return None
    except Exception as e:
        print(f"[dash] Failed to navigate to Quotes Detail: {e}")
        return None
    
    print("[dash] Waiting for Quotes page to load...")
    try:
        page.locator('text="Start Date"').first.wait_for(state="visible", timeout=45000)
    except Exception:
        pass

    _debug_screenshot(page, "dash_quotes_page")

    # Set date range
    _set_date_range(page, target_date)

    # Set Product filter to "Standard Auto" — column 11
    _type_in_column_search(page, 11, "Standard Auto", "Product (column 11)")
    time.sleep(1)

    # Click Go
    _click_go(page)
    _debug_screenshot(page, "dash_quotes_filtered")

    # Download
    return _click_download(page, "quotes")


def _download_nb(page, target_date: str) -> str | None:
    """Navigate to NB Details and download."""
    # Click sidebar link
    try:
        # User confirmed NB Details uses text in the sidebar, but we also include href fallbacks
        selectors = [
            'a:has-text("NB Details"):visible',
            'a:has-text("NB Detail"):visible',
            'a:has-text("New Business Details"):visible',
            '*:has-text("NB Details"):visible',
            'a[href*="/nb-tool/"]:visible',
            'a[href*="NewBusiness"]:visible'
        ]
        
        found = False
        for sel in selectors:
            loc = page.locator(sel)
            if loc.count() > 0:
                print(f"[dash] [OK] Found NB Details link via '{sel}'. Clicking...")
                loc.first.click()
                found = True
                break
                
        if not found:
            print("[dash] [WARN] Using fallback: clicking second sidebar icon...")
            fallback_link = page.locator('.sidebar a:visible, nav a:visible, aside a:visible').nth(1)
            if fallback_link.count() > 0:
                fallback_link.click()
            else:
                print("[dash] [WARN] Could not find NB Details sidebar link")
                _dump_page_info(page)
                return None
    except Exception as e:
        print(f"[dash] Failed to navigate to NB Details: {e}")
        return None
    
    print("[dash] Waiting for NB page to load...")
    try:
        page.locator('text="Start Date"').first.wait_for(state="visible", timeout=45000)
    except Exception:
        pass

    _debug_screenshot(page, "dash_nb_page")

    # Set date range
    _set_date_range(page, target_date)

    # Click Go FIRST to load the data
    _click_go(page)
    time.sleep(5)  # Wait for data to fully load
    _debug_screenshot(page, "dash_nb_after_go")

    # NOW set Disposition Code filter — column 17 (client-side filter on loaded data)
    _type_in_column_search(page, 17, "New Policy Issued", "Disposition Code (column 17)")
    time.sleep(2)
    _debug_screenshot(page, "dash_nb_filtered")

    # Set "NB Production Qualifier for Variable Comp" to Yes
    try:
        page.locator('button, label, div').locator('text="Yes"').first.click(force=True)
        print("[dash] [OK] Clicked 'Yes' for Qualifier")
        time.sleep(1)
    except Exception as e:
        print(f"[dash] [WARN] Failed to set Qualifier: {e}")

    # Download
    return _click_download(page, "nb")


# ---------------------------------------------------------------------------
# UI Interaction Helpers
# ---------------------------------------------------------------------------

def _expand_pc_nb(page) -> bool:
    """Find and click the expand button on the P&C New Business card."""
    # Approach 1: Specific XPath for the card
    try:
        xpath = '(//*[contains(@class, "card") or contains(@class, "panel")]//*[contains(text(), "P&C New Business")]/ancestor::*[contains(@class, "card") or contains(@class, "panel")])[1]//a[contains(@href, "Permalink")]'
        loc = page.locator(f"xpath={xpath}")
        if loc.count() > 0:
            loc.first.click()
            print("[dash] [OK] Clicked P&C New Business expand via XPath")
            time.sleep(3)
            return True
    except Exception as e:
        print(f"[dash] XPath expand attempt failed: {e}")

    # Approach 2: Find the P&C New Business text element and click the nearest permalink icon
    try:
        # Scroll down to ensure lazy-loaded cards are rendered
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        time.sleep(2)
        
        # Look specifically for header or title elements to avoid matching full-width containers
        title_el = page.locator('h1, h2, h3, h4, h5, span, div.card-title, div.panel-title').locator('text="P&C New Business"').first
        title_el.scroll_into_view_if_needed()
        time.sleep(1)
        
        card_container = title_el.locator("xpath=ancestor::div[contains(@class, 'card') or contains(@class, 'panel') or contains(@class, 'widget') or position()=4]")
        if card_container.count() == 0:
            card_container = title_el.locator("xpath=../../..")
            
        links = card_container.first.locator('a[href*="Permalink"]:visible')
        if links.count() > 0:
            href = links.last.get_attribute("href")
            if href:
                target_url = href if href.startswith("http") else f"https://dash.allstate.com{href}"
                print(f"[dash] [OK] Found P&C New Business link: {target_url}. Navigating directly...")
                page.goto(target_url, wait_until="domcontentloaded", timeout=60000)
                time.sleep(3)
                return True
            
        box = title_el.bounding_box()
        if box:
            print(f"[dash] P&C New Business text is at {box}. Clicking slightly right to hit the icon...")
            page.mouse.click(box["x"] + box["width"] + 110, box["y"] + box["height"]/2)
            print("[dash] [OK] Clicked using mouse coordinates")
            time.sleep(3)
            return True
    except Exception as e:
        print(f"[dash] Fallback expand attempt failed: {e}")
        
    return False

def _expand_pc_quotes(page) -> bool:
    """Find and click the expand button on the P&C Quotes card."""
    # Approach 1: Specific XPath for the card
    try:
        # Find a container (like a card) that has the text P&C Quotes, and get the Permalink a-tag inside it
        xpath = '(//*[contains(@class, "card") or contains(@class, "panel")]//*[contains(text(), "P&C Quotes")]/ancestor::*[contains(@class, "card") or contains(@class, "panel")])[1]//a[contains(@href, "Permalink")]'
        loc = page.locator(f"xpath={xpath}")
        if loc.count() > 0:
            loc.first.click()
            print("[dash] [OK] Clicked P&C Quotes expand via XPath")
            time.sleep(3)
            time.sleep(3)
            return True
    except Exception as e:
        print(f"[dash] XPath expand attempt failed: {e}")

    # Approach 2: Find the P&C Quotes text element and click the nearest permalink icon
    try:
        # Find the specific text element for the title
        title_el = page.locator('text="P&C Quotes"').first
        
        # Go up to the card/panel container (or just go up 2-3 levels) and find the links
        card_container = title_el.locator("xpath=ancestor::div[contains(@class, 'card') or contains(@class, 'panel') or contains(@class, 'widget') or position()=4]")
        
        # If we can't find a semantic container, just go up 3 levels
        if card_container.count() == 0:
            card_container = title_el.locator("xpath=../../..")
            
        links = card_container.first.locator('a[href*="Permalink"]:visible')
        if links.count() > 0:
            href = links.last.get_attribute("href")
            if href:
                target_url = href if href.startswith("http") else f"https://dash.allstate.com{href}"
                print(f"[dash] [OK] Found P&C Quotes link: {target_url}. Navigating directly...")
                page.goto(target_url, wait_until="domcontentloaded", timeout=60000)
                time.sleep(3)
                time.sleep(3)
                return True
            
        # If that fails, just click the exact pixel coordinates of the button
        # The blue icon is to the right of the "P&C Quotes" text.
        box = title_el.bounding_box()
        if box:
            print(f"[dash] P&C Quotes text is at {box}. Clicking slightly right to hit the icon...")
            # The icon is on the same line, just shifted to the right. We guess +150px x.
            page.mouse.click(box["x"] + box["width"] + 110, box["y"] + box["height"]/2)
            print("[dash] [OK] Clicked using mouse coordinates")
            time.sleep(3)
            time.sleep(3)
            return True

    except Exception as e:
        print(f"[dash] Relative/Mouse expand attempt failed: {e}")

    return False


def _set_date_range(page, target_date: str) -> None:
    """Set both date inputs on the current page."""
    date_obj = datetime.strptime(target_date, "%Y-%m-%d")

    # Try HTML date inputs first
    date_inputs = page.locator('input[type="date"]:visible')
    if date_inputs.count() >= 2:
        date_inputs.nth(0).fill(target_date)
        time.sleep(0.3)
        date_inputs.nth(1).fill(target_date)
        print(f"[dash] [OK] Set date inputs to {target_date}")
        return

    # Try text inputs with date-like values (MM/DD/YYYY or similar)
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

    display_date = date_obj.strftime("%m/%d/%Y")
    if len(date_like) >= 2:
        for inp in date_like[:2]:
            try:
                # Clear and type
                inp.click(click_count=3)
                page.keyboard.press("Backspace")
                inp.fill(display_date)
                page.keyboard.press("Enter")
                time.sleep(0.3)
            except Exception:
                pass
        print(f"[dash] [OK] Set text date inputs to {display_date}")
        return

    # Dump inputs for debugging
    print("[dash] [INFO] Could not find date inputs. Dumping visible inputs...")
    all_inputs = page.locator("input:visible")
    for i in range(min(all_inputs.count(), 20)):
        inp = all_inputs.nth(i)
        inp_type = inp.get_attribute("type") or "text"
        name = inp.get_attribute("name") or ""
        val = inp.input_value() or ""
        placeholder = inp.get_attribute("placeholder") or ""
        print(f"  Input {i}: type='{inp_type}' name='{name}' placeholder='{placeholder}' value='{val}'")
    _debug_screenshot(page, "dash_date_inputs")


def _set_filter(page, label: str, value: str) -> None:
    """Set a filter by finding an input near a label or under a column header."""
    
    # Attempt horizontal scroll if it's a wide table
    try:
        scrollable_containers = page.locator('.rt-table, .rt-tbody, .table-container, table').all()
        for container in scrollable_containers:
            try:
                container.evaluate("el => el.scrollLeft = 0")
            except Exception:
                pass
    except Exception:
        pass

    # We will try to find the column index and match it to the corresponding search box
    for attempt in range(5):
        try:
            # 1. Try to find input directly inside a table header with the label text
            try:
                header_input = page.locator(f'th:has-text("{label}") input[type="text"], th:has-text("{label}") input[type="search"], div.rt-th:has-text("{label}") input').first
                if header_input.count() > 0:
                    header_input.scroll_into_view_if_needed()
                    header_input.fill("")
                    header_input.type(value, delay=50)
                    page.keyboard.press("Enter")
                    print(f"[dash] [OK] Set column filter '{label}' to '{value}'")
                    return
            except Exception:
                pass

            # 2. Try to find the column index
            headers = page.locator("th, div.rt-th")
            if headers.count() > 0:
                for i in range(headers.count()):
                    header_text = (headers.nth(i).text_content() or "").strip()
                    if label.lower() in header_text.lower():
                        table = headers.nth(i).locator("xpath=ancestor::table | ancestor::*[contains(@class, 'rt-table')]").first
                        if table.count() > 0:
                            inputs = table.locator("thead input, tr:nth-child(2) input, div.rt-thead input, input[placeholder*='Search']")
                            if i < inputs.count():
                                inp = inputs.nth(i)
                                inp.scroll_into_view_if_needed()
                                inp.fill("")
                                inp.type(value, delay=50)
                                page.keyboard.press("Enter")
                                print(f"[dash] [OK] Set column #{i} ({header_text}) filter '{label}' to '{value}'")
                                return
        except Exception as e:
            print(f"[dash] [DEBUG] Index matching failed: {e}")
            
        # Scroll right a bit for the next attempt
        try:
            scrollable_containers = page.locator('.rt-table, .rt-tbody, .table-container, table').all()
            for container in scrollable_containers:
                try:
                    container.evaluate("el => el.scrollLeft += 400")
                except Exception:
                    pass
            time.sleep(0.5)
        except Exception:
            break

    # 2b. Try layout selector
    try:
        below_input = page.locator(f'input[type="text"]:below(:text("{label}")), input[placeholder*="Search"]:below(:text("{label}"))').first
        if below_input.count() > 0:
            below_input.scroll_into_view_if_needed()
            below_input.fill("")
            below_input.type(value, delay=50)
            page.keyboard.press("Enter")
            print(f"[dash] [OK] Set layout filter '{label}' to '{value}'")
            return
    except Exception:
        pass

    # 3. Try looking for select/dropdown by name/id
    try:
        selects = page.locator("select:visible")
        for i in range(selects.count()):
            sel = selects.nth(i)
            sel_name = (sel.get_attribute("name") or "").lower()
            sel_id = (sel.get_attribute("id") or "").lower()
            if label.lower() in sel_name or label.lower() in sel_id:
                sel.select_option(label=value)
                print(f"[dash] [OK] Set dropdown '{label}' to '{value}'")
                return
    except Exception:
        pass

    # 4. Try input by placeholder or name
    try:
        all_inputs = page.locator("input:visible")
        for i in range(all_inputs.count()):
            inp = all_inputs.nth(i)
            placeholder = (inp.get_attribute("placeholder") or "").lower()
            name = (inp.get_attribute("name") or "").lower()
            if label.lower() in placeholder or label.lower() in name:
                inp.fill("")
                inp.type(value, delay=50)
                page.keyboard.press("Enter")
                time.sleep(0.5)
                try:
                    option = page.locator(f'li:has-text("{value}"):visible, option:has-text("{value}"):visible')
                    if option.count() > 0:
                        option.first.click()
                except Exception:
                    pass
                print(f"[dash] [OK] Set text input '{label}' to '{value}'")
                return
    except Exception:
        pass
    print(f"[dash] [WARN] Could not set filter for '{label}'")

    print(f"[dash] [WARN] Could not find filter for '{label}'")


def _click_go(page) -> None:
    """Click the Go/Search/Apply button."""
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
                time.sleep(3)
                time.sleep(3)
                print(f"[dash] [OK] Clicked Go/Search ({sel})")
                return
        except Exception:
            continue
    print("[dash] [WARN] No Go button found")


def _click_download(page, report_name: str) -> str | None:
    """Click the download/export button."""
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

    for sel in selectors:
        try:
            loc = page.locator(sel)
            if loc.count() > 0:
                print(f"[dash] Found download via: {sel}")
                with page.expect_download(timeout=DOWNLOAD_TIMEOUT_MS) as dl_info:
                    loc.first.click()
                download = dl_info.value
                save_dir = Path("C:/Users/scag3s29/Downloads")
                suggested = download.suggested_filename or f"dash_{report_name}_{int(time.time())}.csv"
                target = save_dir / suggested
                download.save_as(str(target))
                print(f"[dash] [OK] Downloaded {report_name}: {target}")
                return str(target)
        except Exception:
            continue

    print(f"[dash] [WARN] No download button found for {report_name}")
    _debug_screenshot(page, f"dash_{report_name}_no_download")
    return None


# ---------------------------------------------------------------------------
# Login & MFA
# ---------------------------------------------------------------------------

def _is_login_page(page) -> bool:
    url = page.url.lower()
    if "login" in url or "signin" in url or "adfs" in url or "microsoftonline" in url:
        return True
    try:
        if page.locator('input[type="password"]:visible').count() > 0:
            return True
        if page.locator('input[name="UserName"]:visible, input[name="loginfmt"]:visible').count() > 0:
            return True
    except Exception:
        pass
    return False


def _perform_login(page, username: str, password: str) -> None:
    """Handle Allstate/Microsoft login flow (may be multi-step)."""
    _debug_screenshot(page, "dash_login_step")

    # Microsoft/ADFS login can be multi-step: username first, then password
    # Step 1: Username
    user_input = page.locator('input[name="loginfmt"]:visible, input[name="UserName"]:visible, input[type="email"]:visible, input[name="username"]:visible')
    if user_input.count() > 0:
        user_input.first.fill(username)
        # Click Next/Submit
        next_btn = page.locator('input[type="submit"]:visible, button[type="submit"]:visible, button:has-text("Next"):visible')
        if next_btn.count() > 0:
            next_btn.first.click()
        time.sleep(3)
        _debug_screenshot(page, "dash_after_username")

    # Step 2: Password
    pw_input = page.locator('input[type="password"]:visible, input[name="passwd"]:visible, input[name="Password"]:visible')
    if pw_input.count() > 0:
        pw_input.first.fill(password)
        submit = page.locator('input[type="submit"]:visible, button[type="submit"]:visible, button:has-text("Sign in"):visible')
        if submit.count() > 0:
            submit.first.click()
        else:
            pw_input.first.press("Enter")
        time.sleep(3)
        _debug_screenshot(page, "dash_after_password")

    # "Stay signed in?" prompt
    try:
        stay_signed = page.locator('input[value="Yes"]:visible, button:has-text("Yes"):visible')
        if stay_signed.count() > 0:
            stay_signed.first.click()
            time.sleep(2)
            print("[dash] [OK] Clicked 'Stay signed in: Yes'")
    except Exception:
        pass

    page.wait_for_load_state("domcontentloaded", timeout=30000)


def _is_mfa_page(page) -> bool:
    url = page.url.lower()
    body = ""
    try:
        body = page.locator("body").inner_text().lower()
    except Exception:
        pass
    mfa_keywords = [
        "approve", "verify", "authenticator", "sign-in request",
        "notification", "approve a request", "identity",
        "additional verification", "more information required"
    ]
    if any(kw in url or kw in body for kw in mfa_keywords):
        return True
    return False


def _wait_for_mfa_completion(page) -> bool:
    """Wait for the user to manually enter the MFA code and proceed."""
    print("[dash] Waiting for MFA completion (checking for dashboard elements)...")
    # Poll every 2 seconds for up to 5 minutes, checking multiple indicators
    indicators = [
        'text="Dashboards"',
        'text="Welcome to DASH!"',
        'text="Primary"',
        'button:has-text("OK")',
        'text="P&C Quotes"',
    ]
    deadline = time.time() + 300  # 5 minutes
    while time.time() < deadline:
        for sel in indicators:
            try:
                loc = page.locator(sel)
                if loc.count() > 0 and loc.first.is_visible():
                    print(f"[dash] [OK] MFA completed — detected '{sel}' on page")
                    return True
            except Exception:
                pass
        time.sleep(2)
    print("[dash] [FAIL] MFA not completed in time")
    _debug_screenshot(page, "mfa_timeout")
    return False

def _select_primary_agency(page) -> None:
    """Select the primary agency from the dropdown if it exists."""
    try:
        print("[dash] Waiting for agency selection panel...")
        # Wait up to 15 seconds for the "OK" button
        ok_btn = None
        for _ in range(15):
            btns = page.locator('button:has-text("OK"):visible, input[value="OK"]:visible, a:has-text("OK"):visible')
            if btns.count() > 0:
                ok_btn = btns.first
                break
            time.sleep(1)
            
        if not ok_btn:
            print("[dash] Agency selection panel did not appear.")
            return

        print("[dash] Agency selection panel is visible.")
        
        # Look for native selects first
        dropdowns = page.locator('select:visible')
        found_native = False
        for i in range(dropdowns.count()):
            sel = dropdowns.nth(i)
            # Find an option that contains the agency
            try:
                options = sel.locator('option:has-text("ALSOP")')
                if options.count() > 0:
                    val = options.first.get_attribute("value")
                    sel.select_option(value=val)
                    print("[dash] [OK] Selected Primary Agency via native select")
                    found_native = True
                    break
            except Exception:
                pass
                
        if not found_native:
            # Click the dropdown under Primary
            primary_label = page.locator('label:has-text("Primary"), div:has-text("Primary")').last
            if primary_label.count() > 0:
                box = primary_label.bounding_box()
                if box:
                    page.mouse.click(box["x"] + 10, box["y"] + box["height"] + 15)
                    print("[dash] Clicked Primary dropdown")
                    time.sleep(2)
            else:
                # Fallback: Just click the dropdown that says "Select"
                select_dropdown = page.locator('text="Select"').last
                if select_dropdown.count() > 0:
                    select_dropdown.click(force=True)
                    print("[dash] Clicked Select dropdown")
                    time.sleep(2)
            
            # Now look for the agency option
            agency_opt = page.locator('text=097762').first
            if agency_opt.count() == 0:
                agency_opt = page.locator('text=ALSOP').first
                
            if agency_opt.count() > 0:
                agency_opt.click(force=True)
                print("[dash] Selected agency option")
                time.sleep(1)
            else:
                print("[dash] [WARN] Could not find the agency option in the dropdown list")
        
        # Click OK
        ok_btn.click(force=True)
        print("[dash] [OK] Clicked OK button to apply agency")
        time.sleep(5)  # Wait for the dashboard to refresh with new cards
        return
    except Exception as e:
        print(f"[dash] [WARN] Could not select primary agency: {e}")


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def _click_first_match(page, selectors: list[str], description: str) -> bool:
    for sel in selectors:
        try:
            loc = page.locator(sel)
            if loc.count() > 0:
                loc.first.click()
                print(f"[dash] [OK] Clicked {description} via: {sel}")
                return True
        except Exception:
            continue
    print(f"[dash] [WARN] Could not find {description}")
    _dump_page_info(page)
    return False


def _dump_page_info(page) -> None:
    try:
        links = page.locator("a:visible")
        count = links.count()
        print(f"[dash] Visible links ({count}):")
        for i in range(min(count, 25)):
            try:
                text = links.nth(i).inner_text().strip().replace("\n", " ")[:80]
                href = links.nth(i).get_attribute("href") or ""
                print(f"  Link {i}: text='{text}' href='{href[:60]}'")
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
        print(f"[dash] Screenshot saved: {path}")
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

    report_type = "both"
    target = None
    headless = True

    args = sys.argv[1:]
    if "--no-headless" in args:
        headless = False
        args.remove("--no-headless")

    if len(args) > 0:
        if args[0] in ("quotes", "nb", "both"):
            report_type = args[0]
            if len(args) > 1:
                target = args[1]
        else:
            target = args[0]

    results = download_dash_report(config, report_type=report_type, target_date=target, headless=headless)
    if any(v for v in results.values()):
        for k, v in results.items():
            print(f"  {k}: {v}")
        print("\n[OK] Success")
    else:
        print("\n[FAIL] No reports downloaded")
        sys.exit(1)
