/**
 * recalculate-summaries.ts — Aggregate daily_metrics into period_summaries.
 *
 * Computes monthly, weekly (Thu–Wed), and YTD totals per agent and upserts
 * them into the period_summaries table.  Designed to be idempotent — safe to
 * re-run after re-uploads.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

// ── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

/** Return the Thursday that starts the Thu–Wed week containing `dateStr`. */
function getThursWeekStart(dateStr: string): Date {
  const d = new Date(dateStr + "T00:00:00")
  const day = d.getDay() // 0=Sun … 4=Thu
  const diff = (day - 4 + 7) % 7
  d.setDate(d.getDate() - diff)
  return d
}

/** ISO week key like "2026-W26" from the Thursday start date. */
function isoWeekKey(thuStart: Date): string {
  const jan1 = new Date(thuStart.getFullYear(), 0, 1)
  const dayOfYear = Math.floor((thuStart.getTime() - jan1.getTime()) / 86_400_000) + 1
  const weekNum = Math.ceil(dayOfYear / 7)
  return `${thuStart.getFullYear()}-W${String(weekNum).padStart(2, "0")}`
}

// ── Metric row from daily_metrics ────────────────────────────────────────────

interface RawMetric {
  agent_id: string
  report_date: string
  quotes: number | null
  quotes_deduped: number | null
  nb_auto_count: number | null
  nb_auto_items: number | null
  nb_count: number | null
  items: number | null
  written_premium: number | null
  calls: number | null
  inbound: number | null
  outbound: number | null
  texts: number | null
  out_texts: number | null
  prem_premium: number | null
}

// ── Bucket accumulator ──────────────────────────────────────────────────────

interface Bucket {
  quotes_deduped: number
  nb_auto_count: number
  nb_auto_items: number
  quotes_raw: number
  nb_count: number
  items: number
  written_premium: number
  calls: number
  inbound: number
  outbound: number
  texts: number
  out_texts: number
  prem_premium: number
  days_with_data: number
}

function emptyBucket(): Bucket {
  return {
    quotes_deduped: 0,
    nb_auto_count: 0,
    nb_auto_items: 0,
    quotes_raw: 0,
    nb_count: 0,
    items: 0,
    written_premium: 0,
    calls: 0,
    inbound: 0,
    outbound: 0,
    texts: 0,
    out_texts: 0,
    prem_premium: 0,
    days_with_data: 0,
  }
}

function addToBucket(b: Bucket, m: RawMetric): void {
  b.quotes_deduped += m.quotes_deduped || 0
  b.nb_auto_count += m.nb_auto_count || 0
  b.nb_auto_items += m.nb_auto_items || 0
  b.quotes_raw += m.quotes || 0
  b.nb_count += m.nb_count || 0
  b.items += m.items || 0
  b.written_premium += m.written_premium || 0
  b.calls += m.calls || 0
  b.inbound += m.inbound || 0
  b.outbound += m.outbound || 0
  b.texts += m.texts || 0
  b.out_texts += m.out_texts || 0
  b.prem_premium += m.prem_premium || 0

  const hasData =
    (m.quotes_deduped || 0) > 0 ||
    (m.quotes || 0) > 0 ||
    (m.nb_auto_count || 0) > 0 ||
    (m.nb_count || 0) > 0 ||
    (m.calls || 0) > 0 ||
    (m.texts || 0) > 0
  if (hasData) b.days_with_data += 1
}

// ── Paginated fetch ─────────────────────────────────────────────────────────

async function fetchAllDailyMetrics(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string,
): Promise<RawMetric[]> {
  const PAGE_SIZE = 1000
  let all: RawMetric[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from("daily_metrics")
      .select(
        "agent_id, report_date, quotes, quotes_deduped, nb_auto_count, nb_auto_items, nb_count, items, written_premium, calls, inbound, outbound, texts, out_texts, prem_premium",
      )
      .gte("report_date", startDate)
      .lte("report_date", endDate)
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw error
    if (!data || data.length === 0) break
    all = all.concat(data as RawMetric[])
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return all
}

// ── Main entry point ────────────────────────────────────────────────────────

export interface RecalcOptions {
  /** Which calendar months to recalculate (1-indexed).  Omit to do all that have data. */
  months?: number[]
  /** Also recalculate weekly Thu–Wed summaries. Default true. */
  weekly?: boolean
  /** Also recalculate yearly (YTD) summary. Default true. */
  ytd?: boolean
}

/**
 * Recalculate period summaries for a given year.
 *
 * Reads all `daily_metrics` rows for `year`, groups them into monthly,
 * weekly, and YTD buckets per agent, then upserts into `period_summaries`.
 *
 * Returns human-readable log lines.
 */
export async function recalculateSummaries(
  supabase: SupabaseClient,
  year: number,
  opts: RecalcOptions = {},
): Promise<string[]> {
  const logs: string[] = []
  const doWeekly = opts.weekly !== false
  const doYtd = opts.ytd !== false

  const startDate = `${year}-01-01`
  const endDate = `${year}-12-31`

  logs.push(`[Summaries] Fetching daily_metrics for ${year}...`)
  const metrics = await fetchAllDailyMetrics(supabase, startDate, endDate)
  logs.push(`[Summaries] Fetched ${metrics.length} rows.`)

  if (metrics.length === 0) {
    logs.push("[Summaries] No data found — nothing to recalculate.")
    return logs
  }

  // ── Monthly buckets ────────────────────────────────────────────────────

  // key = "agentId||2026-06"
  const monthlyBuckets = new Map<string, Bucket>()
  // key = "agentId||2026-W26"
  const weeklyBuckets = new Map<string, { bucket: Bucket; start: Date; end: Date }>()
  // key = "agentId"
  const ytdBuckets = new Map<string, Bucket>()

  // Determine which months to process
  const targetMonths = opts.months
    ? new Set(opts.months.map((m) => String(m).padStart(2, "0")))
    : null // null = all months

  for (const m of metrics) {
    const monthStr = m.report_date.substring(5, 7) // "06"
    if (targetMonths && !targetMonths.has(monthStr)) continue

    const monthKey = m.report_date.substring(0, 7) // "2026-06"
    const agentMonthKey = `${m.agent_id}||${monthKey}`

    // Monthly
    if (!monthlyBuckets.has(agentMonthKey)) {
      monthlyBuckets.set(agentMonthKey, emptyBucket())
    }
    addToBucket(monthlyBuckets.get(agentMonthKey)!, m)

    // Weekly
    if (doWeekly) {
      const thuStart = getThursWeekStart(m.report_date)
      const weekKey = isoWeekKey(thuStart)
      const agentWeekKey = `${m.agent_id}||${weekKey}`
      if (!weeklyBuckets.has(agentWeekKey)) {
        const wedEnd = new Date(thuStart)
        wedEnd.setDate(wedEnd.getDate() + 6)
        weeklyBuckets.set(agentWeekKey, { bucket: emptyBucket(), start: thuStart, end: wedEnd })
      }
      addToBucket(weeklyBuckets.get(agentWeekKey)!.bucket, m)
    }

    // YTD — always recalculates from all months even if targeting specific months
    if (doYtd) {
      if (!ytdBuckets.has(m.agent_id)) {
        ytdBuckets.set(m.agent_id, emptyBucket())
      }
      addToBucket(ytdBuckets.get(m.agent_id)!, m)
    }
  }

  // ── Build upsert payloads ─────────────────────────────────────────────

  interface SummaryRow {
    agent_id: string
    period_type: string
    period_key: string
    period_label: string
    year: number
    quotes_deduped: number
    nb_auto_count: number
    nb_auto_items: number
    quotes_raw: number
    nb_count: number
    items: number
    written_premium: number
    calls: number
    inbound: number
    outbound: number
    texts: number
    out_texts: number
    prem_premium: number
    days_with_data: number
    last_recalculated_at: string
  }

  const rows: SummaryRow[] = []
  const now = new Date().toISOString()

  // Monthly
  for (const [key, bucket] of monthlyBuckets) {
    const [agent_id, monthKey] = key.split("||")
    const monthIdx = parseInt(monthKey.split("-")[1]) - 1
    rows.push({
      agent_id,
      period_type: "monthly",
      period_key: monthKey,
      period_label: `${MONTH_SHORT[monthIdx]} ${year}`,
      year,
      ...bucket,
      last_recalculated_at: now,
    })
  }
  logs.push(`[Summaries] Monthly: ${rows.length} rows prepared.`)

  // Weekly
  if (doWeekly) {
    const weeklyStart = rows.length
    for (const [key, { bucket, start, end }] of weeklyBuckets) {
      const [agent_id, weekKey] = key.split("||")
      const label = `${start.getMonth() + 1}/${start.getDate()} - ${end.getMonth() + 1}/${end.getDate()}`
      rows.push({
        agent_id,
        period_type: "weekly",
        period_key: weekKey,
        period_label: label,
        year,
        ...bucket,
        last_recalculated_at: now,
      })
    }
    logs.push(`[Summaries] Weekly: ${rows.length - weeklyStart} rows prepared.`)
  }

  // YTD
  if (doYtd) {
    const ytdStart = rows.length
    for (const [agent_id, bucket] of ytdBuckets) {
      rows.push({
        agent_id,
        period_type: "ytd",
        period_key: String(year),
        period_label: `${year} YTD`,
        year,
        ...bucket,
        last_recalculated_at: now,
      })
    }
    logs.push(`[Summaries] YTD: ${rows.length - ytdStart} rows prepared.`)
  }

  // ── Upsert in batches ────────────────────────────────────────────────

  logs.push(`[Summaries] Upserting ${rows.length} total rows...`)
  let successCount = 0
  const BATCH_SIZE = 100

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from("period_summaries")
      .upsert(batch, { onConflict: "agent_id,period_type,period_key" })

    if (error) {
      logs.push(`[Summaries] ERROR batch ${i}: ${error.message}`)
    } else {
      successCount += batch.length
    }
  }

  logs.push(`[Summaries] Done — ${successCount}/${rows.length} rows upserted.`)
  return logs
}
