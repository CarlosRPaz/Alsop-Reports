import re
with open('comment_dump.html', 'r', encoding='utf-8') as f:
    html = f.read()

inputs = re.findall(r'<input[^>]*>', html, re.IGNORECASE)
for i in inputs:
    if 'text' in i.lower() or 'search' in i.lower() or 'date' in i.lower():
        print(i)

print('--- textareas ---')
textareas = re.findall(r'<textarea[^>]*>', html, re.IGNORECASE)
for t in textareas:
    print(t)
    
print('--- labels ---')
labels = re.findall(r'<label[^>]*>.*?</label>', html, re.IGNORECASE)
for l in labels:
    print(l)
