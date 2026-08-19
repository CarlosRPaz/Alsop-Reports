import re

with open('src/dash_downloader.py', 'r') as f:
    c = f.read()

lines = c.split('\n')
new_lines = []
i = 0
while i < len(lines):
    line = lines[i]
    if 'try:' in line and i+1 < len(lines) and 'page.wait_for_load_state("domcontentloaded"' in lines[i+1]:
        new_lines.append(line.replace('try:', 'time.sleep(3)'))
        i += 3
        continue
    if 'page.wait_for_load_state("networkidle"' in line:
        new_lines.append(re.sub(r'page\.wait_for_load_state\(\"networkidle\"[^\)]*\)', 'time.sleep(3)', line))
        i += 1
        continue
    
    # Catch any remaining corrupted bits from powershell
    if 'try: page.wait_for_load_state' in line or 'except Exception: pass' in line or 'SyntaxError' in line:
        i += 1
        continue

    new_lines.append(line)
    i += 1

with open('src/dash_downloader.py', 'w') as f:
    f.write('\n'.join(new_lines))
