/**
 * premium-parser.ts — AgencyZoom Premium/Points data parser.
 *
 * Port of Python's premium_parser.py.
 *
 * Handles two formats:
 *   1. Excel export (premium_export.xlsx) — has Date column
 *   2. AgencyZoom CSV download (sales-report*.csv) — no Date column,
 *      has "$" in Premium. First row is "Total" (skip it).
 *
 * Output rows: { Date, Agent, PremItems, PremPremium, PremPoints }
 */

import * as XLSX from "xlsx";
import type { ParseResult } from "../types";
import { Spine } from "../spine";

/**
 * Parse a single premium file (CSV or Excel).
 *
 * @param fileBuffer  Raw file bytes
 * @param fileName    Original filename
 * @param spine       Agent name resolver
 * @param targetDate  ISO date string ("2026-03-22") or null
 */
export function parsePremium(
  fileBuffer: ArrayBuffer,
  fileName: string,
  spine: Spine,
  targetDate: string | null,
): ParseResult {
  const logs: string[] = [];
  logs.push(`[premium-parser] Parsing file: ${fileName}`);

  const isCSV = fileName.toLowerCase().endsWith(".csv");

  if (isCSV) {
    return parseCSVFormat(fileBuffer, fileName, spine, targetDate, logs);
  } else {
    return parseExcelFormat(fileBuffer, fileName, spine, targetDate, logs);
  }
}

// ─── CSV format (AgencyZoom sales-report download) ──────────────────

function parseCSVFormat(
  fileBuffer: ArrayBuffer,
  fileName: string,
  spine: Spine,
  targetDate: string | null,
  logs: string[],
): ParseResult {
  const text = new TextDecoder("utf-8").decode(fileBuffer);
  const rawData = parseCSV(text);
  logs.push(`[premium-parser] Read ${rawData.length} rows from CSV`);

  const rows: Record<string, unknown>[] = [];

  for (const raw of rawData) {
    // Skip "Total" row
    const producer = raw["Producer"];
    if (!producer || producer.trim() === "" || producer.trim() === "Total") {
      continue;
    }

    // Resolve producer name via Spine
    const agent = spine.resolveAgent(producer.trim());
    if (!agent) {
      logs.push(`[premium-parser] Skipping unresolved producer: "${producer}"`);
      continue;
    }

    // Clean currency from Premium column
    const premPremium = cleanCurrency(raw["Premium"]);
    const premItems = toInt(raw["Items"]);
    const premPoints = toInt(raw["Points"]);

    rows.push({
      Date: targetDate,
      Agent: agent,
      PremItems: premItems,
      PremPremium: premPremium,
      PremPoints: premPoints,
    });
  }

  logs.push(`[premium-parser] Parsed ${rows.length} rows from ${fileName}`);
  return { type: "premium", rows, logs };
}

// ─── Excel format (workbook export with Date column) ────────────────

function parseExcelFormat(
  fileBuffer: ArrayBuffer,
  fileName: string,
  spine: Spine,
  targetDate: string | null,
  logs: string[],
): ParseResult {
  const wb = XLSX.read(fileBuffer, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  let data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
  logs.push(`[premium-parser] Read ${data.length} rows from Excel`);

  // Filter to targetDate if Date column exists
  if (targetDate && data.length > 0 && "Date" in data[0]) {
    data = data.filter((row) => {
      const rowDate = toDateString(row["Date"]);
      return rowDate === targetDate;
    });
    logs.push(`[premium-parser] Filtered to ${targetDate}: ${data.length} rows`);
  }

  const rows: Record<string, unknown>[] = [];

  for (const raw of data) {
    // Skip "Total" row
    const producer = raw["Producer"];
    if (producer == null || String(producer).trim() === "" || String(producer).trim() === "Total") {
      continue;
    }

    // Resolve producer name via Spine
    const agent = spine.resolveAgent(String(producer).trim());
    if (!agent) {
      logs.push(`[premium-parser] Skipping unresolved producer: "${producer}"`);
      continue;
    }

    // Date: use per-row Date or targetDate
    const date = raw["Date"] != null ? toDateString(raw["Date"]) : targetDate;

    const premItems = toInt(raw["Items"]);
    const premPremium = toFloat(raw["Premium"]);
    const premPoints = toInt(raw["Points"]);

    rows.push({
      Date: date,
      Agent: agent,
      PremItems: premItems,
      PremPremium: premPremium,
      PremPoints: premPoints,
    });
  }

  logs.push(`[premium-parser] Parsed ${rows.length} rows from ${fileName}`);
  return { type: "premium", rows, logs };
}

// ─── Currency cleaning ──────────────────────────────────────────────

/**
 * Convert '$1,234.56' or '$1,234' to a float.
 * Mirrors Python's _clean_currency().
 */
function cleanCurrency(val: unknown): number {
  if (val == null) return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : val;

  const s = String(val).replace(/\$/g, "").replace(/,/g, "").trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
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
        if (i + 1 < text.length && text[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        }
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
          i++;
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
  // Handle currency strings that might have $ or commas
  const cleaned = String(val).replace(/\$/g, "").replace(/,/g, "").trim();
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? 0 : n;
}

function toFloat(val: unknown): number {
  if (val == null) return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  const cleaned = String(val).replace(/\$/g, "").replace(/,/g, "").trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}
