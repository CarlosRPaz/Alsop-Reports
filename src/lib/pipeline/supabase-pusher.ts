/**
 * supabase-pusher.ts — Push merged data to Supabase.
 *
 * Port of Python's src/supabase_pusher.py.
 * Handles upserting agents, daily metrics (with partial-update support),
 * quote records, quote duplicates, and upload history.
 *
 * CALL DATA HANDLING:
 * Agents can appear on both RingCentral (rc) and Ricochet (rico_ap/rico_ch).
 * When sources are uploaded separately, call data is ADDED (not overwritten).
 * A hidden JSONB column `call_source_breakdown` tracks each source's contribution
 * so re-uploads of the same source correctly replace (not accumulate).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { SOURCE_FIELD_MAP, type QuoteRecord, type QuoteDuplicate } from "./types"

interface MergedRow {
  agent: string
  office: string
  team: string
  Calls: number
  Inbound: number
  Outbound: number
  TalkTimeSeconds: number
  Texts: number
  OutTexts: number
  OptIns: number
  OptOuts: number
  Quotes: number
  QuotesDeduped: number
  NB: number
  Items: number
  WrittenPremium: number
  NBAutoCount: number
  NBAutoItems: number
  PremPremium: number
  PremItems: number
  PremPoints: number
  callSourceBreakdown?: Record<string, { calls: number; inbound: number; outbound: number; talk_time_seconds: number }>
}

/** The four call-related fields that can come from multiple sources */
const CALL_FIELDS = new Set(["calls", "inbound", "outbound", "talk_time_seconds"])

/** Map from daily_metrics column name → callSourceBreakdown sub-key */
const CALL_FIELD_TO_BREAKDOWN_KEY: Record<string, string> = {
  calls: "calls",
  inbound: "inbound",
  outbound: "outbound",
  talk_time_seconds: "talk_time_seconds",
}

/**
 * Push merged data to Supabase.
 * Mirrors Python's push_to_supabase() exactly.
 */
export async function pushToSupabase(
  supabase: SupabaseClient,
  mergedData: MergedRow[],
  reportDate: string,
  uploadTypes: string[] | null,
  quoteRecords?: QuoteRecord[],
  quoteDuplicates?: QuoteDuplicate[],
  uploadId?: string | null,
  sourceAgents?: Record<string, Set<string>>,
): Promise<string[]> {
  const logs: string[] = []
  const isPartial = uploadTypes !== null && uploadTypes.length > 0
  const modeLabel = isPartial ? `PARTIAL (${uploadTypes!.join(",")})` : "FULL"
  logs.push(`[Supabase] Pushing data to Supabase (${modeLabel})...`)

  // Determine which fields to write in partial mode
  const partialFields = new Set<string>()
  if (isPartial) {
    for (const src of uploadTypes!) {
      const fields = SOURCE_FIELD_MAP[src] || []
      for (const f of fields) partialFields.add(f)
    }
    logs.push(`[Supabase] Partial update fields: ${[...partialFields].sort().join(", ")}`)
  }

  // 1. Upsert Agents
  const agentsData = mergedData.map(row => ({
    name: row.agent,
    team: row.team || "",
    office: row.office || "",
    active: true,
  }))

  if (agentsData.length > 0) {
    const { error } = await supabase
      .from("agents")
      .upsert(agentsData, { onConflict: "name" })

    if (error) {
      logs.push(`[Supabase] Failed to push agents: ${error.message}`)
      return logs
    }
  }

  // 2. Fetch Agent IDs
  const { data: agentsDB, error: agentFetchErr } = await supabase
    .from("agents")
    .select("id, name")

  if (agentFetchErr || !agentsDB) {
    logs.push(`[Supabase] Failed to fetch agents: ${agentFetchErr?.message}`)
    return logs
  }

  const agentIdMap = new Map<string, string>()
  for (const a of agentsDB) {
    agentIdMap.set(a.name, a.id)
  }

  // 3. Fetch existing daily metrics to preserve data
  let existingRows = new Map<string, Record<string, unknown>>()
  const existingManualData = new Map<string, Record<string, unknown>>()

  if (isPartial) {
    const { data: existingData } = await supabase
      .from("daily_metrics")
      .select("*")
      .eq("report_date", reportDate)

    if (existingData) {
      for (const row of existingData) {
        existingRows.set(row.agent_id, row)
        existingManualData.set(row.agent_id, {
          dismissed_todos: row.dismissed_todos,
          past_due_todos: row.past_due_todos,
          pivots: row.pivots,
        })
      }
    }
  } else {
    const { data: existingData } = await supabase
      .from("daily_metrics")
      .select("agent_id, dismissed_todos, past_due_todos, pivots, call_source_breakdown")
      .eq("report_date", reportDate)

    if (existingData) {
      for (const row of existingData) {
        existingManualData.set(row.agent_id, {
          dismissed_todos: row.dismissed_todos,
          past_due_todos: row.past_due_todos,
          pivots: row.pivots,
        })
        // For full mode, also store existing rows so we can read call_source_breakdown
        existingRows.set(row.agent_id, row)
      }
    }
  }

  // 4. Upsert Daily Metrics
  const metricsData: Record<string, unknown>[] = []

  for (const row of mergedData) {
    const agentId = agentIdMap.get(row.agent)
    if (!agentId) continue

    const existing = existingManualData.get(agentId) || {}
    const existingRow = existingRows.get(agentId) || {}

    // Build the full field map from pipeline data (non-call fields)
    const allFields: Record<string, unknown> = {
      calls: row.Calls,
      inbound: row.Inbound,
      outbound: row.Outbound,
      talk_time_seconds: row.TalkTimeSeconds,
      texts: row.Texts,
      out_texts: row.OutTexts,
      opt_ins: row.OptIns,
      opt_outs: row.OptOuts,
      quotes: row.Quotes,
      quotes_deduped: row.QuotesDeduped,
      nb_count: row.NB,
      items: row.Items,
      written_premium: row.WrittenPremium,
      nb_auto_count: row.NBAutoCount,
      nb_auto_items: row.NBAutoItems,
      prem_premium: row.PremPremium,
      prem_items: row.PremItems,
      prem_points: row.PremPoints,
      dismissed_todos: existing.dismissed_todos ?? 0,
      past_due_todos: existing.past_due_todos ?? 0,
      pivots: existing.pivots ?? 0,
    }

    // ---------- CALL SOURCE BREAKDOWN LOGIC ----------
    // Read existing breakdown from DB (if any)
    const existingBreakdown: Record<string, Record<string, number>> =
      (existingRow as Record<string, unknown>).call_source_breakdown as Record<string, Record<string, number>> || {}

    // New breakdown from the current merge
    const newBreakdown = row.callSourceBreakdown || {}

    // Compute the final merged breakdown:
    // - Sources in the current upload get REPLACED with new values
    // - Sources NOT in the current upload keep their existing values
    const finalBreakdown: Record<string, Record<string, number>> = { ...existingBreakdown }

    if (isPartial) {
      // Partial upload: merge new source contributions into existing breakdown
      // Only replace sources that are actually in this upload
      for (const [src, data] of Object.entries(newBreakdown)) {
        finalBreakdown[src] = { ...data }
      }
    } else {
      // Full upload: the merge already computed the complete breakdown
      // Replace the entire breakdown with what merge produced
      for (const key of Object.keys(finalBreakdown)) {
        delete finalBreakdown[key]
      }
      for (const [src, data] of Object.entries(newBreakdown)) {
        finalBreakdown[src] = { ...data }
      }
    }

    // Recompute call totals from the merged breakdown
    let totalCalls = 0, totalInbound = 0, totalOutbound = 0, totalTalkTime = 0
    for (const srcData of Object.values(finalBreakdown)) {
      totalCalls += srcData.calls || 0
      totalInbound += srcData.inbound || 0
      totalOutbound += srcData.outbound || 0
      totalTalkTime += srcData.talk_time_seconds || 0
    }

    // Override call fields with the correctly summed totals
    allFields.calls = totalCalls
    allFields.inbound = totalInbound
    allFields.outbound = totalOutbound
    allFields.talk_time_seconds = totalTalkTime

    if (isPartial) {
      // Start from existing row, only overwrite targeted fields
      const metric: Record<string, unknown> = {
        agent_id: agentId,
        report_date: reportDate,
      }

      for (const [field, newVal] of Object.entries(allFields)) {
        if (partialFields.has(field)) {
          // For call fields: use the recomputed total from breakdown
          // For non-call fields: use the value from allFields directly
          metric[field] = newVal
        } else {
          // Keep existing value, fall back to 0/default if no existing row
          const ev = (existingRow as Record<string, unknown>)[field]
          metric[field] = (ev !== null && ev !== undefined) ? ev : newVal
        }
      }

      // Always write the merged breakdown
      metric.call_source_breakdown = finalBreakdown

      metricsData.push(metric)
    } else {
      // Full mode — write everything
      metricsData.push({
        agent_id: agentId,
        report_date: reportDate,
        ...allFields,
        call_source_breakdown: finalBreakdown,
      })
    }
  }

  if (metricsData.length > 0) {
    const { error } = await supabase
      .from("daily_metrics")
      .upsert(metricsData, { onConflict: "agent_id,report_date" })

    if (error) {
      logs.push(`[Supabase] Failed to push metrics: ${error.message}`)
      return logs
    }
  }

  // 5. Push quote duplicates if provided
  if (quoteDuplicates && quoteDuplicates.length > 0) {
    logs.push(`[Supabase] Uploading ${quoteDuplicates.length} duplicate quote records...`)

    // Clear existing duplicates for these months
    const monthsToClear = [...new Set(quoteDuplicates.map(r => r.report_month))].sort()
    for (const rm of monthsToClear) {
      await supabase
        .from("quote_duplicates")
        .delete()
        .eq("report_month", rm)
    }

    // Insert in batches of 50
    let batchSuccess = 0
    for (let i = 0; i < quoteDuplicates.length; i += 50) {
      const batch = quoteDuplicates.slice(i, i + 50)
      const { error } = await supabase.from("quote_duplicates").insert(batch)
      if (!error) {
        batchSuccess += batch.length
      } else {
        logs.push(`[Supabase] ERROR batch ${i}: ${error.message}`)
      }
    }
    logs.push(`[Supabase] quote_duplicates: ${batchSuccess}/${quoteDuplicates.length} inserted.`)
  }

  // 6. Push individual quote records if provided
  if (quoteRecords && quoteRecords.length > 0) {
    logs.push(`[Supabase] Uploading ${quoteRecords.length} individual quote records...`)

    const quotePayloads: Record<string, unknown>[] = []
    for (const r of quoteRecords) {
      const aid = agentIdMap.get(r.agent)
      if (!aid) continue
      quotePayloads.push({
        agent_id: aid,
        report_date: r.report_date,
        quote_control_number: r.quote_control_number,
        product: r.product,
        premium: r.premium,
        sub_producer: r.sub_producer,
        upload_id: uploadId || null,
      })
    }

    if (quotePayloads.length > 0) {
      // Clear existing quote records for these dates
      const datesToClear = [...new Set(quotePayloads.map(r => r.report_date as string))].sort()
      logs.push(`[Supabase] Clearing existing quote records for ${datesToClear.length} date(s)`)
      for (const d of datesToClear) {
        await supabase.from("quote_records").delete().eq("report_date", d)
      }

      // Insert in batches of 100
      let batchSuccess = 0
      for (let i = 0; i < quotePayloads.length; i += 100) {
        const batch = quotePayloads.slice(i, i + 100)
        const { error } = await supabase.from("quote_records").insert(batch)
        if (!error) {
          batchSuccess += batch.length
        } else {
          logs.push(`[Supabase] ERROR quote_records batch ${i}: ${error.message}`)
        }
      }
      logs.push(`[Supabase] quote_records: ${batchSuccess}/${quotePayloads.length} inserted.`)
    }
  }

  // 7. Update upload history if we have an upload ID
  if (uploadId) {
    try {
      await supabase
        .from("upload_history")
        .update({
          status: "success",
          logs: logs.join("\n").substring(0, 2000),
        })
        .eq("id", uploadId)
    } catch {
      logs.push("[Supabase] Failed to update upload history")
    }
  }

  logs.push(`[Supabase] Successfully pushed ${metricsData.length} daily metrics for ${reportDate} (${modeLabel}).`)
  return logs
}
