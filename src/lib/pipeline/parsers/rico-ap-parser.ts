/**
 * rico-ap-parser.ts — Ricochet Agent Performance parser.
 *
 * Port of Python's rico_ap_parser.py to client-side TypeScript.
 *
 * Parses "Agent Performance (N).xlsx" files downloaded from Ricochet.
 * These contain pre-aggregated daily call counts per agent.
 *
 * The Python version reads the xlsx via zipfile + xml.etree due to an openpyxl
 * page-margin crash bug. SheetJS handles these files without issue, so we use
 * normal XLSX reading here.
 *
 * Expected columns:
 *   Name, Contacts, Real Time Calls, Live Queue Calls, Evening Queue Calls,
 *   Drip-Dial Calls, Boost Queue Calls, Email Queue Calls, Campaign Queue Calls,
 *   Direct Dial Calls, Inbound Calls, Total Outbound Calls, Total Queue Calls,
 *   Total Non Queue Calls, Total Calls, Total transfers in, Total transfers out
 *
 * Output rows contain:
 *   Agent, Calls, Inbound, Outbound
 *   (TalkTimeSeconds is NOT included — that comes from Rico CH)
 */

import * as XLSX from "xlsx"
import type { ParseResult } from "../types"
import { Spine } from "../spine"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Names to skip (dialers, summary rows) */
const SKIP_NAMES = new Set(["LM Dialer 1", "LM Dialer 2", "LM Dialer 3", "Total"])

/**
 * Header-to-field mapping. We try to match by header name first.
 * If headers don't match, we fall back to column index (0-indexed):
 *   A (0) = Name, K (10) = Inbound Calls, L (11) = Total Outbound Calls, O (14) = Total Calls
 */
const HEADER_MAP: Record<string, string> = {
  "Name": "Name",
  "Inbound Calls": "Inbound",
  "Total Outbound Calls": "Outbound",
  "Total Calls": "Calls",
}

/** Fallback column indices matching the Python _COL_MAP: A=0, K=10, L=11, O=14 */
const INDEX_FALLBACK: Record<number, string> = {
  0: "Name",
  10: "Inbound",
  11: "Outbound",
  14: "Calls",
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Safely convert a value to integer (mirrors Python _to_int) */
function toInt(val: unknown): number {
  if (val === null || val === undefined || val === "") return 0
  const n = Number(val)
  if (isNaN(n)) return 0
  return Math.floor(n)
}

/**
 * Try to build a column mapping from the header row.
 * Returns a map of column index → field name ("Name", "Inbound", "Outbound", "Calls")
 * if enough required headers are found, otherwise null (caller should use index fallback).
 */
function buildHeaderMap(headerRow: unknown[]): Map<number, string> | null {
  const map = new Map<number, string>()

  for (let i = 0; i < headerRow.length; i++) {
    const cellVal = String(headerRow[i] ?? "").trim()
    if (HEADER_MAP[cellVal]) {
      map.set(i, HEADER_MAP[cellVal])
    }
  }

  // We need at least "Name" and one numeric column to consider this valid
  const fields = new Set(map.values())
  if (fields.has("Name") && (fields.has("Calls") || fields.has("Inbound"))) {
    return map
  }
  return null
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/**
 * Parse a Rico Agent Performance Excel file and return per-agent call counts.
 *
 * @param fileBuffer  - Raw file contents as ArrayBuffer
 * @param fileName    - Original filename (for logging)
 * @param spine       - Spine instance for agent name resolution
 * @param targetDate  - YYYY-MM-DD string for the date column, or null
 * @returns ParseResult with type "rico_ap"
 */
export function parseRicoAP(
  fileBuffer: ArrayBuffer,
  fileName: string,
  spine: Spine,
  targetDate: string | null,
): ParseResult {
  const logs: string[] = []
  logs.push(`[rico_ap] Parsing ${fileName}`)

  // ---------------------------------------------------------------
  // Read the workbook via SheetJS
  // ---------------------------------------------------------------
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(fileBuffer, { type: "array" })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logs.push(`[rico_ap] Error reading ${fileName}: ${msg}`)
    return { type: "rico_ap", rows: [], logs }
  }

  // Use the first sheet
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    logs.push(`[rico_ap] No sheets found in ${fileName}`)
    return { type: "rico_ap", rows: [], logs }
  }

  const sheet = workbook.Sheets[sheetName]
  // Convert to array-of-arrays (header: 1 gives raw rows without auto-keying)
  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
  })

  if (rawRows.length < 2) {
    logs.push(`[rico_ap] No data rows in ${fileName}`)
    return { type: "rico_ap", rows: [], logs }
  }

  logs.push(`[rico_ap] Read ${rawRows.length} raw rows from sheet "${sheetName}"`)

  // ---------------------------------------------------------------
  // Determine column mapping (header-based or index fallback)
  // ---------------------------------------------------------------
  const headerRow = rawRows[0]
  const colMap = buildHeaderMap(headerRow)
  const useHeaderMap = colMap !== null

  if (useHeaderMap) {
    logs.push(`[rico_ap] Matched columns by header names`)
  } else {
    logs.push(`[rico_ap] Headers not recognized, using positional column fallback (A, K, L, O)`)
  }

  /**
   * Extract a named field from a row using either the header map or index fallback.
   */
  function getField(row: unknown[], field: string): unknown {
    if (useHeaderMap && colMap) {
      for (const [idx, f] of colMap.entries()) {
        if (f === field) return row[idx]
      }
      return ""
    }
    // Index fallback
    for (const [idx, f] of Object.entries(INDEX_FALLBACK)) {
      if (f === field) return row[Number(idx)]
    }
    return ""
  }

  // ---------------------------------------------------------------
  // Process data rows (skip header at index 0)
  // ---------------------------------------------------------------
  interface AgentAccum {
    calls: number
    inbound: number
    outbound: number
  }

  const agentMap = new Map<string, AgentAccum>()
  let skippedNames = 0
  let skippedResolve = 0

  for (let r = 1; r < rawRows.length; r++) {
    const row = rawRows[r]

    // Get name from column A / "Name" header
    const rawName = String(getField(row, "Name") ?? "").trim()
    if (!rawName) continue

    // Skip known non-agent names
    if (SKIP_NAMES.has(rawName)) {
      skippedNames++
      continue
    }

    // Resolve through spine
    const agent = spine.resolveAgent(rawName)
    if (!agent) {
      skippedResolve++
      continue
    }

    const calls = toInt(getField(row, "Calls"))
    const inbound = toInt(getField(row, "Inbound"))
    const outbound = toInt(getField(row, "Outbound"))

    // Aggregate in case of spine collisions (multiple rows → same canonical agent)
    const existing = agentMap.get(agent)
    if (existing) {
      existing.calls += calls
      existing.inbound += inbound
      existing.outbound += outbound
    } else {
      agentMap.set(agent, { calls, inbound, outbound })
    }
  }

  if (skippedNames > 0) {
    logs.push(`[rico_ap] Skipped ${skippedNames} non-agent rows (dialers/total)`)
  }
  if (skippedResolve > 0) {
    logs.push(`[rico_ap] Skipped ${skippedResolve} rows (unresolved agent name)`)
  }

  // ---------------------------------------------------------------
  // Build output rows
  // ---------------------------------------------------------------
  const rows: Record<string, unknown>[] = []
  for (const [agent, accum] of agentMap.entries()) {
    const row: Record<string, unknown> = {
      Agent: agent,
      Calls: accum.calls,
      Inbound: accum.inbound,
      Outbound: accum.outbound,
    }

    if (targetDate !== null) {
      row.Date = targetDate
    }

    rows.push(row)
  }

  logs.push(`[rico_ap] Parsed ${rows.length} agents from ${fileName}`)
  return { type: "rico_ap", rows, logs }
}
