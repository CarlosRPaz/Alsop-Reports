// ============================================================================
// Chat System — Conversation CRUD
// ============================================================================

import { supabase } from '@/lib/supabaseClient'
import type {
  Conversation,
  ConversationMember,
  CreateConversationInput,
  MessagePreview,
} from './types'

// ---------------------------------------------------------------------------
// Fetch conversations for an agent
// ---------------------------------------------------------------------------

/**
 * Load every conversation the agent belongs to (via `chat_conversation_members`).
 * Enriches each conversation with:
 *  - `unread_count` (messages after the member's `last_read_at`)
 *  - `last_message` preview (most recent non-deleted message)
 *  - `is_pinned` from the member row
 *
 * Sort: pinned first, then by last message time descending.
 */
export async function fetchConversationsForAgent(
  agentId: string,
): Promise<Conversation[]> {
  // 1. Get all memberships for this agent
  const { data: memberships, error: memErr } = await supabase
    .from('chat_conversation_members')
    .select('conversation_id, last_read_at, is_pinned:pinned')
    .eq('agent_id', agentId)

  if (memErr) {
    console.error('[conversations] Failed to fetch memberships:', memErr)
    throw memErr
  }

  if (!memberships || memberships.length === 0) return []

  const conversationIds = memberships.map((m) => m.conversation_id)

  // 2. Fetch conversation rows (excluding is_private since it's a derived/JS property)
  const { data: conversations, error: convErr } = await supabase
    .from('chat_conversations')
    .select('id, type, name, description, is_archived:archived, created_by, created_at, updated_at')
    .in('id', conversationIds)
    .eq('archived', false)
    .order('updated_at', { ascending: false })

  if (convErr) {
    console.error('[conversations] Failed to fetch conversations:', convErr)
    throw convErr
  }

  if (!conversations) return []

  // Build a lookup from membership data
  const membershipMap = new Map(
    memberships.map((m) => [m.conversation_id, m]),
  )

  // 3. Batch-load members for DM conversations so sidebar can resolve names
  const dmConvIds = conversations
    .filter((c) => c.type === 'direct_dm' || c.type === 'group_dm')
    .map((c) => c.id)

  const membersMap = new Map<string, ConversationMember[]>()

  if (dmConvIds.length > 0) {
    const { data: allMembers } = await supabase
      .from('chat_conversation_members')
      .select('conversation_id, agent_id, role, last_read_at, joined_at, left_at, is_muted:muted, is_pinned:pinned, agent:agents(id, name, avatar_url, role, team, presence, status_message)')
      .in('conversation_id', dmConvIds)

    if (allMembers) {
      for (const m of allMembers) {
        const existing = membersMap.get(m.conversation_id) ?? []
        existing.push(m as unknown as ConversationMember)
        membersMap.set(m.conversation_id, existing)
      }
    }
  }

  // 4. For each conversation, fetch last message + compute unread count
  const enriched = await Promise.all(
    conversations.map(async (conv) => {
      const membership = membershipMap.get(conv.id)
      const lastReadAt = membership?.last_read_at ?? '1970-01-01T00:00:00Z'
      const isPinned = membership?.is_pinned ?? false

      // Last message preview
      const { data: lastMsgRows } = await supabase
        .from('chat_messages')
        .select('id, content, created_at, sender_id, agents!chat_messages_sender_id_fkey(name)')
        .eq('conversation_id', conv.id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(1)

      let lastMessage: MessagePreview | null = null
      if (lastMsgRows && lastMsgRows.length > 0) {
        const msg = lastMsgRows[0] as any
        lastMessage = {
          id: msg.id,
          content: msg.content,
          sender_name: msg.agents?.name ?? 'Unknown',
          created_at: msg.created_at,
        }
      }

      // Unread count
      const { count } = await supabase
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conv.id)
        .eq('is_deleted', false)
        .neq('sender_id', agentId)
        .gt('created_at', lastReadAt)

      return {
        ...conv,
        is_private: conv.type === 'private_channel' || conv.type === 'direct_dm' || conv.type === 'group_dm',
        last_message: lastMessage,
        unread_count: count ?? 0,
        is_pinned: isPinned,
        members: membersMap.get(conv.id) ?? undefined,
      } as Conversation
    }),
  )

  // 5. Sort: pinned first, then 'All' channel, then by last message time
  enriched.sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1
    if (!a.is_pinned && b.is_pinned) return 1
    if (a.type === 'channel' && b.type === 'channel') {
      const isAllA = a.name?.trim().toLowerCase() === 'all'
      const isAllB = b.name?.trim().toLowerCase() === 'all'
      if (isAllA && !isAllB) return -1
      if (!isAllA && isAllB) return 1
    }
    const aTime = a.last_message?.created_at ?? a.updated_at
    const bTime = b.last_message?.created_at ?? b.updated_at
    return new Date(bTime).getTime() - new Date(aTime).getTime()
  })

  return enriched
}

// ---------------------------------------------------------------------------
// Pin / unpin a conversation (user-specific)
// ---------------------------------------------------------------------------

/**
 * Toggle the `pinned` flag on a user's membership row.
 * Returns the new pinned state.
 */
export async function toggleConversationPin(
  conversationId: string,
  agentId: string,
  pinned: boolean,
): Promise<boolean> {
  const { error } = await supabase
    .from('chat_conversation_members')
    .update({ pinned })
    .eq('conversation_id', conversationId)
    .eq('agent_id', agentId)

  if (error) {
    console.error('[conversations] Failed to toggle pin:', error)
    return !pinned // return previous state on failure
  }
  return pinned
}

// ---------------------------------------------------------------------------
// Create conversation
// ---------------------------------------------------------------------------

/**
 * Create a new conversation (channel, group_dm, or direct_dm).
 * Adds the creator as `owner` and each specified member_id as `member`.
 */
export async function createConversation(
  data: CreateConversationInput,
): Promise<Conversation> {
  let dbType = data.type
  if (dbType === 'channel' && data.is_private) {
    dbType = 'private_channel' as any
  }

  // The DB requires a non-null name. For DMs, generate a placeholder name
  // from member names (the sidebar computes the display name from members anyway).
  let convName = data.name ?? null
  if (!convName && (data.type === 'direct_dm' || data.type === 'group_dm')) {
    // Look up agent names for the DM name
    const allIds = [data.created_by, ...data.member_ids]
    const { data: agents } = await supabase
      .from('agents')
      .select('id, name')
      .in('id', allIds)

    if (agents && agents.length > 0) {
      convName = agents.map((a) => a.name.split(' ')[0]).join(' & ')
    } else {
      convName = 'Direct Message'
    }
  }

  // Fallback for channels that somehow have no name
  if (!convName) {
    convName = 'Unnamed Conversation'
  }

  const { data: conv, error } = await supabase
    .from('chat_conversations')
    .insert({
      type: dbType,
      name: convName,
      description: data.description ?? null,
      created_by: data.created_by,
    })
    .select('id, type, name, description, is_archived:archived, created_by, created_at, updated_at')
    .single()

  if (error || !conv) {
    console.error('[conversations] Failed to create conversation:', error)
    throw error
  }

  // Build member rows — creator is owner, others are members
  const allIds = new Set([data.created_by, ...data.member_ids])
  const memberRows = [...allIds].map((agentId) => ({
    conversation_id: conv.id,
    agent_id: agentId,
    role: agentId === data.created_by ? 'owner' : 'member',
  }))

  const { error: memErr } = await supabase
    .from('chat_conversation_members')
    .insert(memberRows)

  if (memErr) {
    console.error('[conversations] Failed to add members:', memErr)
    throw memErr
  }

  return {
    ...conv,
    is_private: conv.type === 'private_channel' || conv.type === 'direct_dm' || conv.type === 'group_dm',
  } as Conversation
}

// ---------------------------------------------------------------------------
// Get or create direct DM
// ---------------------------------------------------------------------------

/**
 * Find an existing `direct_dm` conversation between two agents.
 * If none exists, create one.
 */
export async function getOrCreateDirectDM(
  agentId1: string,
  agentId2: string,
): Promise<Conversation> {
  // Find conversations where both agents are members and type is direct_dm
  const { data: memberships1 } = await supabase
    .from('chat_conversation_members')
    .select('conversation_id')
    .eq('agent_id', agentId1)

  const convIds1 = (memberships1 ?? []).map((m) => m.conversation_id)

  if (convIds1.length > 0) {
    const { data: matches } = await supabase
      .from('chat_conversations')
      .select('id, type, name, description, is_archived:archived, created_by, created_at, updated_at, chat_conversation_members!inner(agent_id)')
      .in('id', convIds1)
      .eq('type', 'direct_dm')
      .eq('chat_conversation_members.agent_id', agentId2)

    if (matches && matches.length > 0) {
      const match = matches[0] as any
      // Strip the nested join data before returning
      const { chat_conversation_members: _, ...cleanMatch } = match
      return {
        ...cleanMatch,
        is_private: true,
      } as Conversation
    }
  }

  // No existing DM — create one (createConversation will look up names)
  return createConversation({
    type: 'direct_dm',
    created_by: agentId1,
    member_ids: [agentId2],
    is_private: true,
  })
}

// ---------------------------------------------------------------------------
// Update conversation metadata
// ---------------------------------------------------------------------------

export async function updateConversation(
  id: string,
  data: Partial<Pick<Conversation, 'name' | 'description' | 'is_private'>>,
): Promise<void> {
  const updateData: any = {
    name: data.name,
    description: data.description,
    updated_at: new Date().toISOString(),
  }

  if (data.is_private !== undefined) {
    const { data: current } = await supabase
      .from('chat_conversations')
      .select('type')
      .eq('id', id)
      .single()

    if (current && (current.type === 'channel' || current.type === 'private_channel')) {
      updateData.type = data.is_private ? 'private_channel' : 'channel'
    }
  }

  const { error } = await supabase
    .from('chat_conversations')
    .update(updateData)
    .eq('id', id)

  if (error) {
    console.error('[conversations] Failed to update conversation:', error)
    throw error
  }
}

// ---------------------------------------------------------------------------
// Member management
// ---------------------------------------------------------------------------

export async function addMembers(
  conversationId: string,
  agentIds: string[],
): Promise<void> {
  const rows = agentIds.map((agentId) => ({
    conversation_id: conversationId,
    agent_id: agentId,
    role: 'member' as const,
  }))

  const { error } = await supabase
    .from('chat_conversation_members')
    .upsert(rows, { onConflict: 'conversation_id,agent_id' })

  if (error) {
    console.error('[conversations] Failed to add members:', error)
    throw error
  }
}

export async function removeMember(
  conversationId: string,
  agentId: string,
): Promise<void> {
  const { error } = await supabase
    .from('chat_conversation_members')
    .delete()
    .eq('conversation_id', conversationId)
    .eq('agent_id', agentId)

  if (error) {
    console.error('[conversations] Failed to remove member:', error)
    throw error
  }
}

// ---------------------------------------------------------------------------
// Archive
// ---------------------------------------------------------------------------

export async function archiveConversation(
  conversationId: string,
): Promise<void> {
  const { error } = await supabase
    .from('chat_conversations')
    .update({
      archived: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId)

  if (error) {
    console.error('[conversations] Failed to archive conversation:', error)
    throw error
  }
}

// ---------------------------------------------------------------------------
// Auto-join default channels
// ---------------------------------------------------------------------------

/** Team → channel name mapping (Support gets no team channel) */
const TEAM_CHANNEL_MAP: Record<string, string> = {
  Sales: 'Sales',
  CSR: 'CSR',
  EA: 'EA',
  Managers: 'Managers',
}

/** Office → channel name mapping */
const OFFICE_CHANNEL_MAP: Record<string, string> = {
  CH: 'CH Office',
  MB: 'MB Office',
  MCM: 'MCM Office',
  RC: 'RC Office',
}

/** All managed channel names (used for isolation / removal logic) */
const ALL_MANAGED_CHANNEL_NAMES = new Set([
  'All',
  ...Object.values(TEAM_CHANNEL_MAP),
  ...Object.values(OFFICE_CHANNEL_MAP),
  'Admin',
])

function matchesOfficeChannel(ch: { name: string | null; description?: string | null }, officeCode: string): boolean {
  if (!officeCode) return false
  const code = officeCode.toUpperCase().trim()
  const name = (ch.name || '').toLowerCase()
  const desc = (ch.description || '').toLowerCase()

  if (code === 'CH') {
    return name === 'ch office' || name === 'ch' || name.includes('chula') || desc.includes('chula')
  }
  if (code === 'MB') {
    return name === 'mb office' || name === 'mb' || name.includes('morena') || desc.includes('morena')
  }
  if (code === 'MCM') {
    return name === 'mcm office' || name === 'mcm' || name.includes('mission center') || desc.includes('mission center')
  }
  if (code === 'RC') {
    return name === 'rc office' || name === 'rc' || name.includes('rancho') || desc.includes('rancho')
  }
  return name.includes(code.toLowerCase())
}

/**
 * Sync an agent's default channel memberships based on their team, office, and role.
 *
 * 1. Joins the agent to:
 *    - `All` (everyone)
 *    - Their team channel (Sales, CSR, EA, or Managers — Support gets none)
 *    - Their office channel (CH Office / Chula Vista, MB Office / Morena, MCM Office / Mission Center, or RC Office / Rancho)
 *    - `Admin` (if role === 'admin')
 *
 * 2. Removes the agent from other team/office channels if they don't belong (isolation).
 */
export async function syncAgentDefaultChannels(
  agentId: string,
  team: string,
  office: string,
  role: string,
): Promise<void> {
  // Fetch all active channels from DB
  const { data: channels } = await supabase
    .from('chat_conversations')
    .select('id, name, type, description')
    .in('type', ['channel', 'private_channel'])
    .eq('archived', false)

  if (!channels || channels.length === 0) return

  const targetChannelIds = new Set<string>()
  const allManagedChannelIds = new Set<string>()

  const isFullAccess = team === 'Support' || team === 'Managers' || role === 'admin'

  for (const ch of channels) {
    const chName = ch.name || ''

    // 1. "All" channel
    if (chName.toLowerCase() === 'all') {
      allManagedChannelIds.add(ch.id)
      targetChannelIds.add(ch.id)
      continue
    }

    // 2. "Admin" channel
    if (chName.toLowerCase() === 'admin') {
      allManagedChannelIds.add(ch.id)
      if (role === 'admin' || team === 'Managers') {
        targetChannelIds.add(ch.id)
      }
      continue
    }

    // 3. "Managers" channel — STRICT: ONLY team === 'Managers' (even if role === 'admin' or team === 'Support')
    if (chName.toLowerCase() === 'managers') {
      allManagedChannelIds.add(ch.id)
      if (team === 'Managers') {
        targetChannelIds.add(ch.id)
      }
      continue
    }

    // 4. Team channels (Sales, CSR, EA)
    const isTeamChannel = ['sales', 'csr', 'ea'].some(
      (t) => t === chName.toLowerCase()
    )
    if (isTeamChannel) {
      allManagedChannelIds.add(ch.id)
      if (isFullAccess || (team && TEAM_CHANNEL_MAP[team]?.toLowerCase() === chName.toLowerCase())) {
        targetChannelIds.add(ch.id)
      }
      continue
    }

    // 4. Office channels (matches CH / MB / MCM / RC even if renamed)
    let isOfficeChannel = false
    for (const offCode of Object.keys(OFFICE_CHANNEL_MAP)) {
      if (matchesOfficeChannel(ch, offCode)) {
        isOfficeChannel = true
        allManagedChannelIds.add(ch.id)
        if (isFullAccess || office?.toUpperCase() === offCode) {
          targetChannelIds.add(ch.id)
        }
        break
      }
    }
  }

  // Channels to JOIN
  const joinChannelIds = Array.from(targetChannelIds)

  // Channels to LEAVE (managed channels agent should NOT be in)
  const leaveChannelIds = Array.from(allManagedChannelIds).filter(
    (id) => !targetChannelIds.has(id)
  )

  // Upsert memberships for target channels
  if (joinChannelIds.length > 0) {
    const rows = joinChannelIds.map((cid) => ({
      conversation_id: cid,
      agent_id: agentId,
      role: 'member' as const,
    }))

    await supabase
      .from('chat_conversation_members')
      .upsert(rows, { onConflict: 'conversation_id,agent_id' })
  }

  // Remove memberships from channels agent shouldn't be in
  if (leaveChannelIds.length > 0) {
    await supabase
      .from('chat_conversation_members')
      .delete()
      .eq('agent_id', agentId)
      .in('conversation_id', leaveChannelIds)
  }
}

/**
 * Legacy alias — calls syncAgentDefaultChannels.
 * Kept for backward compatibility with existing callers.
 */
export async function autoJoinDefaultChannels(
  agentId: string,
  team: string,
  role: string,
): Promise<void> {
  // Fetch agent's office (not passed by legacy callers)
  const { data: agent } = await supabase
    .from('agents')
    .select('office')
    .eq('id', agentId)
    .single()

  await syncAgentDefaultChannels(agentId, team, agent?.office || '', role)
}

// ---------------------------------------------------------------------------
// Get members for a conversation
// ---------------------------------------------------------------------------

export async function getConversationMembers(
  conversationId: string,
): Promise<ConversationMember[]> {
  const { data, error } = await supabase
    .from('chat_conversation_members')
    .select('conversation_id, agent_id, role, last_read_at, joined_at, left_at, is_muted:muted, is_pinned:pinned, agent:agents(*)')
    .eq('conversation_id', conversationId)

  if (error) {
    console.error('[conversations] Failed to fetch members:', error)
    throw error
  }

  const raw = (data ?? []) as any[]
  const filtered = raw.filter(
    (m) =>
      m.agent &&
      m.agent.active !== false &&
      m.agent.report_visible !== false &&
      m.agent.team !== 'System' &&
      m.agent.name?.toLowerCase() !== 'other'
  )

  return filtered as unknown as ConversationMember[]
}
