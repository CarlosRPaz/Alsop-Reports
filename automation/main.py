"""
main.py — Excel Report Automation pipeline entry point.

Daily usage (standard — fetches RC from Outlook, pushes to Supabase):
  python main.py --date 2026-05-05 --supabase-only

Monday catch-up (batch mode for Fri/Sat/Sun):
  python main.py --batch 2026-05-01 2026-05-02 2026-05-03 --supabase-only

Other options:
  python main.py                           # Full run for today → master workbook
  python main.py --skip-email              # Skip Outlook, use existing files in data/raw/
  python main.py --skip-screenshots        # Skip screenshot OCR
  python main.py --new-file               # Generate a standalone report (not master)
"""

import json
import argparse
import pandas as pd
from pathlib import Path
from datetime import date, datetime
from glob import glob

from src.spine import Spine
from src.parsers import rc_parser, hs_parser, rico_ch_parser, rico_ap_parser, nb_parser, quotes_parser, premium_parser, rico_leads_parser
from src.parsers.batch_selector import BatchSelector
from src.screenshot_reader import read_screenshots
from src.reports.dsr_builder import build_dsr

import pandas as pd


def load_config(path: str = "config/config.json") -> dict:
    config_path = Path(path)
    if not config_path.exists():
        raise FileNotFoundError(
            f"Config not found at {path}. "
            "Copy config/config.example.json to config/config.json and fill in your values."
        )
    with open(config_path) as f:
        return json.load(f)


def find_files(folder: str, prefix: str = "", date_str: str = "") -> list[str]:
    """Find data files in folder, optionally filtering by prefix and date string."""
    folder_path = Path(folder)
    if not folder_path.exists():
        return []
    patterns = ["*.xlsx", "*.xls", "*.csv"]
    files = []
    for pat in patterns:
        files.extend(folder_path.glob(pat))

    if prefix:
        files = [f for f in files if f.name.lower().startswith(prefix.lower())]

    if date_str:
        files = [f for f in files if date_str in f.name]

    return [str(f) for f in sorted(files, key=lambda f: f.stat().st_mtime, reverse=True)]


def merge_all_data(spine, report_date, rc_data, hs_data, nb_data,
                   quotes_data, premium_data, screenshot_data,
                   rico_ch_data=None, rico_ap_data=None, rico_leads_data=None,
                   quotes_deduped_data=None, nb_auto_data=None):
    """Merge all parsed data into one DataFrame keyed by agent."""
    agents = pd.DataFrame(spine.all_agents())
    merged = agents.copy()

    # --- Call counts + Talk time ---
    # Three sources contribute to calls:
    #   RC (RingCentral)      → calls + talk time (CSR agents)
    #   Rico AP (Agent Perf)  → calls only (Sales/EA agents)
    #   Rico CH (CH zips)     → talk time only (Sales/EA agents)
    #
    # For agents on both platforms, values are summed.
    call_frames = []
    if rc_data is not None and len(rc_data) > 0:
        call_frames.append(rc_data[["Agent", "Calls", "Inbound", "Outbound", "TalkTimeSeconds"]])

    if rico_ap_data is not None and len(rico_ap_data) > 0:
        # Rico AP provides call counts but NO talk time
        ap_df = rico_ap_data[["Agent", "Calls", "Inbound", "Outbound"]].copy()
        ap_df["TalkTimeSeconds"] = 0

        # If we also have Rico CH data, merge talk time into the AP frame
        if rico_ch_data is not None and len(rico_ch_data) > 0:
            ch_talk = rico_ch_data[["Agent", "TalkTimeSeconds"]].copy()
            ch_talk = ch_talk.groupby("Agent").agg(
                TalkTimeSeconds=("TalkTimeSeconds", "sum")
            ).reset_index()
            ap_df = ap_df.merge(ch_talk, on="Agent", how="left", suffixes=("", "_ch"))
            # Use CH talk time where available
            ap_df["TalkTimeSeconds"] = ap_df["TalkTimeSeconds_ch"].fillna(0).astype(int)
            ap_df = ap_df.drop(columns=["TalkTimeSeconds_ch"], errors="ignore")

        call_frames.append(ap_df)
    elif rico_ch_data is not None and len(rico_ch_data) > 0:
        # No AP data — fall back to CH data for both calls + talk time (legacy behavior)
        call_frames.append(rico_ch_data[["Agent", "Calls", "Inbound", "Outbound", "TalkTimeSeconds"]])

    if call_frames:
        all_calls = pd.concat(call_frames, ignore_index=True)
        rc_agg = all_calls.groupby("Agent").agg(
            Calls=("Calls", "sum"), Inbound=("Inbound", "sum"),
            Outbound=("Outbound", "sum"), TalkTimeSeconds=("TalkTimeSeconds", "sum"),
        ).reset_index()
        merged = merged.merge(rc_agg, left_on="agent", right_on="Agent", how="left", suffixes=("", "_rc"))

    if hs_data is not None and len(hs_data) > 0:
        hs_agg = hs_data.groupby("Agent").agg(
            Texts=("Texts", "sum"), OutTexts=("OutTexts", "sum"),
            OptIns=("OptIns", "sum"), OptOuts=("OptOuts", "sum"),
        ).reset_index()
        merged = merged.merge(hs_agg, left_on="agent", right_on="Agent", how="left", suffixes=("", "_hs"))

    if quotes_data is not None and len(quotes_data) > 0:
        q_agg = quotes_data.groupby("Agent").agg(Quotes=("QuoteCount", "sum")).reset_index()
        merged = merged.merge(q_agg, left_on="agent", right_on="Agent", how="left", suffixes=("", "_q"))

    if nb_data is not None and len(nb_data) > 0:
        nb_agg = nb_data.groupby("Agent").agg(
            NB=("NBCount", "sum"), Items=("Items", "sum"),
            WrittenPremium=("WrittenPremium", "sum"),
        ).reset_index()
        merged = merged.merge(nb_agg, left_on="agent", right_on="Agent", how="left", suffixes=("", "_nb"))

    if premium_data is not None and len(premium_data) > 0:
        p_agg = premium_data.groupby("Agent").agg(
            PremPremium=("PremPremium", "sum"),
            PremItems=("PremItems", "sum"),
            PremPoints=("PremPoints", "sum"),
        ).reset_index()
        merged = merged.merge(p_agg, left_on="agent", right_on="Agent", how="left", suffixes=("", "_prem"))

    if screenshot_data is not None and len(screenshot_data) > 0:
        # Keep dismissed_todos / past_due_todos / pivot_count from eAgent screenshots only.
        # Contact/Quoted/Hot/xsale now come from Rico Leads (DeerDama) — see below.
        ss_cols = ["Agent"]
        for col in ["dismissed_todos", "past_due_todos", "pivot_count"]:
            if col in screenshot_data.columns:
                ss_cols.append(col)
        ss_agg = screenshot_data[ss_cols].groupby("Agent").first().reset_index()
        merged = merged.merge(ss_agg, left_on="agent", right_on="Agent", how="left", suffixes=("", "_ss"))

    # Rico Leads snapshot — Contact / Quoted / Hot / XDate per agent.
    # Column names here use lowercase keys so dsr_builder/dsr_master's
    # row.get("contact"/"quoted"/"hot"/"xsale") pick them up.
    if rico_leads_data is not None and len(rico_leads_data) > 0:
        leads = rico_leads_data.rename(columns={
            "Contact": "contact",
            "Quoted":  "quoted",
            "Hot":     "hot",
            "XDate":   "xsale",   # internal key stays "xsale" for backward compat
        })
        merged = merged.merge(
            leads[["Agent", "contact", "quoted", "hot", "xsale"]],
            left_on="agent", right_on="Agent", how="left", suffixes=("", "_rl")
        )

    if quotes_deduped_data is not None and len(quotes_deduped_data) > 0:
        q_dedup_agg = quotes_deduped_data.groupby("Agent").agg(QuotesDeduped=("QuotesDeduped", "sum")).reset_index()
        merged = merged.merge(q_dedup_agg, left_on="agent", right_on="Agent", how="left", suffixes=("", "_qd"))

    if nb_auto_data is not None and len(nb_auto_data) > 0:
        nb_auto_agg = nb_auto_data.groupby("Agent").agg(
            NBAutoCount=("NBAutoCount", "sum"),
            NBAutoItems=("NBAutoItems", "sum"),
        ).reset_index()
        merged = merged.merge(nb_auto_agg, left_on="agent", right_on="Agent", how="left", suffixes=("", "_nba"))

    return merged


def run(
    report_date: date,
    skip_email: bool = False,
    skip_screenshots: bool = False,
    skip_hs_downloads: bool = False,
    use_master: bool = True,
    supabase_only: bool = False,
    config_path: str = "config/config.json",
    batch_selectors: dict | None = None,
    upload_dir: str | None = None,
    upload_types: list[str] | None = None,
    sources: list[str] | None = None,
    no_headless: bool = False,
    no_date_filter: bool = False,
    upload_id: str | None = None,
):
    """Run the DSR pipeline for a single date.

    Parameters
    ----------
    batch_selectors : dict, optional
        Pre-computed file-to-date mappings for sources without internal dates.
        Keys: "rico_ap", "premium". Values: BatchSelector instances.
        Provided by run_batch() for multi-date catch-up runs.
    """
    mode = "supabase-only" if supabase_only else ("master" if use_master else "new file")
    print("=" * 60)
    print(f"  Excel Report Automation — DSR for {report_date} ({mode})")
    print("=" * 60)

    config = load_config(config_path)
    raw_folder = config["download"]["raw_data_folder"]
    screenshots_folder = config.get("screenshots", {}).get("folder", "data/screenshots")
    spine_path = config.get("spine", {}).get("path", "config/spine.xlsx")
    spine_sheet = config.get("spine", {}).get("sheet_name", "Spine")
    excluded_agents = config.get("spine", {}).get("excluded_agents", [])

    # Source filter (None = all sources)
    ALL_SOURCES = {"rc", "hs", "quotes", "nb", "premium", "rico_ch", "rico_ap", "rico_leads", "eagent", "screenshots"}
    active_sources = set(sources) if sources else ALL_SOURCES
    skipped = ALL_SOURCES - active_sources
    if skipped:
        print(f"  Source filter active — skipping: {', '.join(sorted(skipped))}")

    # Load Spine (prefer Supabase, fall back to Excel)
    print("\n[1/6] Loading Spine (agent name map)...")
    try:
        spine = Spine.from_supabase(config, excluded_agents=excluded_agents)
        print(f"  Loaded {len(spine.agent_names())} agents from Supabase"
              + (f" (excluded: {', '.join(excluded_agents)})" if excluded_agents else ""))
    except Exception as e:
        print(f"  Supabase spine unavailable ({e}), falling back to Excel...")
        spine = Spine(spine_path, sheet_name=spine_sheet, excluded_agents=excluded_agents)
        print(f"  Loaded {len(spine.agent_names())} agents from Excel"
              + (f" (excluded: {', '.join(excluded_agents)})" if excluded_agents else ""))

    # Step 2: Fetch data from portals (ordered: fast/reliable first, slow/flaky last)
    eagent_data_df = None
    if not skip_email:
        print("\n[2/6] Fetching data from portals...")

        # ── FAST / RELIABLE ──────────────────────────────────────────────

        # 2a: Premium from AgencyZoom (~30s, own browser, rock solid)
        if "premium" in active_sources:
            try:
                from src.az_downloader import download_az_report
                print("\n  [az_downloader] Auto-pulling Sales Report from AgencyZoom...")
                az_path = download_az_report(
                    config,
                    target_date=report_date.strftime("%Y-%m-%d"),
                    headless=not no_headless
                )
                if az_path:
                    print(f"  [az_downloader] Auto-downloaded Premium → {Path(az_path).name}")
            except Exception as e:
                print(f"  [az_downloader] Auto-download failed: {e}")

        # 2b: Rico Leads snapshot (~15s, CDP, fast)
        if "rico_leads" in active_sources:
            try:
                from src.rico_leads_downloader import download_rico_leads
                leads_path = download_rico_leads(config, target_date=report_date.strftime("%Y-%m-%d"))
                if leads_path:
                    print(f"  Rico Leads: auto-downloaded → {Path(leads_path).name}")
            except Exception as e:
                print(f"  Rico Leads auto-download: {e}")

        # 2c: Agent Performance from Ricochet (~20s, own browser, instant download)
        if "rico_ap" in active_sources:
            try:
                from src.rico_ap_downloader import download_rico_agent_performance
                print("\n  [rico_ap] Auto-pulling Agent Performance report from Ricochet...")
                ap_path = download_rico_agent_performance(
                    config,
                    target_date=report_date.strftime("%Y-%m-%d"),
                    headless=not no_headless
                )
                if ap_path:
                    print(f"  [rico_ap] Auto-downloaded Agent Performance → {Path(ap_path).name}")
            except Exception as e:
                print(f"  [rico_ap] Auto-download failed: {e}")

        # ── MODERATE ─────────────────────────────────────────────────────

        # 2d: eAgent To-Dos (~60s, CDP, occasional timeout on past due)
        eagent_data_df = None
        if "eagent" in active_sources:
            try:
                from src.eagent_downloader import scrape_eagent_data
                print(f"\n  [Auto-pull] Scraping eAgent To-Dos for {report_date}...")
                eagent_results = scrape_eagent_data(report_date.strftime("%Y-%m-%d"))
                if eagent_results:
                    print(f"  eAgent pull successful! Scraped {len(eagent_results)} agents.")
                    records = []
                    for agent, stats in eagent_results.items():
                        records.append({
                            "Agent": agent,
                            "dismissed_todos": stats.get("dismissed", 0),
                            "past_due_todos": stats.get("past_due", 0),
                            "pivot_count": stats.get("pivots", 0)
                        })
                    eagent_data_df = pd.DataFrame(records)
            except Exception as e:
                print(f"  eAgent auto-download: {e}")

        # ── SLOW / FLAKY ─────────────────────────────────────────────────

        # 2e: RC from Outlook email (depends on Outlook COM)
        if "rc" in active_sources:
            try:
                from src.email_watcher import fetch_source_attachments
                rc_paths = fetch_source_attachments(config, "rc")
                if rc_paths:
                    print(f"  RC: {len(rc_paths)} file(s) from Outlook")
            except Exception as e:
                print(f"  RC email fetch: {e}")

        # 2f: Hearsay (Outlook COM + browser download links)
        if "hs" in active_sources and not skip_hs_downloads:
            try:
                from src.hs_downloader import download_hs_reports
                hs_count = download_hs_reports(lookback_days=2, target_date=report_date)
                if hs_count > 0:
                    print(f"\n  Waiting for {hs_count} Hearsay downloads to finish...")
                    import time as _time
                    _time.sleep(min(hs_count * 2, 30))  # ~2 sec per download, max 30s
                    print("  Hearsay downloads should be ready.")
            except Exception as e:
                print(f"  Hearsay auto-download: {e}")

        # 2g: DASH auto-download DISABLED
        if any(src in active_sources for src in ["quotes", "nb"]):
            print("\n  [dash] ⚠️  DASH auto-download disabled (portal layout changed).")
            print("  [dash]    → Upload Quotes Detail Report and NB Details manually.")

        # 2h: Call History from Ricochet (SLOWEST — triggers export, then polls
        #     Outlook for emailed ZIP up to 15 × 20s = 5 minutes)
        if "rico_ch" in active_sources:
            try:
                from src.rico_ch_downloader import download_rico_call_history, retrieve_ch_from_email
                print("\n  [rico_ch] Auto-triggering Call History export from Ricochet...")
                ch_trigger = download_rico_call_history(
                    config,
                    target_date=report_date.strftime("%Y-%m-%d"),
                    headless=not no_headless
                )
                if ch_trigger == "EXPORT_TRIGGERED":
                    print("  [rico_ch] Call History export triggered! Waiting for emailed ZIP attachment...")
                    # Poll for email and download ZIP
                    ch_path = retrieve_ch_from_email(
                        config,
                        max_retries=15,
                        retry_delay=20.0
                    )
                    if ch_path:
                        print(f"  [rico_ch] Auto-downloaded Call History ZIP → {Path(ch_path).name}")
            except Exception as e:
                print(f"  [rico_ch] Auto-download failed: {e}")
    else:
        print("\n[2/6] Skipping email fetch (using existing files)")

    # Step 3: Parse all data sources
    print("\n[3/6] Parsing data sources...")
    date_str = report_date.strftime("%Y%m%d")
    quotes_records_list = []

    # If --upload-dir is specified, parse files from the upload directory
    # instead of the configured folders
    if upload_dir:
        return _run_from_uploads(
            upload_dir=upload_dir,
            upload_types=upload_types or [],
            report_date=report_date,
            spine=spine,
            config=config,
            supabase_only=supabase_only,
            no_date_filter=no_date_filter,
            upload_id=upload_id,
        )

    # RC: date-validated file selection (prevents using stale data)
    if "rc" in active_sources:
        rc_data = rc_parser.parse_for_date(raw_folder, spine, report_date)
    else:
        rc_data = None

    # HS: check if using downloads folder (daily CSVs) or raw folder (xlsx export)
    if "hs" in active_sources:
        hs_config = config.get("email_sources", {}).get("hs", {})
        if hs_config.get("source_type") == "downloads_folder":
            hs_downloads = hs_config.get("downloads_folder", "")
            if hs_downloads:
                try:
                    hs_data = hs_parser.parse_downloads(hs_downloads, spine, target_date=report_date)
                    if len(hs_data) > 0:
                        print(f"  HS: {len(hs_data)} agents from Downloads folder CSVs")
                    else:
                        print("  HS: no data found in Downloads folder")
                        hs_data = None
                except Exception as e:
                    print(f"  HS: downloads scan error - {e}")
                    hs_data = None
            else:
                hs_data = _try_parse("HS", hs_parser, raw_folder, "hs", spine, report_date)
        else:
            hs_data = _try_parse("HS", hs_parser, raw_folder, "hs", spine, report_date)
    else:
        hs_data = None

    # Rico Agent Performance: Sales/EA call counts from Agent Performance xlsx
    rico_ap_data = None
    if "rico_ap" in active_sources:
        rico_ap_config = config.get("email_sources", {}).get("rico_ap", {})
        ap_batch = batch_selectors.get("rico_ap") if batch_selectors else None
        if rico_ap_config.get("source_type") == "downloads_folder":
            rico_ap_downloads = rico_ap_config.get("downloads_folder", "")
            if rico_ap_downloads:
                try:
                    rico_ap_data = rico_ap_parser.parse_downloads(
                        rico_ap_downloads, spine, target_date=report_date,
                        batch_selector=ap_batch,
                    )
                    if rico_ap_data is not None and len(rico_ap_data) > 0:
                        print(f"  Rico AP: {len(rico_ap_data)} agents from Agent Performance")
                    else:
                        print("  Rico AP: no data found in Downloads folder")
                        rico_ap_data = None
                except Exception as e:
                    print(f"  Rico AP: downloads scan error - {e}")
                    rico_ap_data = None

    # Rico Call History: talk time from Rico dialer (CH zips)
    rico_ch_data = None
    if "rico_ch" in active_sources:
        rico_ch_config = config.get("email_sources", {}).get("rico_ch", {})
        if rico_ch_config.get("source_type") == "downloads_folder":
            rico_ch_downloads = rico_ch_config.get("downloads_folder", "")
            if rico_ch_downloads:
                try:
                    rico_ch_data = rico_ch_parser.parse_downloads(
                        rico_ch_downloads, spine, target_date=report_date
                    )
                    if len(rico_ch_data) > 0:
                        print(f"  Rico CH: {len(rico_ch_data)} agents (talk time) from Downloads folder")
                    else:
                        print("  Rico CH: no data found in Downloads folder")
                        rico_ch_data = None
                except Exception as e:
                    print(f"  Rico CH: downloads scan error - {e}")

    # NB: prefer downloads folder if configured, fall back to master workbook
    nb_auto_data = None
    if "nb" in active_sources:
        nb_config = config.get("email_sources", {}).get("nb", {})
        nb_from_downloads = False
        if nb_config.get("source_type") == "downloads_folder":
            nb_downloads = nb_config.get("downloads_folder", "")
            if nb_downloads:
                try:
                    nb_data = nb_parser.parse_downloads(nb_downloads, spine, target_date=report_date)
                    # parse_downloads returns empty DF if no file covers the date
                    # Treat any result (even 0 rows) as valid if downloads folder is configured
                    nb_from_downloads = True
                    if nb_data is not None and len(nb_data) > 0:
                        print(f"  NB: {len(nb_data)} agents from Downloads folder")
                    else:
                        print("  NB: 0 rows from Downloads folder (no NB for this date)")
                    # Find the correct file for parse_auto
                    from pathlib import Path as _P
                    _nb_files = sorted(_P(nb_downloads).glob("New Business Details*.xlsx"),
                                       key=lambda f: f.stat().st_mtime, reverse=True)
                    _matched_nb = None
                    if report_date is not None:
                        td = pd.Timestamp(report_date).date()
                        for _nf in _nb_files:
                            try:
                                _df = nb_parser._read_with_header_detection(str(_nf))
                                for _dc in ["Date", "Issued Date", "Date Written"]:
                                    if _dc in _df.columns:
                                        _dates = pd.to_datetime(_df[_dc], errors="coerce").dropna()
                                        if len(_dates) > 0 and _dates.min().date() <= td <= _dates.max().date():
                                            _matched_nb = _nf
                                        break
                                if _matched_nb:
                                    break
                            except Exception:
                                continue
                    if _matched_nb is None and _nb_files:
                        _matched_nb = _nb_files[0]
                    if _matched_nb:
                        nb_auto_data = nb_parser.parse_auto(str(_matched_nb), spine, target_date=report_date)
                except Exception as e:
                    print(f"  NB: downloads scan error ({e}), falling back to workbook...")

        if not nb_from_downloads:
            try:
                print(f"  NB: Reading from master workbook sheet 'NB' in {spine_path}...")
                nb_data = nb_parser.parse(spine_path, spine, target_date=report_date, sheet_name="NB")
                nb_auto_data = nb_parser.parse_auto(spine_path, spine, target_date=report_date, sheet_name="NB")
            except Exception as e:
                print(f"  NB: error reading from master workbook sheet - {e}")
                nb_data = None
                nb_auto_data = None
    else:
        nb_data = None

    # Quotes: prefer downloads folder if configured, fall back to master workbook
    quotes_deduped_data = None
    quote_duplicates_list = []
    if "quotes" in active_sources:
        quotes_config = config.get("email_sources", {}).get("quotes", {})
        quotes_from_downloads = False
        if quotes_config.get("source_type") == "downloads_folder":
            quotes_downloads = quotes_config.get("downloads_folder", "")
            if quotes_downloads:
                try:
                    quotes_data = quotes_parser.parse_downloads(quotes_downloads, spine, target_date=report_date)
                    if quotes_data is not None and len(quotes_data) > 0:
                        print(f"  Quotes: {len(quotes_data)} agents from Downloads folder")
                        quotes_from_downloads = True
                        # Find the correct file covering the target date for deduped/records
                        from pathlib import Path as _P
                        _q_files = sorted(_P(quotes_downloads).glob("Quotes Detail Report*.xlsx"),
                                          key=lambda f: f.stat().st_mtime, reverse=True)
                        # Use same date-matching logic as parse_downloads
                        _matched_file = None
                        if report_date is not None:
                            td = pd.Timestamp(report_date).date()
                            for _qf in _q_files:
                                try:
                                    _meta = pd.read_excel(_qf, header=None, nrows=5)
                                    _s = pd.to_datetime(str(_meta.iloc[2, 1]).strip(), errors="coerce")
                                    _e = pd.to_datetime(str(_meta.iloc[3, 1]).strip(), errors="coerce")
                                    if pd.notna(_s) and pd.notna(_e) and _s.date() <= td <= _e.date():
                                        _matched_file = _qf
                                        break
                                except Exception:
                                    continue
                        if _matched_file is None and _q_files:
                            _matched_file = _q_files[0]
                        if _matched_file:
                            quotes_deduped_data, quote_duplicates_list = quotes_parser.parse_auto_deduped(
                                str(_matched_file), spine, target_date=report_date
                            )
                            _, quotes_records_list = quotes_parser.parse(
                                str(_matched_file), spine, target_date=report_date, return_records=True
                            )
                    else:
                        print("  Quotes: no data found in Downloads folder, falling back to workbook...")
                        quotes_data = None
                except Exception as e:
                    print(f"  Quotes: downloads scan error ({e}), falling back to workbook...")

        if not quotes_from_downloads:
            try:
                print(f"  Quotes: Reading from master workbook sheet 'Quotes' in {spine_path}...")
                quotes_data, quotes_records_list = quotes_parser.parse(spine_path, spine, target_date=report_date, sheet_name="Quotes", return_records=True)
                quotes_deduped_data, quote_duplicates_list = quotes_parser.parse_auto_deduped(spine_path, spine, target_date=report_date, sheet_name="Quotes")
            except Exception as e:
                print(f"  Quotes: error reading from master workbook sheet - {e}")
                quotes_data = None
                quotes_deduped_data = None
    else:
        quotes_data = None

    # Premium: check if using downloads folder or raw folder
    if "premium" in active_sources:
        prem_config = config.get("email_sources", {}).get("premium", {})
        prem_batch = batch_selectors.get("premium") if batch_selectors else None
        if prem_config.get("source_type") == "downloads_folder":
            prem_downloads = prem_config.get("downloads_folder", "")
            if prem_downloads:
                try:
                    premium_data = premium_parser.parse_downloads(
                        prem_downloads, spine, target_date=report_date,
                        batch_selector=prem_batch,
                    )
                    if premium_data is not None and len(premium_data) > 0:
                        print(f"  Premium: {len(premium_data)} agents from Downloads folder")
                    else:
                        print("  Premium: no data found in Downloads folder")
                        premium_data = None
                except Exception as e:
                    print(f"  Premium: downloads scan error - {e}")
                    premium_data = None
            else:
                premium_data = _try_parse("Premium", premium_parser, raw_folder, "premium", spine, report_date)
        else:
            premium_data = _try_parse("Premium", premium_parser, raw_folder, "premium", spine, report_date)
    else:
        premium_data = None

    # Rico Leads (DeerDama): live snapshot of lead statuses — source for
    # Contact/Quoted/Hot/XDate. No target_date filter (snapshot semantics).
    rico_leads_data = None
    if "rico_leads" in active_sources:
        leads_cfg = config.get("email_sources", {}).get("rico_leads", {})
        leads_dir = leads_cfg.get("downloads_folder", "C:/Users/scag3s29/Downloads")
        leads_glob = leads_cfg.get("file_glob", "leads_report_*.csv")
        try:
            rico_leads_data = rico_leads_parser.parse_downloads(leads_dir, spine, file_glob=leads_glob)
            if rico_leads_data is not None and len(rico_leads_data) > 0:
                print(f"  Rico Leads: {len(rico_leads_data)} agents from snapshot")
            else:
                print("  Rico Leads: no data parsed")
                rico_leads_data = None
        except Exception as e:
            print(f"  Rico Leads: parse error - {e}")
            rico_leads_data = None

    # Step 4: Screenshot OCR (optional) / eAgent injected data
    screenshot_data = None
    if "screenshots" in active_sources and not skip_screenshots:
        print("\n[4/6] Processing screenshots with Claude Vision...")
        screenshot_data = read_screenshots(screenshots_folder, spine, report_date)
        if len(screenshot_data) > 0:
            print(f"  Extracted {len(screenshot_data)} records from screenshots")
        else:
            print("  No screenshot data extracted")
    else:
        print("\n[4/6] Skipping screenshot OCR")
        
    # Inject eAgent data directly into screenshot_data format so it merges automatically
    if eagent_data_df is not None:
        if screenshot_data is None:
            screenshot_data = eagent_data_df
        else:
            # Merge eAgent data over OCR if both exist
            screenshot_data = screenshot_data.merge(eagent_data_df, on="Agent", how="outer", suffixes=("", "_ea"))
            if "dismissed_todos_ea" in screenshot_data.columns:
                screenshot_data["dismissed_todos"] = screenshot_data["dismissed_todos_ea"].combine_first(screenshot_data.get("dismissed_todos"))
            if "past_due_todos_ea" in screenshot_data.columns:
                screenshot_data["past_due_todos"] = screenshot_data["past_due_todos_ea"].combine_first(screenshot_data.get("past_due_todos"))
            if "pivot_count_ea" in screenshot_data.columns:
                screenshot_data["pivot_count"] = screenshot_data["pivot_count_ea"].combine_first(screenshot_data.get("pivot_count", pd.Series(dtype=float)))

    # --- Source status report ---
    print("\n" + "-" * 60)
    print(f"  SOURCE STATUS for {report_date}")
    print("-" * 60)
    _print_source_status([
        ("RC",           rc_data),
        ("Rico AP",      rico_ap_data),
        ("Rico CH",      rico_ch_data),
        ("Hearsay",      hs_data),
        ("Quotes",       quotes_data),
        ("NB",           nb_data),
        ("Premium",      premium_data),
        ("Rico Leads",   rico_leads_data),
        ("Screenshots",  screenshot_data if not skip_screenshots else "skipped"),
    ])
    print("-" * 60)

    # Step 5: Build DSR
    print("\n[5/6] Building DSR report...")

    if use_master:
        master_path = config.get("report", {}).get("master_path", "")
        if not master_path:
            # Fall back to spine path (the original DSR workbook)
            master_path = spine_path

    # Always merge data so we can push to Supabase
    merged = merge_all_data(
        spine, report_date, rc_data, hs_data,
        nb_data, quotes_data, premium_data, screenshot_data,
        rico_ch_data=rico_ch_data, rico_ap_data=rico_ap_data,
        rico_leads_data=rico_leads_data,
        quotes_deduped_data=quotes_deduped_data,
        nb_auto_data=nb_auto_data
    )

    # Push to Supabase Web App Backend
    try:
        from src.supabase_pusher import push_to_supabase
        actual_types = []
        if rc_data is not None and len(rc_data) > 0: actual_types.append("rc")
        if rico_ap_data is not None and len(rico_ap_data) > 0: actual_types.append("rico_ap")
        if rico_ch_data is not None and len(rico_ch_data) > 0: actual_types.append("rico_ch")
        if hs_data is not None and len(hs_data) > 0: actual_types.append("hs")
        if quotes_data is not None and len(quotes_data) > 0: actual_types.append("quotes")
        if nb_data is not None and len(nb_data) > 0: actual_types.append("nb")
        if premium_data is not None and len(premium_data) > 0: actual_types.append("premium")
        if rico_leads_data is not None and len(rico_leads_data) > 0: actual_types.append("rico_leads")
        if screenshot_data is not None and len(screenshot_data) > 0: actual_types.append("screenshots")
        
        push_to_supabase(
            merged,
            report_date,
            config,
            upload_types=actual_types if sources else None,
            actual_sources=actual_types,
            quote_duplicates=quote_duplicates_list,
            quote_records=quotes_records_list,
            upload_id=upload_id
        )
    except Exception as e:
        print(f"  [Supabase] Push error: {e}")

    if supabase_only:
        # Supabase-only mode: skip Excel writing entirely
        print("\n[6/6] Complete! (Supabase-only mode — no Excel output)")
        print("=" * 60)
        print(f"  Data pushed to Supabase for {report_date}")
        print("=" * 60)
        return

    if use_master:
        # --- Master mode: write into existing workbook (preserves slicers) ---
        from src.reports.dsr_master import write_to_master, prepare_rows
        rows = prepare_rows(spine, report_date, merged)
        output_path = write_to_master(master_path, report_date, rows)
    else:
        # --- New file mode: generate standalone report ---
        output_folder = config["report"]["output_folder"]
        output_path = build_dsr(
            spine=spine,
            report_date=report_date,
            rc_data=rc_data,
            hs_data=hs_data,
            nb_data=nb_data,
            quotes_data=quotes_data,
            premium_data=premium_data,
            screenshot_data=screenshot_data,
            output_folder=output_folder,
        )

    # Step 6: Done
    print("\n[6/6] Complete!")
    print("=" * 60)
    print(f"  Report: {output_path}")
    print("=" * 60)


def _run_from_uploads(
    upload_dir: str,
    upload_types: list[str],
    report_date: date,
    spine: Spine,
    config: dict,
    supabase_only: bool = True,
    no_date_filter: bool = False,
    upload_id: str | None = None,
):
    """
    Process uploaded files from a staging directory.
    
    Instead of searching Downloads/raw folders, this reads files directly
    from the upload directory and auto-detects which parser to use based
    on filename patterns.
    
    Parameters
    ----------
    upload_dir : str
        Directory containing the uploaded files.
    upload_types : list[str]
        List of source types to process (e.g. ["rc", "quotes", "nb"]).
    report_date : date
        Target date for the data.
    spine : Spine
        Agent name resolver.
    config : dict
        Pipeline config.
    supabase_only : bool
        Only push to Supabase (default True for uploads).
    """
    import re
    from pathlib import Path as _Path

    print(f"\n  [UPLOAD MODE] Processing {len(upload_types)} source types from {upload_dir}")
    print(f"  Target date: {report_date}")
    print(f"  Types: {', '.join(upload_types)}")

    folder = _Path(upload_dir)
    all_files = list(folder.iterdir())
    print(f"  Found {len(all_files)} files in upload directory")

    # Auto-detect and group files by type
    FILE_DETECT = [
        (r"rc_|Office_Perf.*Users", "rc"),
        (r"Performance Breakdown Report", "hs"),
        (r"Quotes Detail Report", "quotes"),
        (r"New Business", "nb"),
        (r"sales-report", "premium"),
        (r"^ch-", "rico_ch"),
        (r"Agent Performance", "rico_ap"),
    ]

    typed_files: dict[str, list[_Path]] = {}
    for f in all_files:
        if f.is_dir():
            continue
        for pattern, ftype in FILE_DETECT:
            if re.search(pattern, f.name, re.IGNORECASE):
                if ftype not in typed_files:
                    typed_files[ftype] = []
                typed_files[ftype].append(f)
                print(f"    {f.name} -> {ftype}")
                break
        else:
            print(f"    {f.name} -> UNKNOWN (skipping)")

    # Parse each requested type
    rc_data = None
    hs_data = None
    quotes_data = None
    quotes_records_list = []
    nb_data = None
    premium_data = None
    rico_ch_data = None
    rico_ap_data = None
    screenshot_data = None
    rico_leads_data = None

    if "rc" in upload_types and "rc" in typed_files:
        for f in typed_files["rc"]:
            try:
                data = rc_parser.parse(str(f), spine, target_date=None if no_date_filter else report_date)
                if data is not None and len(data) > 0:
                    rc_data = pd.concat([rc_data, data]) if rc_data is not None else data
                    print(f"  RC: {len(data)} rows from {f.name}")
            except Exception as e:
                print(f"  RC: parse error ({f.name}) - {e}")

    if "hs" in upload_types and "hs" in typed_files:
        for f in typed_files["hs"]:
            try:
                data = hs_parser.parse(str(f), spine, target_date=report_date)
                if data is not None and len(data) > 0:
                    hs_data = pd.concat([hs_data, data]) if hs_data is not None else data
                    print(f"  HS: {len(data)} rows from {f.name}")
            except Exception as e:
                print(f"  HS: parse error ({f.name}) - {e}")

    quotes_deduped_data = None
    quote_duplicates_list = []
    if "quotes" in upload_types and "quotes" in typed_files:
        for f in typed_files["quotes"]:
            try:
                data, recs = quotes_parser.parse(str(f), spine, target_date=None if no_date_filter else report_date, return_records=True)
                if data is not None and len(data) > 0:
                    quotes_data = pd.concat([quotes_data, data]) if quotes_data is not None else data
                    print(f"  Quotes: {len(data)} rows from {f.name}")
                if recs:
                    quotes_records_list.extend(recs)
            except Exception as e:
                print(f"  Quotes: parse error ({f.name}) - {e}")

            try:
                q_dedup, q_dups = quotes_parser.parse_auto_deduped(str(f), spine, target_date=None if no_date_filter else report_date)
                if q_dedup is not None and len(q_dedup) > 0:
                    quotes_deduped_data = pd.concat([quotes_deduped_data, q_dedup]) if quotes_deduped_data is not None else q_dedup
                if q_dups:
                    quote_duplicates_list.extend(q_dups)
            except Exception as e:
                print(f"  Quotes Auto: parse error ({f.name}) - {e}")

    nb_auto_data = None
    if "nb" in upload_types and "nb" in typed_files:
        for f in typed_files["nb"]:
            try:
                data = nb_parser.parse(str(f), spine, target_date=None if no_date_filter else report_date)
                if data is not None and len(data) > 0:
                    nb_data = pd.concat([nb_data, data]) if nb_data is not None else data
                    print(f"  NB: {len(data)} rows from {f.name}")
            except Exception as e:
                print(f"  NB: parse error ({f.name}) - {e}")

            try:
                n_auto = nb_parser.parse_auto(str(f), spine, target_date=None if no_date_filter else report_date)
                if n_auto is not None and len(n_auto) > 0:
                    nb_auto_data = pd.concat([nb_auto_data, n_auto]) if nb_auto_data is not None else n_auto
            except Exception as e:
                print(f"  NB Auto: parse error ({f.name}) - {e}")

    if "premium" in upload_types and "premium" in typed_files:
        for f in typed_files["premium"]:
            try:
                data = premium_parser.parse(str(f), spine, target_date=report_date)
                if data is not None and len(data) > 0:
                    premium_data = pd.concat([premium_data, data]) if premium_data is not None else data
                    print(f"  Premium: {len(data)} rows from {f.name}")
            except Exception as e:
                print(f"  Premium: parse error ({f.name}) - {e}")

    if "rico_ch" in upload_types and "rico_ch" in typed_files:
        for f in typed_files["rico_ch"]:
            try:
                data = rico_ch_parser.parse(str(f), spine, target_date=None if no_date_filter else report_date)
                if data is not None and len(data) > 0:
                    rico_ch_data = pd.concat([rico_ch_data, data]) if rico_ch_data is not None else data
                    print(f"  Rico CH: {len(data)} rows from {f.name}")
            except Exception as e:
                print(f"  Rico CH: parse error ({f.name}) - {e}")

    if "rico_ap" in upload_types and "rico_ap" in typed_files:
        for f in typed_files["rico_ap"]:
            try:
                data = rico_ap_parser._parse_xlsx(Path(f), spine, target_date=report_date)
                if data is not None and len(data) > 0:
                    rico_ap_data = pd.concat([rico_ap_data, data]) if rico_ap_data is not None else data
                    print(f"  Rico AP: {len(data)} rows from {f.name}")
            except Exception as e:
                print(f"  Rico AP: parse error ({f.name}) - {e}")

    # Source status
    print("\n" + "-" * 60)
    print(f"  UPLOAD SOURCE STATUS for {report_date}")
    print("-" * 60)
    _print_source_status([
        ("RC",           rc_data),
        ("Rico AP",      rico_ap_data),
        ("Rico CH",      rico_ch_data),
        ("Hearsay",      hs_data),
        ("Quotes",       quotes_data),
        ("NB",           nb_data),
        ("Premium",      premium_data),
    ])
    print("-" * 60)

    # Merge and push — only include types that actually returned data
    # to avoid zeroing out existing fields from failed parses
    actual_types = []
    if rc_data is not None and len(rc_data) > 0: actual_types.append("rc")
    if hs_data is not None and len(hs_data) > 0: actual_types.append("hs")
    if quotes_data is not None and len(quotes_data) > 0: actual_types.append("quotes")
    if nb_data is not None and len(nb_data) > 0: actual_types.append("nb")
    if premium_data is not None and len(premium_data) > 0: actual_types.append("premium")
    if rico_ch_data is not None and len(rico_ch_data) > 0: actual_types.append("rico_ch")
    if rico_ap_data is not None and len(rico_ap_data) > 0: actual_types.append("rico_ap")

    if no_date_filter and actual_types:
        # Multi-date mode: group parsed data by date and push each separately
        print(f"\n  [MULTI-DATE] No date filter -- extracting all dates from parsed data...")

        # Collect all unique dates from data that has a Date column
        all_dates = set()
        date_source_map = {}  # {source_name: DataFrame with Date column}

        if quotes_data is not None and len(quotes_data) > 0 and "Date" in quotes_data.columns:
            for d in quotes_data["Date"].dropna().unique():
                all_dates.add(pd.Timestamp(d).date())
            date_source_map["quotes"] = quotes_data
        if nb_data is not None and len(nb_data) > 0 and "Date" in nb_data.columns:
            for d in nb_data["Date"].dropna().unique():
                all_dates.add(pd.Timestamp(d).date())
            date_source_map["nb"] = nb_data
        if rc_data is not None and len(rc_data) > 0 and "Date" in rc_data.columns:
            for d in rc_data["Date"].dropna().unique():
                all_dates.add(pd.Timestamp(d).date())
            date_source_map["rc"] = rc_data
        if rico_ch_data is not None and len(rico_ch_data) > 0 and "Date" in rico_ch_data.columns:
            for d in rico_ch_data["Date"].dropna().unique():
                all_dates.add(pd.Timestamp(d).date())
            date_source_map["rico_ch"] = rico_ch_data

        if not all_dates:
            print("  [MULTI-DATE] No dates found in parsed data -- falling back to single-date mode.")
        else:
            sorted_dates = sorted(all_dates)
            print(f"  [MULTI-DATE] Found {len(sorted_dates)} unique date(s): {', '.join(str(d) for d in sorted_dates)}")

            for target_d in sorted_dates:
                print(f"\n  {'-' * 50}")
                print(f"  [MULTI-DATE] Processing {target_d}...")

                # Filter each source to this specific date
                day_quotes = None
                day_nb = None
                day_rc = None
                day_rico_ch = None

                if "quotes" in date_source_map:
                    df = date_source_map["quotes"]
                    day_quotes = df[df["Date"].apply(lambda x: pd.Timestamp(x).date()) == target_d]
                    if len(day_quotes) == 0:
                        day_quotes = None
                    else:
                        print(f"    Quotes: {len(day_quotes)} rows")
                
                day_quotes_deduped = None
                if quotes_deduped_data is not None and len(quotes_deduped_data) > 0:
                    day_quotes_deduped = quotes_deduped_data[quotes_deduped_data["Date"].apply(lambda x: pd.Timestamp(x).date()) == target_d]
                    if len(day_quotes_deduped) == 0:
                        day_quotes_deduped = None

                if "nb" in date_source_map:
                    df = date_source_map["nb"]
                    day_nb = df[df["Date"].apply(lambda x: pd.Timestamp(x).date()) == target_d]
                    if len(day_nb) == 0:
                        day_nb = None
                    else:
                        print(f"    NB: {len(day_nb)} rows")
                
                day_nb_auto = None
                if nb_auto_data is not None and len(nb_auto_data) > 0:
                    day_nb_auto = nb_auto_data[nb_auto_data["Date"].apply(lambda x: pd.Timestamp(x).date()) == target_d]
                    if len(day_nb_auto) == 0:
                        day_nb_auto = None

                if "rc" in date_source_map:
                    df = date_source_map["rc"]
                    day_rc = df[df["Date"].apply(lambda x: pd.Timestamp(x).date()) == target_d]
                    if len(day_rc) == 0:
                        day_rc = None
                    else:
                        print(f"    RC: {len(day_rc)} rows")

                if "rico_ch" in date_source_map:
                    df = date_source_map["rico_ch"]
                    day_rico_ch = df[df["Date"].apply(lambda x: pd.Timestamp(x).date()) == target_d]
                    if len(day_rico_ch) == 0:
                        day_rico_ch = None
                    else:
                        print(f"    Rico CH: {len(day_rico_ch)} rows")

                # Build actual_types for this date
                day_types = []
                if day_rc is not None: day_types.append("rc")
                if day_quotes is not None: day_types.append("quotes")
                if day_nb is not None: day_types.append("nb")
                if day_rico_ch is not None: day_types.append("rico_ch")

                if not day_types:
                    print(f"    No data for {target_d} -- skipping.")
                    continue

                merged = merge_all_data(
                    spine, target_d, day_rc, None,
                    day_nb, day_quotes, None, None,
                    rico_ch_data=day_rico_ch, rico_ap_data=None,
                    rico_leads_data=None,
                    quotes_deduped_data=day_quotes_deduped,
                    nb_auto_data=day_nb_auto
                )

                try:
                    from src.supabase_pusher import push_to_supabase
                    day_dups = [d for d in quote_duplicates_list if d["report_month"] == target_d.strftime("%Y-%m")]
                    day_recs = [r for r in quotes_records_list if pd.Timestamp(r["report_date"]).date() == target_d]
                    push_to_supabase(
                        merged, target_d, config, upload_types=day_types,
                        quote_duplicates=day_dups, quote_records=day_recs,
                        upload_id=upload_id
                    )
                except Exception as e:
                    print(f"    [Supabase] Push error for {target_d}: {e}")

            print(f"\n{'=' * 60}")
            print(f"  MULTI-DATE UPLOAD COMPLETE -- {len(sorted_dates)} date(s) processed")
            print(f"{'=' * 60}")
            return

    if not actual_types:
        print("\n  [!] No sources returned data — skipping Supabase push to preserve existing data.")
        print("=" * 60)
        return

    print(f"\n  Merging uploaded data (sources with data: {', '.join(actual_types)})...")
    merged = merge_all_data(
        spine, report_date, rc_data, hs_data,
        nb_data, quotes_data, premium_data, screenshot_data,
        rico_ch_data=rico_ch_data, rico_ap_data=rico_ap_data,
        rico_leads_data=rico_leads_data,
        quotes_deduped_data=quotes_deduped_data,
        nb_auto_data=nb_auto_data
    )

    try:
        from src.supabase_pusher import push_to_supabase
        push_to_supabase(
            merged,
            report_date,
            config,
            upload_types=actual_types,
            quote_duplicates=quote_duplicates_list,
            quote_records=quotes_records_list,
            upload_id=upload_id
        )
    except Exception as e:
        print(f"  [Supabase] Push error: {e}")

    print("\n" + "=" * 60)
    print(f"  UPLOAD COMPLETE for {report_date}")
    print("=" * 60)


# Instructions for fetching missing data sources
_MISSING_INSTRUCTIONS = {
    "RC":         "Fetch from Outlook: 'Inbox/Daily Reports' -> save attachment to data/raw/",
    "Rico AP":    "Download from Ricochet: Reports -> Agent Performance -> Download",
    "Rico CH":    "Download from Ricochet: Reports -> Call History -> set date range -> Download",
    "Hearsay":    "Download from Hearsay: Reports -> Performance Breakdown -> Download",
    "Quotes":     "Download from AgencyZoom: Reports -> Quotes -> Download",
    "NB":         "Download from Allstate Gateway: Reports -> New Business Details -> Download",
    "Premium":    "Download from AgencyZoom: Reports -> Sales Report -> Download",
    "Rico Leads": "Download from Ricochet: Reports -> Leads -> Download",
}


def _print_source_status(sources: list[tuple[str, object]]):
    """Print a clean status table of what was pulled successfully vs missing."""
    for label, data in sources:
        if isinstance(data, str) and data == "skipped":
            status = "[--]"
            detail = "skipped"
        elif data is not None and hasattr(data, '__len__') and len(data) > 0:
            status = "[OK]"
            count = str(len(data))
            detail = f"{count} agents"
        else:
            status = "[XX]"
            detail = "no data"
        print(f"  {status}  {label:<14s} {detail}")
        # Show instructions for missing sources
        if status == "[XX]":
            instruction = _MISSING_INSTRUCTIONS.get(label)
            if instruction:
                print(f"        >> {instruction}")


def _try_parse(label, parser_module, raw_folder, prefix, spine, report_date):
    """Try to parse files for a given source. Returns DataFrame or None."""
    files = find_files(raw_folder, prefix)
    if not files:
        print(f"  {label}: no files found (prefix: {prefix}*)")
        return None
    try:
        df = parser_module.parse(files[0], spine, target_date=report_date)
        print(f"  {label}: {len(df)} rows from {Path(files[0]).name}")
        return df
    except Exception as e:
        print(f"  {label}: parse error — {e}")
        return None


def run_reports(target_date: date, reports: list[str], config_path: str = "config/config.json"):
    """
    Generate Weekly, Monthly, and/or CR report sheets inside DSR_Master.xlsx.

    Parameters
    ----------
    target_date : date
        Reference date for the reports.
    reports : list[str]
        Which reports to generate: ["weekly", "monthly", "cr"]
    config_path : str
        Path to config.json.
    """
    config = load_config(config_path)
    master_path = config.get("report", {}).get("master_path", "")
    if not master_path:
        master_path = config.get("spine", {}).get("path", "config/spine.xlsx")
    spine_path = config.get("spine", {}).get("path", "config/spine.xlsx")
    spine_sheet = config.get("spine", {}).get("sheet_name", "Spine")
    excluded_agents = config.get("spine", {}).get("excluded_agents", [])

    spine = Spine(spine_path, sheet_name=spine_sheet, excluded_agents=excluded_agents)

    report_labels = ", ".join(r.title() for r in reports)
    print("=" * 60)
    print(f"  Generating {report_labels} -> DSR_Master.xlsx")
    print(f"  Reference date: {target_date}")
    print("=" * 60)

    from src.reports.master_sheets import write_all_reports
    output = write_all_reports(master_path, spine, target_date, reports=reports)

    print("=" * 60)
    print(f"  Done! Reports written to: {output}")
    print("=" * 60)


def run_batch(
    dates: list[date],
    skip_email: bool = False,
    skip_screenshots: bool = False,
    skip_hs_downloads: bool = False,
    use_master: bool = True,
    supabase_only: bool = False,
    config_path: str = "config/config.json",
    sources: list[str] | None = None,
    no_headless: bool = False,
):
    """
    Run the DSR pipeline for multiple dates (e.g. Monday catch-up for Fri/Sat/Sun).

    For sources without internal date info (Rico AP, Premium), this function
    pre-computes file-to-date assignments using BatchSelector, then runs each
    date with the correct file mapping.
    """
    dates = sorted(dates)
    config = load_config(config_path)

    print("=" * 60)
    print(f"  BATCH RUN: {len(dates)} dates")
    print(f"  Dates: {', '.join(str(d) for d in dates)}")
    print("=" * 60)

    # Build batch selectors for undated sources
    batch_selectors = {}

    # Rico AP: gather all Agent Performance files
    ap_config = config.get("email_sources", {}).get("rico_ap", {})
    if ap_config.get("source_type") == "downloads_folder":
        ap_folder = Path(ap_config.get("downloads_folder", ""))
        ap_files = list(ap_folder.glob("Agent Performance*.xlsx"))
        if ap_files:
            ap_selector = BatchSelector(ap_files, dates)
            batch_selectors["rico_ap"] = ap_selector
            print(f"\n  Rico AP file assignments:")
            print(ap_selector.summary())

    # Premium: gather all sales-report CSVs
    prem_config = config.get("email_sources", {}).get("premium", {})
    if prem_config.get("source_type") == "downloads_folder":
        prem_folder = Path(prem_config.get("downloads_folder", ""))
        prem_files = list(prem_folder.glob("sales-report - *T*.csv"))
        if not prem_files:
            prem_files = list(prem_folder.glob("sales-report*.csv"))
        if prem_files:
            prem_selector = BatchSelector(prem_files, dates)
            batch_selectors["premium"] = prem_selector
            print(f"\n  Premium file assignments:")
            print(prem_selector.summary())

    print("\n" + "=" * 60)

    # Run each date with the batch selectors
    for d in dates:
        print(f"\n{'#' * 60}")
        print(f"  Processing {d}")
        print(f"{'#' * 60}")
        run(
            report_date=d,
            skip_email=skip_email,
            skip_screenshots=skip_screenshots,
            skip_hs_downloads=skip_hs_downloads,
            use_master=use_master,
            supabase_only=supabase_only,
            config_path=config_path,
            batch_selectors=batch_selectors,
            sources=sources,
            no_headless=no_headless,
        )

    print(f"\n{'=' * 60}")
    print(f"  BATCH COMPLETE: {len(dates)} dates processed")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Excel Report Automation — DSR Builder")
    parser.add_argument(
        "--date",
        type=str,
        default=None,
        help="Report date (YYYY-MM-DD). Defaults to today.",
    )
    parser.add_argument(
        "--batch",
        type=str,
        nargs="+",
        default=None,
        help="Batch mode: process multiple dates (e.g. --batch 2026-05-01 2026-05-02 2026-05-03). "
             "Use for Monday catch-ups when multiple files share the same download day.",
    )
    parser.add_argument("--report", choices=["dsr", "weekly", "monthly", "cr", "all"], default="dsr",
                        help="Report type: dsr (daily), weekly, monthly, cr (close rate), all (weekly+monthly+cr)")
    parser.add_argument("--skip-email", action="store_true", help="Skip Outlook email fetch")
    parser.add_argument("--skip-screenshots", action="store_true", help="Skip screenshot OCR")
    parser.add_argument("--skip-hs-downloads", action="store_true",
                        help="Skip opening Hearsay download links in browser")
    parser.add_argument("--new-file", action="store_true",
                        help="Generate a standalone report instead of writing to the master")
    parser.add_argument("--supabase-only", action="store_true",
                        help="Only push data to Supabase (skip Excel output). Used by the web dashboard.")
    parser.add_argument("--config", default="config/config.json", help="Config file path")
    parser.add_argument("--upload-dir", type=str, default=None,
                        help="Upload mode: read source files from this directory instead of configured paths")
    parser.add_argument("--upload-types", type=str, default=None,
                        help="Comma-separated list of source types to process from upload dir (e.g. rc,quotes,nb)")
    parser.add_argument("--upload-id", type=str, default=None,
                        help="The UUID of the upload batch from Next.js")
    parser.add_argument("--sources", type=str, default=None,
                        help="Comma-separated list of sources to process (e.g. rc,hs,quotes,nb,premium,rico_ch,rico_ap,rico_leads). "
                             "Omit to process all sources. Used by smart sync to only pull missing data.")
    parser.add_argument("--no-headless", action="store_true",
                        help="Run Playwright browser headfully (visible)")
    parser.add_argument("--no-date-filter", action="store_true",
                        help="Don't filter internal-date files (quotes, nb, rc, rico_ch) to a single date. "
                             "Instead, read all dates from the file and push each date separately.")

    args = parser.parse_args()

    if args.report == "all":
        report_date = date.fromisoformat(args.date) if args.date else date.today()
        run_reports(report_date, ["weekly", "monthly", "cr"], config_path=args.config)
    elif args.report in ("weekly", "monthly", "cr"):
        report_date = date.fromisoformat(args.date) if args.date else date.today()
        run_reports(report_date, [args.report], config_path=args.config)
    elif args.batch:
        # Batch mode: process multiple dates
        batch_dates = [date.fromisoformat(d) for d in args.batch]
        sources_filter = args.sources.split(",") if args.sources else None
        run_batch(
            dates=batch_dates,
            skip_email=args.skip_email,
            skip_screenshots=args.skip_screenshots,
            skip_hs_downloads=args.skip_hs_downloads,
            use_master=not args.new_file,
            supabase_only=args.supabase_only,
            config_path=args.config,
            sources=sources_filter,
            no_headless=args.no_headless,
        )
    else:
        report_date = date.fromisoformat(args.date) if args.date else date.today()
        upload_types = args.upload_types.split(",") if args.upload_types else None
        sources_filter = args.sources.split(",") if args.sources else None
        run(
            report_date=report_date,
            skip_email=args.skip_email,
            skip_screenshots=args.skip_screenshots,
            skip_hs_downloads=args.skip_hs_downloads,
            use_master=not args.new_file,
            supabase_only=args.supabase_only,
            config_path=args.config,
            upload_dir=args.upload_dir,
            upload_types=upload_types,
            sources=sources_filter,
            no_headless=args.no_headless,
            no_date_filter=args.no_date_filter,
        )
