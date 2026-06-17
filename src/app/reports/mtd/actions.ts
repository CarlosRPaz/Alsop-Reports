"use server"

import { supabase } from "@/lib/supabaseClient"
import { unstable_noStore as noStore } from "next/cache"

/**
 * Fetch all data needed for the Monthly Production Report.
 * Aggregates daily_metrics and weekly_manual_metrics for the selected month.
 */
export async function getMTDData(year: number, month: number) {
  noStore()
  try {
    const today = new Date()
    const todayStr = today.toISOString().split("T")[0]

    // Selected month boundaries
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`
    const lastDayOfMonth = new Date(year, month, 0).getDate()
    const monthEndStr = `${year}-${String(month).padStart(2, "0")}-${String(lastDayOfMonth).padStart(2, "0")}`

    const isCurrentMonth = today.getFullYear() === year && (today.getMonth() + 1) === month
    const endDate = isCurrentMonth && todayStr < monthEndStr ? todayStr : monthEndStr

    // 1. Fetch all daily_metrics for the month range, joined with active & report-visible agents
    const { data: dailyRows } = await supabase
      .from("daily_metrics")
      .select(`
        *,
        agents!inner(id, name, team, office, meeting_time, active, report_visible)
      `)
      .gte("report_date", startDate)
      .lte("report_date", endDate)
      .eq("agents.active", true)
      .eq("agents.report_visible", true)

    // 1b. Fetch ALL daily_metrics (unfiltered by active/visible) for agency-wide totals
    const { data: allDailyRows } = await supabase
      .from("daily_metrics")
      .select(`
        agent_id, nb_auto_items, prem_premium,
        agents(office)
      `)
      .gte("report_date", startDate)
      .lte("report_date", endDate)

    // 2. Fetch weekly manual metrics for the weeks starting in that month
    const { data: weeklyManual } = await supabase
      .from("weekly_manual_metrics")
      .select("*")
      .gte("week_start", startDate)
      .lte("week_start", monthEndStr)
      .order("week_start", { ascending: true }) // Ascending order so latest week is processed last
    // 2b. Fetch quote records for the month range (from startDate to endDate)
    const { data: quoteRows } = await supabase
      .from("quote_records")
      .select("agent_id, quote_control_number")
      .gte("report_date", startDate)
      .lte("report_date", endDate)

    const hasQuoteRecords = quoteRows && quoteRows.length > 0

    const agentQuotesMap: Record<string, Set<string>> = {}
    if (hasQuoteRecords) {
      for (const r of quoteRows) {
        if (!agentQuotesMap[r.agent_id]) {
          agentQuotesMap[r.agent_id] = new Set()
        }
        if (r.quote_control_number) {
          agentQuotesMap[r.agent_id].add(r.quote_control_number)
        }
      }
    }
    // 3. Fetch goals
    const { data: goals } = await supabase
      .from("kpi_goals")
      .select("*")
      .in("timeframe", ["daily", "monthly", "weekly"])

    // 4. Fetch holidays for pacing
    const { data: holidays } = await supabase
      .from("holidays")
      .select("holiday_date, name")
      .gte("holiday_date", `${year}-01-01`)
      .lte("holiday_date", `${year}-12-31`)

    // 5. Fetch weekly submission status for weeks starting in that month
    const { data: weeklyMeta } = await supabase
      .from("weekly_reports_meta")
      .select("week_start, manual_submitted")
      .gte("week_start", startDate)
      .lte("week_start", monthEndStr)

    // Find all Mondays in the selected month
    const start = new Date(startDate + "T12:00:00")
    const end = new Date(monthEndStr + "T12:00:00")
    const mondays: string[] = []
    const cursor = new Date(start)
    while (cursor <= end) {
      if (cursor.getDay() === 1) { // 1 = Monday
        mondays.push(cursor.toISOString().split("T")[0])
      }
      cursor.setDate(cursor.getDate() + 1)
    }

    const metaMap: Record<string, boolean> = {}
    if (weeklyMeta) {
      for (const m of weeklyMeta) {
        metaMap[m.week_start] = m.manual_submitted || false
      }
    }

    const monthSubmitted = mondays.length > 0 && mondays.every(mon => metaMap[mon] === true)

    // 5. Fetch previous month totals (for prev_month_points reference)
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year
    const prevStartDate = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`
    const prevLastDay = new Date(prevYear, prevMonth, 0).getDate()
    const prevEndDate = `${prevYear}-${String(prevMonth).padStart(2, "0")}-${String(prevLastDay).padStart(2, "0")}`

    const { data: prevMonthMetrics } = await supabase
      .from("daily_metrics")
      .select("agent_id, items")
      .gte("report_date", prevStartDate)
      .lte("report_date", prevEndDate)

    // ── Aggregate daily rows into per-agent monthly totals ──
    const agentMap: Record<string, any> = {}

    for (const row of (dailyRows || [])) {
      const aid = row.agent_id
      if (!agentMap[aid]) {
        agentMap[aid] = {
          agent_id: aid,
          agents: row.agents,
          // Aggregated fields
          calls: 0,
          inbound: 0,
          outbound: 0,
          talk_time_seconds: 0,
          texts: 0,
          out_texts: 0,
          opt_ins: 0,
          opt_outs: 0,
          quotes: 0,
          nb_count: 0,
          items: 0,
          prem_premium: 0,
          prem_points: 0,
          pivots: 0,
          dismissed_todos: 0,
        }
      }
      const a = agentMap[aid]
      a.calls += row.calls || 0
      a.inbound += row.inbound || 0
      a.outbound += row.outbound || 0
      a.talk_time_seconds += row.talk_time_seconds || 0
      a.texts += row.texts || 0
      a.out_texts += row.out_texts || 0
      a.opt_ins += row.opt_ins || 0
      a.opt_outs += row.opt_outs || 0
      if (!hasQuoteRecords) {
        a.quotes += row.quotes || 0
      }
      a.nb_count += row.nb_count || 0
      a.items += row.items || 0
      a.prem_premium += Number(row.prem_premium) || 0
      a.prem_points += Number(row.prem_points) || 0
      a.pivots += row.pivots || 0
      a.dismissed_todos += row.dismissed_todos || 0
    }

    // Assign deduplicated quote counts if quote_records were found
    if (hasQuoteRecords) {
      for (const aid of Object.keys(agentMap)) {
        agentMap[aid].quotes = agentQuotesMap[aid]?.size || 0
      }
    }

    // ── Aggregate agency-wide MTD totals (all agents, not filtered) ──
    let agencyItemsMTD = 0
    const agencyOfficeMap: Record<string, number> = {}
    for (const row of (allDailyRows || [])) {
      const items = row.nb_auto_items || 0
      agencyItemsMTD += items
      const office = (row.agents as any)?.office || "Unknown"
      agencyOfficeMap[office] = (agencyOfficeMap[office] || 0) + items
    }

    // Previous month items mapping
    const prevItemsMap: Record<string, number> = {}
    if (prevMonthMetrics) {
      for (const m of prevMonthMetrics) {
        prevItemsMap[m.agent_id] = (prevItemsMap[m.agent_id] || 0) + (m.items || 0)
      }
    }

    // Aggregate weekly manual metrics per agent
    const manualMap: Record<string, {
      unique_leads: number
      rico_hot_pipeline: number
      pivot: number
      saved: number
      dismissed_todos: number
      past_due_todos: number
      rico_past_due_tasks: number
    }> = {}

    if (weeklyManual) {
      for (const wm of weeklyManual) {
        const aid = wm.agent_id
        if (!manualMap[aid]) {
          manualMap[aid] = {
            unique_leads: 0,
            rico_hot_pipeline: 0,
            pivot: 0,
            saved: 0,
            dismissed_todos: 0,
            past_due_todos: 0,       // snapshot — latest week's value
            rico_past_due_tasks: 0,  // snapshot — latest week's value
          }
        }
        const m = manualMap[aid]
        // Summed fields
        m.pivot += wm.pivot || 0
        m.saved += wm.saved || 0
        m.dismissed_todos += wm.dismissed_todos || 0
        
        // Snapshot fields: overwrite with latest week's value
        m.unique_leads = wm.unique_leads || 0
        m.rico_hot_pipeline = wm.rico_hot_pipeline || 0
        m.past_due_todos = wm.past_due_todos || 0
        m.rico_past_due_tasks = wm.rico_past_due_tasks || 0
      }
    }

    // Merge everything
    const merged = Object.values(agentMap).map((a: any) => {
      const manual = manualMap[a.agent_id] || {
        unique_leads: 0,
        rico_hot_pipeline: 0,
        pivot: 0,
        saved: 0,
        dismissed_todos: 0,
        past_due_todos: 0,
        rico_past_due_tasks: 0,
      }
      return {
        ...a,
        // Aggregated manual/DSR columns
        unique_leads: manual.unique_leads,
        rico_hot_pipeline: manual.rico_hot_pipeline,
        pivot: a.pivots || manual.pivot || 0,
        saved: manual.saved,
        w_dismissed_todos: a.dismissed_todos || manual.dismissed_todos || 0,
        w_past_due_todos: manual.past_due_todos,
        rico_past_due_tasks: manual.rico_past_due_tasks,
        
        // Points = Items * 10
        prem_points: (a.items || 0) * 10,
        
        // Month total and MTD are identical in this context
        items_mtd: a.items || 0,
        premium_mtd: a.prem_premium || 0,
        points_mtd: (a.items || 0) * 10,

        // Previous Month points reference
        prev_month_points: (prevItemsMap[a.agent_id] || 0) * 10,
      }
    })

    return {
      success: true,
      data: {
        metrics: merged,
        goals: goals || [],
        holidays: holidays || [],
        startDate,
        endDate,
        manualSubmitted: monthSubmitted,
        agencyItemsMTD,
        agencyOfficeBreakdown: agencyOfficeMap,
      }
    }

  } catch (error: any) {
    console.error("Error fetching MTD data:", error)
    return { success: false, error: error.message }
  }
}
