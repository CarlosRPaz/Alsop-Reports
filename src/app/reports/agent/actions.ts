"use server"

import { supabase } from "@/lib/supabaseClient"
import { unstable_noStore as noStore } from "next/cache"
import { toHolidaySet, getBusinessDaysInMonth, getElapsedBusinessDays } from "@/lib/businessDays"

const PAGE_SIZE = 1000

/**
 * Paginated Supabase fetch — loops .range() to get ALL rows, defeating the 1000-row cap.
 */
async function fetchAllRows(
  buildQuery: (from: number, to: number) => any
): Promise<any[]> {
  let allData: any[] = []
  let from = 0
  while (true) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    allData = allData.concat(data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return allData
}

// ── Types ──

export interface AgentInfo {
  id: string
  name: string
  team: string | null
  office: string | null
  role: string | null
  active: boolean
}

export interface MetricScorecardItem {
  metric: string
  label: string
  unit?: "$" | "min" | "%" | ""
  value: number
  dailyAvg: number
  weeklyAvg: number
  pacing: number
  goalTarget: number | null
  // Dual rankings
  rankInTeam: number
  totalInTeam: number
  teamAvg: number
  rankInAgency: number
  totalInAgency: number
  agencyAvg: number
}

export interface AgentDailyRow {
  report_date: string
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
  prem_premium: number
  prem_items: number
  prem_points: number
  dismissed_todos: number
  past_due_todos: number
  pivots: number
}

export interface AgentMonthlyData {
  agent: AgentInfo
  scorecards: MetricScorecardItem[]
  dailyRows: AgentDailyRow[]
  businessDaysTotal: number
  businessDaysPassed: number
  periodLabel: string
  lastDataDate: string
  mode: "month" | "ytd"
  /** Resolved daily goal targets for this agent (metric_name → target_value) */
  dailyGoals: Record<string, number>
}

// ── Historical Trends Types ──

export interface WeekTrend {
  weekStart: string
  weekLabel: string
  items: number
  premium: number
  quotes: number
  calls: number
  talkTimeSeconds: number
  outbound: number
  texts: number
  itemsDelta: number | null
  premiumDelta: number | null
  quotesDelta: number | null
  callsDelta: number | null
}

export interface MonthTrend {
  year: number
  month: number
  monthLabel: string
  isCurrentMonth: boolean
  items: number
  premium: number
  quotes: number
  calls: number
  talkTimeSeconds: number
  outbound: number
  texts: number
  itemsDelta: number | null
  premiumDelta: number | null
  quotesDelta: number | null
  callsDelta: number | null
}

export interface AgentHistoricalTrends {
  weeks: WeekTrend[]
  months: MonthTrend[]
}

// ── Get all agents (for the directory list) ──

export async function getAllAgents(): Promise<{ success: boolean; data?: AgentInfo[]; error?: string }> {
  noStore()
  try {
    const { data: agents, error } = await supabase
      .from("agents")
      .select("id, name, team, office, role, active")
      .eq("active", true)
      .order("name")

    if (error) throw error

    return {
      success: true,
      data: agents || []
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// ── Get agent monthly data (full page payload) ──

export async function getAgentMonthlyData(
  agentId: string,
  year: number,
  month: number,
  mode: "month" | "ytd" = "month"
): Promise<{ success: boolean; data?: AgentMonthlyData; error?: string }> {
  noStore()
  try {
    const today = new Date()
    const todayStr = today.toISOString().split("T")[0]
    const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1
    const isCurrentYear = year === today.getFullYear()

    // Date range calculation based on mode
    let startDate: string
    let endDate: string
    let periodLabel: string

    const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"]

    if (mode === "ytd") {
      startDate = `${year}-01-01`
      const yearEnd = `${year}-12-31`
      endDate = yearEnd <= todayStr ? yearEnd : todayStr
      periodLabel = `${year} YTD`
    } else {
      startDate = `${year}-${String(month).padStart(2, "0")}-01`
      const lastDay = new Date(year, month, 0).getDate()
      const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
      endDate = monthEnd <= todayStr ? monthEnd : todayStr
      periodLabel = `${MONTH_NAMES[month]} ${year}${isCurrentMonth ? " (MTD)" : ""}`
    }

    // 1. Fetch agent details
    const { data: agentData, error: agentErr } = await supabase
      .from("agents")
      .select("id, name, team, office, role, active")
      .eq("id", agentId)
      .single()

    if (agentErr || !agentData) throw agentErr || new Error("Agent not found")

    // 2. Fetch holidays for working days pacing
    const { data: holidays } = await supabase
      .from("holidays")
      .select("holiday_date")
      .gte("holiday_date", `${year}-01-01`)
      .lte("holiday_date", `${year}-12-31`)

    const holidaySet = toHolidaySet(holidays || [])

    // Business days calculation based on mode
    let businessDaysTotal: number
    if (mode === "ytd") {
      const lastMonth = isCurrentYear ? today.getMonth() + 1 : 12
      businessDaysTotal = 0
      for (let m = 1; m <= lastMonth; m++) {
        businessDaysTotal += getBusinessDaysInMonth(year, m, holidaySet)
      }
    } else {
      businessDaysTotal = getBusinessDaysInMonth(year, month, holidaySet)
    }

    // 3. Fetch this agent's daily metrics for selected period (paginated)
    const metrics = await fetchAllRows((from, to) =>
      supabase
        .from("daily_metrics")
        .select("*")
        .eq("agent_id", agentId)
        .gte("report_date", startDate)
        .lte("report_date", endDate)
        .order("report_date", { ascending: true })
        .range(from, to)
    )

    // 4. Fetch all active agents
    const { data: allActiveAgents } = await supabase
      .from("agents")
      .select("id, name, team, office, active")
      .eq("active", true)

    // 5. Fetch ALL agents' aggregated metrics for the same period (for dual rankings)
    const allMetrics = await fetchAllRows((from, to) =>
      supabase
        .from("daily_metrics")
        .select("agent_id, quotes, quotes_deduped, nb_auto_count, nb_auto_items, calls, inbound, outbound, talk_time_seconds, texts, out_texts, written_premium, prem_premium")
        .gte("report_date", startDate)
        .lte("report_date", endDate)
        .range(from, to)
    )

    // 6. Fetch KPI Goals for target referencing
    const { data: goals } = await supabase
      .from("kpi_goals")
      .select("*")
      .in("timeframe", ["daily", "monthly"])

    // Build daily rows and aggregate current agent totals
    const dailyRows: AgentDailyRow[] = []
    let lastDataDate = startDate

    const agentTotals = {
      quotes: 0, nb_count: 0, items: 0, written_premium: 0, prem_premium: 0,
      calls: 0, inbound: 0, outbound: 0, talk_time_seconds: 0,
      texts: 0, out_texts: 0, opt_ins: 0, opt_outs: 0,
      dismissed_todos: 0, past_due_todos: 0, pivots: 0,
    }

    for (const m of (metrics || [])) {
      const effectiveQuotes = m.quotes_deduped > 0 ? m.quotes_deduped : (m.quotes || 0)
      agentTotals.quotes += effectiveQuotes
      agentTotals.nb_count += m.nb_auto_count || 0
      agentTotals.items += m.nb_auto_items || 0
      agentTotals.written_premium += Number(m.written_premium) || 0
      agentTotals.prem_premium += Number(m.prem_premium) || 0
      agentTotals.calls += m.calls || 0
      agentTotals.inbound += m.inbound || 0
      agentTotals.outbound += m.outbound || 0
      agentTotals.talk_time_seconds += m.talk_time_seconds || 0
      agentTotals.texts += m.texts || 0
      agentTotals.out_texts += m.out_texts || 0
      agentTotals.opt_ins += m.opt_ins || 0
      agentTotals.opt_outs += m.opt_outs || 0
      agentTotals.dismissed_todos += m.dismissed_todos || 0
      agentTotals.past_due_todos += m.past_due_todos || 0
      agentTotals.pivots += m.pivots || 0

      if (m.report_date > lastDataDate && (effectiveQuotes > 0 || m.nb_auto_count > 0 || m.calls > 0)) {
        lastDataDate = m.report_date
      }

      dailyRows.push({
        report_date: m.report_date,
        calls: m.calls || 0,
        inbound: m.inbound || 0,
        outbound: m.outbound || 0,
        talk_time_seconds: m.talk_time_seconds || 0,
        texts: m.texts || 0,
        out_texts: m.out_texts || 0,
        opt_ins: m.opt_ins || 0,
        opt_outs: m.opt_outs || 0,
        quotes: effectiveQuotes,
        quotes_deduped: m.quotes_deduped || 0,
        nb_count: m.nb_auto_count || 0,
        items: m.nb_auto_items || 0,
        written_premium: Number(m.written_premium) || 0,
        prem_premium: Number(m.prem_premium) || 0,
        prem_items: m.prem_items || 0,
        prem_points: m.prem_points || 0,
        dismissed_todos: m.dismissed_todos || 0,
        past_due_todos: m.past_due_todos || 0,
        pivots: m.pivots || 0,
      })
    }

    // Business days passed calculation
    const lastDateObj = new Date(lastDataDate + "T12:00:00")
    let businessDaysPassed: number
    if (mode === "ytd") {
      const lastDateMonth = lastDateObj.getMonth() + 1
      let elapsed = 0
      for (let m = 1; m < lastDateMonth; m++) {
        elapsed += getBusinessDaysInMonth(year, m, holidaySet)
      }
      elapsed += getElapsedBusinessDays(year, lastDateMonth, holidaySet, lastDateObj)
      businessDaysPassed = Math.max(1, elapsed)
    } else {
      businessDaysPassed = Math.max(1, getElapsedBusinessDays(year, month, holidaySet, lastDateObj))
    }

    // 7. Build Agency & Team aggregation maps for Dual Rankings
    const teamAgentIds = new Set((allActiveAgents || []).filter(a => a.team === agentData.team).map(a => a.id))
    const agencyAgentIds = new Set((allActiveAgents || []).map(a => a.id))

    type AggObj = {
      items: number; premium: number; quotes: number; nb: number; close_rate: number;
      talk_time: number; outbound: number; calls: number; texts: number;
    }

    const teamAggs: Record<string, AggObj> = {}
    const agencyAggs: Record<string, AggObj> = {}

    const initAgg = (): AggObj => ({
      items: 0, premium: 0, quotes: 0, nb: 0, close_rate: 0,
      talk_time: 0, outbound: 0, calls: 0, texts: 0,
    })

    for (const a of (allActiveAgents || [])) {
      agencyAggs[a.id] = initAgg()
      if (teamAgentIds.has(a.id)) teamAggs[a.id] = initAgg()
    }

    for (const m of (allMetrics || [])) {
      const aid = m.agent_id
      if (agencyAggs[aid]) {
        const q = m.quotes_deduped > 0 ? m.quotes_deduped : (m.quotes || 0)
        agencyAggs[aid].quotes += q
        agencyAggs[aid].nb += m.nb_auto_count || 0
        agencyAggs[aid].items += m.nb_auto_items || 0
        agencyAggs[aid].premium += Number(m.prem_premium || 0)
        agencyAggs[aid].calls += m.calls || 0
        agencyAggs[aid].outbound += m.outbound || 0
        agencyAggs[aid].talk_time += m.talk_time_seconds || 0
        agencyAggs[aid].texts += m.texts || 0
      }
      if (teamAggs[aid]) {
        const q = m.quotes_deduped > 0 ? m.quotes_deduped : (m.quotes || 0)
        teamAggs[aid].quotes += q
        teamAggs[aid].nb += m.nb_auto_count || 0
        teamAggs[aid].items += m.nb_auto_items || 0
        teamAggs[aid].premium += Number(m.prem_premium || 0)
        teamAggs[aid].calls += m.calls || 0
        teamAggs[aid].outbound += m.outbound || 0
        teamAggs[aid].talk_time += m.talk_time_seconds || 0
        teamAggs[aid].texts += m.texts || 0
      }
    }

    Object.values(agencyAggs).forEach(agg => {
      agg.close_rate = agg.quotes > 0 ? agg.nb / agg.quotes : 0
    })
    Object.values(teamAggs).forEach(agg => {
      agg.close_rate = agg.quotes > 0 ? agg.nb / agg.quotes : 0
    })

    const calcRank = (aggMap: Record<string, AggObj>, key: keyof AggObj, myVal: number) => {
      const entries = Object.entries(aggMap)
        .map(([id, agg]) => ({ id, value: agg[key] }))
        .sort((a, b) => b.value - a.value)
      const rank = entries.findIndex(e => e.id === agentId) + 1
      const total = Object.keys(aggMap).length
      const avg = total > 0 ? entries.reduce((s, e) => s + e.value, 0) / total : 0
      return { rank: rank || total, total, avg }
    }

    const resolveGoal = (metricName: string, timeframe: "daily" | "monthly") => {
      if (!goals) return null
      const matching = goals.filter((g: any) => g.metric_name === metricName && g.timeframe === timeframe)
      if (!matching.length) return null
      const teamAndOffice = matching.find((g: any) => g.team === agentData.team && g.office === agentData.office)
      if (teamAndOffice) return teamAndOffice.target_value
      const teamOnly = matching.find((g: any) => g.team === agentData.team && !g.office)
      if (teamOnly) return teamOnly.target_value
      const officeOnly = matching.find((g: any) => g.office === agentData.office && !g.team)
      if (officeOnly) return officeOnly.target_value
      const globalGoal = matching.find((g: any) => !g.office && !g.team)
      return globalGoal ? globalGoal.target_value : null
    }

    const myCloseRate = agentTotals.quotes > 0 ? agentTotals.nb_count / agentTotals.quotes : 0

    // 8. Build 8-Metric Scorecard items (no WoW/MoM)
    const buildScorecardItem = (
      metric: string, label: string, unit: "$" | "min" | "%" | "",
      value: number, keyInAgg: keyof AggObj,
    ): MetricScorecardItem => {
      const dailyAvg = Math.round((value / businessDaysPassed) * 10) / 10
      const weeklyAvg = Math.round((dailyAvg * 5) * 10) / 10
      const pacing = Math.round(dailyAvg * businessDaysTotal)
      const goalTarget = resolveGoal(metric, "monthly")
      const teamR = calcRank(teamAggs, keyInAgg, value)
      const agencyR = calcRank(agencyAggs, keyInAgg, value)

      return {
        metric, label, unit, value, dailyAvg, weeklyAvg, pacing, goalTarget,
        rankInTeam: teamR.rank, totalInTeam: teamR.total, teamAvg: Math.round(teamR.avg * 10) / 10,
        rankInAgency: agencyR.rank, totalInAgency: agencyR.total, agencyAvg: Math.round(agencyR.avg * 10) / 10,
      }
    }

    const scorecards: MetricScorecardItem[] = [
      buildScorecardItem("items", "NB Auto Items", "", agentTotals.items, "items"),
      buildScorecardItem("prem_premium", "Written Premium", "$", agentTotals.prem_premium, "premium"),
      buildScorecardItem("quotes", "Quotes", "", agentTotals.quotes, "quotes"),
      {
        metric: "close_rate", label: "Close Rate", unit: "%",
        value: myCloseRate, dailyAvg: myCloseRate, weeklyAvg: myCloseRate,
        pacing: myCloseRate, goalTarget: null,
        rankInTeam: calcRank(teamAggs, "close_rate", myCloseRate).rank,
        totalInTeam: teamAgentIds.size,
        teamAvg: Math.round(calcRank(teamAggs, "close_rate", myCloseRate).avg * 1000) / 10,
        rankInAgency: calcRank(agencyAggs, "close_rate", myCloseRate).rank,
        totalInAgency: agencyAgentIds.size,
        agencyAvg: Math.round(calcRank(agencyAggs, "close_rate", myCloseRate).avg * 1000) / 10,
      },
      // Talk time stays in seconds for correct ranking; UI converts
      buildScorecardItem("talk_time_seconds", "Talk Time", "min", agentTotals.talk_time_seconds, "talk_time"),
      buildScorecardItem("outbound", "Outbound Dials", "", agentTotals.outbound, "outbound"),
      buildScorecardItem("calls", "Total Calls", "", agentTotals.calls, "calls"),
      buildScorecardItem("texts", "Texts", "", agentTotals.texts, "texts"),
    ]

    // 9. Build resolved daily goals map for the DAL
    const dailyGoalMetrics = ["calls", "inbound", "outbound", "talk_time_seconds", "texts", "out_texts", "quotes", "items", "nb_count", "prem_premium", "pivots"]
    const dailyGoals: Record<string, number> = {}
    for (const metricName of dailyGoalMetrics) {
      const target = resolveGoal(metricName, "daily")
      if (target !== null && target > 0) dailyGoals[metricName] = target
    }

    return {
      success: true,
      data: {
        agent: agentData, scorecards, dailyRows, businessDaysTotal,
        businessDaysPassed, periodLabel, lastDataDate, mode, dailyGoals,
      },
    }
  } catch (error: any) {
    console.error("Error fetching agent monthly data:", error)
    return { success: false, error: error.message }
  }
}

// ── Historical WoW/MoM Trends ──

function calcPctDelta(cur: number, prev: number): number | null {
  if (!prev || prev === 0) return null
  return Math.round(((cur - prev) / prev) * 1000) / 10
}

export async function getAgentHistoricalTrends(
  agentId: string,
  year: number
): Promise<{ success: boolean; data?: AgentHistoricalTrends; error?: string }> {
  noStore()
  try {
    const today = new Date()
    const todayStr = today.toISOString().split("T")[0]

    // ── WoW: Past 13 completed weeks (~3 months) ──
    const dayOfWeek = today.getDay()
    const lastSunday = new Date(today)
    lastSunday.setDate(today.getDate() - (dayOfWeek === 0 ? 7 : dayOfWeek))
    
    const weekStart = new Date(lastSunday)
    weekStart.setDate(lastSunday.getDate() - (13 * 7) + 1)

    const weekStartStr = weekStart.toISOString().split("T")[0]
    const weekEndStr = lastSunday.toISOString().split("T")[0]

    const weekMetrics = await fetchAllRows((from, to) =>
      supabase
        .from("daily_metrics")
        .select("report_date, quotes, quotes_deduped, nb_auto_count, nb_auto_items, calls, outbound, talk_time_seconds, texts, prem_premium")
        .eq("agent_id", agentId)
        .gte("report_date", weekStartStr)
        .lte("report_date", weekEndStr)
        .range(from, to)
    )

    const weekBuckets: Record<string, { items: number; premium: number; quotes: number; calls: number; talkTimeSeconds: number; outbound: number; texts: number }> = {}

    for (const m of weekMetrics) {
      const d = new Date(m.report_date + "T12:00:00")
      const day = d.getDay()
      const diffToMon = day === 0 ? -6 : 1 - day
      const monday = new Date(d)
      monday.setDate(d.getDate() + diffToMon)
      const monStr = monday.toISOString().split("T")[0]

      if (!weekBuckets[monStr]) {
        weekBuckets[monStr] = { items: 0, premium: 0, quotes: 0, calls: 0, talkTimeSeconds: 0, outbound: 0, texts: 0 }
      }

      const q = m.quotes_deduped > 0 ? m.quotes_deduped : (m.quotes || 0)
      weekBuckets[monStr].items += m.nb_auto_items || 0
      weekBuckets[monStr].premium += Number(m.prem_premium) || 0
      weekBuckets[monStr].quotes += q
      weekBuckets[monStr].calls += m.calls || 0
      weekBuckets[monStr].talkTimeSeconds += m.talk_time_seconds || 0
      weekBuckets[monStr].outbound += m.outbound || 0
      weekBuckets[monStr].texts += m.texts || 0
    }

    const sortedWeeks = Object.keys(weekBuckets).sort()
    const weeks: WeekTrend[] = sortedWeeks.map((monStr, i) => {
      const d = new Date(monStr + "T12:00:00")
      const sun = new Date(d)
      sun.setDate(d.getDate() + 6)
      const weekLabel = `${d.getMonth() + 1}/${d.getDate()} – ${sun.getMonth() + 1}/${sun.getDate()}`
      const prev = i > 0 ? weekBuckets[sortedWeeks[i - 1]] : null
      const cur = weekBuckets[monStr]

      return {
        weekStart: monStr,
        weekLabel,
        items: cur.items, premium: Math.round(cur.premium), quotes: cur.quotes,
        calls: cur.calls, talkTimeSeconds: cur.talkTimeSeconds,
        outbound: cur.outbound, texts: cur.texts,
        itemsDelta: prev ? calcPctDelta(cur.items, prev.items) : null,
        premiumDelta: prev ? calcPctDelta(cur.premium, prev.premium) : null,
        quotesDelta: prev ? calcPctDelta(cur.quotes, prev.quotes) : null,
        callsDelta: prev ? calcPctDelta(cur.calls, prev.calls) : null,
      }
    })

    // ── MoM: Every month of the year ──
    const yearStart = `${year}-01-01`
    const yearEnd = `${year}-12-31` <= todayStr ? `${year}-12-31` : todayStr

    const monthMetrics = await fetchAllRows((from, to) =>
      supabase
        .from("daily_metrics")
        .select("report_date, quotes, quotes_deduped, nb_auto_count, nb_auto_items, calls, outbound, talk_time_seconds, texts, prem_premium")
        .eq("agent_id", agentId)
        .gte("report_date", yearStart)
        .lte("report_date", yearEnd)
        .range(from, to)
    )

    const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"]

    const monthBuckets: Record<number, { items: number; premium: number; quotes: number; calls: number; talkTimeSeconds: number; outbound: number; texts: number }> = {}

    for (const m of monthMetrics) {
      const monthNum = parseInt(m.report_date.split("-")[1], 10)
      if (!monthBuckets[monthNum]) {
        monthBuckets[monthNum] = { items: 0, premium: 0, quotes: 0, calls: 0, talkTimeSeconds: 0, outbound: 0, texts: 0 }
      }
      const q = m.quotes_deduped > 0 ? m.quotes_deduped : (m.quotes || 0)
      monthBuckets[monthNum].items += m.nb_auto_items || 0
      monthBuckets[monthNum].premium += Number(m.prem_premium) || 0
      monthBuckets[monthNum].quotes += q
      monthBuckets[monthNum].calls += m.calls || 0
      monthBuckets[monthNum].talkTimeSeconds += m.talk_time_seconds || 0
      monthBuckets[monthNum].outbound += m.outbound || 0
      monthBuckets[monthNum].texts += m.texts || 0
    }

    const currentMonth = today.getFullYear() === year ? today.getMonth() + 1 : 12
    const months: MonthTrend[] = []

    for (let mo = 1; mo <= currentMonth; mo++) {
      const cur = monthBuckets[mo] || { items: 0, premium: 0, quotes: 0, calls: 0, talkTimeSeconds: 0, outbound: 0, texts: 0 }
      const prev = mo > 1 ? (monthBuckets[mo - 1] || { items: 0, premium: 0, quotes: 0, calls: 0, talkTimeSeconds: 0, outbound: 0, texts: 0 }) : null

      months.push({
        year, month: mo, monthLabel: MONTH_NAMES[mo],
        isCurrentMonth: year === today.getFullYear() && mo === today.getMonth() + 1,
        items: cur.items, premium: Math.round(cur.premium), quotes: cur.quotes,
        calls: cur.calls, talkTimeSeconds: cur.talkTimeSeconds,
        outbound: cur.outbound, texts: cur.texts,
        itemsDelta: prev ? calcPctDelta(cur.items, prev.items) : null,
        premiumDelta: prev ? calcPctDelta(cur.premium, prev.premium) : null,
        quotesDelta: prev ? calcPctDelta(cur.quotes, prev.quotes) : null,
        callsDelta: prev ? calcPctDelta(cur.calls, prev.calls) : null,
      })
    }

    return { success: true, data: { weeks, months } }
  } catch (error: any) {
    console.error("Error fetching agent historical trends:", error)
    return { success: false, error: error.message }
  }
}

// ── Manager Notes ──

export async function getAgentNotes(agentId: string) {
  try {
    noStore()
    const { data: agent, error } = await supabase
      .from("agents")
      .select("system_variants")
      .eq("id", agentId)
      .single()

    if (error) throw error

    const variants = (agent?.system_variants as Record<string, any>) || {}
    return {
      success: true,
      notes: variants.manager_notes || "",
      isAi: !!variants.manager_notes_ai
    }
  } catch (error: any) {
    console.error("Error fetching agent notes:", error)
    return { success: false, error: error.message }
  }
}

export async function saveAgentNotes(agentId: string, notes: string, isAi: boolean) {
  try {
    noStore()
    const { data: agent, error: fetchError } = await supabase
      .from("agents")
      .select("system_variants")
      .eq("id", agentId)
      .single()

    if (fetchError) throw fetchError

    const variants = (agent?.system_variants as Record<string, any>) || {}
    variants.manager_notes = notes
    variants.manager_notes_ai = isAi

    const { error: updateError } = await supabase
      .from("agents")
      .update({
        system_variants: variants,
        updated_at: new Date().toISOString()
      })
      .eq("id", agentId)

    if (updateError) throw updateError

    return { success: true }
  } catch (error: any) {
    console.error("Error saving agent notes:", error)
    return { success: false, error: error.message }
  }
}
