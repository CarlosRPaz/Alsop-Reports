/**
 * hs-parser.ts — HiSales/Hearsay messaging data parser.
 *
 * Port of Python's hs_parser.py.
 *
 * Handles two input formats:
 *   1. Multi-date Excel export (hs_export.xlsx) — has Date column
 *   2. Daily CSV downloads from Hearsay — no Date column.
 *      Filename: "Performance Breakdown Report 2026-03-23T0823 (N).csv"
 *      Date is extracted from filename (data date = generation date - 1 day).
 *
 * Output rows: { Date, Agent, Texts, OutTexts, OptIns, OptOuts }
 */

import * as XLSX from "xlsx";
import type { ParseResult } from "../types";
import { Spine } from "../spine";

// ─── Column mapping (original name → internal name) ───
const COL_MAP: Record<string, string> = {
  "Date": "Date",
  "User Name": "UserName",
  "Number of Total Messages": "Texts",
  "Number of Outbound Messages": "OutTexts",
  "Number of Opt-Ins": "OptIns",
  "Number of Opt-Outs": "OptOuts",
  "Workspace Name": "WorkspaceName",
};


const NUMERIC_COLS = ["Texts", "OutTexts", "OptIns", "OptOuts"] as const;

/**
 * Parse a single Hearsay file (CSV or Excel).
 *
 * @param fileBuffer  Raw file bytes
 * @param fileName    Original filename (used for date extraction)
 * @param spine       Agent name resolver
 * @param targetDate  ISO date string ("2026-03-22") or null
 */
export function parseHS(
  fileBuffer: ArrayBuffer,
  fileName: string,
  spine: Spine,
  targetDate: string | null,
): ParseResult {
  const logs: string[] = [];
  logs.push(`[hs-parser] Parsing file: ${fileName}`);

  const isCSV = fileName.toLowerCase().endsWith(".csv");

  let rawData: Record<string, unknown>[];

  if (isCSV) {
    const text = new TextDecoder("utf-8").decode(fileBuffer);
    rawData = parseCSV(text);
    logs.push(`[hs-parser] Read ${rawData.length} rows from CSV`);
  } else {
    const wb = XLSX.read(fileBuffer, { type: "array", cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    logs.push(`[hs-parser] Read ${rawData.length} rows from Excel`);
  }

  // Rename columns via COL_MAP
  const data = rawData.map((raw) => {
    const row: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      const mapped = COL_MAP[key] ?? key;
      row[mapped] = value;
    }
    return row;
  });

  // Determine date
  const hasDateCol = data.length > 0 && "Date" in data[0];

  if (!hasDateCol) {
    // Extract date from filename or use targetDate
    const fileDate = dateFromFilename(fileName);
    const reportDate = fileDate ?? targetDate;
    if (reportDate) {
      logs.push(`[hs-parser] Using date: ${reportDate} (from ${fileDate ? "filename" : "targetDate"})`);
    } else {
      logs.push("[hs-parser] WARNING: No date available from filename or targetDate");
    }
    for (const row of data) {
      row["Date"] = reportDate;
    }
  } else if (targetDate) {
    // Filter to targetDate
    const before = data.length;
    const filtered = data.filter((row) => {
      const rowDate = toDateString(row["Date"]);
      return rowDate === targetDate;
    });
    // Replace data in-place by clearing and pushing
    data.length = 0;
    data.push(...filtered);
    logs.push(`[hs-parser] Filtered to ${targetDate}: ${data.length}/${before} rows`);
  }

  // Resolve agent names
  const resolved: Record<string, unknown>[] = [];
  for (const row of data) {
    const userName = row["UserName"];
    if (userName == null || String(userName).trim() === "") continue;

    const agent = spine.resolveAgent(String(userName));
    if (!agent) {
      logs.push(`[hs-parser] Skipping unresolved user: "${userName}"`);
      continue;
    }
    row["Agent"] = agent;
    resolved.push(row);
  }

  logs.push(`[hs-parser] Resolved ${resolved.length} agent rows`);

  // Aggregate per [Date, Agent] — agent may appear in multiple workspaces
  const aggregated = aggregate(resolved, logs, fileName);

  return { type: "hs", rows: aggregated, logs };
}

// ─── Aggregation ────────────────────────────────────────────────────

/**
 * Group by [Date, Agent] and sum numeric columns.
 * Mirrors Python's _aggregate().
 */
function aggregate(
  data: Record<string, unknown>[],
  logs: string[],
  sourceName: string,
): Record<string, unknown>[] {
  if (data.length === 0) {
    logs.push("[hs-parser] No data to aggregate");
    return [];
  }

  // Build aggregation map: "Date|Agent" → summed values
  const groups = new Map<
    string,
    { Date: string | null; Agent: string; Texts: number; OutTexts: number; OptIns: number; OptOuts: number }
  >();

  // Deduplicate by Date|Agent|WorkspaceName to prevent double-counting when duplicate files are uploaded
  const uniqueRows: Record<string, unknown>[] = []
  const seenKeys = new Set<string>()

  for (const row of data) {
    const date = row["Date"] != null ? toDateString(row["Date"]) : null
    const agent = String(row["Agent"])
    const workspace = String(row["WorkspaceName"] || "DefaultWorkspace").trim()
    const key = `${date}|${agent}|${workspace}`

    if (seenKeys.has(key)) {
      continue
    }
    seenKeys.add(key)
    uniqueRows.push(row)
  }

  if (uniqueRows.length < data.length) {
    logs.push(`[hs-parser] Deduplicated: kept ${uniqueRows.length} unique workspace rows out of ${data.length} total rows`);
  }

  for (const row of uniqueRows) {
    const date = row["Date"] != null ? toDateString(row["Date"]) : null;
    const agent = String(row["Agent"]);
    const key = `${date}|${agent}`;

    let group = groups.get(key);
    if (!group) {
      group = { Date: date, Agent: agent, Texts: 0, OutTexts: 0, OptIns: 0, OptOuts: 0 };
      groups.set(key, group);
    }

    for (const col of NUMERIC_COLS) {
      group[col] += toInt(row[col]);
    }
  }

  // Convert to array, skipping all-zero rows
  const rows: Record<string, unknown>[] = [];
  for (const group of Array.from(groups.values())) {
    const total = group.Texts + group.OutTexts + group.OptIns + group.OptOuts;
    if (total === 0) continue;

    rows.push({
      Date: group.Date,
      Agent: group.Agent,
      Texts: group.Texts,
      OutTexts: group.OutTexts,
      OptIns: group.OptIns,
      OptOuts: group.OptOuts,
    });
  }

  logs.push(`[hs-parser] Aggregated to ${rows.length} rows from ${sourceName}`);
  return rows;
}

// ─── Date extraction from filename ──────────────────────────────────

/**
 * Extract the DATA date from a Hearsay CSV filename.
 *
 * Filename format: "Performance Breakdown Report 2026-03-23T0823 (N).csv"
 * The date in the filename is the generation date.
 * The actual data date = generation date - 1 day (report is for "yesterday").
 */
function dateFromFilename(fileName: string): string | null {
  const match = fileName.match(/(\d{4}-\d{2}-\d{2})T/);
  if (!match) return null;

  const genDate = new Date(match[1] + "T12:00:00Z"); // noon UTC to avoid DST issues
  genDate.setUTCDate(genDate.getUTCDate() - 1); // data is for yesterday
  return genDate.toISOString().slice(0, 10);
}

// ─── CSV parser ─────────────────────────────────────────────────────

/**
 * Simple CSV parser that handles quoted fields (fields containing commas
 * or newlines wrapped in double quotes, with "" as escaped quote).
 */
function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        // Check for escaped quote ""
        if (i + 1 < text.length && text[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        }
        // End of quoted field
        inQuotes = false;
        i++;
        continue;
      }
      currentField += ch;
      i++;
    } else {
      if (ch === '"' && currentField === "") {
        inQuotes = true;
        i++;
      } else if (ch === ",") {
        currentRow.push(currentField);
        currentField = "";
        i++;
      } else if (ch === "\n" || ch === "\r") {
        currentRow.push(currentField);
        currentField = "";
        if (ch === "\r" && i + 1 < text.length && text[i + 1] === "\n") {
          i++; // skip \r\n
        }
        if (currentRow.length > 0 && currentRow.some((f) => f.trim() !== "")) {
          rows.push(currentRow);
        }
        currentRow = [];
        i++;
      } else {
        currentField += ch;
        i++;
      }
    }
  }

  // Last field/row
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some((f) => f.trim() !== "")) {
      rows.push(currentRow);
    }
  }

  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.trim());
  const result: Record<string, string>[] = [];

  for (let r = 1; r < rows.length; r++) {
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = c < rows[r].length ? rows[r][c].trim() : "";
    }
    result.push(obj);
  }

  return result;
}

// ─── Helpers ────────────────────────────────────────────────────────

function toDateString(val: unknown): string | null {
  if (val == null) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);

  const s = String(val).trim();
  if (!s) return null;

  const isoMatch = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  const usMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usMatch) {
    const [, mm, dd, yyyy] = usMatch;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);

  return null;
}

function toInt(val: unknown): number {
  if (val == null) return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : Math.round(val);
  const n = parseInt(String(val), 10);
  return isNaN(n) ? 0 : n;
}
