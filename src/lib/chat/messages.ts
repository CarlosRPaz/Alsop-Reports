// ============================================================================
// Chat System — Message Operations
// ============================================================================

import { supabase } from '@/lib/supabaseClient'
import type { Message, MessagePreview, ReactionGroup, SendMessageInput } from './types'

// ---------------------------------------------------------------------------
// Fetch messages (paginated)
// ---------------------------------------------------------------------------

/**
 * Fetch messages for a conversation with cursor-based pagination.
 *
 * - Newest first by default
 * - Includes sender info (name, avatar, role, team)
 * - Groups reactions by emoji
 * - Includes parent message preview for threaded replies
 * - Soft-deleted messages get their content replaced with placeholder text
 */
export async function fetchMessages(
  conversationId: string,
  limit = 50,
  before?: string,
): Promise<Message[]> {
  let query = supabase
    .from('chat_messages')
    .select(
      `
      *,
      sender:agents!chat_messages_sender_id_fkey(id, name, office, avatar_url, role, team, status_message, presence),
      reactions:chat_message_reactions(id, agent_id, emoji, created_at, agents(id, name))
    `,
    )
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (before) {
    query = query.lt('created_at', before)
  }

  const { data, error } = await query

  if (error) {
    console.error('[messages] Failed to fetch messages:', error)
    throw error
  }

  if (!data) return []

  // Collect parent_message_ids to fetch previews in a single query
  const parentIds = [
    ...new Set(
      data
        .filter((m: any) => m.parent_message_id)
        .map((m: any) => m.parent_message_id as string),
    ),
  ]

  let parentMap = new Map<string, MessagePreview>()
  if (parentIds.length > 0) {
    const { data: parents } = await supabase
      .from('chat_messages')
      .select('id, content, created_at, sender_id, agents!chat_messages_sender_id_fkey(name)')
      .in('id', parentIds)

    if (parents) {
      parentMap = new Map(
        parents.map((p: any) => [
          p.id,
          {
            id: p.id,
            content: p.is_deleted ? 'Message deleted' : p.content,
            sender_name: p.agents?.name ?? 'Unknown',
            created_at: p.created_at,
          } satisfies MessagePreview,
        ]),
      )
    }
  }

  // Enrich each message
  return data.map((row: any) => {
    // Group reactions by emoji
    const rawReactions: any[] = row.reactions ?? []
    const reactionGroups = groupReactions(rawReactions)

    // Mask deleted content
    const content = row.is_deleted ? 'Message deleted' : row.content

    return {
      ...row,
      content,
      sender: row.sender ?? undefined,
      reactions: reactionGroups,
      parent_preview: row.parent_message_id
        ? parentMap.get(row.parent_message_id) ?? null
        : null,
    } as Message
  })
}

/** Group flat reaction rows into `{ emoji, count, agent_ids, agent_names }` */
function groupReactions(reactions: any[]): ReactionGroup[] {
  const map = new Map<string, { agentIds: string[]; agentNames: string[] }>()
  for (const r of reactions) {
    const existing = map.get(r.emoji) ?? { agentIds: [], agentNames: [] }
    existing.agentIds.push(r.agent_id)
    const agentName = r.agents?.name || r.agent?.name || 'Someone'
    existing.agentNames.push(agentName)
    map.set(r.emoji, existing)
  }
  return [...map.entries()].map(([emoji, val]) => ({
    emoji,
    count: val.agentIds.length,
    agent_ids: val.agentIds,
    agent_names: val.agentNames,
  }))
}

// ---------------------------------------------------------------------------
// Send message
// ---------------------------------------------------------------------------

/**
 * Insert a new message and return it with sender info.
 */
export async function sendMessage(data: SendMessageInput): Promise<Message> {
  const { data: msg, error } = await supabase
    .from('chat_messages')
    .insert({
      conversation_id: data.conversation_id,
      sender_id: data.sender_id,
      content: data.content,
      parent_message_id: data.parent_message_id ?? null,
    })
    .select(
      `
      *,
      sender:agents!chat_messages_sender_id_fkey(id, name, office, avatar_url, role, team, status_message, presence)
    `,
    )
    .single()

  if (error || !msg) {
    console.error('[messages] Failed to send message:', error)
    throw error
  }

  // Update conversation timestamp so it bubbles to the top
  await supabase
    .from('chat_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', data.conversation_id)

  return { ...msg, reactions: [] } as unknown as Message
}

// ---------------------------------------------------------------------------
// Edit message
// ---------------------------------------------------------------------------

export async function editMessage(
  messageId: string,
  newContent: string,
): Promise<void> {
  const { error } = await supabase
    .from('chat_messages')
    .update({
      content: newContent,
      is_edited: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', messageId)

  if (error) {
    console.error('[messages] Failed to edit message:', error)
    throw error
  }
}

// ---------------------------------------------------------------------------
// Soft-delete message
// ---------------------------------------------------------------------------

export async function deleteMessage(
  messageId: string,
  deletedBy: string,
): Promise<void> {
  const { error } = await supabase
    .from('chat_messages')
    .update({
      is_deleted: true,
      deleted_by: deletedBy,
      deleted_at: new Date().toISOString(),
    })
    .eq('id', messageId)

  if (error) {
    console.error('[messages] Failed to delete message:', error)
    throw error
  }
}

// ---------------------------------------------------------------------------
// Pin / Unpin
// ---------------------------------------------------------------------------

export async function pinMessage(
  messageId: string,
  pinnedBy: string,
): Promise<void> {
  const { error } = await supabase
    .from('chat_messages')
    .update({
      is_pinned: true,
      pinned_by: pinnedBy,
      pinned_at: new Date().toISOString(),
    })
    .eq('id', messageId)

  if (error) {
    console.error('[messages] Failed to pin message:', error)
    throw error
  }
}

export async function unpinMessage(messageId: string): Promise<void> {
  const { error } = await supabase
    .from('chat_messages')
    .update({
      is_pinned: false,
      pinned_by: null,
      pinned_at: null,
    })
    .eq('id', messageId)

  if (error) {
    console.error('[messages] Failed to unpin message:', error)
    throw error
  }
}

export async function getPinnedMessages(
  conversationId: string,
): Promise<Message[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select(
      `
      *,
      sender:agents!chat_messages_sender_id_fkey(id, name, office, avatar_url, role, team, status_message, presence)
    `,
    )
    .eq('conversation_id', conversationId)
    .eq('is_pinned', true)
    .eq('is_deleted', false)
    .order('pinned_at', { ascending: false })

  if (error) {
    console.error('[messages] Failed to fetch pinned messages:', error)
    throw error
  }

  return (data ?? []) as unknown as Message[]
}

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

export async function addReaction(
  messageId: string,
  agentId: string,
  emoji: string,
): Promise<void> {
  const { error } = await supabase
    .from('chat_message_reactions')
    .upsert(
      { message_id: messageId, agent_id: agentId, emoji },
      { onConflict: 'message_id,agent_id,emoji' },
    )

  if (error) {
    console.error('[messages] Failed to add reaction:', error)
    throw error
  }
}

export async function removeReaction(
  messageId: string,
  agentId: string,
  emoji: string,
): Promise<void> {
  const { error } = await supabase
    .from('chat_message_reactions')
    .delete()
    .eq('message_id', messageId)
    .eq('agent_id', agentId)
    .eq('emoji', emoji)

  if (error) {
    console.error('[messages] Failed to remove reaction:', error)
    throw error
  }
}
