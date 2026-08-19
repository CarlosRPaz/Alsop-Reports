"""
email_watcher.py
----------------
Connects to Outlook via COM and extracts attachments from emails matching
configured filters for each data source.

Each source has its own config in config.json:
  - sender_filter: partial match on sender email/name
  - subject_filter: partial match on subject line
  - attachment_filter: partial match on attachment filename (e.g. "users" to grab only Users file)
  - folder: Outlook folder path (e.g. "Inbox/Daily Reports"). Defaults to "Inbox"
  - lookback_days: how many days back to search

Only downloads the most recent matching email per source (avoids duplicates).

Requirements:
  - Microsoft Outlook must be installed and signed in on this machine.
  - pip install pywin32
"""

import win32com.client
import pythoncom
from datetime import datetime, timedelta
from pathlib import Path


def fetch_source_attachments(config: dict, source_name: str) -> list[Path]:
    """
    Fetch email attachments for a specific data source.
    source_name should match a key in config["email_sources"], e.g. "rc", "rico", "hs".
    Returns list of saved file paths.
    """
    source_config = config.get("email_sources", {}).get(source_name)
    if not source_config:
        print(f"[email_watcher] No email config for source '{source_name}', skipping.")
        return []

    dest_folder = Path(config["download"]["raw_data_folder"])
    dest_folder.mkdir(parents=True, exist_ok=True)

    folder_path = source_config.get("folder", "Inbox")
    emails = _get_matching_emails(
        sender_filter=source_config.get("sender_filter", ""),
        subject_filter=source_config.get("subject_filter", ""),
        lookback_days=source_config.get("lookback_days", 2),
        folder_path=folder_path,
    )

    if not emails:
        print(f"[email_watcher] {source_name}: no matching emails found in {folder_path}.")
        return []

    # Only process the most recent matching email
    most_recent = emails[0]
    att_filter = source_config.get("attachment_filter", "")
    saved = _save_attachments(most_recent, dest_folder, prefix=source_name, att_name_filter=att_filter)
    print(f"[email_watcher] {source_name}: saved {len(saved)} attachment(s) from \"{most_recent['subject']}\"")
    return saved


def fetch_all_sources(config: dict) -> dict[str, list[Path]]:
    """Fetch attachments for all configured email sources. Returns {source: [paths]}."""
    results = {}
    for source_name in config.get("email_sources", {}):
        results[source_name] = fetch_source_attachments(config, source_name)
    return results


def list_recent_emails(folder_path: str = "Inbox", lookback_days: int = 3,
                       limit: int = 30) -> list[dict]:
    """
    List recent emails with attachments. Useful for figuring out filter patterns.
    Returns list of {subject, sender, received_time, attachment_names}.
    """
    pythoncom.CoInitialize()
    try:
        outlook = win32com.client.DispatchEx("Outlook.Application")
        namespace = outlook.GetNamespace("MAPI")
        folder = _resolve_folder(namespace, folder_path)

        cutoff = datetime.now() - timedelta(days=lookback_days)
        cutoff_str = cutoff.strftime("%m/%d/%Y %H:%M %p")

        items = folder.Items
        items.Sort("[ReceivedTime]", True)
        filtered = items.Restrict(f"[ReceivedTime] >= '{cutoff_str}'")

        results = []
        for item in filtered:
            if len(results) >= limit:
                break
            try:
                if item.Attachments.Count == 0:
                    continue
                att_names = [item.Attachments.Item(j).FileName
                             for j in range(1, item.Attachments.Count + 1)]
                results.append({
                    "subject": item.Subject,
                    "sender": item.SenderEmailAddress,
                    "received_time": item.ReceivedTime.replace(tzinfo=None),
                    "attachment_count": item.Attachments.Count,
                    "attachment_names": att_names,
                })
            except Exception:
                continue

        outlook.Quit()
        return results
    finally:
        pythoncom.CoUninitialize()


def _resolve_folder(namespace, folder_path: str):
    """
    Resolve an Outlook folder by path.
    Examples:
      "Inbox" -> default inbox
      "Inbox/Daily Reports" -> subfolder of inbox
      "Inbox/Hearsay Texts" -> subfolder of inbox
    """
    parts = folder_path.strip("/").split("/")

    # Start from inbox if path starts with "Inbox"
    if parts[0].lower() == "inbox":
        folder = namespace.GetDefaultFolder(6)  # 6 = Inbox
        parts = parts[1:]  # consume the "Inbox" part
    else:
        folder = namespace.GetDefaultFolder(6)

    # Navigate through subfolders
    for part in parts:
        if not part:
            continue
        try:
            folder = folder.Folders(part)
        except Exception as e:
            raise ValueError(f"Outlook folder not found: '{part}' in path '{folder_path}'. Error: {e}")

    return folder


def _get_matching_emails(
    sender_filter: str = "",
    subject_filter: str = "",
    lookback_days: int = 2,
    folder_path: str = "Inbox",
) -> list[dict]:
    """Find emails matching sender/subject filters within lookback window."""
    pythoncom.CoInitialize()
    try:
        outlook = win32com.client.DispatchEx("Outlook.Application")
        namespace = outlook.GetNamespace("MAPI")
        folder = _resolve_folder(namespace, folder_path)

        cutoff = datetime.now() - timedelta(days=lookback_days)
        sender_filter = sender_filter.lower()
        subject_filter = subject_filter.lower()

        # Use Restrict for speed
        cutoff_str = cutoff.strftime("%m/%d/%Y %H:%M %p")
        restriction = f"[ReceivedTime] >= '{cutoff_str}'"

        items = folder.Items
        items.Sort("[ReceivedTime]", True)
        filtered = items.Restrict(restriction)

        results = []
        for item in filtered:
            try:
                if item.Attachments.Count == 0:
                    continue

                sender_email = getattr(item, "SenderEmailAddress", "") or ""
                sender_name = getattr(item, "SenderName", "") or ""
                subject = getattr(item, "Subject", "") or ""

                # Check sender filter against both email and display name
                if sender_filter:
                    if (sender_filter not in sender_email.lower()
                            and sender_filter not in sender_name.lower()):
                        continue

                # Check subject filter
                if subject_filter and subject_filter not in subject.lower():
                    continue

                # Check for Excel/CSV attachments
                has_data_file = False
                for j in range(1, item.Attachments.Count + 1):
                    fname = item.Attachments.Item(j).FileName.lower()
                    if any(fname.endswith(ext) for ext in (".xlsx", ".xls", ".csv")):
                        has_data_file = True
                        break
                if not has_data_file:
                    continue

                received = item.ReceivedTime
                # Strip timezone if present
                if hasattr(received, 'replace'):
                    try:
                        received = received.replace(tzinfo=None)
                    except Exception:
                        pass

                results.append({
                    "subject": subject,
                    "sender": sender_email,
                    "received_time": received,
                    "raw_item": item,
                })
            except Exception:
                continue

        # Don't quit outlook here — the raw_items need the COM connection alive
        return results

    except Exception:
        pythoncom.CoUninitialize()
        raise


def _save_attachments(email: dict, dest_folder: Path, prefix: str = "",
                      att_name_filter: str = "") -> list[Path]:
    """Save attachments from an email. Optionally filter by attachment filename."""
    saved = []
    raw = email.get("raw_item")
    if raw is None:
        return saved

    received = email["received_time"]
    if hasattr(received, 'strftime'):
        date_str = received.strftime("%Y%m%d")
    else:
        date_str = "unknown"

    att_name_filter = att_name_filter.lower()

    for i in range(1, raw.Attachments.Count + 1):
        att = raw.Attachments.Item(i)
        filename = att.FileName
        # Only save Excel/CSV files
        if not any(filename.lower().endswith(ext) for ext in (".xlsx", ".xls", ".csv")):
            continue
        # If attachment filter set, only save files whose name contains it
        if att_name_filter and att_name_filter not in filename.lower():
            continue
        # Save with source prefix for the parser to find
        # e.g. "rc_20260323_Office_Perf_Users_03_23_2026.xlsx"
        out_name = f"{prefix}_{date_str}_{filename}" if prefix else filename
        out_path = (dest_folder / out_name).resolve()
        att.SaveAsFile(str(out_path))
        saved.append(out_path)
        print(f"  >> {out_path.name}")

    return saved


# ---------------------------------------------------------------------------
# MFA Code Extraction
# ---------------------------------------------------------------------------

def get_recent_mfa_code(
    sender_filter: str = "",
    subject_filter: str = "",
    lookback_minutes: int = 5,
    folder_path: str = "Inbox",
    max_retries: int = 12,
    retry_delay: float = 5.0,
) -> str | None:
    """
    Search recent Outlook emails for a 6-digit MFA verification code.

    Polls the inbox up to `max_retries` times (with `retry_delay` seconds
    between attempts) to handle email delivery latency.

    Parameters
    ----------
    sender_filter : str
        Partial match against sender email address or display name.
    subject_filter : str
        Partial match against subject line.
    lookback_minutes : int
        Only search emails received within the last N minutes.
    folder_path : str
        Outlook folder path (e.g. "Inbox").
    max_retries : int
        Number of polling attempts before giving up.
    retry_delay : float
        Seconds between polling attempts.

    Returns
    -------
    str | None : The 6-digit code, or None if not found.
    """
    import re as _re
    import time as _time

    sender_filter = sender_filter.lower()
    subject_filter = subject_filter.lower()

    for attempt in range(1, max_retries + 1):
        print(f"[email_watcher] MFA code scan attempt {attempt}/{max_retries}...")
        pythoncom.CoInitialize()
        try:
            outlook = win32com.client.DispatchEx("Outlook.Application")
            namespace = outlook.GetNamespace("MAPI")
            folder = _resolve_folder(namespace, folder_path)

            cutoff = datetime.now() - timedelta(minutes=lookback_minutes)
            cutoff_str = cutoff.strftime("%m/%d/%Y %H:%M %p")

            items = folder.Items
            items.Sort("[ReceivedTime]", True)  # newest first
            filtered = items.Restrict(f"[ReceivedTime] >= '{cutoff_str}'")

            for item in filtered:
                try:
                    sender_email = (getattr(item, "SenderEmailAddress", "") or "").lower()
                    sender_name = (getattr(item, "SenderName", "") or "").lower()
                    subject = (getattr(item, "Subject", "") or "").lower()

                    # Apply filters
                    if sender_filter:
                        if sender_filter not in sender_email and sender_filter not in sender_name:
                            continue
                    if subject_filter:
                        if subject_filter not in subject:
                            continue

                    # Extract the body text
                    body = getattr(item, "Body", "") or ""

                    # Look for 6-digit code patterns
                    # Common patterns: standalone 6 digits, "code: 123456", "123456"
                    codes = _re.findall(r'\b(\d{6})\b', body)
                    if codes:
                        code = codes[0]
                        subj_display = (getattr(item, "Subject", "") or "")[:50]
                        print(f"[email_watcher] Found MFA code: {code} (from: \"{subj_display}\")")
                        return code

                    # Also check subject for codes
                    subj_codes = _re.findall(r'\b(\d{6})\b', getattr(item, "Subject", "") or "")
                    if subj_codes:
                        code = subj_codes[0]
                        print(f"[email_watcher] Found MFA code in subject: {code}")
                        return code

                except Exception:
                    continue

        except Exception as e:
            print(f"[email_watcher] MFA scan error: {e}")
        finally:
            pythoncom.CoUninitialize()

        if attempt < max_retries:
            print(f"[email_watcher] No MFA code yet, retrying in {retry_delay}s...")
            _time.sleep(retry_delay)

    print("[email_watcher] MFA code not found after all retries")
    return None

