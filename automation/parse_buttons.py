import re
with open('comment_dump.html', 'r', encoding='utf-8') as f: html = f.read()
buttons = re.findall(r'<button[^>]*>.*?</button>', html, re.IGNORECASE)
for b in buttons: print("B:", b)
inputs = re.findall(r'<input[^>]*type="button"[^>]*>|<input[^>]*type="submit"[^>]*>', html, re.IGNORECASE)
for i in inputs: print("I:", i)
