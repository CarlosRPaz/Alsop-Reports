"use server"

import { supabase } from "@/lib/supabaseClient"
import { unstable_noStore as noStore } from "next/cache"

export type ViewMode = "mtd" | "ytd" | "monthly"

export interface QuotesAgentRow {
  agent_id: string
  name: string
  team: string | null
  office: string | null
  nb_policies: number
  quote_count: number
}

export interface QuotesDataResult {
  agents: QuotesAgentRow[]
  businessDaysTotal: number
  businessDaysPassed: number
  periodLabel: string
  dateRangeStart: string
  dateRangeEnd: string
  lastDataDate: string    // Most recent date with quote or NB data
  mtdItems: number        // Total items (daily_metrics.items) in the period
  holidays: { holiday_date: string; name: string }[]
}

/**
 * Fetch and aggregate quotes/nb data for a given time period.
 * 
 * Modes:
 * - "mtd": Current month, 1st through today
 * - "ytd": Jan 1 through today
 * - "monthly": Specific month (requires year + month)
 */
export async function getQuotesData(
  mode: ViewMode,
  year: number,
  month?: number // 1-indexed, required for "monthly" and "mtd"
): Promise<{ success: boolean; data?: QuotesDataResult; error?: string }> {
  noStore()
  try {
    const today = new Date()
    const todayStr = today.toISOString().split("T")[0]

    let startDate: string
    let endDate: string
    let periodLabel: string

    // Determine date range based on mode
    if (mode === "ytd") {
      startDate = `${year}-01-01`
      endDate = todayStr
      periodLabel = `YTD ${year}`
    } else if (mode === "monthly" && month) {
      startDate = `${year}-${String(month).padStart(2, "0")}-01`
      // Last day of the month
      const lastDay = new Date(year, month, 0).getDate()
      const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
      // If this month is the current month, cap at today
      const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1
      endDate = monthEnd <= todayStr ? monthEnd : todayStr
      const monthNames = ["", "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"]
      periodLabel = `${monthNames[month]} ${year}${isCurrentMonth ? " (MTD)" : ""}`
    } else {
      // MTD — default to current month
      const m = month || (today.getMonth() + 1)
      const y = year || today.getFullYear()
      startDate = `${y}-${String(m).padStart(2, "0")}-01`
      endDate = todayStr
      const monthNames = ["", "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"]
      periodLabel = `${monthNames[m]} ${y} (MTD)`
    }

    // Fetch active and report-visible agents
    const { data: agents } = await supabase
      .from("agents")
      .select("id, name, team, office")
      .eq("active", true)
      .eq("report_visible", true)
      .order("name")

    // Fetch daily_metrics in the date range (include nb_auto_items for MTD count)
    const { data: metrics } = await supabase
      .from("daily_metrics")
      .select("agent_id, report_date, quotes, quotes_deduped, nb_auto_count, nb_auto_items")
      .gte("report_date", startDate)
      .lte("report_date", endDate)

    // Fetch holidays for biz day calculations
    const { data: holidays } = await supabase
      .from("holidays")
      .select("holiday_date, name")
      .gte("holiday_date", `${year}-01-01`)
      .lte("holiday_date", `${year}-12-31`)

    const holidaySet = new Set((holidays || []).map(h => h.holiday_date))

    // Aggregate per agent + find the most recent date with data + sum items
    const agentQuotes: Record<string, { quotes: number; nb: number }> = {}
    let lastDataDate = startDate
    let mtdItems = 0
    if (metrics) {
      for (const m of metrics) {
        if (!agentQuotes[m.agent_id]) {
          agentQuotes[m.agent_id] = { quotes: 0, nb: 0 }
        }
        // Use quotes_deduped if available and > 0, else fallback to raw quotes
        const effectiveQuotes = m.quotes_deduped > 0 ? m.quotes_deduped : (m.quotes || 0)
        agentQuotes[m.agent_id].quotes += effectiveQuotes
        agentQuotes[m.agent_id].nb += m.nb_auto_count || 0
        mtdItems += m.nb_auto_items || 0

        // Track the most recent date that has quote or NB data
        if ((effectiveQuotes > 0 || m.nb_auto_count > 0) && m.report_date > lastDataDate) {
          lastDataDate = m.report_date
        }
      }
    }

    // Build result rows (only agents with at least 1 quote or 1 NB)
    const rows: QuotesAgentRow[] = (agents || [])
      .map(a => ({
        agent_id: a.id,
        name: a.name,
        team: a.team,
        office: a.office,
        nb_policies: agentQuotes[a.id]?.nb || 0,
        quote_count: agentQuotes[a.id]?.quotes || 0,
      }))
      .filter(r => r.quote_count > 0 || r.nb_policies > 0)

    // Calculate business days using lastDataDate for elapsed (not today)
    const businessDaysTotal = calcBusinessDays(startDate, endDate, holidaySet, "total")
    const businessDaysPassed = calcBusinessDays(startDate, lastDataDate, holidaySet, "elapsed")

    return {
      success: true,
      data: {
        agents: rows,
        businessDaysTotal,
        businessDaysPassed,
        periodLabel,
        dateRangeStart: startDate,
        dateRangeEnd: endDate,
        lastDataDate,
        mtdItems,
        holidays: holidays || [],
      },
    }
  } catch (error: any) {
    console.error("Error fetching quotes data:", error)
    return { success: false, error: error.message }
  }
}

export interface DailyBreakdownPoint {
  date: string       // YYYY-MM-DD
  dayLabel: string   // "Mo 5/1", "Tu 5/2", etc.
  quotes: number
  nb: number
  items: number
  closeRate: number  // 0-100 (percentage)
  isBusinessDay: boolean
  dayOfWeek: string  // "Mo", "Tu", etc.
}

/**
 * Fetch per-day agency-wide quotes + nb for a date range.
 * Used for the daily trend line chart.
 */
export async function getDailyBreakdown(
  startDate: string,
  endDate: string
): Promise<{ success: boolean; data?: DailyBreakdownPoint[]; error?: string }> {
  noStore()
  try {
    const { data: metrics } = await supabase
      .from("daily_metrics")
      .select("report_date, quotes, quotes_deduped, nb_auto_count, nb_auto_items")
      .gte("report_date", startDate)
      .lte("report_date", endDate)

    // Fetch holidays for biz day check
    const year = parseInt(startDate.substring(0, 4))
    const { data: holidays } = await supabase
      .from("holidays")
      .select("holiday_date")
      .gte("holiday_date", `${year}-01-01`)
      .lte("holiday_date", `${year}-12-31`)
    const holidaySet = new Set((holidays || []).map(h => h.holiday_date))

    // Group by date
    const byDate: Record<string, { quotes: number; nb: number; items: number }> = {}
    if (metrics) {
      for (const m of metrics) {
        if (!byDate[m.report_date]) byDate[m.report_date] = { quotes: 0, nb: 0, items: 0 }
        const effectiveQuotes = m.quotes_deduped > 0 ? m.quotes_deduped : (m.quotes || 0)
        byDate[m.report_date].quotes += effectiveQuotes
        byDate[m.report_date].nb += m.nb_auto_count || 0
        byDate[m.report_date].items += m.nb_auto_items || 0
      }
    }

    const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

    // Generate all dates in range and build result
    const points: DailyBreakdownPoint[] = []
    const cursor = new Date(startDate + "T00:00:00")
    const end = new Date(endDate + "T00:00:00")

    while (cursor <= end) {
      const dateStr = cursor.toISOString().split("T")[0]
      const d = byDate[dateStr] || { quotes: 0, nb: 0, items: 0 }
      const month = cursor.getMonth() + 1
      const day = cursor.getDate()
      const dow = DOW[cursor.getDay()]
      const isBizDay = !isWeekend(cursor) && !holidaySet.has(dateStr)

      points.push({
        date: dateStr,
        dayLabel: `${dow} ${month}/${day}`,
        quotes: d.quotes,
        nb: d.nb,
        items: d.items,
        closeRate: d.quotes > 0 ? Math.round((d.nb / d.quotes) * 10000) / 100 : 0,
        isBusinessDay: isBizDay,
        dayOfWeek: dow,
      })

      cursor.setDate(cursor.getDate() + 1)
    }

    return { success: true, data: points }
  } catch (error: any) {
    console.error("Error fetching daily breakdown:", error)
    return { success: false, error: error.message }
  }
}

// ── YTD Aggregated Breakdown (Weekly / Monthly) ──

export interface YTDAggPoint {
  label: string       // "1/2 - 1/8" or "Jan"
  sortKey: string     // for ordering
  quotes: number
  nb: number
  items: number
  closeRate: number
}

/**
 * Get weekly (Thu–Wed) or monthly aggregated data for the YTD chart.
 */
export async function getYTDBreakdown(
  year: number,
  groupBy: "weekly" | "monthly"
): Promise<{ success: boolean; data?: YTDAggPoint[]; error?: string }> {
  noStore()
  try {
    // Fetch all data for the year up to yesterday
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().split("T")[0]
    const startDate = `${year}-01-01`

    const { data: metrics } = await supabase
      .from("daily_metrics")
      .select("report_date, quotes, quotes_deduped, nb_auto_count, nb_auto_items")
      .gte("report_date", startDate)
      .lte("report_date", yesterdayStr)

    if (!metrics || metrics.length === 0) {
      return { success: true, data: [] }
    }

    // Aggregate by date first
    const byDate: Record<string, { quotes: number; nb: number; items: number }> = {}
    for (const m of metrics) {
      if (!byDate[m.report_date]) byDate[m.report_date] = { quotes: 0, nb: 0, items: 0 }
      const effectiveQuotes = m.quotes_deduped > 0 ? m.quotes_deduped : (m.quotes || 0)
      byDate[m.report_date].quotes += effectiveQuotes
      byDate[m.report_date].nb += m.nb_auto_count || 0
      byDate[m.report_date].items += m.nb_auto_items || 0
    }

    const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

    if (groupBy === "monthly") {
      // Group by calendar month
      const monthBuckets: Record<string, { quotes: number; nb: number; items: number }> = {}
      for (const [dateStr, vals] of Object.entries(byDate)) {
        const monthKey = dateStr.substring(0, 7) // "2026-01"
        if (!monthBuckets[monthKey]) monthBuckets[monthKey] = { quotes: 0, nb: 0, items: 0 }
        monthBuckets[monthKey].quotes += vals.quotes
        monthBuckets[monthKey].nb += vals.nb
        monthBuckets[monthKey].items += vals.items
      }

      const points: YTDAggPoint[] = Object.entries(monthBuckets)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([monthKey, vals]) => {
          const monthIdx = parseInt(monthKey.split("-")[1]) - 1
          return {
            label: MONTH_SHORT[monthIdx],
            sortKey: monthKey,
            quotes: vals.quotes,
            nb: vals.nb,
            items: vals.items,
            closeRate: vals.quotes > 0 ? Math.round((vals.nb / vals.quotes) * 10000) / 100 : 0,
          }
        })

      return { success: true, data: points }
    } else {
      // Weekly: Thu–Wed buckets
      // For each date, find the Thursday that starts that week
      function getThursWeekStart(dateStr: string): Date {
        const d = new Date(dateStr + "T00:00:00")
        const day = d.getDay() // 0=Sun, 4=Thu
        // How many days back to the most recent Thursday?
        const diff = (day - 4 + 7) % 7
        d.setDate(d.getDate() - diff)
        return d
      }

      const weekBuckets: Record<string, { quotes: number; nb: number; items: number; start: Date; end: Date }> = {}
      for (const [dateStr, vals] of Object.entries(byDate)) {
        const thuStart = getThursWeekStart(dateStr)
        const wedEnd = new Date(thuStart)
        wedEnd.setDate(wedEnd.getDate() + 6)
        const weekKey = thuStart.toISOString().split("T")[0]

        if (!weekBuckets[weekKey]) {
          weekBuckets[weekKey] = { quotes: 0, nb: 0, items: 0, start: thuStart, end: wedEnd }
        }
        weekBuckets[weekKey].quotes += vals.quotes
        weekBuckets[weekKey].nb += vals.nb
        weekBuckets[weekKey].items += vals.items
      }

      const points: YTDAggPoint[] = Object.entries(weekBuckets)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([weekKey, vals]) => {
          const s = vals.start
          const e = vals.end
          const label = `${s.getMonth() + 1}/${s.getDate()} - ${e.getMonth() + 1}/${e.getDate()}`
          return {
            label,
            sortKey: weekKey,
            quotes: vals.quotes,
            nb: vals.nb,
            items: vals.items,
            closeRate: vals.quotes > 0 ? Math.round((vals.nb / vals.quotes) * 10000) / 100 : 0,
          }
        })

      return { success: true, data: points }
    }
  } catch (error: any) {
    console.error("Error fetching YTD breakdown:", error)
    return { success: false, error: error.message }
  }
}

/**
 * Calculate business days for a date range.
 * "total" = all biz days in the range's full month(s)
 * "elapsed" = biz days from startDate through endDate
 */
function calcBusinessDays(
  startDate: string,
  endDate: string,
  holidaySet: Set<string>,
  mode: "total" | "elapsed"
): number {
  const start = new Date(startDate + "T00:00:00")
  const end = new Date(endDate + "T00:00:00")

  if (mode === "total") {
    // For MTD/monthly: total biz days in that month
    // For YTD: total biz days from Jan 1 to Dec 31 (or end of current month)
    const startMonth = start.getMonth()
    const startYear = start.getFullYear()
    const endMonth = end.getMonth()
    const endYear = end.getFullYear()

    // If same month, just count biz days in that month
    if (startYear === endYear && startMonth === endMonth) {
      const daysInMonth = new Date(startYear, startMonth + 1, 0).getDate()
      let count = 0
      for (let d = 1; d <= daysInMonth; d++) {
        const dt = new Date(startYear, startMonth, d)
        if (!isWeekend(dt) && !holidaySet.has(dt.toISOString().split("T")[0])) {
          count++
        }
      }
      return count
    }

    // Multi-month (YTD): count biz days across all months
    let count = 0
    const cursor = new Date(start)
    // Go to end of the last full month in the range
    const lastDate = new Date(endYear, endMonth + 1, 0) // last day of end month
    while (cursor <= lastDate) {
      if (!isWeekend(cursor) && !holidaySet.has(cursor.toISOString().split("T")[0])) {
        count++
      }
      cursor.setDate(cursor.getDate() + 1)
    }
    return count
  }

  // "elapsed" mode: count business days from start through end
  let count = 0
  const cursor = new Date(start)
  while (cursor <= end) {
    if (!isWeekend(cursor) && !holidaySet.has(cursor.toISOString().split("T")[0])) {
      count++
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return count
}

function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6
}

// ── Duplicate Quotes Viewer ──

export interface DuplicateQuote {
  id: string
  dedup_key: string
  sub_producer: string
  first_name: string
  last_name: string
  address: string
  quote_date: string
  agent_number: string
  quote_control_number: string
  premium: number
  is_kept: boolean
}

export interface DuplicateGroup {
  dedup_key: string
  kept: DuplicateQuote
  removed: DuplicateQuote[]
}

/**
 * Fetch all duplicate quote records for a given month.
 * Returns groups where each group has the kept quote and its duplicates.
 */
export async function getDuplicateQuotes(
  year: number,
  month: number
): Promise<{ success: boolean; data?: DuplicateGroup[]; totalRemoved?: number; error?: string }> {
  noStore()
  try {
    // month=0 means YTD (all months)
    let query = supabase
      .from("quote_duplicates")
      .select("*")

    if (month > 0) {
      const reportMonth = `${year}-${String(month).padStart(2, "0")}`
      query = query.eq("report_month", reportMonth)
    } else {
      query = query.like("report_month", `${year}-%`)
    }

    const { data: records, error } = await query
      .order("dedup_key")
      .order("is_kept", { ascending: false })
      .order("quote_date", { ascending: false })

    if (error) throw error
    if (!records || records.length === 0) {
      return { success: true, data: [], totalRemoved: 0 }
    }

    // Group by dedup_key
    const groupMap: Record<string, { kept: DuplicateQuote | null; removed: DuplicateQuote[] }> = {}
    for (const r of records) {
      if (!groupMap[r.dedup_key]) {
        groupMap[r.dedup_key] = { kept: null, removed: [] }
      }
      const entry: DuplicateQuote = {
        id: r.id,
        dedup_key: r.dedup_key,
        sub_producer: r.sub_producer,
        first_name: r.first_name,
        last_name: r.last_name,
        address: r.address,
        quote_date: r.quote_date,
        agent_number: r.agent_number,
        quote_control_number: r.quote_control_number || "",
        premium: r.premium || 0,
        is_kept: r.is_kept,
      }
      if (r.is_kept) {
        groupMap[r.dedup_key].kept = entry
      } else {
        groupMap[r.dedup_key].removed.push(entry)
      }
    }

    const groups: DuplicateGroup[] = Object.entries(groupMap)
      .filter(([, g]) => g.kept !== null)
      .map(([key, g]) => ({
        dedup_key: key,
        kept: g.kept!,
        removed: g.removed,
      }))
      .sort((a, b) => b.removed.length - a.removed.length) // Most dupes first

    const totalRemoved = groups.reduce((sum, g) => sum + g.removed.length, 0)

    return { success: true, data: groups, totalRemoved }
  } catch (error: any) {
    console.error("Error fetching duplicate quotes:", error)
    return { success: false, error: error.message }
  }
}
