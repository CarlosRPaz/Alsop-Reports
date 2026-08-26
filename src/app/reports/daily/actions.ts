"use server"

import { unstable_noStore as noStore } from "next/cache"
import { supabase } from "@/lib/supabaseClient"
import { getAgencyKPITotals } from "@/lib/agencyKPI"

/** Paginated Supabase fetch — loops .range() pages of 1000 to defeat the server-side max-rows cap. */
async function fetchAllRows(
  buildQuery: (from: number, to: number) => any
): Promise<any[]> {
  const PAGE_SIZE = 1000
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

export async function getDailyData(dateStr: string) {
  try {
    // 1. Fetch Goals (daily + monthly for MTD highlighting)
    const { data: goals } = await supabase.from("kpi_goals").select("*").in("timeframe", ["daily", "monthly"])

    // 2. Fetch Metrics for the specific date (only report-visible agents)
    let metrics: any[] | null = null
    const { data: filteredMetrics, error: metricsErr } = await supabase
      .from("daily_metrics")
      .select(`
        *,
        agents!inner(id, name, team, office, meeting_time, report_visible, active)
      `)
      .eq("report_date", dateStr)
      .eq("agents.report_visible", true)
      .eq("agents.active", true)
      .not("agents.team", "in", '("Managers","Support")')
      .order("created_at", { ascending: false })

    if (metricsErr) {
      // Fallback if report_visible column doesn't exist yet
      const { data: fallbackMetrics } = await supabase
        .from("daily_metrics")
        .select(`*, agents(id, name, team, office, meeting_time)`)
        .eq("report_date", dateStr)
        .order("created_at", { ascending: false })
      metrics = fallbackMetrics
    } else {
      metrics = filteredMetrics
    }
      
    // 3. Fetch Leads Snapshot for the specific date
    const { data: leads } = await supabase
      .from("leads_snapshot")
      .select("*")
      .eq("report_date", dateStr)

    // 4. Check if eAgent has been submitted
    const { data: meta } = await supabase
      .from("daily_reports_meta")
      .select("eagent_submitted")
      .eq("report_date", dateStr)
      .single()

    // 5. Calculate MTD Items (we need to sum items for all dates in the month up to dateStr)
    const [year, month, day] = dateStr.split('-')
    const firstDayOfMonth = `${year}-${month}-01`

    // 5b. Fetch holidays for the current year (for business day calculations)
    const { data: holidays } = await supabase
      .from("holidays")
      .select("holiday_date, name")
      .gte("holiday_date", `${year}-01-01`)
      .lte("holiday_date", `${year}-12-31`)

    // MTD items: use centralized paginated helper to guarantee accurate agency-wide KPIs.
    // This fetches ALL agents (including hidden/on-leave/archived) with proper pagination.
    const agencyKPI = await getAgencyKPITotals(firstDayOfMonth, dateStr)
    const agencyItemsMTD = agencyKPI.totals.nb_auto_items
    const agencyOfficeMap = agencyKPI.officeBreakdown

    // Last month's NB Auto Item Count
    const monthNum = Number(month)
    const yearNum = Number(year)
    const prevMonth = monthNum === 1 ? 12 : monthNum - 1
    const prevYear = monthNum === 1 ? yearNum - 1 : yearNum
    const prevFirstOfMonth = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`
    const prevLastOfMonth = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${new Date(prevYear, prevMonth, 0).getDate()}`
    const prevKPI = await getAgencyKPITotals(prevFirstOfMonth, prevLastOfMonth)
    const lastMonthItems = prevKPI.totals.nb_auto_items

    // Backfill: ensure all active + report-visible production agents are represented
    // (Managers, Support, and on-leave agents are excluded from individual standup table rows).
    const { data: allActiveAgents } = await supabase
      .from("agents")
      .select("id, name, team, office, meeting_time, report_visible, active")
      .eq("active", true)
      .eq("report_visible", true)
      .not("team", "in", '("Managers","Support")')

    const productionMetrics = (metrics || []).filter(
      (m: any) => m.agents?.team !== "Managers" && m.agents?.team !== "Support"
    )
    const existingIds = new Set(productionMetrics.map((m: any) => m.agent_id))
    const backfilled = [...productionMetrics]
    for (const agent of (allActiveAgents || [])) {
      if (!existingIds.has(agent.id)) {
        backfilled.push({
          agent_id: agent.id,
          report_date: dateStr,
          agents: agent,
          calls: 0, inbound: 0, outbound: 0, talk_time_seconds: 0,
          texts: 0, out_texts: 0, opt_ins: 0, opt_outs: 0,
          quotes: 0, quotes_deduped: 0,
          nb_count: 0, nb_auto_count: 0, items: 0, nb_auto_items: 0,
          written_premium: 0, prem_premium: 0, prem_items: 0, prem_points: 0,
          dismissed_todos: 0, past_due_todos: 0, pivots: 0,
        })
      }
    }

    // Merge everything
    const merged = backfilled.map(m => {
      const lead = leads?.find(l => l.agent_id === m.agent_id) || { contact: 0, quoted: 0, hot: 0, xsale: 0 }
      return { 
        ...m, 
        leads_snapshot: lead,
        items_mtd: agencyKPI.perAgentItems[m.agent_id] || 0,
        premium_mtd: agencyKPI.perAgentPremium[m.agent_id] || 0
      }
    })
    
    return {
      success: true,
      data: {
        metrics: merged,
        goals: goals || [],
        eagentSubmitted: meta?.eagent_submitted || false,
        holidays: holidays || [],
        agencyItemsMTD, // Agency-wide total (all agents, Standard Auto only)
        agencyOfficeBreakdown: agencyOfficeMap, // Per-office items (all agents)
        lastMonthItems, // Last month's NB Auto Item Count (all agents)
      }
    }

  } catch (error: any) {
    console.error("Error fetching daily data:", error)
    return { success: false, error: error.message }
  }
}

export async function saveEAgentData(dateStr: string, updates: { agent_id: string, dismissed: number, pastDue: number, pivots: number }[]) {
  try {
    // For each agent, try to update the existing row first.
    // If no row exists (new agent with no metrics yet), insert one.
    for (const update of updates) {
      const { data: existing } = await supabase
        .from("daily_metrics")
        .select("id")
        .eq("report_date", dateStr)
        .eq("agent_id", update.agent_id)
        .maybeSingle()

      if (existing) {
        // Row exists — update only the eAgent fields
        await supabase
          .from("daily_metrics")
          .update({
            dismissed_todos: update.dismissed,
            past_due_todos: update.pastDue,
            pivots: update.pivots,
            updated_at: new Date().toISOString()
          })
          .eq("report_date", dateStr)
          .eq("agent_id", update.agent_id)
      } else {
        // No row yet — insert a new one with eAgent data (all other fields default to 0)
        await supabase
          .from("daily_metrics")
          .insert({
            agent_id: update.agent_id,
            report_date: dateStr,
            dismissed_todos: update.dismissed,
            past_due_todos: update.pastDue,
            pivots: update.pivots,
            updated_at: new Date().toISOString()
          })
      }
    }

    // Mark as submitted in meta table
    // Using upsert since the row might not exist yet
    await supabase
      .from("daily_reports_meta")
      .upsert({
        report_date: dateStr,
        eagent_submitted: true,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: "report_date" })

    return { success: true }
  } catch (error: any) {
    console.error("Error saving eAgent data:", error)
    return { success: false, error: error.message }
  }
}

export async function getDailyCoverage(dateStr: string) {
  noStore()
  try {
    // Fetch all daily_metrics rows for this date in a single query
    const { data: metrics, error: metricsError } = await supabase
      .from("daily_metrics")
      .select("agent_id, calls, inbound, outbound, texts, out_texts, quotes, items, nb_count, prem_premium, prem_points")
      .eq("report_date", dateStr)

    if (metricsError) throw metricsError

    // Count agents with data per source
    let callsCount = 0
    let textsCount = 0
    let quotesCount = 0
    let itemsCount = 0
    let premiumCount = 0

    for (const m of metrics || []) {
      if ((m.calls || 0) > 0 || (m.inbound || 0) > 0 || (m.outbound || 0) > 0) callsCount++
      if ((m.texts || 0) > 0 || (m.out_texts || 0) > 0) textsCount++
      if ((m.quotes || 0) > 0) quotesCount++
      if ((m.items || 0) > 0 || (m.nb_count || 0) > 0) itemsCount++
      if (Number(m.prem_premium || 0) > 0 || (m.prem_points || 0) > 0) premiumCount++
    }

    // Check eAgent submission in daily_reports_meta
    const { data: meta } = await supabase
      .from("daily_reports_meta")
      .select("eagent_submitted")
      .eq("report_date", dateStr)
      .single()

    const eagentPresent = meta?.eagent_submitted === true

    // Check leads_snapshot for any rows with data
    const { data: leads } = await supabase
      .from("leads_snapshot")
      .select("agent_id, contact, quoted, hot, xsale")
      .eq("report_date", dateStr)

    const leadsWithData = (leads || []).filter(l =>
      (l.contact || 0) > 0 || (l.quoted || 0) > 0 || (l.hot || 0) > 0 || (l.xsale || 0) > 0
    )

    // Check which sources were actually uploaded by querying upload_history_files.
    // This is the single source of truth for what was synced on a given date.
    // For call sub-sources, we cannot infer RC vs Rico AP from daily_metrics alone
    // because both write to the same columns (calls, inbound, outbound).
    // For quotes/nb/premium, the file may cover a date where all values are 0
    // (e.g., weekends) — we still mark the source as "synced" if the upload record exists.
    const { data: uploadedFiles } = await supabase
      .from("upload_history_files")
      .select("file_type")
      .eq("target_date", dateStr)

    const uploadedTypes = new Set((uploadedFiles || []).map(f => f.file_type))

    const callSubSources: Record<string, boolean> = {
      rc: uploadedTypes.has("rc"),
      rico_ch: uploadedTypes.has("rico_ch"),
      rico_ap: uploadedTypes.has("rico_ap"),
    }

    // Fetch any sources marked as unavailable for this date
    const { data: unavailRows } = await supabase
      .from("source_unavailability")
      .select("source_type, reason")
      .eq("report_date", dateStr)

    const unavailMap: Record<string, string | null> = {}
    for (const row of (unavailRows || [])) {
      unavailMap[row.source_type] = row.reason || null
    }

    const isUnavail = (key: string) => Object.prototype.hasOwnProperty.call(unavailMap, key)

    // A source is "present" if either:
    // 1. It has actual non-zero data in daily_metrics, OR
    // 2. Its file type was uploaded for this date (e.g., quotes=0 on a weekend but file was synced)

    return {
      success: true,
      data: {
        calls: { present: callsCount > 0, agentCount: callsCount, subSources: callSubSources, unavailable: isUnavail("calls"), unavailReason: unavailMap.calls },
        texts: { present: textsCount > 0 || uploadedTypes.has("hs"), agentCount: textsCount, unavailable: isUnavail("texts"), unavailReason: unavailMap.texts },
        quotes: { present: quotesCount > 0 || uploadedTypes.has("quotes"), agentCount: quotesCount, unavailable: isUnavail("quotes"), unavailReason: unavailMap.quotes },
        items: { present: itemsCount > 0 || uploadedTypes.has("nb"), agentCount: itemsCount, unavailable: isUnavail("items"), unavailReason: unavailMap.items },
        premium: { present: premiumCount > 0 || uploadedTypes.has("premium"), agentCount: premiumCount, unavailable: isUnavail("premium"), unavailReason: unavailMap.premium },
        eagent: { present: eagentPresent, agentCount: eagentPresent ? 1 : 0, unavailable: isUnavail("eagent"), unavailReason: unavailMap.eagent },
        leads: { present: leadsWithData.length > 0, agentCount: leadsWithData.length, unavailable: isUnavail("leads"), unavailReason: unavailMap.leads },
      }
    }

  } catch (error: any) {
    console.error("Error fetching daily coverage:", error)
    return { success: false, error: error.message }
  }
}

export async function getDailyInsights(dateStr: string) {
  noStore()
  try {
    // Fetch last 30 calendar days of metrics for streak calculations
    const targetDate = new Date(dateStr + "T12:00:00")
    const startDate = new Date(targetDate)
    startDate.setDate(startDate.getDate() - 29) // 30 days total
    const startStr = startDate.toISOString().split("T")[0]

    const history = await fetchAllRows((from, to) =>
      supabase
        .from("daily_metrics")
        .select(`
          agent_id, report_date, calls, outbound, nb_auto_items, quotes, inbound, out_texts, talk_time_seconds,
          agents!inner(id, name, team, office, meeting_time, report_visible, active)
        `)
        .gte("report_date", startStr)
        .lte("report_date", dateStr)
        .eq("agents.report_visible", true)
        .eq("agents.active", true)
        .not("agents.team", "in", '("Managers","Support")')
        .order("report_date", { ascending: true })
        .range(from, to)
    )

    if (!history || history.length === 0) {
      return { success: true, data: { streaks: [] } }
    }

    // Group by agent
    const byAgent: Record<string, { name: string, team: string, office: string, meeting_time: string, days: { date: string, outbound: number, items: number, quotes: number, inbound: number, out_texts: number, talk_time_seconds: number }[] }> = {}
    for (const row of history) {
      const agent = row.agents as any
      if (!byAgent[row.agent_id]) {
        byAgent[row.agent_id] = {
          name: agent.name, team: agent.team, office: agent.office, meeting_time: agent.meeting_time,
          days: []
        }
      }
      byAgent[row.agent_id].days.push({
        date: row.report_date,
        outbound: row.outbound || 0,
        items: row.nb_auto_items || 0,
        quotes: row.quotes || 0,
        inbound: row.inbound || 0,
        out_texts: row.out_texts || 0,
        talk_time_seconds: row.talk_time_seconds || 0,
      })
    }

    // Fetch Goals (for resolving dynamic streak thresholds)
    const { data: goals } = await supabase.from("kpi_goals").select("*").eq("timeframe", "daily")

    const streaks: { name: string, team: string, office: string, meeting_time: string, metric: string, streak: number, label: string }[] = []

    const STREAK_METRICS = [
      { key: "outbound", label: "Outbound Calls", threshold: 20 },
      { key: "items", label: "Items Written", threshold: 1 },
      { key: "quotes", label: "Quotes", threshold: 4 },
      { key: "out_texts", label: "Outbound Texts", threshold: 20 },
      { key: "inbound", label: "Inbound Calls", threshold: 10 },
      { key: "talk_time_seconds", label: "Talk Time (60m+)", threshold: 3600 },
    ] as const

    const getPrecedingFriday = (dStr: string): string => {
      const dt = new Date(dStr + "T12:00:00");
      const day = dt.getDay();
      if (day === 0) { // Sunday
        dt.setDate(dt.getDate() - 2);
      } else if (day === 6) { // Saturday
        dt.setDate(dt.getDate() - 1);
      }
      return dt.toISOString().split("T")[0];
    };

    const getAgentGoalValue = (agent: { office: string, team: string }, metricName: string, fallbackThreshold: number): number => {
      if (!goals || goals.length === 0) return fallbackThreshold;
      const matching = goals.filter((g: any) => g.metric_name === metricName);
      if (matching.length === 0) return fallbackThreshold;

      const teamAndOffice = matching.find((g: any) => g.team === agent.team && g.office === agent.office);
      if (teamAndOffice) return teamAndOffice.target_value;

      const teamOnly = matching.find((g: any) => g.team === agent.team && !g.office);
      if (teamOnly) return teamOnly.target_value;

      const officeOnly = matching.find((g: any) => g.office === agent.office && !g.team);
      if (officeOnly) return officeOnly.target_value;

      const defaultGoal = matching.find((g: any) => !g.office && !g.team);
      return defaultGoal ? defaultGoal.target_value : fallbackThreshold;
    };

    for (const [_, agentData] of Object.entries(byAgent)) {
      // Create a map of date string -> metrics for quick lookup
      const valuesMap: Record<string, { outbound: number, items: number, quotes: number, inbound: number, out_texts: number, talk_time_seconds: number }> = {};
      agentData.days.forEach(day => {
        valuesMap[day.date] = {
          outbound: day.outbound,
          items: day.items,
          quotes: day.quotes,
          inbound: day.inbound,
          out_texts: day.out_texts,
          talk_time_seconds: day.talk_time_seconds
        };
      });

      for (const sm of STREAK_METRICS) {
        let streak = 0
        let currentDate = new Date(targetDate)

        // Resolve threshold dynamically based on agent overrides
        const resolvedGoal = getAgentGoalValue(agentData, sm.key, sm.threshold);
        const threshold = sm.key === "talk_time_seconds" ? resolvedGoal * 60 : resolvedGoal;

        // Check up to 30 calendar days going backward
        for (let i = 0; i < 30; i++) {
          const dStr = currentDate.toISOString().split("T")[0]
          
          const val = valuesMap[dStr]?.[sm.key] || 0
          const dt = new Date(dStr + "T12:00:00")
          const dayOfWeek = dt.getDay()
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

          if (val >= threshold) {
            streak++
          } else if (isWeekend) {
            // Weekend day counts if bridged by an active Friday
            const fridayStr = getPrecedingFriday(dStr)
            const fridayVal = valuesMap[fridayStr]?.[sm.key] || 0
            if (fridayVal >= threshold) {
              streak++
            } else {
              break
            }
          } else {
            break
          }

          currentDate.setDate(currentDate.getDate() - 1)
        }

        if (streak >= 3) {
          streaks.push({
            name: agentData.name,
            team: agentData.team,
            office: agentData.office,
            meeting_time: agentData.meeting_time,
            metric: sm.key,
            streak,
            label: sm.label
          })
        }
      }
    }

    // Sort by streak length descending
    streaks.sort((a, b) => b.streak - a.streak)

    return { success: true, data: { streaks } }

  } catch (error: any) {
    console.error("Error fetching daily insights:", error)
    return { success: false, error: error.message }
  }
}

export async function getDailyNotes(dateStr: string) {
  try {
    noStore()
    let { data: notesAgent, error } = await supabase
      .from("agents")
      .select("system_variants")
      .eq("name", "__standup_notes__")
      .single()

    if (error || !notesAgent) {
      const { data: newAgent, error: createError } = await supabase
        .from("agents")
        .insert({
          name: "__standup_notes__",
          active: false,
          report_visible: false,
          team: "System",
          office: "System",
          system_variants: {}
        })
        .select("system_variants")
        .single()

      if (createError) {
        console.error("Failed to create standup notes dummy agent:", createError)
        return { success: true, notes: "" }
      }
      notesAgent = newAgent
    }

    const variants = (notesAgent?.system_variants as Record<string, string>) || {}
    return { success: true, notes: variants[dateStr] || "" }
  } catch (error: any) {
    console.error("Error fetching daily standup notes:", error)
    return { success: false, error: error.message }
  }
}

export async function saveDailyNotes(dateStr: string, notes: string) {
  try {
    noStore()
    let { data: notesAgent } = await supabase
      .from("agents")
      .select("id, system_variants")
      .eq("name", "__standup_notes__")
      .single()

    let agentId = notesAgent?.id
    let variants = (notesAgent?.system_variants as Record<string, string>) || {}

    if (!notesAgent) {
      const { data: newAgent } = await supabase
        .from("agents")
        .insert({
          name: "__standup_notes__",
          active: false,
          report_visible: false,
          team: "System",
          office: "System",
          system_variants: {}
        })
        .select("id, system_variants")
        .single()

      if (newAgent) {
        agentId = newAgent.id
        variants = {}
      }
    }

    if (!agentId) {
      throw new Error("Unable to resolve standup notes dummy agent ID")
    }

    variants[dateStr] = notes

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
    console.error("Error saving daily standup notes:", error)
    return { success: false, error: error.message }
  }
}

/**
 * Toggle a data source as unavailable for a given date.
 * If already marked unavailable, removes the mark.
 */
export async function toggleSourceUnavailable(
  dateStr: string,
  sourceType: string,
  reason?: string
) {
  noStore()
  try {
    // Check if already marked
    const { data: existing } = await supabase
      .from("source_unavailability")
      .select("id")
      .eq("report_date", dateStr)
      .eq("source_type", sourceType)
      .maybeSingle()

    if (existing) {
      // Remove the unavailable mark
      const { error } = await supabase
        .from("source_unavailability")
        .delete()
        .eq("id", existing.id)

      if (error) throw error
      return { success: true, unavailable: false }
    } else {
      // Mark as unavailable
      const { error } = await supabase
        .from("source_unavailability")
        .insert({
          report_date: dateStr,
          source_type: sourceType,
          reason: reason || null,
        })

      if (error) throw error
      return { success: true, unavailable: true }
    }
  } catch (error: any) {
    console.error("Error toggling source unavailability:", error)
    return { success: false, error: error.message }
  }
}
