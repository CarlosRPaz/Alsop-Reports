import re
with open('fpage_dump.html', encoding='utf-8') as f: html = f.read()
headers = re.findall(r'<div class="report-column-header"[^>]*><div[^>]*>(.*?)</div>', html)
print("Headers:", headers)
