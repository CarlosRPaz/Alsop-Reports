"use server"

import { supabase } from "@/lib/supabaseClient"

const PAGE_SIZE = 1000

/**
 * Paginated Supabase fetch — loops .range() to get ALL rows, defeating the 1000-row cap.
 * This is a generic helper that any server action can use.
 */
export async function fetchAllRows(
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

export interface AgencyKPITotals {
  nb_auto_items: number
  prem_premium: number
  items: number
  nb_count: number
  nb_auto_count: number
  quotes: number
  quotes_deduped: number
}

export interface AgencyKPIResult {
  totals: AgencyKPITotals
  officeBreakdown: Record<string, number>
  /** Per-agent nb_auto_items totals (for the per-agent items_mtd column) */
  perAgentItems: Record<string, number>
  /** Per-agent prem_premium totals (for the per-agent premium_mtd column) */
  perAgentPremium: Record<string, number>
}

/**
 * Get agency-wide KPI totals and per-office breakdown for a date range.
 *
 * Uses paginated fetching to guarantee accuracy regardless of row count.
 * This is the SINGLE source of truth for agency-wide KPIs across all report pages.
 *
 * Includes ALL agents (active, hidden, archived, on-leave) because the agency
 * KPI should count every item regardless of agent visibility.
 */
export async function getAgencyKPITotals(
  startDate: string,
  endDate: string
): Promise<AgencyKPIResult> {
  // Fetch all rows with pagination — only select the fields we need to aggregate
  const rows = await fetchAllRows((from, to) =>
    supabase
      .from("daily_metrics")
      .select("agent_id, nb_auto_items, prem_premium, items, nb_count, nb_auto_count, quotes, quotes_deduped, agents(office, team)")
      .gte("report_date", startDate)
      .lte("report_date", endDate)
      .range(from, to)
  )

  // Aggregate in a single pass
  const totals: AgencyKPITotals = {
    nb_auto_items: 0,
    prem_premium: 0,
    items: 0,
    nb_count: 0,
    nb_auto_count: 0,
    quotes: 0,
    quotes_deduped: 0,
  }

  const officeBreakdown: Record<string, number> = {}
  const perAgentItems: Record<string, number> = {}
  const perAgentPremium: Record<string, number> = {}

  for (const row of rows) {
    // Exclude Support team from agency totals
    const team = (row.agents as any)?.team
    if (team === "Support") continue

    const autoItems = row.nb_auto_items || 0
    const premium = Number(row.prem_premium) || 0

    totals.nb_auto_items += autoItems
    totals.prem_premium += premium
    totals.items += row.items || 0
    totals.nb_count += row.nb_count || 0
    totals.nb_auto_count += row.nb_auto_count || 0
    totals.quotes += row.quotes || 0
    totals.quotes_deduped += row.quotes_deduped || 0

    // Office breakdown
    const office = (row.agents as any)?.office || "Other"
    officeBreakdown[office] = (officeBreakdown[office] || 0) + autoItems

    // Per-agent totals
    const aid = row.agent_id
    perAgentItems[aid] = (perAgentItems[aid] || 0) + autoItems
    perAgentPremium[aid] = (perAgentPremium[aid] || 0) + premium
  }

  // Remove zero-count offices
  for (const office of Object.keys(officeBreakdown)) {
    if (officeBreakdown[office] === 0) delete officeBreakdown[office]
  }

  return { totals, officeBreakdown, perAgentItems, perAgentPremium }
}
