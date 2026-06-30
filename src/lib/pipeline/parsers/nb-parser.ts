/**
 * nb-parser.ts — Client-side port of nb_parser.py
 *
 * Handles two Excel formats:
 *   1. Workbook export — clean headers at row 0
 *   2. Allstate portal download — metadata rows before header,
 *      header contains "Sub-Producer Name"
 *
 * Exports a single entry-point:
 *   parseNB(fileBuffer, fileName, spine, targetDate) → ParseResult
 */

import * as XLSX from "xlsx";
import type { ParseResult } from "../types";
import { Spine } from "../spine";

// ─── Helpers ────────────────────────────────────────────────────────────────

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

/**
 * Convert an unknown cell value to "YYYY-MM-DD" string, or null.
 * Handles Excel serial numbers, Date objects, ISO strings, and US-format dates.
 */
function toDateStr(v: unknown): string | null {
  if (v == null) return null;

  if (typeof v === "number" && v > 1 && v < 3000000) {
    const d = new Date(EXCEL_EPOCH_MS + v * 86_400_000);
    return fmtDate(d);
  }

  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return fmtDate(v);
  }

  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;

    const mdy = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
    if (mdy) {
      const d = new Date(Date.UTC(+mdy[3], +mdy[1] - 1, +mdy[2]));
      if (!isNaN(d.getTime())) return fmtDate(d);
    }

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

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function toFloat(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}

function toInt(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? Math.round(v) : parseInt(String(v), 10);
  return isNaN(n) ? 0 : n;
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
        i++;
        while (i < line.length) {
          if (line[i] === '"' && i + 1 < line.length && line[i + 1] === '"') {
            val += '"';
            i += 2;
          } else if (line[i] === '"') {
            i++;
            break;
          } else {
            val += line[i];
            i++;
          }
        }
        row.push(val);
        if (i < line.length && line[i] === ",") i++;
      } else {
        let val = "";
        while (i < line.length && line[i] !== ",") {
          val += line[i];
          i++;
        }
        row.push(val.trim());
        if (i < line.length) i++;
      }
    }
    result.push(row);
  }
  return result;
}

// ─── Agent resolution ───────────────────────────────────────────────────────

/**
 * Resolve agent from an NB row using dual-field fallback:
 *   Primary:  "Sub-Producer Name"
 *   Fallback: "Bind ID Name" (used when Sub-Producer Name is blank, e.g. rewrites)
 * Returns the canonical agent name, or null if unresolvable.
 */
function resolveAgentWithFallback(
  row: SheetRow,
  spine: Spine,
  logs: string[],
): string | null {
  // Try primary field: Sub-Producer Name
  const subName = str(row["Sub-Producer Name"]);
  if (subName) {
    const result = spine.resolveAgent(subName);
    if (result !== null) return result;
  }

  // Fallback: Bind ID Name
  const bindName = str(row["Bind ID Name"]);
  if (bindName) {
    const result = spine.resolveAgent(bindName);
    if (result !== null) {
      const subCode = str(row["Sub Producer"]);
      logs.push(
        `[nb] Fallback: resolved '${bindName}' via Bind ID Name (Sub Producer=${subCode})`,
      );
      return result;
    }
  }

  return null;
}

// ─── Exclude cancelled policies ─────────────────────────────────────────────

function excludeCancelled(
  rows: SheetRow[],
  columns: string[],
  fileName: string,
  logs: string[],
): SheetRow[] {
  if (!columns.includes("Disposition Code")) return rows;

  const kept: SheetRow[] = [];
  let cancelledCount = 0;

  for (const row of rows) {
    const disp = str(row["Disposition Code"]).toLowerCase();
    if (disp === "cancelled") {
      cancelledCount++;
    } else {
      kept.push(row);
    }
  }

  if (cancelledCount > 0) {
    const noun = cancelledCount === 1 ? "policy" : "policies";
    logs.push(`[nb] Excluded ${cancelledCount} cancelled ${noun} from ${fileName}`);
  }

  return kept;
}

// ─── Determine date column ──────────────────────────────────────────────────

function determineDateCol(columns: string[]): string {
  if (columns.includes("Date")) return "Date";
  if (columns.includes("Issued Date")) return "Issued Date";
  if (columns.includes("Date Written")) return "Date Written";
  return "Date"; // fallback
}

// ─── Parse (standard NB counting) ──────────────────────────────────────────

interface ParseBasicResult {
  rows: Record<string, unknown>[];
  logs: string[];
}

function parseBasic(
  fileBuffer: ArrayBuffer,
  fileName: string,
  spine: Spine,
  targetDate: string | null,
): ParseBasicResult {
  const logs: string[] = [];
  const { rows, columns } = readWithHeaderDetection(
    fileBuffer,
    fileName,
    "Sub-Producer Name",
    6,
  );
  logs.push(`[nb] Read ${rows.length} data rows from ${fileName}`);

  // Exclude cancelled policies
  let filtered = excludeCancelled(rows, columns, fileName, logs);

  // Determine and normalize date column
  const dateCol = determineDateCol(columns);
  for (const row of filtered) {
    row["__date"] = toDateStr(row[dateCol]);
  }

  // Filter to target date if specified
  if (targetDate) {
    filtered = filtered.filter((r) => r["__date"] === targetDate);
    logs.push(`[nb] Filtered to targetDate=${targetDate}: ${filtered.length} rows`);
  }

  // Resolve agents with fallback
  const resolved: (SheetRow & { Agent: string })[] = [];
  for (const row of filtered) {
    const agent = resolveAgentWithFallback(row, spine, logs);
    if (agent) {
      (row as Record<string, unknown>)["Agent"] = agent;
      resolved.push(row as SheetRow & { Agent: string });
    }
  }
  logs.push(
    `[nb] Resolved ${resolved.length} rows to agents (${filtered.length - resolved.length} unmapped/dropped)`,
  );

  // Group by [Date, Agent]: NBCount = nunique(Policy No), Items = sum(Item Count),
  //   WrittenPremium = sum(Written Premium)
  const groups = new Map<
    string,
    { policies: Set<string>; items: number; premium: number }
  >();

  for (const row of resolved) {
    const key = `${row["__date"]}||${row["Agent"]}`;
    if (!groups.has(key)) {
      groups.set(key, { policies: new Set(), items: 0, premium: 0 });
    }
    const g = groups.get(key)!;
    const policyNo = str(row["Policy No"]);
    if (policyNo) g.policies.add(policyNo);
    g.items += toInt(row["Item Count"]);
    g.premium += toFloat(row["Written Premium"]);
  }

  const aggRows: Record<string, unknown>[] = [];
  for (const [key, g] of groups) {
    const [date, agent] = key.split("||");
    aggRows.push({
      Date: date,
      Agent: agent,
      NBCount: g.policies.size,
      Items: g.items,
      WrittenPremium: Math.round(g.premium * 100) / 100,
    });
  }

  logs.push(`[nb] Aggregated into ${aggRows.length} (Date, Agent) groups`);
  return { rows: aggRows, logs };
}

// ─── Parse Auto (Standard Auto NB) ─────────────────────────────────────────

interface ParseAutoResult {
  rows: Record<string, unknown>[];
  logs: string[];
}

function parseAuto(
  fileBuffer: ArrayBuffer,
  fileName: string,
  spine: Spine,
  targetDate: string | null,
): ParseAutoResult {
  const logs: string[] = [];
  const { rows, columns } = readWithHeaderDetection(
    fileBuffer,
    fileName,
    "Sub-Producer Name",
    6,
  );

  // 1. Normalize date column
  const dateCol = determineDateCol(columns);
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
    logs.push(`[nb-auto] After Standard Auto filter: ${filtered.length} rows`);
  } else {
    logs.push("[nb-auto] WARNING: 'Product' column not found, skipping Standard Auto filter!");
  }

  // 3. Filter strictly for New Policy Issued
  if (columns.includes("Disposition Code")) {
    filtered = filtered.filter(
      (r) => str(r["Disposition Code"]).toLowerCase() === "new policy issued",
    );
    logs.push(`[nb-auto] After New Policy Issued filter: ${filtered.length} rows`);
  } else {
    logs.push(
      "[nb-auto] WARNING: 'Disposition Code' column not found, skipping New Policy filter!",
    );
  }

  // 4. Resolve agents (fallback to "Other" instead of dropping)
  for (const row of filtered) {
    const agent = resolveAgentWithFallback(row, spine, logs);
    (row as Record<string, unknown>)["Agent"] = agent ?? "Other";
  }

  if (filtered.length === 0) {
    logs.push(`[nb-auto] No Standard Auto New Policies found in ${fileName}`);
    return { rows: [], logs };
  }

  // 5. Deduplicate on Policy No (keep first occurrence)
  if (columns.includes("Policy No")) {
    const initialLen = filtered.length;
    const seen = new Set<string>();
    const deduped: SheetRow[] = [];
    for (const row of filtered) {
      const policyNo = str(row["Policy No"]);
      if (!policyNo || !seen.has(policyNo)) {
        if (policyNo) seen.add(policyNo);
        deduped.push(row);
      }
    }
    const removedCount = initialLen - deduped.length;
    if (removedCount > 0) {
      logs.push(`[nb-auto] Excluded ${removedCount} duplicate policy rows from ${fileName}`);
    }
    filtered = deduped;
  } else {
    logs.push(
      "[nb-auto] WARNING: 'Policy No' column not found, skipping policy number deduplication!",
    );
  }

  // 6. Aggregate by Date and Agent → NBAutoCount (count), NBAutoItems (sum of Item Count)
  const groups = new Map<string, { count: number; items: number }>();
  for (const row of filtered) {
    const key = `${str(row["__date"])}||${str((row as Record<string, unknown>)["Agent"])}`;
    if (!groups.has(key)) groups.set(key, { count: 0, items: 0 });
    const g = groups.get(key)!;
    g.count += 1;
    g.items += toInt(row["Item Count"]);
  }

  const aggRows: Record<string, unknown>[] = [];
  let totalPolicies = 0;
  let totalItems = 0;
  for (const [key, g] of groups) {
    const [date, agent] = key.split("||");
    aggRows.push({
      Date: date,
      Agent: agent,
      NBAutoCount: g.count,
      NBAutoItems: g.items,
    });
    totalPolicies += g.count;
    totalItems += g.items;
  }

  logs.push(
    `[nb-auto] Standard Auto NB parsed: ${totalPolicies} policies, ${totalItems} items from ${fileName}`,
  );
  return { rows: aggRows, logs };
}

// ─── Main entry point ───────────────────────────────────────────────────────

/**
 * Parse an NB file — runs BOTH standard NB counting and Standard Auto
 * aggregation, merging the results into a single ParseResult.
 *
 * Merged rows contain:
 *   { Date, Agent, NBCount, Items, WrittenPremium, NBAutoCount?, NBAutoItems? }
 */
export function parseNB(
  fileBuffer: ArrayBuffer,
  fileName: string,
  spine: Spine,
  targetDate: string | null,
): ParseResult {
  const logs: string[] = [];

  // Run both parse modes
  const basic = parseBasic(fileBuffer, fileName, spine, targetDate);
  logs.push(...basic.logs);

  const auto = parseAuto(fileBuffer, fileName, spine, targetDate);
  logs.push(...auto.logs);

  // Merge by (Date, Agent)
  const merged = new Map<string, Record<string, unknown>>();

  for (const row of basic.rows) {
    const key = `${row["Date"]}||${row["Agent"]}`;
    merged.set(key, { ...row });
  }

  for (const row of auto.rows) {
    const key = `${row["Date"]}||${row["Agent"]}`;
    const existing = merged.get(key);
    if (existing) {
      existing["NBAutoCount"] = row["NBAutoCount"];
      existing["NBAutoItems"] = row["NBAutoItems"];
    } else {
      merged.set(key, { ...row });
    }
  }

  const rows = Array.from(merged.values());
  logs.push(`[nb] Final merged output: ${rows.length} rows`);

  return {
    type: "nb",
    rows,
    logs,
  };
}
