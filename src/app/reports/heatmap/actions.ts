"use server"

import { supabase } from "@/lib/supabaseClient"
import { unstable_noStore as noStore } from "next/cache"

const PAGE_SIZE = 1000

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

export interface HeatmapAgentRow {
  id: string
  name: string
  office: string | null
  team: string | null
  // Raw Aggregates
  items: number
  premium: number
  quotes: number
  nb: number
  closeRate: number
  talkTime: number // seconds
  outbound: number
  calls: number
  texts: number
  // Daily Averages
  daysActive: number
  itemsDailyAvg: number
  quotesDailyAvg: number
  outboundDailyAvg: number
  talkTimeDailyAvg: number
  // Relative Deviations (% vs Team Average)
  deviations: {
    items: number // e.g. +35.2 (%)
    premium: number
    quotes: number
    closeRate: number
    talkTime: number
    outbound: number
    calls: number
    texts: number
  }
  // Day-of-week daily averages: [Mon, Tue, Wed, Thu, Fri]
  weekdayRhythm: {
    mon: { items: number; quotes: number; outbound: number; talkTime: number; count: number }
    tue: { items: number; quotes: number; outbound: number; talkTime: number; count: number }
    wed: { items: number; quotes: number; outbound: number; talkTime: number; count: number }
    thu: { items: number; quotes: number; outbound: number; talkTime: number; count: number }
    fri: { items: number; quotes: number; outbound: number; talkTime: number; count: number }
  }
  // Effort vs Output Index
  effortScore: number // 0 - 100
  resultsScore: number // 0 - 100
  quadrant: "pacesetter" | "coaching" | "capacity" | "at_risk"
}

export interface HeatmapPayload {
  rows: HeatmapAgentRow[]
  teamAverages: Record<string, {
    items: number
    premium: number
    quotes: number
    closeRate: number
    talkTime: number
    outbound: number
    calls: number
    texts: number
    agentCount: number
  }>
  agencyAverages: {
    items: number
    premium: number
    quotes: number
    closeRate: number
    talkTime: number
    outbound: number
    calls: number
    texts: number
    agentCount: number
  }
}

export async function getHeatmapData(
  startDate: string,
  endDate: string
): Promise<{ success: boolean; data?: HeatmapPayload; error?: string }> {
  try {
    noStore()

    // 1. Fetch active, visible agents
    const { data: agents, error: agentsErr } = await supabase
      .from("agents")
      .select("id, name, office, team")
      .eq("active", true)
      .eq("report_visible", true)
      .order("name")

    if (agentsErr) throw agentsErr
    if (!agents || agents.length === 0) {
      return {
        success: true,
        data: {
          rows: [],
          teamAverages: {},
          agencyAverages: { items: 0, premium: 0, quotes: 0, closeRate: 0, talkTime: 0, outbound: 0, calls: 0, texts: 0, agentCount: 0 }
        }
      }
    }

    // 2. Fetch daily metrics in range (with pagination)
    const metrics = await fetchAllRows((from, to) =>
      supabase
        .from("daily_metrics")
        .select("agent_id, report_date, inbound, outbound, calls, talk_time_seconds, texts, out_texts, quotes, quotes_deduped, nb_auto_count, nb_auto_items, prem_premium, written_premium")
        .gte("report_date", startDate)
        .lte("report_date", endDate)
        .range(from, to)
    )

    // 3. Aggregate metrics per agent
    type AgentAccumulator = {
      items: number
      premium: number
      quotes: number
      nb: number
      talkTime: number
      outbound: number
      calls: number
      texts: number
      activeDays: Set<string>
      weekdayMetrics: {
        [key: number]: { items: number; quotes: number; outbound: number; talkTime: number; days: Set<string> }
      }
    }

    const agentMap: Record<string, AgentAccumulator> = {}

    agents.forEach(a => {
      agentMap[a.id] = {
        items: 0,
        premium: 0,
        quotes: 0,
        nb: 0,
        talkTime: 0,
        outbound: 0,
        calls: 0,
        texts: 0,
        activeDays: new Set(),
        weekdayMetrics: {
          1: { items: 0, quotes: 0, outbound: 0, talkTime: 0, days: new Set() }, // Mon
          2: { items: 0, quotes: 0, outbound: 0, talkTime: 0, days: new Set() }, // Tue
          3: { items: 0, quotes: 0, outbound: 0, talkTime: 0, days: new Set() }, // Wed
          4: { items: 0, quotes: 0, outbound: 0, talkTime: 0, days: new Set() }, // Thu
          5: { items: 0, quotes: 0, outbound: 0, talkTime: 0, days: new Set() }, // Fri
        }
      }
    })

    metrics.forEach(m => {
      const acc = agentMap[m.agent_id]
      if (!acc) return

      const q = m.quotes_deduped > 0 ? m.quotes_deduped : (m.quotes || 0)
      const it = m.nb_auto_items || 0
      const prem = Number(m.prem_premium || m.written_premium || 0)
      const out = m.outbound || 0
      const cl = m.calls || 0
      const tt = m.talk_time_seconds || 0
      const txt = m.texts || 0
      const nb = m.nb_auto_count || 0

      acc.items += it
      acc.premium += prem
      acc.quotes += q
      acc.nb += nb
      acc.outbound += out
      acc.calls += cl
      acc.talkTime += tt
      acc.texts += txt

      if (q > 0 || it > 0 || out > 0 || cl > 0 || tt > 0) {
        acc.activeDays.add(m.report_date)
      }

      // Check weekday
      const d = new Date(m.report_date + "T12:00:00")
      const dayOfWeek = d.getDay() // 1 = Mon, 2 = Tue, ..., 5 = Fri
      if (acc.weekdayMetrics[dayOfWeek]) {
        acc.weekdayMetrics[dayOfWeek].items += it
        acc.weekdayMetrics[dayOfWeek].quotes += q
        acc.weekdayMetrics[dayOfWeek].outbound += out
        acc.weekdayMetrics[dayOfWeek].talkTime += tt
        acc.weekdayMetrics[dayOfWeek].days.add(m.report_date)
      }
    })

    // 4. Calculate Team and Agency Averages
    const teamAverages: HeatmapPayload["teamAverages"] = {}
    const teamTotals: Record<string, {
      items: number; premium: number; quotes: number; nb: number;
      talkTime: number; outbound: number; calls: number; texts: number; count: number;
    }> = {}

    const agencyTotals = {
      items: 0, premium: 0, quotes: 0, nb: 0,
      talkTime: 0, outbound: 0, calls: 0, texts: 0, count: agents.length
    }

    agents.forEach(a => {
      const t = a.team || "Unassigned"
      if (!teamTotals[t]) {
        teamTotals[t] = { items: 0, premium: 0, quotes: 0, nb: 0, talkTime: 0, outbound: 0, calls: 0, texts: 0, count: 0 }
      }
      const acc = agentMap[a.id]
      teamTotals[t].items += acc.items
      teamTotals[t].premium += acc.premium
      teamTotals[t].quotes += acc.quotes
      teamTotals[t].nb += acc.nb
      teamTotals[t].talkTime += acc.talkTime
      teamTotals[t].outbound += acc.outbound
      teamTotals[t].calls += acc.calls
      teamTotals[t].texts += acc.texts
      teamTotals[t].count += 1

      agencyTotals.items += acc.items
      agencyTotals.premium += acc.premium
      agencyTotals.quotes += acc.quotes
      agencyTotals.nb += acc.nb
      agencyTotals.talkTime += acc.talkTime
      agencyTotals.outbound += acc.outbound
      agencyTotals.calls += acc.calls
      agencyTotals.texts += acc.texts
    })

    Object.entries(teamTotals).forEach(([t, tot]) => {
      const c = Math.max(1, tot.count)
      const cr = tot.quotes > 0 ? tot.nb / tot.quotes : 0
      teamAverages[t] = {
        items: tot.items / c,
        premium: tot.premium / c,
        quotes: tot.quotes / c,
        closeRate: cr,
        talkTime: tot.talkTime / c,
        outbound: tot.outbound / c,
        calls: tot.calls / c,
        texts: tot.texts / c,
        agentCount: tot.count
      }
    })

    const agCount = Math.max(1, agencyTotals.count)
    const agencyAverages = {
      items: agencyTotals.items / agCount,
      premium: agencyTotals.premium / agCount,
      quotes: agencyTotals.quotes / agCount,
      closeRate: agencyTotals.quotes > 0 ? agencyTotals.nb / agencyTotals.quotes : 0,
      talkTime: agencyTotals.talkTime / agCount,
      outbound: agencyTotals.outbound / agCount,
      calls: agencyTotals.calls / agCount,
      texts: agencyTotals.texts / agCount,
      agentCount: agencyTotals.count
    }

    // 5. Compute Relative Deviations, Percentiles, and Quadrants
    const calcDev = (val: number, avg: number): number => {
      if (!avg || avg === 0) return 0
      return Math.round(((val - avg) / avg) * 1000) / 10
    }

    // Compute raw composite scores for percentile ranks
    const agentScores = agents.map(a => {
      const acc = agentMap[a.id]
      const effort = (acc.outbound * 1) + (acc.talkTime / 60 * 1.5)
      const results = (acc.items * 25) + (acc.quotes * 5) + (acc.premium * 0.005)
      return { id: a.id, effort, results }
    })

    const sortedByEffort = [...agentScores].sort((a, b) => a.effort - b.effort)
    const sortedByResults = [...agentScores].sort((a, b) => a.results - b.results)

    const effortPercentiles: Record<string, number> = {}
    const resultsPercentiles: Record<string, number> = {}

    const totalN = Math.max(1, agentScores.length)
    sortedByEffort.forEach((s, idx) => {
      effortPercentiles[s.id] = Math.round(((idx + 1) / totalN) * 100)
    })
    sortedByResults.forEach((s, idx) => {
      resultsPercentiles[s.id] = Math.round(((idx + 1) / totalN) * 100)
    })

    // 6. Build the final rows
    const rows: HeatmapAgentRow[] = agents.map(a => {
      const acc = agentMap[a.id]
      const team = a.team || "Unassigned"
      const tAvg = teamAverages[team] || agencyAverages
      const closeRate = acc.quotes > 0 ? acc.nb / acc.quotes : 0
      const daysActive = Math.max(1, acc.activeDays.size)

      const devItems = calcDev(acc.items, tAvg.items)
      const devPremium = calcDev(acc.premium, tAvg.premium)
      const devQuotes = calcDev(acc.quotes, tAvg.quotes)
      const devCloseRate = calcDev(closeRate, tAvg.closeRate)
      const devTalkTime = calcDev(acc.talkTime, tAvg.talkTime)
      const devOutbound = calcDev(acc.outbound, tAvg.outbound)
      const devCalls = calcDev(acc.calls, tAvg.calls)
      const devTexts = calcDev(acc.texts, tAvg.texts)

      const getWeekdayAvg = (dayKey: number) => {
        const wm = acc.weekdayMetrics[dayKey]
        const count = Math.max(1, wm.days.size)
        return {
          items: Math.round((wm.items / count) * 10) / 10,
          quotes: Math.round((wm.quotes / count) * 10) / 10,
          outbound: Math.round((wm.outbound / count) * 10) / 10,
          talkTime: Math.round((wm.talkTime / count) * 10) / 10,
          count: wm.days.size
        }
      }

      const effortScore = effortPercentiles[a.id] || 50
      const resultsScore = resultsPercentiles[a.id] || 50

      let quadrant: HeatmapAgentRow["quadrant"] = "at_risk"
      if (effortScore >= 50 && resultsScore >= 50) quadrant = "pacesetter"
      else if (effortScore >= 50 && resultsScore < 50) quadrant = "coaching"
      else if (effortScore < 50 && resultsScore >= 50) quadrant = "capacity"
      else quadrant = "at_risk"

      return {
        id: a.id,
        name: a.name,
        office: a.office,
        team: a.team,
        items: acc.items,
        premium: acc.premium,
        quotes: acc.quotes,
        nb: acc.nb,
        closeRate,
        talkTime: acc.talkTime,
        outbound: acc.outbound,
        calls: acc.calls,
        texts: acc.texts,
        daysActive,
        itemsDailyAvg: Math.round((acc.items / daysActive) * 10) / 10,
        quotesDailyAvg: Math.round((acc.quotes / daysActive) * 10) / 10,
        outboundDailyAvg: Math.round((acc.outbound / daysActive) * 10) / 10,
        talkTimeDailyAvg: Math.round((acc.talkTime / daysActive) * 10) / 10,
        deviations: {
          items: devItems,
          premium: devPremium,
          quotes: devQuotes,
          closeRate: devCloseRate,
          talkTime: devTalkTime,
          outbound: devOutbound,
          calls: devCalls,
          texts: devTexts,
        },
        weekdayRhythm: {
          mon: getWeekdayAvg(1),
          tue: getWeekdayAvg(2),
          wed: getWeekdayAvg(3),
          thu: getWeekdayAvg(4),
          fri: getWeekdayAvg(5),
        },
        effortScore,
        resultsScore,
        quadrant,
      }
    })

    return {
      success: true,
      data: {
        rows,
        teamAverages,
        agencyAverages,
      }
    }
  } catch (error: any) {
    console.error("Error in getHeatmapData:", error)
    return { success: false, error: error.message }
  }
}

