// ============================================================================
// Chat System — Supabase Realtime Subscriptions
// ============================================================================

import { supabase } from '@/lib/supabaseClient'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { ConversationCallbacks, GlobalCallbacks } from './types'

// ---------------------------------------------------------------------------
// Subscribe to a single conversation
// ---------------------------------------------------------------------------

/**
 * Subscribe to real-time events for a specific conversation:
 *  - INSERT on chat_messages  → onNewMessage
 *  - UPDATE on chat_messages  → onMessageUpdate
 *  - DELETE on chat_messages  → onMessageDelete
 *  - INSERT on chat_message_reactions → onNewReaction
 *
 * Returns the RealtimeChannel so the caller can unsubscribe:
 *   `channel.unsubscribe()`
 */
export function subscribeToConversation(
  conversationId: string,
  callbacks: ConversationCallbacks,
): RealtimeChannel {
  const channel = supabase
    .channel(`conversation:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => callbacks.onNewMessage(payload.new as any),
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'chat_messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => callbacks.onMessageUpdate(payload.new as any),
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'chat_messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => callbacks.onMessageDelete(payload.old as any),
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_message_reactions',
      },
      (payload) => {
        // Only forward reactions for messages in this conversation.
        // Supabase doesn't support multi-table joins on filters, so we
        // let the caller filter if necessary — most UIs already scope to
        // the current conversation's message IDs.
        callbacks.onNewReaction(payload.new as any)
      },
    )
    .subscribe()

  return channel
}

// ---------------------------------------------------------------------------
// Subscribe to all conversations (for global unread badge)
// ---------------------------------------------------------------------------

/**
 * Subscribe to new messages across all of an agent's conversations at once.
 * Used by the sidebar / badge to know when any conversation gets a new message
 * without opening a per-conversation channel for each one.
 *
 * This creates a single channel with multiple filters — one per conversation
 * ID. For agents with very many conversations, consider debouncing or
 * batching.
 */
export function subscribeToAllConversations(
  agentId: string,
  conversationIds: string[],
  callbacks: GlobalCallbacks,
): RealtimeChannel {
  const channel = supabase.channel(`global:${agentId}`)

  for (const convId of conversationIds) {
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `conversation_id=eq.${convId}`,
      },
      (payload) => callbacks.onNewMessage(payload.new as any),
    )
  }

  channel.subscribe()
  return channel
}

// ---------------------------------------------------------------------------
// Presence
// ---------------------------------------------------------------------------

/**
 * Update the agent's presence status and last-seen timestamp in the `agents`
 * table. Call on login, status change, and periodically as a heartbeat.
 */
export async function updatePresence(
  agentId: string,
  status: 'online' | 'away' | 'busy' | 'offline',
): Promise<void> {
  const { error } = await supabase
    .from('agents')
    .update({
      presence: status,
      last_seen_at: new Date().toISOString(),
    })
    .eq('id', agentId)

  if (error) {
    console.error('[realtime] Failed to update presence:', error)
    throw error
  }
}

// ---------------------------------------------------------------------------
// Cleanup helper
// ---------------------------------------------------------------------------

/**
 * Unsubscribe from a channel and remove it from the Supabase client.
 * Safe to call even if the channel is already removed.
 */
export async function unsubscribeChannel(
  channel: RealtimeChannel,
): Promise<void> {
  try {
    await supabase.removeChannel(channel)
  } catch {
    // Channel may already be removed — swallow the error
  }
}
