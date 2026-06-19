/**
 * rico-ch-parser.ts — Rico Call History parser.
 *
 * Port of Python's rico_ch_parser.py to client-side TypeScript.
 *
 * Parses Rico Call History CSV files uploaded directly by the user.
 * These contain individual call records for Sales/EA agents using the Rico dialer.
 *
 * Expected CSV columns:
 *   Date, Full name, User, From, To, Call Duration, Call Duration In Seconds,
 *   Current Status, Call Type, Call Status, Vendor Name, Team
 *
 * Output rows contain:
 *   Date, Agent, Calls, Inbound, Outbound, TalkTimeSeconds
 */

import * as XLSX from "xlsx"
import type { ParseResult } from "../types"
import { Spine } from "../spine"

// ---------------------------------------------------------------------------
// CSV helper
// ---------------------------------------------------------------------------

/**
 * Parse a CSV string into an array of row objects keyed by header names.
 * Handles quoted fields containing commas and newlines.
 */
function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let current: string[] = []
  let field = ""
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        // Peek ahead: escaped quote ("") or end of quoted field
        if (i + 1 < text.length && text[i + 1] === '"') {
          field += '"'
          i++ // skip next quote
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ",") {
        current.push(field)
        field = ""
      } else if (ch === "\n") {
        current.push(field)
        field = ""
        // Skip blank rows
        if (current.length > 1 || current[0] !== "") {
          rows.push(current)
        }
        current = []
      } else if (ch === "\r") {
        // skip, handle \r\n via \n
      } else {
        field += ch
      }
    }
  }
  // Flush last field / row
  if (field || current.length > 0) {
    current.push(field)
    if (current.length > 1 || current[0] !== "") {
      rows.push(current)
    }
  }

  if (rows.length < 2) return []

  const headers = rows[0].map((h) => h.trim())
  const result: Record<string, string>[] = []
  for (let r = 1; r < rows.length; r++) {
    const obj: Record<string, string> = {}
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = (rows[r][c] ?? "").trim()
    }
    result.push(obj)
  }
  return result
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Parse a date string into YYYY-MM-DD format.
 * Handles common formats: MM/DD/YYYY, YYYY-MM-DD, M/D/YY, etc.
 * Returns null if unparseable.
 */
function parseDateStr(raw: string): string | null {
  if (!raw || !raw.trim()) return null
  const s = raw.trim()

  // Try ISO: YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (isoMatch) {
    const [, y, m, d] = isoMatch
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
  }

  // Try US: M/D/YYYY or M/D/YY (also M-D-YYYY)
  const usMatch = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})/)
  if (usMatch) {
    const [, m, d, yRaw] = usMatch
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
  }

  // Fallback: try native Date parse
  const dt = new Date(s)
  if (!isNaN(dt.getTime())) {
    const y = dt.getFullYear()
    const m = String(dt.getMonth() + 1).padStart(2, "0")
    const d = String(dt.getDate()).padStart(2, "0")
    return `${y}-${m}-${d}`
  }

  return null
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/**
 * Parse a Rico Call History CSV file and return aggregated per-agent stats.
 *
 * @param fileBuffer  - Raw file contents as ArrayBuffer
 * @param fileName    - Original filename (for logging)
 * @param spine       - Spine instance for agent name resolution
 * @param targetDate  - YYYY-MM-DD string to filter to, or null for multi-date mode
 * @returns ParseResult with type "rico_ch"
 */
export function parseRicoCH(
  fileBuffer: ArrayBuffer,
  fileName: string,
  spine: Spine,
  targetDate: string | null,
): ParseResult {
  const logs: string[] = []
  logs.push(`[rico_ch] Parsing ${fileName}`)

  // Decode buffer to text
  const decoder = new TextDecoder("utf-8")
  const text = decoder.decode(fileBuffer)

  // Parse CSV
  const csvRows = parseCSV(text)
  if (csvRows.length === 0) {
    logs.push(`[rico_ch] No data rows found in ${fileName}`)
    return { type: "rico_ch", rows: [], logs }
  }
  logs.push(`[rico_ch] Read ${csvRows.length} raw rows`)

  // ------------------------------------------------------------------
  // Build per-row records with parsed fields
  // ------------------------------------------------------------------
  interface CallRecord {
    date: string | null
    agent: string
    isInbound: boolean
    seconds: number
  }

  const records: CallRecord[] = []
  let skippedNoAgent = 0
  let skippedDate = 0

  for (const row of csvRows) {
    // Parse date
    const dateStr = parseDateStr(row["Date"] ?? "")

    // Filter by target date if provided
    if (targetDate !== null && dateStr !== targetDate) {
      skippedDate++
      continue
    }

    // Resolve agent via spine
    const rawUser = row["User"] ?? ""
    if (!rawUser.trim()) {
      skippedNoAgent++
      continue
    }
    const agent = spine.resolveAgent(rawUser)
    if (!agent) {
      skippedNoAgent++
      continue
    }

    // Classify call direction: "inbound" in Call Type (case-insensitive) → inbound
    const callType = row["Call Type"] ?? ""
    const isInbound = callType.toLowerCase().includes("inbound")

    // Talk time from "Call Duration In Seconds"
    const rawSeconds = row["Call Duration In Seconds"] ?? "0"
    const seconds = Math.floor(Number(rawSeconds)) || 0

    records.push({ date: dateStr, agent, isInbound, seconds })
  }

  if (skippedDate > 0) {
    logs.push(`[rico_ch] Filtered out ${skippedDate} rows not matching ${targetDate}`)
  }
  if (skippedNoAgent > 0) {
    logs.push(`[rico_ch] Skipped ${skippedNoAgent} rows (unresolved/missing agent)`)
  }

  if (records.length === 0) {
    logs.push(`[rico_ch] No matching records after filtering`)
    return { type: "rico_ch", rows: [], logs }
  }

  // ------------------------------------------------------------------
  // Aggregate per agent (and per date in multi-date mode)
  // ------------------------------------------------------------------

  // Determine grouping mode
  const multiDate = targetDate === null
  type AggKey = string // "agent" or "date|agent"

  function makeKey(rec: CallRecord): AggKey {
    if (multiDate && rec.date) {
      return `${rec.date}|${rec.agent}`
    }
    return rec.agent
  }

  interface Accum {
    date: string | null
    agent: string
    calls: number
    inbound: number
    talkTimeSeconds: number
  }

  const buckets = new Map<AggKey, Accum>()

  for (const rec of records) {
    const key = makeKey(rec)
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = {
        date: rec.date,
        agent: rec.agent,
        calls: 0,
        inbound: 0,
        talkTimeSeconds: 0,
      }
      buckets.set(key, bucket)
    }
    bucket.calls++
    if (rec.isInbound) bucket.inbound++
    bucket.talkTimeSeconds += rec.seconds
  }

  // Build output rows
  const rows: Record<string, unknown>[] = []
  for (const bucket of buckets.values()) {
    const outbound = bucket.calls - bucket.inbound

    const row: Record<string, unknown> = {
      Agent: bucket.agent,
      Calls: bucket.calls,
      Inbound: bucket.inbound,
      Outbound: outbound,
      TalkTimeSeconds: bucket.talkTimeSeconds,
    }

    // Attach date
    if (multiDate && bucket.date) {
      row.Date = bucket.date
    } else if (targetDate !== null) {
      row.Date = targetDate
    } else {
      row.Date = bucket.date ?? null
    }

    rows.push(row)
  }

  logs.push(`[rico_ch] Parsed ${rows.length} agent rows from ${fileName}`)
  return { type: "rico_ch", rows, logs }
}
