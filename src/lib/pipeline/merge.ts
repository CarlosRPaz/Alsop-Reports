/**
 * merge.ts — Merge all parsed data into one record per agent.
 * 
 * Port of merge_all_data() from Python main.py (lines 62-172).
 * Creates a master DataFrame keyed by agent, then left-merges each data source.
 */

import { Spine } from "./spine"

export interface AgentMetrics {
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
}

/** Result of merging all sources — includes per-agent source tracking */
export interface MergeResult {
  data: AgentMetrics[]
  /**
   * Maps source type (e.g. "rc", "rico_ch", "hs") to the set of agent names
   * that had actual data from that source. Used by the pusher to avoid
   * overwriting shared fields (like talk_time_seconds) for agents that
   * weren't present in the uploaded source.
   */
  sourceAgents: Record<string, Set<string>>
}

/**
 * Merge all parsed source data into a single array of agent metrics.
 * Mirrors Python's merge_all_data() function exactly.
 */
export function mergeAllData(
  spine: Spine,
  rcData: Record<string, unknown>[] | null,
  hsData: Record<string, unknown>[] | null,
  nbData: Record<string, unknown>[] | null,
  quotesData: Record<string, unknown>[] | null,
  premiumData: Record<string, unknown>[] | null,
  ricoCHData: Record<string, unknown>[] | null,
  ricoAPData: Record<string, unknown>[] | null,
  quotesDeduped: Record<string, unknown>[] | null,
  nbAutoData: Record<string, unknown>[] | null,
): MergeResult {
  // Start with all agents from spine
  const allAgents = spine.allAgents()
  const agentMap = new Map<string, AgentMetrics>()

  // Track which agents had real data from each source.
  // This prevents partial uploads from overwriting shared fields
  // (e.g. talk_time_seconds) for agents not in the uploaded source.
  const sourceAgents: Record<string, Set<string>> = {
    rc: new Set(), rico_ap: new Set(), rico_ch: new Set(),
    hs: new Set(), quotes: new Set(), nb: new Set(), premium: new Set(),
  }

  for (const a of allAgents) {
    agentMap.set(a.agent, {
      agent: a.agent,
      office: a.office,
      team: a.team,
      Calls: 0, Inbound: 0, Outbound: 0, TalkTimeSeconds: 0,
      Texts: 0, OutTexts: 0, OptIns: 0, OptOuts: 0,
      Quotes: 0, QuotesDeduped: 0,
      NB: 0, Items: 0, WrittenPremium: 0,
      NBAutoCount: 0, NBAutoItems: 0,
      PremPremium: 0, PremItems: 0, PremPoints: 0,
    })
  }

  // --- Call counts + Talk time ---
  // Three sources contribute to calls:
  //   RC (RingCentral)      → calls + talk time (CSR agents)
  //   Rico AP (Agent Perf)  → calls only (Sales/EA agents)
  //   Rico CH (CH zips)     → talk time only (Sales/EA agents)
  //
  // For agents on both platforms, values are summed.

  // Combine call frames
  type CallRow = { Agent: string; Calls: number; Inbound: number; Outbound: number; TalkTimeSeconds: number }
  const callFrames: CallRow[] = []

  if (rcData && rcData.length > 0) {
    for (const row of rcData) {
      const agent = String(row.Agent || "")
      if (agent) sourceAgents.rc.add(agent)
      callFrames.push({
        Agent: agent,
        Calls: toInt(row.Calls),
        Inbound: toInt(row.Inbound),
        Outbound: toInt(row.Outbound),
        TalkTimeSeconds: toInt(row.TalkTimeSeconds),
      })
    }
  }

  if (ricoAPData && ricoAPData.length > 0) {
    // Rico AP provides call counts but NO talk time
    // If we also have Rico CH data, merge talk time per agent
    const chTalkMap = new Map<string, number>()
    if (ricoCHData && ricoCHData.length > 0) {
      for (const row of ricoCHData) {
        const agent = String(row.Agent || "")
        if (agent) sourceAgents.rico_ch.add(agent)
        chTalkMap.set(agent, (chTalkMap.get(agent) || 0) + toInt(row.TalkTimeSeconds))
      }
    }

    for (const row of ricoAPData) {
      const agent = String(row.Agent || "")
      if (agent) sourceAgents.rico_ap.add(agent)
      callFrames.push({
        Agent: agent,
        Calls: toInt(row.Calls),
        Inbound: toInt(row.Inbound),
        Outbound: toInt(row.Outbound),
        TalkTimeSeconds: chTalkMap.get(agent) || 0,
      })
    }
  } else if (ricoCHData && ricoCHData.length > 0) {
    // No AP data — fall back to CH data for both calls + talk time (legacy behavior)
    for (const row of ricoCHData) {
      const agent = String(row.Agent || "")
      if (agent) {
        sourceAgents.rico_ch.add(agent)
        sourceAgents.rico_ap.add(agent)  // CH provides both calls + talk in legacy mode
      }
      callFrames.push({
        Agent: agent,
        Calls: toInt(row.Calls),
        Inbound: toInt(row.Inbound),
        Outbound: toInt(row.Outbound),
        TalkTimeSeconds: toInt(row.TalkTimeSeconds),
      })
    }
  }

  // Aggregate call frames per agent and merge
  const callAgg = new Map<string, CallRow>()
  for (const row of callFrames) {
    const existing = callAgg.get(row.Agent)
    if (existing) {
      existing.Calls += row.Calls
      existing.Inbound += row.Inbound
      existing.Outbound += row.Outbound
      existing.TalkTimeSeconds += row.TalkTimeSeconds
    } else {
      callAgg.set(row.Agent, { ...row })
    }
  }

  for (const [agent, calls] of callAgg) {
    const m = agentMap.get(agent)
    if (m) {
      m.Calls = calls.Calls
      m.Inbound = calls.Inbound
      m.Outbound = calls.Outbound
      m.TalkTimeSeconds = calls.TalkTimeSeconds
    }
  }

  // --- Hearsay texts ---
  if (hsData && hsData.length > 0) {
    const hsAgg = aggregateByAgent(hsData, ["Texts", "OutTexts", "OptIns", "OptOuts"])
    for (const [agent, vals] of hsAgg) {
      sourceAgents.hs.add(agent)
      const m = agentMap.get(agent)
      if (m) {
        m.Texts = vals.Texts || 0
        m.OutTexts = vals.OutTexts || 0
        m.OptIns = vals.OptIns || 0
        m.OptOuts = vals.OptOuts || 0
      }
    }
  }

  // --- Quotes ---
  if (quotesData && quotesData.length > 0) {
    const qAgg = aggregateByAgent(quotesData, ["QuoteCount"])
    for (const [agent, vals] of qAgg) {
      sourceAgents.quotes.add(agent)
      const m = agentMap.get(agent)
      if (m) {
        m.Quotes = vals.QuoteCount || 0
      }
    }
  }

  // --- Quotes Deduped ---
  if (quotesDeduped && quotesDeduped.length > 0) {
    const qdAgg = aggregateByAgent(quotesDeduped, ["QuotesDeduped"])
    for (const [agent, vals] of qdAgg) {
      const m = agentMap.get(agent)
      if (m) {
        m.QuotesDeduped = vals.QuotesDeduped || 0
      }
    }
  }

  // --- New Business ---
  if (nbData && nbData.length > 0) {
    const nbAgg = aggregateByAgent(nbData, ["NBCount", "Items", "WrittenPremium"])
    for (const [agent, vals] of nbAgg) {
      sourceAgents.nb.add(agent)
      const m = agentMap.get(agent)
      if (m) {
        m.NB = vals.NBCount || 0
        m.Items = vals.Items || 0
        m.WrittenPremium = vals.WrittenPremium || 0
      }
    }
  }

  // --- NB Auto ---
  if (nbAutoData && nbAutoData.length > 0) {
    const naAgg = aggregateByAgent(nbAutoData, ["NBAutoCount", "NBAutoItems"])
    for (const [agent, vals] of naAgg) {
      const m = agentMap.get(agent)
      if (m) {
        m.NBAutoCount = vals.NBAutoCount || 0
        m.NBAutoItems = vals.NBAutoItems || 0
      }
    }
  }

  // --- Premium ---
  if (premiumData && premiumData.length > 0) {
    const pAgg = aggregateByAgent(premiumData, ["PremItems", "PremPremium", "PremPoints"])
    for (const [agent, vals] of pAgg) {
      sourceAgents.premium.add(agent)
      const m = agentMap.get(agent)
      if (m) {
        m.PremPremium = vals.PremPremium || 0
        m.PremItems = vals.PremItems || 0
        m.PremPoints = vals.PremPoints || 0
      }
    }
  }

  return { data: Array.from(agentMap.values()), sourceAgents }
}


// ─── Helpers ──────────────────────────────────────────────────────────

function toInt(val: unknown): number {
  if (val === null || val === undefined) return 0
  const n = Number(val)
  return isNaN(n) ? 0 : Math.round(n)
}

/** Aggregate rows by Agent, summing specified numeric fields */
function aggregateByAgent(
  rows: Record<string, unknown>[],
  fields: string[],
): Map<string, Record<string, number>> {
  const result = new Map<string, Record<string, number>>()

  for (const row of rows) {
    const agent = String(row.Agent || "")
    if (!agent) continue

    let agg = result.get(agent)
    if (!agg) {
      agg = {}
      for (const f of fields) agg[f] = 0
      result.set(agent, agg)
    }

    for (const f of fields) {
      agg[f] += toInt(row[f])
    }
  }

  return result
}
