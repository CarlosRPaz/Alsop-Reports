// ============================================================================
// Chat System — Mention Parsing & Notification Creation
// ============================================================================

import { supabase } from '@/lib/supabaseClient'
import type { Agent, MentionType, ParsedMention } from './types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Team names that can be @-mentioned */
const TEAM_MENTIONS = ['Sales', 'CSR', 'EA', 'Managers'] as const

/** Role names that can be @-mentioned */
const ROLE_MENTIONS = ['Admin'] as const

/** Office codes that can be @-mentioned */
const OFFICE_MENTIONS = ['CH', 'MB', 'MCM', 'RC'] as const

// ---------------------------------------------------------------------------
// Parse mentions from message text
// ---------------------------------------------------------------------------

/**
 * Parse `@` mentions from raw message content.
 *
 * Supported patterns:
 *   @AgentName     → agent mention (must match a member's name)
 *   @Sales         → team mention
 *   @CSR           → team mention
 *   @EA            → team mention
 *   @Managers      → team mention
 *   @CH            → office mention
 *   @MB            → office mention
 *   @MCM           → office mention
 *   @RC            → office mention
 *   @Admin         → role mention
 *   @Everyone      → everyone mention
 *
 * `members` is the list of agents in the current conversation — used to
 * resolve agent-level mentions by name.
 */
export function parseMentions(
  content: string,
  members: Pick<Agent, 'id' | 'name'>[],
): ParsedMention[] {
  const mentions: ParsedMention[] = []
  const seen = new Set<string>() // de-duplicate

  // Build target candidates sorted by longest name first (so "Alex C" matches before "Alex")
  const allTargets: {
    name: string
    type: MentionType
    agent_id?: string
  }[] = [
    { name: 'Everyone', type: 'everyone' as const },
    { name: 'all', type: 'everyone' as const },
    ...TEAM_MENTIONS.map((t) => ({ name: t, type: 'team' as const })),
    ...OFFICE_MENTIONS.map((o) => ({ name: o, type: 'office' as const })),
    ...ROLE_MENTIONS.map((r) => ({ name: r, type: 'role' as const })),
    ...members.map((m) => ({ name: m.name, type: 'agent' as const, agent_id: m.id })),
  ].sort((a, b) => b.name.length - a.name.length)

  // Find all @ occurrences
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '@') {
      const rest = content.slice(i + 1)
      for (const target of allTargets) {
        const targetLen = target.name.length
        const candidate = rest.slice(0, targetLen)
        if (candidate.toLowerCase() === target.name.toLowerCase()) {
          const nextChar = rest[targetLen]
          // Word boundary or punctuation or end of string
          if (!nextChar || /\s|[.,!?;:)\-\n]/.test(nextChar)) {
            const key = target.type === 'agent' ? `agent:${target.agent_id}` : `${target.type}:${target.name.toLowerCase()}`
            if (!seen.has(key)) {
              mentions.push({
                type: target.type,
                target: target.name,
                agent_id: target.agent_id,
              })
              seen.add(key)
            }
            i += targetLen
            break
          }
        }
      }
    }
  }

  return mentions
}

// ---------------------------------------------------------------------------
// Create mention records in DB
// ---------------------------------------------------------------------------

/**
 * Insert rows into `chat_message_mentions` for each parsed mention.
 */
export async function createMentionRecords(
  messageId: string,
  mentions: ParsedMention[],
): Promise<void> {
  if (mentions.length === 0) return

  const rows = mentions.map((m) => ({
    message_id: messageId,
    mentioned_agent_id: m.agent_id ?? null,
    mention_type: m.type,
    mention_target: m.target,
  }))

  const { error } = await supabase
    .from('chat_message_mentions')
    .insert(rows)

  if (error) {
    console.error('[mentions] Failed to create mention records:', error)
    throw error
  }
}

// ---------------------------------------------------------------------------
// Resolve mention targets to agent IDs
// ---------------------------------------------------------------------------

/**
 * Expand parsed mentions to a de-duplicated list of agent IDs.
 *
 * - `agent` type → uses `agent_id` directly
 * - `team` type → queries agents with matching `team`
 * - `role` type → queries agents with matching `role`
 * - `everyone` → queries all active agents
 */
export async function resolveMentionTargets(
  mentions: ParsedMention[],
): Promise<string[]> {
  const agentIdSet = new Set<string>()

  // Collect agent-level immediately
  for (const m of mentions) {
    if (m.type === 'agent' && m.agent_id) {
      agentIdSet.add(m.agent_id)
    }
  }

  // Batch team/role/office/everyone queries
  const needsTeamQuery = mentions
    .filter((m) => m.type === 'team')
    .map((m) => m.target)
  const needsRoleQuery = mentions
    .filter((m) => m.type === 'role')
    .map((m) => m.target.toLowerCase()) // DB stores lowercase roles
  const needsOfficeQuery = mentions
    .filter((m) => m.type === 'office')
    .map((m) => m.target)
  const hasEveryone = mentions.some((m) => m.type === 'everyone')

  // If @Everyone, just fetch all active, report-visible agents
  if (hasEveryone) {
    const { data } = await supabase
      .from('agents')
      .select('id')
      .eq('active', true)
      .eq('report_visible', true)

    for (const a of data ?? []) agentIdSet.add(a.id)
    return [...agentIdSet]
  }

  // Team queries
  if (needsTeamQuery.length > 0) {
    const { data } = await supabase
      .from('agents')
      .select('id')
      .eq('active', true)
      .eq('report_visible', true)
      .in('team', needsTeamQuery)

    for (const a of data ?? []) agentIdSet.add(a.id)
  }

  // Role queries
  if (needsRoleQuery.length > 0) {
    const { data } = await supabase
      .from('agents')
      .select('id')
      .eq('active', true)
      .eq('report_visible', true)
      .in('role', needsRoleQuery)

    for (const a of data ?? []) agentIdSet.add(a.id)
  }

  // Office queries
  if (needsOfficeQuery.length > 0) {
    const { data } = await supabase
      .from('agents')
      .select('id')
      .eq('active', true)
      .eq('report_visible', true)
      .in('office', needsOfficeQuery)

    for (const a of data ?? []) agentIdSet.add(a.id)
  }

  return [...agentIdSet]
}
