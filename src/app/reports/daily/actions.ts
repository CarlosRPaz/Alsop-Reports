"use server"

import { supabase } from "@/lib/supabaseClient"

export async function getDailyData(dateStr: string) {
  try {
    // 1. Fetch Goals (daily + monthly for MTD highlighting)
    const { data: goals } = await supabase.from("kpi_goals").select("*").in("timeframe", ["daily", "monthly"])

    // 2. Fetch Metrics for the specific date
    const { data: metrics } = await supabase
      .from("daily_metrics")
      .select(`
        *,
        agents(id, name, team, office, meeting_time)
      `)
      .eq("report_date", dateStr)
      .order("created_at", { ascending: false })
      
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

    const { data: mtdMetrics } = await supabase
      .from("daily_metrics")
      .select("agent_id, items, prem_premium")
      .gte("report_date", firstDayOfMonth)
      .lte("report_date", dateStr)

    // Aggregate MTD items and premium per agent
    const mtdItemsMap: Record<string, number> = {}
    const mtdPremiumMap: Record<string, number> = {}
    if (mtdMetrics) {
      mtdMetrics.forEach(m => {
        mtdItemsMap[m.agent_id] = (mtdItemsMap[m.agent_id] || 0) + (m.items || 0)
        mtdPremiumMap[m.agent_id] = (mtdPremiumMap[m.agent_id] || 0) + (Number(m.prem_premium) || 0)
      })
    }

    // Merge everything
    const merged = (metrics || []).map(m => {
      const lead = leads?.find(l => l.agent_id === m.agent_id) || { contact: 0, quoted: 0, hot: 0, xsale: 0 }
      return { 
        ...m, 
        leads_snapshot: lead,
        items_mtd: mtdItemsMap[m.agent_id] || 0,
        premium_mtd: mtdPremiumMap[m.agent_id] || 0
      }
    })

    // If there are NO metrics for this date, but we have agents, we might want to return an empty array
    // Or we could return a list of agents with 0s. The python script usually creates rows for active agents.
    
    return {
      success: true,
      data: {
        metrics: merged,
        goals: goals || [],
        eagentSubmitted: meta?.eagent_submitted || false,
        holidays: holidays || []
      }
    }

  } catch (error: any) {
    console.error("Error fetching daily data:", error)
    return { success: false, error: error.message }
  }
}

export async function saveEAgentData(dateStr: string, updates: { agent_id: string, dismissed: number, pastDue: number, pivots: number }[]) {
  try {
    // We need to upsert the daily_metrics for each agent with the new eagent data
    // Since we don't want to overwrite other metrics, we have to do an update
    for (const update of updates) {
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
