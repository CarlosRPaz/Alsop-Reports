"use server"

import { supabase } from "@/lib/supabaseClient"
import { unstable_noStore as noStore } from "next/cache"
import { getAgencyKPITotals } from "@/lib/agencyKPI"

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/**
 * Check data coverage for each business day (Mon–Fri) in the week.
 * Returns per-day source availability so the UI can show what's missing.
 */
export async function getWeekCoverage(weekStartStr: string, weekEndStr: string) {
  noStore()
  try {
    // Generate Mon–Fri dates for the week
    const start = new Date(weekStartStr + "T00:00:00")
    const businessDays: { date: string; dayName: string }[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      const dateStr = d.toISOString().split("T")[0]
      businessDays.push({ date: dateStr, dayName: DAY_NAMES[d.getDay()] })
    }

    // Fetch all daily_metrics for the week
    const { data: rows } = await supabase
      .from("daily_metrics")
      .select("report_date, calls, inbound, outbound, texts, out_texts, quotes, items, nb_count, prem_premium, prem_points, talk_time_seconds")
      .gte("report_date", weekStartStr)
      .lte("report_date", weekEndStr)

    // Fetch eAgent submission status for each day
    const { data: metaRows } = await supabase
      .from("daily_reports_meta")
      .select("report_date, eagent_submitted")
      .gte("report_date", weekStartStr)
      .lte("report_date", weekEndStr)

    const metaMap: Record<string, boolean> = {}
    if (metaRows) {
      for (const m of metaRows) {
        metaMap[m.report_date] = m.eagent_submitted || false
      }
    }

    // Group rows by date and check which sources have data
    const dateRowMap: Record<string, any[]> = {}
    if (rows) {
      for (const r of rows) {
        if (!dateRowMap[r.report_date]) dateRowMap[r.report_date] = []
        dateRowMap[r.report_date].push(r)
      }
    }

    const coverage = businessDays.map(day => {
      const dayRows = dateRowMap[day.date] || []
      const agentCount = dayRows.length

      // A source is "present" if at least one agent has a non-zero value
      const hasAny = (field: string) => dayRows.some(r => (Number(r[field]) || 0) > 0)

      return {
        date: day.date,
        dayName: day.dayName,
        agentCount,
        sources: {
          calls: hasAny("calls") || hasAny("inbound") || hasAny("outbound"),
          texts: hasAny("texts") || hasAny("out_texts"),
          quotes: hasAny("quotes"),
          items: hasAny("items") || hasAny("nb_count"),
          premium: hasAny("prem_premium") || hasAny("prem_points"),
          eagent: metaMap[day.date] || false,
        }
      }
    })

    return { success: true, data: coverage }
  } catch (error: any) {
    console.error("Error fetching week coverage:", error)
    return { success: false, error: error.message, data: [] }
  }
}

/**
 * Fetch all data needed for the Weekly Production Report.
 * Aggregates daily_metrics across Mon–Sun, merges weekly manual inputs.
 */
export async function getWeeklyData(weekStartStr: string, weekEndStr: string) {
  noStore()
  try {
    // 1. Fetch all daily_metrics for the week range, joined with active & report-visible agents
    const { data: dailyRows } = await supabase
      .from("daily_metrics")
      .select(`
        *,
        agents!inner(id, name, team, office, meeting_time, active, report_visible)
      `)
      .gte("report_date", weekStartStr)
      .lte("report_date", weekEndStr)
      .eq("agents.active", true)
      .eq("agents.report_visible", true)

    // 2. Fetch weekly manual metrics for this week
    const { data: weeklyManual } = await supabase
      .from("weekly_manual_metrics")
      .select("*")
      .eq("week_start", weekStartStr)

    // 3. Fetch leads snapshot for the last day of the week (or latest available)
    const { data: leads } = await supabase
      .from("leads_snapshot")
      .select("*")
      .gte("report_date", weekStartStr)
      .lte("report_date", weekEndStr)
      .order("report_date", { ascending: false })

    // 4. Fetch submission status
    const { data: meta } = await supabase
      .from("weekly_reports_meta")
      .select("manual_submitted")
      .eq("week_start", weekStartStr)
      .single()
    // 4b. Fetch quote records for the week range
    const { data: quoteRows } = await supabase
      .from("quote_records")
      .select("agent_id, quote_control_number")
      .gte("report_date", weekStartStr)
      .lte("report_date", weekEndStr)

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
    // 5. Fetch goals
    const { data: goals } = await supabase
      .from("kpi_goals")
      .select("*")
      .in("timeframe", ["daily", "monthly", "weekly"])

    // 6. Fetch holidays for pacing
    const [yearStr] = weekStartStr.split("-")
    const { data: holidays } = await supabase
      .from("holidays")
      .select("holiday_date, name")
      .gte("holiday_date", `${yearStr}-01-01`)
      .lte("holiday_date", `${yearStr}-12-31`)

    // 7. Calculate MTD items/premium/points
    //    Month is based on the week end date (the Sunday)
    const weekEndDate = new Date(weekEndStr + "T00:00:00")
    const mtdMonth = weekEndDate.getMonth() + 1
    const mtdYear = weekEndDate.getFullYear()
    const firstOfMonth = `${mtdYear}-${String(mtdMonth).padStart(2, "0")}-01`

    // MTD items: use centralized paginated helper to guarantee accurate agency-wide KPIs
    const agencyKPI = await getAgencyKPITotals(firstOfMonth, weekEndStr)

    // 8. Calculate previous month totals (for prem_points reference)
    const prevMonth = mtdMonth === 1 ? 12 : mtdMonth - 1
    const prevYear = mtdMonth === 1 ? mtdYear - 1 : mtdYear
    const prevFirstOfMonth = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`
    const prevLastOfMonth = `${prevYear}-${String(prevMonth).padStart(2, "0")}-${new Date(prevYear, prevMonth, 0).getDate()}`

    const { data: prevMonthMetrics } = await supabase
      .from("daily_metrics")
      .select("agent_id, nb_auto_items")
      .gte("report_date", prevFirstOfMonth)
      .lte("report_date", prevLastOfMonth)

    // ── Aggregate daily rows into per-agent weekly totals ──
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
          written_premium: 0,
          prem_premium: 0,
          prem_items: 0,
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
      a.nb_count += row.nb_auto_count || 0
      a.items += row.nb_auto_items || 0
      a.written_premium += Number(row.written_premium) || 0
      a.prem_premium += Number(row.prem_premium) || 0
      a.prem_items += row.prem_items || 0
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

    // MTD aggregation — use centralized helper results
    const agencyItemsMTD = agencyKPI.totals.nb_auto_items
    const agencyOfficeMap = agencyKPI.officeBreakdown

    // Previous month items (points = items × 10)
    const prevItemsMap: Record<string, number> = {}
    if (prevMonthMetrics) {
      for (const m of prevMonthMetrics) {
        prevItemsMap[m.agent_id] = (prevItemsMap[m.agent_id] || 0) + (m.nb_auto_items || 0)
      }
    }

    // Manual weekly data lookup
    const manualMap: Record<string, any> = {}
    if (weeklyManual) {
      for (const wm of weeklyManual) {
        manualMap[wm.agent_id] = wm
      }
    }

    // Latest leads per agent (use the most recent snapshot in the week)
    const leadsMap: Record<string, any> = {}
    if (leads) {
      for (const l of leads) {
        // Only keep the first (most recent) per agent
        if (!leadsMap[l.agent_id]) {
          leadsMap[l.agent_id] = l
        }
      }
    }

    // Merge everything
    const merged = Object.values(agentMap).map((a: any) => {
      const manual = manualMap[a.agent_id] || {}
      const lead = leadsMap[a.agent_id] || { contact: 0, quoted: 0, hot: 0, xsale: 0 }
      return {
        ...a,
        // Weekly manual fields
        unique_leads: manual.unique_leads || 0,
        rico_hot_pipeline: manual.rico_hot_pipeline || 0,
        pivot: a.pivots || manual.pivot || 0,
        saved: manual.saved || 0,
        w_dismissed_todos: a.dismissed_todos || manual.dismissed_todos || 0,
        w_past_due_todos: manual.past_due_todos || 0,
        rico_past_due_tasks: manual.rico_past_due_tasks || 0,
        // Points = Items × 10 (from NB, not AgencyZoom)
        prem_points: (a.items || 0) * 10,
        // MTD
        items_mtd: agencyKPI.perAgentItems[a.agent_id] || 0,
        premium_mtd: agencyKPI.perAgentPremium[a.agent_id] || 0,
        points_mtd: (agencyKPI.perAgentItems[a.agent_id] || 0) * 10,
        // Prev month
        prev_month_points: (prevItemsMap[a.agent_id] || 0) * 10,
        // Leads
        leads_snapshot: lead,
      }
    })

    return {
      success: true,
      data: {
        metrics: merged,
        goals: goals || [],
        manualSubmitted: meta?.manual_submitted || false,
        holidays: holidays || [],
        agencyItemsMTD,
        agencyOfficeBreakdown: agencyOfficeMap,
      }
    }

  } catch (error: any) {
    console.error("Error fetching weekly data:", error)
    return { success: false, error: error.message }
  }
}

/**
 * Save weekly manual input data.
 */
export async function saveWeeklyManualData(
  weekStartStr: string,
  updates: {
    agent_id: string
    unique_leads: number
    rico_hot_pipeline: number
    pivot: number
    saved: number
    dismissed_todos: number
    past_due_todos: number
    rico_past_due_tasks: number
  }[]
) {
  try {
    // Upsert each agent's weekly manual data
    const rows = updates.map(u => ({
      agent_id: u.agent_id,
      week_start: weekStartStr,
      unique_leads: u.unique_leads,
      rico_hot_pipeline: u.rico_hot_pipeline,
      pivot: u.pivot,
      saved: u.saved,
      dismissed_todos: u.dismissed_todos,
      past_due_todos: u.past_due_todos,
      rico_past_due_tasks: u.rico_past_due_tasks,
      updated_at: new Date().toISOString(),
    }))

    const { error } = await supabase
      .from("weekly_manual_metrics")
      .upsert(rows, { onConflict: "agent_id,week_start" })

    if (error) throw error

    // Mark as submitted
    await supabase
      .from("weekly_reports_meta")
      .upsert({
        week_start: weekStartStr,
        manual_submitted: true,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "week_start" })

    return { success: true }
  } catch (error: any) {
    console.error("Error saving weekly manual data:", error)
    return { success: false, error: error.message }
  }
}

/**
 * Calculate auto-sums from daily data to pre-populate the weekly manual entry modal.
 * Sums: unique_leads (leads contact), rico_hot (leads hot), pivot, dismissed_todos
 * Snapshot (NOT summed): past_due_todos, rico_past_due_tasks
 * Not available daily: saved
 */
export async function getWeeklyAutoSums(weekStartStr: string, weekEndStr: string) {
  noStore()
  try {
    // 1. Sum pivots and dismissed_todos from daily_metrics
    const { data: dailyRows } = await supabase
      .from("daily_metrics")
      .select("agent_id, pivots, dismissed_todos")
      .gte("report_date", weekStartStr)
      .lte("report_date", weekEndStr)

    // 2. Latest leads snapshot per agent (NOT summed — snapshot only)
    const { data: leadsRows } = await supabase
      .from("leads_snapshot")
      .select("agent_id, report_date, contact, hot")
      .gte("report_date", weekStartStr)
      .lte("report_date", weekEndStr)
      .order("report_date", { ascending: false })

    // Aggregate daily metrics per agent
    const sums: Record<string, {
      unique_leads: number
      rico_hot_pipeline: number
      pivot: number
      saved: number
      dismissed_todos: number
      past_due_todos: number
      rico_past_due_tasks: number
    }> = {}

    const ensure = (id: string) => {
      if (!sums[id]) {
        sums[id] = {
          unique_leads: 0,
          rico_hot_pipeline: 0,
          pivot: 0,
          saved: 0,
          dismissed_todos: 0,
          past_due_todos: 0,        // snapshot — stays 0
          rico_past_due_tasks: 0,   // snapshot — stays 0
        }
      }
    }

    for (const row of (dailyRows || [])) {
      ensure(row.agent_id)
      sums[row.agent_id].pivot += row.pivots || 0
      sums[row.agent_id].dismissed_todos += row.dismissed_todos || 0
    }

    // Use latest snapshot per agent (first occurrence since sorted desc)
    const seenLeadsAgents = new Set<string>()
    for (const row of (leadsRows || [])) {
      if (seenLeadsAgents.has(row.agent_id)) continue
      seenLeadsAgents.add(row.agent_id)
      ensure(row.agent_id)
      sums[row.agent_id].unique_leads = row.contact || 0
      sums[row.agent_id].rico_hot_pipeline = row.hot || 0
    }

    return { success: true, data: sums }

  } catch (error: any) {
    console.error("Error fetching weekly auto sums:", error)
    return { success: false, error: error.message }
  }
}
