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

  // Regex captures the word(s) after @, supporting multi-word names like
  // "John Smith" by greedily matching capitalized words.
  // We process longest matches first so "@John Smith" isn't split.
  const mentionRegex = /@(\w[\w\s]*\w|\w+)/g
  let match: RegExpExecArray | null

  while ((match = mentionRegex.exec(content)) !== null) {
    const raw = match[1].trim()

    // @Everyone
    if (raw.toLowerCase() === 'everyone') {
      if (!seen.has('everyone')) {
        mentions.push({ type: 'everyone', target: 'Everyone' })
        seen.add('everyone')
      }
      continue
    }

    // @TeamName
    const teamMatch = TEAM_MENTIONS.find(
      (t) => t.toLowerCase() === raw.toLowerCase(),
    )
    if (teamMatch) {
      if (!seen.has(`team:${teamMatch}`)) {
        mentions.push({ type: 'team', target: teamMatch })
        seen.add(`team:${teamMatch}`)
      }
      continue
    }

    // @RoleName
    const roleMatch = ROLE_MENTIONS.find(
      (r) => r.toLowerCase() === raw.toLowerCase(),
    )
    if (roleMatch) {
      if (!seen.has(`role:${roleMatch}`)) {
        mentions.push({ type: 'role', target: roleMatch })
        seen.add(`role:${roleMatch}`)
      }
      continue
    }

    // @AgentName (match against conversation members)
    const agentMatch = members.find(
      (m) => m.name.toLowerCase() === raw.toLowerCase(),
    )
    if (agentMatch && !seen.has(`agent:${agentMatch.id}`)) {
      mentions.push({
        type: 'agent',
        target: agentMatch.name,
        agent_id: agentMatch.id,
      })
      seen.add(`agent:${agentMatch.id}`)
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

  // Batch team/role/everyone queries
  const needsTeamQuery = mentions
    .filter((m) => m.type === 'team')
    .map((m) => m.target)
  const needsRoleQuery = mentions
    .filter((m) => m.type === 'role')
    .map((m) => m.target.toLowerCase()) // DB stores lowercase roles
  const hasEveryone = mentions.some((m) => m.type === 'everyone')

  // If @Everyone, just fetch all active agents
  if (hasEveryone) {
    const { data } = await supabase
      .from('agents')
      .select('id')
      .eq('active', true)

    for (const a of data ?? []) agentIdSet.add(a.id)
    return [...agentIdSet]
  }

  // Team queries
  if (needsTeamQuery.length > 0) {
    const { data } = await supabase
      .from('agents')
      .select('id')
      .eq('active', true)
      .in('team', needsTeamQuery)

    for (const a of data ?? []) agentIdSet.add(a.id)
  }

  // Role queries
  if (needsRoleQuery.length > 0) {
    const { data } = await supabase
      .from('agents')
      .select('id')
      .eq('active', true)
      .in('role', needsRoleQuery)

    for (const a of data ?? []) agentIdSet.add(a.id)
  }

  return [...agentIdSet]
}
