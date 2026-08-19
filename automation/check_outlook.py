"""Quick check of Outlook for RC emails."""
from src.email_watcher import list_recent_emails

emails = list_recent_emails("Inbox/Daily Reports", lookback_days=2, limit=5)
for e in emails:
    subj = e["subject"][:60]
    sender = e["sender"][:50]
    when = e["received_time"]
    atts = e["attachment_names"]
    print(f"  Subject: {subj}")
    print(f"  Sender:  {sender}")
    print(f"  When:    {when}")
    print(f"  Attachments: {atts}")
    print()
