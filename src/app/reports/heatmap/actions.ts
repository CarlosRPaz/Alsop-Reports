"use server"

import { supabase } from "@/lib/supabaseClient"
import { unstable_noStore as noStore } from "next/cache"

export async function getHeatmapData(startDate: string, endDate: string) {
  try {
    noStore()

    // 1. Fetch active, visible agents
    const { data: agents, error: agentsErr } = await supabase
      .from("agents")
      .select("id, name, office, team")
      .eq("active", true)
      .eq("report_visible", true)

    if (agentsErr) throw agentsErr

    // 2. Fetch daily metrics in range
    const { data: metrics, error: metricsErr } = await supabase
      .from("daily_metrics")
      .select("agent_id, outbound, talk_time_seconds, quotes, items, prem_premium, nb_count")
      .gte("report_date", startDate)
      .lte("report_date", endDate)
      .range(0, 9999)

    if (metricsErr) throw metricsErr

    // 3. Aggregate metrics per agent
    const agentMap: Record<string, {
      outbound: number
      talk_time: number
      quotes: number
      items: number
      premium: number
      nb: number
    }> = {}

    agents.forEach(a => {
      agentMap[a.id] = { outbound: 0, talk_time: 0, quotes: 0, items: 0, premium: 0, nb: 0 }
    })

    metrics.forEach(m => {
      if (agentMap[m.agent_id]) {
        agentMap[m.agent_id].outbound += m.outbound || 0
        agentMap[m.agent_id].talk_time += m.talk_time_seconds || 0
        agentMap[m.agent_id].quotes += m.quotes || 0
        agentMap[m.agent_id].items += m.items || 0
        agentMap[m.agent_id].premium += Number(m.prem_premium || 0)
        agentMap[m.agent_id].nb += m.nb_count || 0
      }
    })

    const rows = agents.map(a => {
      const agg = agentMap[a.id]
      const closeRate = agg.quotes > 0 ? agg.nb / agg.quotes : 0
      return {
        id: a.id,
        name: a.name,
        office: a.office,
        team: a.team,
        outbound: agg.outbound,
        talkTime: agg.talk_time,
        quotes: agg.quotes,
        items: agg.items,
        premium: agg.premium,
        closeRate
      }
    })

    return { success: true, data: rows }
  } catch (error: any) {
    console.error("Error in getHeatmapData:", error)
    return { success: false, error: error.message }
  }
}
