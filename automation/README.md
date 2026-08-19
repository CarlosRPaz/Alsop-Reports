# Excel Report Automation

Automated pipeline that produces the **Daily Standup Report (DSR)** for an Allstate insurance agency. Pulls data from 6+ systems (RingCentral, Ricochet, HiSales, New Business, Quotes, AgencyZoom), resolves agent name mismatches across systems, and generates a formatted Excel report.

---

## Table of Contents
1. [How It Works](#how-it-works)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Configuration](#configuration)
5. [Daily Usage](#daily-usage)
6. [Screenshot OCR Setup](#screenshot-ocr-setup)
7. [Folder Structure](#folder-structure)
8. [Customizing](#customizing)
9. [Scheduling](#scheduling)
10. [Troubleshooting](#troubleshooting)

---

## How It Works

```
Outlook Inbox                     Manual Downloads
(RC, Rico, HS emails)             (NB, Quotes, Premium)
       │                                  │
       ▼                                  ▼
[email_watcher.py]              User drops files in data/raw/
       │                                  │
       └──────────┬───────────────────────┘
                  ▼
         [Spine] name resolver
         (maps agent names across all 6 systems)
                  │
     ┌────────────┼────────────┐
     ▼            ▼            ▼
 [rc_parser]  [hs_parser]  [nb_parser]  ...
     │            │            │
     └────────────┼────────────┘
                  ▼
     [screenshot_reader.py]  ← Claude Vision reads eAgent/Rico screenshots
                  │
                  ▼
         [dsr_builder.py]
                  │
                  ▼
      reports/DSR_2026-03-20.xlsx
```

---

## Prerequisites

| Requirement | Notes |
|---|---|
| **Windows 10/11** | Required for Outlook COM automation |
| **Microsoft Outlook** | Must be installed and signed in |
| **Python 3.10+** | [python.org](https://www.python.org/downloads/) |
| **Git** | [git-scm.com](https://git-scm.com/) |
| **Anthropic API key** | Required for screenshot OCR only — [console.anthropic.com](https://console.anthropic.com/) |

---

## Installation

### 1. Clone the repository
```bash
git clone https://github.com/YOUR_ORG/excel-report-automation.git
cd excel-report-automation
```

### 2. Create and activate a virtual environment
```bash
python -m venv venv
venv\Scripts\activate
```

### 3. Install dependencies
```bash
pip install -r requirements.txt
```

### 4. Set up configuration
```bash
copy config\config.example.json config\config.json
```
Edit `config\config.json` — see [Configuration](#configuration).

### 5. Set environment variables (optional, for screenshot OCR)
```cmd
setx ANTHROPIC_API_KEY "sk-ant-..."
```
Restart terminal after setting.

---

## Configuration

Edit `config/config.json`:

```json
{
  "spine": {
    "path": "C:/path/to/Daily Standup Report.xlsx",
    "sheet_name": "Spine"
  },
  "email_sources": {
    "rc": {
      "sender_filter": "ringcentral",
      "subject_filter": "",
      "lookback_days": 2
    },
    "rico": {
      "sender_filter": "ricochet",
      "subject_filter": "",
      "lookback_days": 2
    },
    "hs": {
      "sender_filter": "hisales",
      "subject_filter": "",
      "lookback_days": 2
    }
  },
  "download": {
    "raw_data_folder": "data/raw"
  },
  "screenshots": {
    "folder": "data/screenshots"
  },
  "report": {
    "output_folder": "reports",
    "company_name": "Allstate Agency"
  }
}
```

### Key settings:
- **spine.path**: Path to the workbook containing the Spine sheet (agent name mapping)
- **email_sources**: Filters for auto-detecting email attachments per source
- **download.raw_data_folder**: Where raw data files are stored
- **screenshots.folder**: Where eAgent/Rico screenshots are saved for OCR

---

## Daily Usage

### Full run (Outlook + screenshots + report)
```bash
python main.py
```

### Specific date
```bash
python main.py --date 2026-03-19
```

### Skip Outlook (use existing files in data/raw/)
```bash
python main.py --skip-email
```

### Skip screenshot OCR
```bash
python main.py --skip-screenshots
```

### Skip both (just process what's in data/raw/)
```bash
python main.py --skip-email --skip-screenshots
```

### Typical daily workflow (~5 min)
1. Outlook is already open — the script grabs RC, Rico, HS attachments automatically
2. Download NB, Quotes, and Premium files from the web portal → save to `data/raw/`
3. Take screenshots of eAgent/Rico screens → save to `data/screenshots/`
4. Run `python main.py`
5. Open `reports/DSR_YYYY-MM-DD.xlsx`

---

## Screenshot OCR Setup

The screenshot reader uses Claude's Vision API to read numbers from eAgent and Ricochet screenshots, replacing 30+ minutes of manual data entry.

### How to use:
1. Take screenshots of the relevant eAgent/Rico screens
2. Save them to `data/screenshots/` (PNG, JPG, etc.)
3. Run the pipeline — the screenshot reader processes them automatically

### Supported screenshot types:
- eAgent Dismissed To-Do's
- eAgent Past Due To-Do's
- Rico Hot Pipeline
- eAgent #PIVOT comments
- eAgent #SAVED comments
- Rico Unique Leads
- eAgent Contact/Quoted/Hot/x-sale pipeline

### Tips for accurate OCR:
- Take clear, full-resolution screenshots
- Make sure all agent names and numbers are visible
- One screenshot per screen/report type works best

---

## Folder Structure

```
excel-report-automation/
├── config/
│   ├── config.example.json     # Template — copy to config.json
│   └── config.json             # Your local config (NOT in Git)
├── data/
│   ├── raw/                    # Data files (email attachments + manual downloads)
│   ├── screenshots/            # eAgent/Rico screenshots for OCR
│   └── processed/              # Intermediate outputs
├── reports/                    # Generated Excel reports
├── src/
│   ├── spine.py                # Agent name resolver (Spine lookup)
│   ├── email_watcher.py        # Outlook COM attachment extraction
│   ├── screenshot_reader.py    # Claude Vision OCR
│   ├── parsers/
│   │   ├── rc_parser.py        # RingCentral phone data
│   │   ├── rico_parser.py      # Ricochet CRM calls
│   │   ├── hs_parser.py        # HiSales messaging
│   │   ├── nb_parser.py        # New Business policies
│   │   ├── quotes_parser.py    # Auto quotes
│   │   └── premium_parser.py   # AgencyZoom premium/points
│   └── reports/
│       └── dsr_builder.py      # Daily Standup Report generator
├── main.py                     # Pipeline entry point
├── requirements.txt
└── README.md
```

### What's NOT in Git (stays local):
- `config/config.json` — machine-specific paths
- `data/raw/` — client data files
- `data/screenshots/` — screen captures
- `reports/` — generated reports

---

## Customizing

### Adding/removing agents
Update the **Spine** sheet in your master workbook. The pipeline reads it fresh every run.

### Changing email filters
Edit `config/config.json` → `email_sources`. Each source can filter by sender address and/or subject line.

### Changing report formatting
Edit `src/reports/dsr_builder.py`:
- Colors: `HEADER_FILL`, `HEADER_FONT` constants
- Column layout: `DSR_COLUMNS` list
- Column widths: `COL_WIDTHS` dict

### Adding new data sources
1. Create a new parser in `src/parsers/` following the existing pattern
2. Add a `parse()` function that takes `(file_path, spine, target_date, sheet_name)`
3. Wire it into `main.py`

---

## Scheduling

Use **Windows Task Scheduler** for fully automated daily runs.

1. Open Task Scheduler → Create Basic Task
2. Name: `DSR Report Builder`
3. Trigger: Daily at your preferred time
4. Action: Start a program
   - Program: `C:\path\to\venv\Scripts\python.exe`
   - Arguments: `main.py --skip-screenshots`
   - Start in: `C:\path\to\excel-report-automation`
5. Click Finish

> Note: Outlook must be running for email extraction. Use `--skip-email` if running without Outlook.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `ModuleNotFoundError: win32com` | `pip install pywin32` |
| Parser finds 0 rows | Check the date filter — data must exist for that date |
| Agent shows as 0 across all columns | Agent name not in Spine — add their name variants |
| Screenshot OCR fails | Check `ANTHROPIC_API_KEY` env var is set |
| Outlook email fetch fails | Make sure Outlook is running and signed in |
| Excel file won't open | Run `pip install openpyxl` |
