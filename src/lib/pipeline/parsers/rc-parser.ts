/**
 * rc-parser.ts — RingCentral phone data parser.
 *
 * Port of Python's rc_parser.py.
 *
 * Handles two file formats:
 *   1. Daily scheduled report (from Outlook): has "Users" sheet with data,
 *      "Filters" sheet with date. No "Date" column in the data.
 *   2. Multi-date export (rc_export.xlsx): has a "Date" column per row.
 *
 * Output rows: { Date, Agent, Calls, Inbound, Outbound, TalkTimeSeconds }
 */

import * as XLSX from "xlsx";
import type { ParseResult } from "../types";
import { Spine } from "../spine";

// ─── Column mapping (original name → internal name) ───
const COL_MAP: Record<string, string> = {
  "Total Calls": "Calls",
  "# Inbound": "Inbound",
  "# Outbound": "Outbound",
  "Total Handle Time": "TalkTime",
};

/**
 * Parse an RC file buffer (Excel workbook).
 *
 * @param fileBuffer  Raw file bytes
 * @param fileName    Original filename (used for date extraction fallback)
 * @param spine       Agent name resolver
 * @param targetDate  ISO date string ("2026-03-22") or null
 */
export function parseRC(
  fileBuffer: ArrayBuffer,
  fileName: string,
  spine: Spine,
  targetDate: string | null,
): ParseResult {
  const logs: string[] = [];
  logs.push(`[rc-parser] Parsing file: ${fileName}`);

  const wb = XLSX.read(fileBuffer, { type: "array", cellDates: true });
  const sheetNames = wb.SheetNames;

  if (sheetNames.includes("Users")) {
    logs.push("[rc-parser] Detected daily report format (Users sheet present)");
    return parseDailyReport(wb, fileName, spine, targetDate, logs);
  } else {
    logs.push("[rc-parser] Detected multi-date export format");
    return parseMultiDate(wb, fileName, spine, targetDate, logs);
  }
}

// ─── Daily report format ────────────────────────────────────────────

function parseDailyReport(
  wb: XLSX.WorkBook,
  fileName: string,
  spine: Spine,
  targetDate: string | null,
  logs: string[],
): ParseResult {
  // 1. Extract date from the Filters sheet's "From Time" column
  let reportDate: string | null = targetDate;

  try {
    const filtersSheet = wb.Sheets["Filters"];
    if (filtersSheet) {
      const filtersData = XLSX.utils.sheet_to_json<Record<string, unknown>>(filtersSheet);
      if (filtersData.length > 0) {
        const firstRow = filtersData[0];
        const fromTime = firstRow["From Time"];
        if (fromTime != null) {
          reportDate = toDateString(fromTime);
          logs.push(`[rc-parser] Extracted date from Filters sheet: ${reportDate}`);
        }
      }
    }
  } catch {
    logs.push("[rc-parser] Could not read Filters sheet for date");
  }

  // 2. Fallback: extract date from filename (e.g. Office_Perf_Users_03_23_2026_...)
  if (!reportDate) {
    const match = fileName.match(/(\d{2})_(\d{2})_(\d{4})/);
    if (match) {
      const [, m, d, y] = match;
      reportDate = `${y}-${m}-${d}`;
      logs.push(`[rc-parser] Extracted date from filename: ${reportDate}`);
    }
  }

  // 3. Last resort: today's date
  if (!reportDate) {
    reportDate = new Date().toISOString().slice(0, 10);
    logs.push(`[rc-parser] Using today's date as fallback: ${reportDate}`);
  }

  // Read the Users sheet
  const usersSheet = wb.Sheets["Users"];
  if (!usersSheet) {
    logs.push("[rc-parser] ERROR: Users sheet not found");
    return { type: "rc", rows: [], logs };
  }

  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(usersSheet);
  return processRows(data, spine, reportDate, fileName, logs);
}

// ─── Multi-date export format ───────────────────────────────────────

function parseMultiDate(
  wb: XLSX.WorkBook,
  fileName: string,
  spine: Spine,
  targetDate: string | null,
  logs: string[],
): ParseResult {
  const sheet = wb.Sheets[wb.SheetNames[0]];
  let data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

  // Filter to targetDate if a Date column exists and targetDate is provided
  if (targetDate) {
    const hasDateCol = data.length > 0 && "Date" in data[0];
    if (hasDateCol) {
      data = data.filter((row) => {
        const rowDate = toDateString(row["Date"]);
        return rowDate === targetDate;
      });
      logs.push(`[rc-parser] Filtered to target date ${targetDate}: ${data.length} rows`);
    }
  }

  // For multi-date, we pass null so processRows preserves per-row dates
  const dateForAllRows = targetDate;
  return processRows(data, spine, dateForAllRows, fileName, logs);
}

// ─── Shared processing ─────────────────────────────────────────────

function processRows(
  data: Record<string, unknown>[],
  spine: Spine,
  reportDate: string | null,
  sourceName: string,
  logs: string[],
): ParseResult {
  const rows: Record<string, unknown>[] = [];

  for (const raw of data) {
    // Rename columns via COL_MAP
    const row: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      const mapped = COL_MAP[key] ?? key;
      row[mapped] = value;
    }

    // Resolve agent name
    const nameVal = row["Name"];
    if (nameVal == null || String(nameVal).trim() === "") continue;

    const agent = spine.resolveAgent(String(nameVal));
    if (!agent) {
      logs.push(`[rc-parser] Skipping unresolved name: "${nameVal}"`);
      continue;
    }

    // Date: use reportDate or fall back to per-row Date column
    let date = reportDate;
    if (!date && row["Date"] != null) {
      date = toDateString(row["Date"]);
    }

    // Numeric columns: default to 0
    const calls = toInt(row["Calls"]);
    const inbound = toInt(row["Inbound"]);
    const outbound = toInt(row["Outbound"]);
    const talkTimeSeconds = toSeconds(row["TalkTime"]);

    rows.push({
      Date: date,
      Agent: agent,
      Calls: calls,
      Inbound: inbound,
      Outbound: outbound,
      TalkTimeSeconds: talkTimeSeconds,
    });
  }

  logs.push(`[rc-parser] Parsed ${rows.length} rows from ${sourceName}`);
  return { type: "rc", rows, logs };
}

// ─── Helper: convert any value to a date string ────────────────────

function toDateString(val: unknown): string | null {
  if (val == null) return null;

  // Already a Date object (SheetJS cellDates:true)
  if (val instanceof Date) {
    return val.toISOString().slice(0, 10);
  }

  // String date — try ISO parse
  const s = String(val).trim();
  if (!s) return null;

  // ISO format "2026-03-22" or "2026-03-22T..."
  const isoMatch = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  // US format "03/22/2026"
  const usMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usMatch) {
    const [, mm, dd, yyyy] = usMatch;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  // Fallback: let JS Date parse it
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);

  return null;
}

// ─── Helper: convert TalkTime to total seconds ─────────────────────

/**
 * Convert a TalkTime value to total seconds.
 * Handles:
 *   - Excel serial time (fractional day number, e.g. 0.00381944 ≈ 330s)
 *   - Timedelta strings from pandas ("0 days 00:05:30")
 *   - Plain HH:MM:SS or MM:SS strings ("00:05:30")
 *   - Already-numeric seconds
 *   - Date objects (treated as time-of-day offset from midnight)
 */
function toSeconds(val: unknown): number {
  if (val == null) return 0;

  // Excel serial time: a number between 0 and 1 (fraction of a day)
  // Numbers >= 1 are also valid (e.g. 1.5 = 36 hours)
  if (typeof val === "number") {
    if (val === 0) return 0;
    // If it looks like an Excel serial time (fractional day),
    // convert: 1 day = 86400 seconds
    if (val > 0 && val < 500) {
      // Treat values < 500 as fractional days (up to ~500 days).
      // Exact integers might be raw seconds, but Excel time values
      // for call durations are almost always < 1.
      if (val < 1) {
        return Math.round(val * 86400);
      }
      // If it's a small integer, it could be seconds already or a fractional day.
      // Excel serial times for talk time are typically < 1, so integers > 1
      // are likely already in seconds.
      return Math.round(val);
    }
    return Math.round(val);
  }

  // Date object from SheetJS cellDates:true — extract time-of-day
  if (val instanceof Date) {
    const hours = val.getUTCHours();
    const minutes = val.getUTCMinutes();
    const seconds = val.getUTCSeconds();
    return hours * 3600 + minutes * 60 + seconds;
  }

  // String formats
  if (typeof val === "string") {
    const s = val.trim();
    if (!s) return 0;

    // Pandas timedelta string: "0 days 00:05:30" or "0 days 00:05:30.000000"
    const tdMatch = s.match(/(\d+)\s+days?\s+(\d{1,2}):(\d{2}):(\d{2})/);
    if (tdMatch) {
      const [, days, hh, mm, ss] = tdMatch;
      return (
        parseInt(days) * 86400 +
        parseInt(hh) * 3600 +
        parseInt(mm) * 60 +
        parseInt(ss)
      );
    }

    // HH:MM:SS
    const hmsMatch = s.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
    if (hmsMatch) {
      const [, hh, mm, ss] = hmsMatch;
      return parseInt(hh) * 3600 + parseInt(mm) * 60 + parseInt(ss);
    }

    // MM:SS
    const msMatch = s.match(/^(\d{1,2}):(\d{2})$/);
    if (msMatch) {
      const [, mm, ss] = msMatch;
      return parseInt(mm) * 60 + parseInt(ss);
    }

    // Numeric string
    const num = parseFloat(s);
    if (!isNaN(num)) {
      if (num > 0 && num < 1) return Math.round(num * 86400);
      return Math.round(num);
    }

    return 0;
  }

  return 0;
}

// ─── Helper: safe int parse ────────────────────────────────────────

function toInt(val: unknown): number {
  if (val == null) return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : Math.round(val);
  const n = parseInt(String(val), 10);
  return isNaN(n) ? 0 : n;
}
