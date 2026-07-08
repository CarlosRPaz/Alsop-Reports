"use server"

import { supabase } from "@/lib/supabaseClient"
import { unstable_noStore as noStore } from "next/cache"

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

export interface AgentKPIs {
  quotes: number
  nb_count: number
  items: number
  written_premium: number
  calls: number
  inbound: number
  outbound: number
  talk_time_seconds: number
  texts: number
  out_texts: number
  close_rate: number
  dismissed_todos: number
  past_due_todos: number
  pivots: number
  prem_premium: number
  prem_items: number
  prem_points: number
}

export interface AgentDailyRow {
  report_date: string
  calls: number
  inbound: number
  outbound: number
  talk_time_seconds: number
  texts: number
  out_texts: number
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

export interface RankingEntry {
  metric: string
  label: string
  rank: number
  total: number
  value: number
  teamAvg: number
}

export interface AgentMonthlyData {
  agent: AgentInfo
  kpis: AgentKPIs
  dailyRows: AgentDailyRow[]
  rankings: RankingEntry[]
  businessDaysTotal: number
  businessDaysPassed: number
  periodLabel: string
  lastDataDate: string
}

// ── Helpers ──

function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6
}

function calcBusinessDays(
  startDate: string,
  endDate: string,
  holidaySet: Set<string>,
  mode: "total" | "elapsed"
): number {
  const start = new Date(startDate + "T00:00:00")
  const end = new Date(endDate + "T00:00:00")

  if (mode === "total") {
    const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()
    let count = 0
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(start.getFullYear(), start.getMonth(), d)
      if (!isWeekend(dt) && !holidaySet.has(dt.toISOString().split("T")[0])) {
        count++
      }
    }
    return count
  }

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

// ── Get all agents (for the selector page) ──

export async function getAllAgents(): Promise<{ success: boolean; data?: AgentInfo[]; error?: string }> {
  noStore()
  try {
    const { data, error } = await supabase
      .from("agents")
      .select("id, name, team, office, role, active")
      .eq("active", true)
      .order("name")

    if (error) throw error
    return { success: true, data: data || [] }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// ── Get agent monthly data (full page payload) ──

export async function getAgentMonthlyData(
  agentId: string,
  year: number,
  month: number
): Promise<{ success: boolean; data?: AgentMonthlyData; error?: string }> {
  noStore()
  try {
    const today = new Date()
    const todayStr = today.toISOString().split("T")[0]
    const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1

    const startDate = `${year}-${String(month).padStart(2, "0")}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
    const endDate = monthEnd <= todayStr ? monthEnd : todayStr

    const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"]
    const periodLabel = `${MONTH_NAMES[month]} ${year}${isCurrentMonth ? " (MTD)" : ""}`

    // Fetch agent details
    const { data: agentData, error: agentErr } = await supabase
      .from("agents")
      .select("id, name, team, office, role, active")
      .eq("id", agentId)
      .single()

    if (agentErr || !agentData) throw agentErr || new Error("Agent not found")

    // Fetch holidays
    const { data: holidays } = await supabase
      .from("holidays")
      .select("holiday_date")
      .gte("holiday_date", `${year}-01-01`)
      .lte("holiday_date", `${year}-12-31`)

    const holidaySet = new Set((holidays || []).map(h => h.holiday_date))

    // Fetch this agent's daily metrics
    const { data: metrics } = await supabase
      .from("daily_metrics")
      .select("*")
      .eq("agent_id", agentId)
      .gte("report_date", startDate)
      .lte("report_date", endDate)
      .order("report_date", { ascending: true })

    // Fetch ALL agents' aggregated metrics for the same period (for rankings)
    // Use paginated fetch to avoid Supabase's default 1000-row limit
    const allMetrics = await fetchAllRows((from, to) =>
      supabase
        .from("daily_metrics")
        .select("agent_id, quotes, quotes_deduped, nb_auto_count, nb_auto_items, calls, talk_time_seconds, written_premium, dismissed_todos, pivots")
        .gte("report_date", startDate)
        .lte("report_date", endDate)
        .range(from, to)
    )

    // Fetch all active agents to get team info
    const { data: allAgents } = await supabase
      .from("agents")
      .select("id, team")
      .eq("active", true)

    // Build agent's KPIs
    const kpis: AgentKPIs = {
      quotes: 0, nb_count: 0, items: 0, written_premium: 0,
      calls: 0, inbound: 0, outbound: 0, talk_time_seconds: 0,
      texts: 0, out_texts: 0, close_rate: 0,
      dismissed_todos: 0, past_due_todos: 0, pivots: 0,
      prem_premium: 0, prem_items: 0, prem_points: 0,
    }

    const dailyRows: AgentDailyRow[] = []
    let lastDataDate = startDate

    for (const m of (metrics || [])) {
      const effectiveQuotes = m.quotes_deduped > 0 ? m.quotes_deduped : (m.quotes || 0)
      kpis.quotes += effectiveQuotes
      kpis.nb_count += m.nb_auto_count || 0
      kpis.items += m.nb_auto_items || 0
      kpis.written_premium += m.written_premium || 0
      kpis.calls += m.calls || 0
      kpis.inbound += m.inbound || 0
      kpis.outbound += m.outbound || 0
      kpis.talk_time_seconds += m.talk_time_seconds || 0
      kpis.texts += m.texts || 0
      kpis.out_texts += m.out_texts || 0
      kpis.dismissed_todos += m.dismissed_todos || 0
      kpis.past_due_todos += m.past_due_todos || 0
      kpis.pivots += m.pivots || 0
      kpis.prem_premium += m.prem_premium || 0
      kpis.prem_items += m.prem_items || 0
      kpis.prem_points += m.prem_points || 0

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
        quotes: effectiveQuotes,
        quotes_deduped: m.quotes_deduped || 0,
        nb_count: m.nb_auto_count || 0,
        items: m.nb_auto_items || 0,
        written_premium: m.written_premium || 0,
        prem_premium: m.prem_premium || 0,
        prem_items: m.prem_items || 0,
        prem_points: m.prem_points || 0,
        dismissed_todos: m.dismissed_todos || 0,
        past_due_todos: m.past_due_todos || 0,
        pivots: m.pivots || 0,
      })
    }

    kpis.close_rate = kpis.quotes > 0 ? kpis.nb_count / kpis.quotes : 0

    // Build team-scoped rankings
    const agentTeam = agentData.team
    const teamAgentIds = new Set(
      (allAgents || [])
        .filter(a => a.team === agentTeam)
        .map(a => a.id)
    )

    // Aggregate all metrics per agent (same team only)
    const agentAggs: Record<string, {
      quotes: number; nb: number; items: number; calls: number;
      talk_time: number; written_premium: number; dismissed_todos: number; pivots: number;
    }> = {}

    for (const m of (allMetrics || [])) {
      if (!teamAgentIds.has(m.agent_id)) continue
      if (!agentAggs[m.agent_id]) {
        agentAggs[m.agent_id] = { quotes: 0, nb: 0, items: 0, calls: 0, talk_time: 0, written_premium: 0, dismissed_todos: 0, pivots: 0 }
      }
      const eq = m.quotes_deduped > 0 ? m.quotes_deduped : (m.quotes || 0)
      agentAggs[m.agent_id].quotes += eq
      agentAggs[m.agent_id].nb += m.nb_auto_count || 0
      agentAggs[m.agent_id].items += m.nb_auto_items || 0
      agentAggs[m.agent_id].calls += m.calls || 0
      agentAggs[m.agent_id].talk_time += m.talk_time_seconds || 0
      agentAggs[m.agent_id].written_premium += m.written_premium || 0
      agentAggs[m.agent_id].dismissed_todos += m.dismissed_todos || 0
      agentAggs[m.agent_id].pivots += m.pivots || 0
    }

    // Calculate rankings
    function getRanking(
      metricKey: keyof typeof agentAggs[string],
      label: string,
      metricName: string
    ): RankingEntry {
      const entries = Object.entries(agentAggs)
        .map(([id, agg]) => ({ id, value: agg[metricKey] as number }))
        .filter(e => e.value > 0 || e.id === agentId) // include agent even if 0
        .sort((a, b) => b.value - a.value)

      const rank = entries.findIndex(e => e.id === agentId) + 1
      const total = teamAgentIds.size
      const myValue = agentAggs[agentId]?.[metricKey] as number || 0
      const teamTotal = entries.reduce((s, e) => s + e.value, 0)
      const teamAvg = total > 0 ? teamTotal / total : 0

      return { metric: metricName, label, rank: rank || total, total, value: myValue, teamAvg }
    }

    const rankings: RankingEntry[] = [
      getRanking("quotes", "Quotes", "quotes"),
      getRanking("nb", "NB Policies", "nb"),
      getRanking("calls", "Total Calls", "calls"),
      getRanking("items", "Items Sold", "items"),
    ]

    // Add close rate ranking (computed, not direct field)
    const crEntries = Object.entries(agentAggs)
      .map(([id, agg]) => ({
        id,
        value: agg.quotes > 0 ? agg.nb / agg.quotes : 0,
      }))
      .filter(e => agentAggs[e.id].quotes > 0 || e.id === agentId)
      .sort((a, b) => b.value - a.value)

    const crRank = crEntries.findIndex(e => e.id === agentId) + 1
    const crTotal = teamAgentIds.size
    const myCR = kpis.close_rate
    const crTeamAvg = crEntries.length > 0
      ? crEntries.reduce((s, e) => s + e.value, 0) / crEntries.length : 0

    rankings.push({
      metric: "close_rate",
      label: "Close Rate",
      rank: crRank || crTotal,
      total: crTotal,
      value: myCR,
      teamAvg: crTeamAvg,
    })

    const businessDaysTotal = calcBusinessDays(startDate, endDate, holidaySet, "total")
    const businessDaysPassed = calcBusinessDays(startDate, lastDataDate, holidaySet, "elapsed")

    return {
      success: true,
      data: {
        agent: agentData,
        kpis,
        dailyRows,
        rankings,
        businessDaysTotal,
        businessDaysPassed,
        periodLabel,
        lastDataDate,
      },
    }
  } catch (error: any) {
    console.error("Error fetching agent data:", error)
    return { success: false, error: error.message }
  }
}
