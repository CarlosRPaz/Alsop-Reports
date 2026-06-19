/**
 * spine.ts — Agent name resolver (Spine).
 * 
 * Port of Python's src/spine.py (Spine.from_supabase mode).
 * Loads agents + system_variants from the Supabase `agents` table and builds
 * a case-insensitive lookup dict mapping any name variant → canonical agent record.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { AgentRecord, SystemVariants } from "./types"

export class Spine {
  private lookup: Map<string, AgentRecord> = new Map()
  private agents: AgentRecord[] = []

  private constructor() {}

  /** Build a Spine from the Supabase `agents` table */
  static async fromSupabase(supabase: SupabaseClient): Promise<Spine> {
    const { data, error } = await supabase
      .from("agents")
      .select("name, office, team, system_variants")
      .eq("active", true)

    if (error) throw new Error(`Failed to load agents: ${error.message}`)
    if (!data || data.length === 0) throw new Error("No active agents found in Supabase")

    const spine = new Spine()
    spine.buildLookup(data)
    return spine
  }

  private buildLookup(agentsData: { name: string; office: string; team: string; system_variants: SystemVariants | null }[]) {
    for (const agent of agentsData) {
      if (!agent.name) continue

      const record: AgentRecord = {
        agent: agent.name,
        office: agent.office || "",
        full_name: agent.system_variants?.full_name || "",
        team: agent.team || "",
      }

      // Index the canonical name
      this.lookup.set(Spine.normalize(agent.name), record)

      // Index all variant names from system_variants
      const variants = agent.system_variants || {}
      for (const variantName of Object.values(variants)) {
        if (variantName && String(variantName).trim()) {
          const norm = Spine.normalize(String(variantName))
          this.lookup.set(norm, record)

          // Also index the name portion after sub-producer code
          // e.g. "387-ALEX CLANCY" → "ALEX CLANCY"
          if (String(variantName).includes("-") && /^\d/.test(String(variantName))) {
            const stripped = String(variantName).split("-").slice(1).join("-").trim()
            if (stripped) {
              this.lookup.set(Spine.normalize(stripped), record)
            }
          }
        }
      }

      // Track unique agents
      if (!this.agents.find(a => a.agent === agent.name)) {
        this.agents.push(record)
      }
    }
  }

  /** Normalize a name for case-insensitive comparison */
  static normalize(name: string): string {
    return name.trim().replace(/\s+/g, " ").toUpperCase()
  }

  /**
   * Resolve any name variant to the canonical agent record, or null.
   * Tries exact match first, then fuzzy first+last name fallback.
   */
  resolve(name: string): AgentRecord | null {
    if (!name || !String(name).trim()) return null

    const key = Spine.normalize(String(name))
    const exact = this.lookup.get(key)
    if (exact) return exact

    // Fuzzy fallback: match first + last name
    const parts = key.split(" ")
    if (parts.length >= 2) {
      for (const [storedKey, record] of this.lookup.entries()) {
        const storedParts = storedKey.split(" ")
        if (storedParts.length >= 2) {
          if (parts[0] === storedParts[0] && parts[parts.length - 1] === storedParts[storedParts.length - 1]) {
            return record
          }
        }
      }
    }

    return null
  }

  /** Return just the canonical agent nickname, or null */
  resolveAgent(name: string): string | null {
    const record = this.resolve(name)
    return record ? record.agent : null
  }

  /** Return all unique agent records */
  allAgents(): AgentRecord[] {
    return [...this.agents]
  }

  /** Return sorted list of all canonical agent nicknames */
  agentNames(): string[] {
    return this.agents.map(a => a.agent).sort()
  }
}
