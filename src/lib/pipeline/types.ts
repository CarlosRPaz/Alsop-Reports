/**
 * types.ts — Shared types for the client-side data pipeline.
 * Mirrors the Python pipeline's data structures.
 */

/** Canonical agent record from the Spine (agent name resolver) */
export interface AgentRecord {
  agent: string
  office: string
  full_name: string
  team: string
}

/** System variant names stored in the agents table JSONB column */
export interface SystemVariants {
  full_name?: string
  rc_name?: string
  rico_name?: string
  hs_name?: string
  nb_name?: string
  quotes_name?: string
  az_name?: string
}

/** Raw agent row from Supabase */
export interface SupabaseAgent {
  id: string
  name: string
  office: string
  team: string
  system_variants: SystemVariants | null
  active: boolean
}

/** Per-agent parsed metrics for a single date */
export interface DailyMetrics {
  agent: string
  calls: number
  inbound: number
  outbound: number
  talk_time_seconds: number
  texts: number
  out_texts: number
  opt_ins: number
  opt_outs: number
  quotes: number
  quotes_deduped: number
  nb_count: number
  items: number
  written_premium: number
  nb_auto_count: number
  nb_auto_items: number
  prem_premium: number
  prem_items: number
  prem_points: number
}

/** Which Supabase columns each source type populates — mirrors Python SOURCE_FIELD_MAP */
export const SOURCE_FIELD_MAP: Record<string, (keyof DailyMetrics)[]> = {
  rc:        ["calls", "inbound", "outbound", "talk_time_seconds"],
  rico_ap:   ["calls", "inbound", "outbound"],
  rico_ch:   ["talk_time_seconds"],
  hs:        ["texts", "out_texts", "opt_ins", "opt_outs"],
  quotes:    ["quotes", "quotes_deduped"],
  nb:        ["nb_count", "items", "written_premium", "nb_auto_count", "nb_auto_items"],
  premium:   ["prem_premium", "prem_items", "prem_points"],
}

/** File type detection pattern */
export interface FilePattern {
  pattern: RegExp
  type: string
  label: string
  hasInternalDate: boolean
}

/** Standard file detection patterns — mirrors the Python FILE_DETECT list */
export const FILE_PATTERNS: FilePattern[] = [
  { pattern: /^rc_|Office_Perf.*Users/i, type: "rc", label: "RC (RingCentral)", hasInternalDate: true },
  { pattern: /Performance Breakdown Report/i, type: "hs", label: "Hearsay", hasInternalDate: false },
  { pattern: /Quotes Detail Report/i, type: "quotes", label: "Quotes", hasInternalDate: true },
  { pattern: /New Business Details/i, type: "nb", label: "NB (Items)", hasInternalDate: true },
  { pattern: /sales-report/i, type: "premium", label: "Premium (AgencyZoom)", hasInternalDate: false },
  { pattern: /^ch-/i, type: "rico_ch", label: "Rico CH (Talk Time)", hasInternalDate: true },
  { pattern: /Agent Performance/i, type: "rico_ap", label: "Rico AP (Calls)", hasInternalDate: false },
]

/** Detect the file type from its filename */
export function detectFileType(filename: string): FilePattern | null {
  for (const p of FILE_PATTERNS) {
    if (p.pattern.test(filename)) return p
  }
  return null
}

/** A single quote record for the quote_records table */
export interface QuoteRecord {
  agent: string
  report_date: string
  quote_control_number: string
  product: string | null
  premium: number | null
  sub_producer: string | null
}

/** A duplicate quote entry for the quote_duplicates table */
export interface QuoteDuplicate {
  report_month: string
  dedup_key: string
  sub_producer: string
  first_name: string
  last_name: string
  address: string
  quote_date: string
  agent_number: string
  quote_control_number: string
  premium: number
  product: string
  is_kept: boolean
}

/** Result from a single parser */
export interface ParseResult {
  /** Source type key (rc, hs, quotes, nb, premium, rico_ch, rico_ap) */
  type: string
  /** Parsed rows: each row has Agent + date + source-specific fields */
  rows: Record<string, unknown>[]
  /** Human-readable log messages */
  logs: string[]
  /** For quotes: individual quote records */
  quoteRecords?: QuoteRecord[]
  /** For quotes: duplicate audit trail */
  quoteDuplicates?: QuoteDuplicate[]
}

/** Overall pipeline result */
export interface PipelineResult {
  success: boolean
  logs: string
  filesProcessed: number
  sourceTypes: string[]
  datesProcessed: string[]
}
