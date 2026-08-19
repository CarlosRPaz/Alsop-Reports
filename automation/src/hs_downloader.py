"""
hs_downloader.py — Auto-download Hearsay reports via browser.

Extracts download URLs from today's Hearsay "Report created" emails in Outlook,
then opens them all in the default browser. Since the user is already logged
into Hearsay, each page auto-downloads the CSV.

Usage:
    from src.hs_downloader import download_hs_reports
    count = download_hs_reports(lookback_days=1)
"""

import os
import re
import subprocess
import webbrowser
import win32com.client
import pythoncom
from datetime import date, datetime, timedelta
from urllib.parse import unquote


# Explicit Edge paths — tried in order. First one that exists wins.
_EDGE_CANDIDATES = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"),
]


def _find_edge() -> str | None:
    for p in _EDGE_CANDIDATES:
        if p and os.path.exists(p):
            return p
    return None


def download_hs_reports(
    lookback_days: int = 1,
    folder_path: str = "Inbox/Daily Reports",
    delay_seconds: float = 0.5,
    target_date: date | None = None,
) -> int:
    """
    Extract Hearsay download URLs from recent Outlook emails and open them
    in the default browser to trigger auto-downloads.

    Parameters
    ----------
    lookback_days : int
        How many days back to search for emails (only used if target_date is None).
    folder_path : str
        Outlook folder path to search.
    delay_seconds : float
        Delay between opening tabs to avoid overwhelming the browser.
    target_date : date, optional
        If provided, strictly looks for emails received for this target report date.

    Returns
    -------
    int : Number of download URLs opened.
    """
    urls = get_hs_download_urls(lookback_days, folder_path, target_date)

    if not urls:
        print("[hs_downloader] No Hearsay download URLs found.")
        return 0

    edge_path = _find_edge()
    import time as _time

    if edge_path:
        print(f"[hs_downloader] Opening {len(urls)} Hearsay download links in Edge...")
        for i, url in enumerate(urls):
            subprocess.Popen([edge_path, url])
            if i < len(urls) - 1:
                _time.sleep(delay_seconds)
    else:
        print("[hs_downloader] Edge not found — falling back to default browser.")
        for i, url in enumerate(urls):
            webbrowser.open(url)
            if i < len(urls) - 1:
                _time.sleep(delay_seconds)

    print(f"[hs_downloader] Opened {len(urls)} tabs. CSVs will auto-download.")
    print("[hs_downloader] Wait for all downloads to finish before running the pipeline.")
    return len(urls)


def get_hs_download_urls(
    lookback_days: int = 1,
    folder_path: str = "Inbox/Daily Reports",
    target_date: date | None = None,
) -> list[str]:
    """
    Scan Outlook for Hearsay "Report created" emails and extract the
    schedule_result download URLs.
    """
    pythoncom.CoInitialize()
    try:
        outlook = win32com.client.DispatchEx("Outlook.Application")
        ns = outlook.GetNamespace("MAPI")

        # Navigate to folder
        folder = ns.GetDefaultFolder(6)  # Inbox
        for part in folder_path.strip("/").split("/")[1:]:  # skip "Inbox"
            folder = folder.Folders(part)

        if target_date:
            # Safe window: received between target_date and 2 days after target_date
            # (Hearsay scheduled reports for date D are generated and received on D+1 morning)
            start_dt = datetime.combine(target_date, datetime.min.time())
            end_dt = datetime.combine(target_date + timedelta(days=2), datetime.max.time())
            start_str = start_dt.strftime("%m/%d/%Y %I:%M %p")
            end_str = end_dt.strftime("%m/%d/%Y %I:%M %p")
            print(f"[hs_downloader] Filtering Hearsay emails received between {start_str} and {end_str}")
            
            items = folder.Items
            items.Sort("[ReceivedTime]", True)
            restricted = items.Restrict(f"[ReceivedTime] >= '{start_str}' AND [ReceivedTime] <= '{end_str}'")
        else:
            cutoff = datetime.now() - timedelta(days=lookback_days)
            cutoff_str = cutoff.strftime("%m/%d/%Y %H:%M %p")
            print(f"[hs_downloader] Filtering Hearsay emails received since {cutoff_str}")

            items = folder.Items
            items.Sort("[ReceivedTime]", True)
            restricted = items.Restrict(f"[ReceivedTime] >= '{cutoff_str}'")

        urls = []
        for item in restricted:
            try:
                subj = getattr(item, "Subject", "") or ""
                if "report created" not in subj.lower():
                    continue

                sender = getattr(item, "SenderEmailAddress", "") or ""
                if "hearsay" not in sender.lower():
                    sender_name = getattr(item, "SenderName", "") or ""
                    if "hearsay" not in sender_name.lower():
                        continue

                body = item.HTMLBody
                # Find schedule_result download links
                links = re.findall(
                    r'href=["\']([^"\'> ]+schedule_result[^"\'> ]+)["\']',
                    body
                )
                for link in links:
                    # Decode Outlook SafeLinks wrapper
                    safe_match = re.search(r'url=([^&]+)', link)
                    if safe_match:
                        actual_url = unquote(safe_match.group(1))
                        # Clean up any HTML entities
                        actual_url = actual_url.replace("&amp;", "&")
                        urls.append(actual_url)
                    elif "hearsaysocial.com" in link:
                        urls.append(link)
            except Exception:
                continue

        outlook.Quit()
        return urls

    finally:
        pythoncom.CoUninitialize()
