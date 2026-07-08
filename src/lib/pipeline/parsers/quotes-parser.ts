/**
 * quotes-parser.ts — Client-side port of quotes_parser.py
 *
 * Handles two Excel formats:
 *   1. Workbook export — clean headers at row 0, column "Date"
 *   2. Allstate portal download — metadata rows before header,
 *      column "Production Date" (MM/DD/YYYY)
 *
 * Exports a single entry-point that runs BOTH parse modes and merges results:
 *   parseQuotes(fileBuffer, fileName, spine, targetDate) → ParseResult
 */

import * as XLSX from "xlsx";
import type { ParseResult, QuoteRecord, QuoteDuplicate } from "../types";
import { Spine } from "../spine";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Excel serial-date epoch: 1899-12-30 in UTC milliseconds */
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

/**
 * Convert an unknown cell value to "YYYY-MM-DD" string, or null.
 * Handles: Excel serial numbers, JS Date objects, ISO strings, US-format
 * date strings (MM/DD/YYYY), and other parseable date strings.
 */
function toDateStr(v: unknown): string | null {
  if (v == null) return null;

  // Excel serial number (e.g. 45678)
  if (typeof v === "number" && v > 1 && v < 3000000) {
    const d = new Date(EXCEL_EPOCH_MS + v * 86_400_000);
    return fmtDate(d);
  }

  // JS Date
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return fmtDate(v);
  }

  // String
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;

    // Try MM/DD/YYYY
    const mdy = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
    if (mdy) {
      const d = new Date(Date.UTC(+mdy[3], +mdy[1] - 1, +mdy[2]));
      if (!isNaN(d.getTime())) return fmtDate(d);
    }

    // Try YYYY-MM-DD or general parse
    const d = new Date(s);
    if (!isNaN(d.getTime())) return fmtDate(d);
  }

  return null;
}

function fmtDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Safely cast a cell to trimmed string, or "" */
function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

/** Safely cast to float, or null */
function toFloat(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isNaN(n) ? null : n;
}

// ─── Sheet reading ──────────────────────────────────────────────────────────

interface SheetRow {
  [col: string]: unknown;
}

/**
 * Read an Excel or CSV buffer and auto-detect the header row by scanning
 * the first `probeRows` rows for a cell containing `markerColumn`.
 */
function readWithHeaderDetection(
  fileBuffer: ArrayBuffer,
  fileName: string,
  markerColumn: string,
  probeRows: number,
): { rows: SheetRow[]; columns: string[] } {
  const isCSV = /\.csv$/i.test(fileName);
  let allRows: unknown[][];

  if (isCSV) {
    allRows = parseCSVRaw(fileBuffer);
  } else {
    const wb = XLSX.read(fileBuffer, { type: "array", cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    allRows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];
  }

  // Probe for the header row
  let headerIdx = 0;
  const limit = Math.min(probeRows, allRows.length);
  for (let i = 0; i < limit; i++) {
    const row = allRows[i];
    if (!row) continue;
    const vals = row.filter((c) => c != null).map((c) => String(c).trim());
    if (vals.some((v) => v.includes(markerColumn))) {
      headerIdx = i;
      break;
    }
  }

  const headerRow = (allRows[headerIdx] || []).map((c) => str(c));
  const columns = headerRow.map((c) => c.trim());

  const rows: SheetRow[] = [];
  for (let i = headerIdx + 1; i < allRows.length; i++) {
    const raw = allRows[i];
    if (!raw) continue;
    const obj: SheetRow = {};
    let hasData = false;
    for (let j = 0; j < columns.length; j++) {
      const val = raw[j] ?? null;
      obj[columns[j]] = val;
      if (val != null && String(val).trim() !== "") hasData = true;
    }
    if (hasData) rows.push(obj);
  }

  return { rows, columns };
}

/**
 * Minimal CSV parser: splits by newlines, then by commas with quoted-field
 * support. Returns an array of arrays.
 */
function parseCSVRaw(buffer: ArrayBuffer): unknown[][] {
  const text = new TextDecoder("utf-8").decode(buffer);
  const lines = text.split(/\r?\n/);
  const result: unknown[][] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const row: unknown[] = [];
    let i = 0;
    while (i < line.length) {
      if (line[i] === '"') {
        let val = "";
        i++; // skip opening quote
        while (i < line.length) {
          if (line[i] === '"' && i + 1 < line.length && line[i + 1] === '"') {
            val += '"';
            i += 2;
          } else if (line[i] === '"') {
            i++; // skip closing quote
            break;
          } else {
            val += line[i];
            i++;
          }
        }
        row.push(val);
        if (i < line.length && line[i] === ",") i++; // skip comma
      } else {
        let val = "";
        while (i < line.length && line[i] !== ",") {
          val += line[i];
          i++;
        }
        row.push(val.trim());
        if (i < line.length) i++; // skip comma
      }
    }
    result.push(row);
  }
  return result;
}

// ─── Parse (basic quote counting) ───────────────────────────────────────────

interface ParseBasicResult {
  rows: Record<string, unknown>[];
  quoteRecords: QuoteRecord[];
  logs: string[];
}

function parseBasic(
  fileBuffer: ArrayBuffer,
  fileName: string,
  spine: Spine,
  targetDate: string | null,
): ParseBasicResult {
  const logs: string[] = [];
  const { rows, columns } = readWithHeaderDetection(fileBuffer, fileName, "Sub Producer", 10);
  logs.push(`[quotes] Read ${rows.length} data rows from ${fileName}`);

  // Determine date column: portal uses "Production Date", workbook uses "Date"
  const dateCol = columns.includes("Production Date") ? "Production Date" : "Date";

  // Convert dates and optionally filter to target date
  for (const row of rows) {
    row["__date"] = toDateStr(row[dateCol]);
  }

  let filtered = rows;
  if (targetDate) {
    filtered = filtered.filter((r) => r["__date"] === targetDate);
    logs.push(`[quotes] Filtered to targetDate=${targetDate}: ${filtered.length} rows`);
  }

  // Resolve agent via Spine (fallback to "Other" instead of dropping, so agency totals are accurate)
  const resolved: (typeof rows[0] & { Agent: string })[] = [];
  let unmappedCount = 0;
  for (const row of filtered) {
    const subProducer = str(row["Sub Producer"]);
    // Extract name portion after sub-producer code (e.g. "387-ALEX CLANCY" → "ALEX CLANCY")
    let excelName = subProducer;
    if (subProducer.includes("-")) {
      const parts = subProducer.split("-");
      excelName = parts.slice(1).join("-").trim() || parts[0].trim();
    }
    const agent = excelName ? spine.resolveAgent(excelName) : null;
    (row as Record<string, unknown>)["Agent"] = agent || "Other";
    resolved.push(row as typeof rows[0] & { Agent: string });
    if (!agent) unmappedCount++;
  }
  logs.push(`[quotes] Resolved ${resolved.length} rows to agents (${unmappedCount} mapped to "Other")`);

  // Build individual quote records for Supabase
  const quoteRecords: QuoteRecord[] = resolved.map((row) => ({
    quote_control_number: str(row["Quote Control Number"]),
    agent: row["Agent"],
    report_date: str(row["__date"]),
    product: str(row["Product"]) || null,
    premium: toFloat(row["Quoted Premium($)"]),
    sub_producer: str(row["Sub Producer"]) || null,
  }));

  // Group by [Date, Agent], count unique Quote Control Numbers
  const groups = new Map<string, Set<string>>();
  for (const row of resolved) {
    const key = `${row["__date"]}||${row["Agent"]}`;
    if (!groups.has(key)) groups.set(key, new Set());
    const qcn = str(row["Quote Control Number"]);
    if (qcn) groups.get(key)!.add(qcn);
  }

  const aggRows: Record<string, unknown>[] = [];
  for (const [key, qcnSet] of groups) {
    const [date, agent] = key.split("||");
    aggRows.push({ Date: date, Agent: agent, QuoteCount: qcnSet.size });
  }

  logs.push(`[quotes] Aggregated into ${aggRows.length} (Date, Agent) groups`);
  return { rows: aggRows, quoteRecords, logs };
}

// ─── Parse Auto Deduped (rolling 30-day deduplication) ──────────────────────

interface ParseDedupedResult {
  rows: Record<string, unknown>[];
  duplicates: QuoteDuplicate[];
  logs: string[];
}

function parseAutoDeduped(
  fileBuffer: ArrayBuffer,
  fileName: string,
  spine: Spine,
  targetDate: string | null,
): ParseDedupedResult {
  const logs: string[] = [];
  const { rows, columns } = readWithHeaderDetection(fileBuffer, fileName, "Sub Producer", 10);

  // 1. Normalize date column
  const dateCol = columns.includes("Production Date") ? "Production Date" : "Date";
  for (const row of rows) {
    row["__date"] = toDateStr(row[dateCol]);
  }

  let filtered = rows;
  if (targetDate) {
    filtered = filtered.filter((r) => r["__date"] === targetDate);
  }

  // 2. Filter strictly for Standard Auto
  if (columns.includes("Product")) {
    filtered = filtered.filter((r) => str(r["Product"]).toLowerCase() === "standard auto");
    logs.push(`[quotes-dedup] After Standard Auto filter: ${filtered.length} rows`);
  } else {
    logs.push("[quotes-dedup] WARNING: 'Product' column not found, skipping Standard Auto filter!");
  }

  // 3. Resolve agents (fallback to "Other" instead of dropping)
  for (const row of filtered) {
    const subProducer = str(row["Sub Producer"]);
    // Extract name portion after sub-producer code (e.g. "387-ALEX CLANCY" → "ALEX CLANCY")
    let excelName = subProducer;
    if (subProducer.includes("-")) {
      const parts = subProducer.split("-");
      excelName = parts.slice(1).join("-").trim() || parts[0].trim();
    }
    const resolved = excelName ? spine.resolveAgent(excelName) : null;
    (row as Record<string, unknown>)["Agent"] = resolved || "Other";
  }

  if (filtered.length === 0) {
    logs.push(`[quotes-dedup] No Standard Auto quotes found in ${fileName}`);
    return { rows: [], duplicates: [], logs };
  }

  // 4. Build dedup key: sub_producer_clean|first_upper|last_upper|address_upper
  for (const row of filtered) {
    const subClean = str(row["Sub Producer"]);
    const firstClean = str(row["Customer First Name"]).toUpperCase();
    const lastClean = str(row["Customer Last Name"]).toUpperCase();
    const addressClean = str(row["Customer Street Address"])
      .toUpperCase()
      .replace(/\n/g, "")
      .replace(/\r/g, "");
    (row as Record<string, unknown>)["__dedup_key"] =
      `${subClean}|${firstClean}|${lastClean}|${addressClean}`;
  }

  // Sort chronologically for rolling deduplication (by dedup_key then date)
  const sorted = [...filtered].sort((a, b) => {
    const ka = str(a["__dedup_key"]);
    const kb = str(b["__dedup_key"]);
    if (ka !== kb) return ka < kb ? -1 : 1;
    const da = str(a["__date"]);
    const db = str(b["__date"]);
    return da < db ? -1 : da > db ? 1 : 0;
  });

  // Rolling 30-day deduplication
  const lastKeptDates = new Map<string, string>(); // key → YYYY-MM-DD of last kept date
  const isKept: boolean[] = [];

  for (const row of sorted) {
    const key = str(row["__dedup_key"]);
    const currDate = str(row["__date"]);

    if (!currDate) {
      isKept.push(false);
      continue;
    }

    const lastDate = lastKeptDates.get(key);
    if (lastDate === undefined) {
      // First occurrence of this key — keep it
      isKept.push(true);
      lastKeptDates.set(key, currDate);
    } else {
      const diffDays = dateDiffDays(lastDate, currDate);
      if (diffDays <= 30) {
        // Within 30 days of last kept — duplicate
        isKept.push(false);
      } else {
        isKept.push(true);
        lastKeptDates.set(key, currDate);
      }
    }
  }

  // Tag each row with is_kept
  for (let i = 0; i < sorted.length; i++) {
    (sorted[i] as Record<string, unknown>)["__is_kept"] = isKept[i];
  }

  // Build duplicates list (all rows in groups of size > 1)
  const keyGroups = new Map<string, typeof sorted>();
  for (const row of sorted) {
    const key = str(row["__dedup_key"]);
    if (!keyGroups.has(key)) keyGroups.set(key, []);
    keyGroups.get(key)!.push(row);
  }

  const duplicates: QuoteDuplicate[] = [];
  for (const [key, group] of keyGroups) {
    if (group.length > 1) {
      for (const r of group) {
        const qDate = str(r["__date"]);
        const address = str(r["Customer Street Address"])
          .replace(/\n/g, "")
          .replace(/\r/g, "");
        duplicates.push({
          report_month: qDate ? qDate.substring(0, 7) : "",
          dedup_key: key,
          sub_producer: str(r["Sub Producer"]),
          first_name: str(r["Customer First Name"]),
          last_name: str(r["Customer Last Name"]),
          address,
          quote_date: qDate || "",
          agent_number: str(r["Agent Number"]),
          quote_control_number: str(r["Quote Control Number"]),
          premium: toFloat(r["Quoted Premium($)"]) ?? 0,
          product: str(r["Product"]),
          is_kept: !!r["__is_kept"],
        });
      }
    }
  }

  // 5. Aggregate kept rows by Date + Agent → QuotesDeduped count
  const keptRows = sorted.filter((_, i) => isKept[i]);
  const keptCount = keptRows.length;
  const removedCount = sorted.length - keptCount;
  logs.push(
    `[quotes-dedup] Standard Auto deduped: ${keptCount} kept, ${removedCount} duplicates removed from ${fileName}`,
  );

  const aggMap = new Map<string, number>();
  for (const row of keptRows) {
    const key = `${str(row["__date"])}||${str((row as Record<string, unknown>)["Agent"])}`;
    aggMap.set(key, (aggMap.get(key) || 0) + 1);
  }

  const aggRows: Record<string, unknown>[] = [];
  for (const [key, count] of aggMap) {
    const [date, agent] = key.split("||");
    aggRows.push({ Date: date, Agent: agent, QuotesDeduped: count });
  }

  return { rows: aggRows, duplicates, logs };
}

// ─── Date diff helper ───────────────────────────────────────────────────────

/** Compute calendar-day difference between two YYYY-MM-DD strings. */
function dateDiffDays(a: string, b: string): number {
  const da = new Date(a + "T00:00:00Z");
  const db = new Date(b + "T00:00:00Z");
  return Math.round(Math.abs(db.getTime() - da.getTime()) / 86_400_000);
}

// ─── Main entry point ───────────────────────────────────────────────────────

/**
 * Parse a quotes file — runs BOTH basic counting and auto-deduplication,
 * merging the results into a single ParseResult.
 *
 * rows[] will contain objects with:
 *   - { Date, Agent, QuoteCount } — from basic parse
 *   - { Date, Agent, QuotesDeduped } — from dedup parse
 * merged into single objects keyed by (Date, Agent).
 */
export function parseQuotes(
  fileBuffer: ArrayBuffer,
  fileName: string,
  spine: Spine,
  targetDate: string | null,
): ParseResult {
  const logs: string[] = [];

  // Run both parse modes
  const basic = parseBasic(fileBuffer, fileName, spine, targetDate);
  logs.push(...basic.logs);

  const deduped = parseAutoDeduped(fileBuffer, fileName, spine, targetDate);
  logs.push(...deduped.logs);

  // Merge aggregated rows by (Date, Agent)
  const merged = new Map<string, Record<string, unknown>>();

  for (const row of basic.rows) {
    const key = `${row["Date"]}||${row["Agent"]}`;
    merged.set(key, { ...row });
  }

  for (const row of deduped.rows) {
    const key = `${row["Date"]}||${row["Agent"]}`;
    const existing = merged.get(key);
    if (existing) {
      existing["QuotesDeduped"] = row["QuotesDeduped"];
    } else {
      merged.set(key, { ...row });
    }
  }

  const rows = Array.from(merged.values());
  logs.push(`[quotes] Final merged output: ${rows.length} rows`);

  return {
    type: "quotes",
    rows,
    logs,
    quoteRecords: basic.quoteRecords,
    quoteDuplicates: deduped.duplicates,
  };
}
