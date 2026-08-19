"""Deeper inspection of DSR sheet to find actual header and data rows."""
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta

ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
rels_ns = "http://schemas.openxmlformats.org/package/2006/relationships"

DSR_PATH = r"C:\Users\scag3s29\Documents\Claude Scope\Daily Standup Report.xlsx"

zf = zipfile.ZipFile(DSR_PATH)

strings = []
if "xl/sharedStrings.xml" in zf.namelist():
    tree = ET.parse(zf.open("xl/sharedStrings.xml"))
    for si in tree.findall(f".//{{{ns}}}si"):
        texts = si.findall(f".//{{{ns}}}t")
        strings.append("".join(t.text or "" for t in texts))

# Read sheet1 (DSR)
tree = ET.parse(zf.open("xl/worksheets/sheet1.xml"))
rows = tree.findall(f".//{{{ns}}}row")

base = datetime(1899, 12, 30)

def cell_val(cell):
    t = cell.get("t")
    v = cell.find(f"{{{ns}}}v")
    val = v.text if v is not None else ""
    if t == "s" and val:
        val = strings[int(val)]
    return val

# Print first 10 rows to find the real header
print("=== First 10 rows (finding header) ===")
for i, row in enumerate(rows[:10]):
    row_num = row.get("r", str(i))
    cells = {}
    for cell in row.findall(f"{{{ns}}}c"):
        ref = cell.get("r", "")
        col = "".join(ch for ch in ref if ch.isalpha())
        cells[col] = cell_val(cell)
    
    # Print non-empty cells
    non_empty = {k: v for k, v in cells.items() if v}
    print(f"  Row {row_num}: {dict(sorted(non_empty.items()))}")

# Now look at a range that might be the actual data
# Look for rows that contain "Date" or date-like values
print("\n=== Searching for header row with 'Date' ===")
header_row_idx = None
for i, row in enumerate(rows):
    for cell in row.findall(f"{{{ns}}}c"):
        val = cell_val(cell)
        if val == "Date":
            row_num = row.get("r", str(i))
            print(f"  Found 'Date' in row {row_num}")
            header_row_idx = i
            
            # Print all cells in this row
            cells = {}
            for c in row.findall(f"{{{ns}}}c"):
                ref = c.get("r", "")
                col = "".join(ch for ch in ref if ch.isalpha())
                cells[col] = cell_val(c)
            non_empty = {k: v for k, v in cells.items() if v}
            print(f"  Header: {dict(sorted(non_empty.items()))}")
            break
    if header_row_idx is not None:
        break

if header_row_idx is not None:
    # Print 5 data rows after header
    print(f"\n=== Data rows after header (rows {header_row_idx+1} to {header_row_idx+6}) ===")
    header_cells = {}
    for cell in rows[header_row_idx].findall(f"{{{ns}}}c"):
        ref = cell.get("r", "")
        col = "".join(ch for ch in ref if ch.isalpha())
        header_cells[col] = cell_val(cell)
    
    for row in rows[header_row_idx+1:header_row_idx+6]:
        data = {}
        for cell in row.findall(f"{{{ns}}}c"):
            ref = cell.get("r", "")
            col = "".join(ch for ch in ref if ch.isalpha())
            val = cell_val(cell)
            col_name = header_cells.get(col, col)
            if col_name and val:
                data[col_name] = val
        
        # Parse date
        date_raw = data.get("Date", "")
        try:
            serial = int(float(date_raw))
            dt = (base + timedelta(days=serial)).strftime("%Y-%m-%d")
        except:
            dt = date_raw
        
        print(f"  {dt}  {data.get('Agent', '?'):<16s}  "
              f"calls={data.get('Total Calls', '?'):<6s}  "
              f"inb={data.get('Inbound', '?'):<5s}  "
              f"out={data.get('Outbound', '?'):<5s}  "
              f"texts={data.get('Total Texts', '?'):<5s}  "
              f"quotes={data.get('Quotes', '?'):<5s}  "
              f"nb={data.get('NB', '?'):<3s}")
    
    # Find data for 5/1, 5/2, 5/3
    print(f"\n=== Rows for 5/1, 5/2, 5/3 ===")
    from datetime import date
    targets = {date(2026,5,1), date(2026,5,2), date(2026,5,3)}
    count = 0
    for row in rows[header_row_idx+1:]:
        data = {}
        for cell in row.findall(f"{{{ns}}}c"):
            ref = cell.get("r", "")
            col = "".join(ch for ch in ref if ch.isalpha())
            val = cell_val(cell)
            col_name = header_cells.get(col, col)
            data[col_name] = val
        
        date_raw = data.get("Date", "")
        try:
            serial = int(float(date_raw))
            dt = (base + timedelta(days=serial)).date()
        except:
            continue
        
        if dt in targets:
            count += 1
            print(f"  {dt}  {data.get('Agent', '?'):<16s}  "
                  f"calls={data.get('Total Calls', '?'):<6s}  "
                  f"inb={data.get('Inbound', '?'):<5s}  "
                  f"out={data.get('Outbound', '?'):<5s}  "
                  f"texts={data.get('Total Texts', '?'):<5s}  "
                  f"otxt={data.get('Outbound Texts', '?'):<5s}  "
                  f"quotes={data.get('Quotes', '?'):<5s}  "
                  f"nb={data.get('NB', '?'):<3s}  "
                  f"items={data.get('Items', '?')}")
    
    print(f"\n  Total matching rows: {count}")
