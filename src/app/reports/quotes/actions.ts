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
      endDate = monthEnd <= todayStr ? monthEnd : todayStr
      const monthNames = ["", "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"]
      periodLabel = `${monthNames[month]} ${year}`
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

    // Fetch active agents
    const { data: agents } = await supabase
      .from("agents")
      .select("id, name, team, office")
      .eq("active", true)
      .order("name")

    // Fetch daily_metrics in the date range (include items for MTD count)
    const { data: metrics } = await supabase
      .from("daily_metrics")
      .select("agent_id, report_date, quotes, quotes_deduped, nb_count, items")
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
        agentQuotes[m.agent_id].nb += m.nb_count || 0
        mtdItems += m.items || 0

        // Track the most recent date that has quote or NB data
        if ((effectiveQuotes > 0 || m.nb_count > 0) && m.report_date > lastDataDate) {
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
      .select("report_date, quotes, quotes_deduped, nb_count")
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
    const byDate: Record<string, { quotes: number; nb: number }> = {}
    if (metrics) {
      for (const m of metrics) {
        if (!byDate[m.report_date]) byDate[m.report_date] = { quotes: 0, nb: 0 }
        const effectiveQuotes = m.quotes_deduped > 0 ? m.quotes_deduped : (m.quotes || 0)
        byDate[m.report_date].quotes += effectiveQuotes
        byDate[m.report_date].nb += m.nb_count || 0
      }
    }

    const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

    // Generate all dates in range and build result
    const points: DailyBreakdownPoint[] = []
    const cursor = new Date(startDate + "T00:00:00")
    const end = new Date(endDate + "T00:00:00")

    while (cursor <= end) {
      const dateStr = cursor.toISOString().split("T")[0]
      const d = byDate[dateStr] || { quotes: 0, nb: 0 }
      const month = cursor.getMonth() + 1
      const day = cursor.getDate()
      const dow = DOW[cursor.getDay()]
      const isBizDay = !isWeekend(cursor) && !holidaySet.has(dateStr)

      points.push({
        date: dateStr,
        dayLabel: `${dow} ${month}/${day}`,
        quotes: d.quotes,
        nb: d.nb,
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
