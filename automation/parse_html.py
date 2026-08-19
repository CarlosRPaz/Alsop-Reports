from bs4 import BeautifulSoup
import re

with open("dash_main.html", "r", encoding="utf-8") as f:
    html = f.read()

soup = BeautifulSoup(html, "html.parser")
# Find primary agency dropdown/inputs
print("--- AGENCY ELEMENTS ---")
for tag in soup.find_all(string=re.compile("ALSOP", re.IGNORECASE)):
    print(tag.parent.prettify())

print("\n--- BUTTONS ---")
for btn in soup.find_all(["button", "a", "input"], string=re.compile("OK", re.IGNORECASE)):
    print(btn.prettify())
