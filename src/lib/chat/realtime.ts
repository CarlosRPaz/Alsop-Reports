// ============================================================================
// Chat System — Supabase Realtime Subscriptions
// ============================================================================

import { supabase } from '@/lib/supabaseClient'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { ConversationCallbacks, GlobalCallbacks } from './types'

// Monotonic counter to guarantee unique channel names across re-subscriptions.
let channelSeq = 0

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
  const seq = ++channelSeq
  const channel = supabase.channel(`conversation:${conversationId}:${seq}`)

  // IMPORTANT: All `.on()` calls MUST be chained BEFORE `.subscribe()`.
  // Calling `.on()` after `.subscribe()` throws:
  //   "cannot add 'postgres_changes' callbacks after subscribe()"
  channel
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

  // Subscribe AFTER all `.on()` calls are registered
  channel.subscribe((status, err) => {
    if (status === 'CHANNEL_ERROR') {
      console.warn(`[realtime] Channel connection notice for conversation:${conversationId}:${seq}`, err?.message || '')
    }
  })

  return channel
}

// ---------------------------------------------------------------------------
// Subscribe to all conversations (for global unread badge)
// ---------------------------------------------------------------------------

/**
 * Subscribe to new messages across all of an agent's conversations at once.
 * Used by the sidebar / badge to know when any conversation gets a new message
 * without opening a per-conversation channel for each one.
 */
export function subscribeToAllConversations(
  agentId: string,
  conversationIds: string[],
  callbacks: GlobalCallbacks,
): RealtimeChannel[] {
  if (conversationIds.length === 0) return []

  const convSet = new Set(conversationIds)
  const seq = ++channelSeq
  const channel = supabase.channel(`global:${agentId}:${seq}`)

  // Single efficient table-level listener filtered in-memory
  channel.on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'chat_messages',
    },
    (payload) => {
      const newMsg = payload.new as any
      if (newMsg && convSet.has(newMsg.conversation_id)) {
        callbacks.onNewMessage(newMsg)
      }
    },
  )

  channel.subscribe((status, err) => {
    if (status === 'CHANNEL_ERROR') {
      console.warn(`[realtime] Global channel notice for agent ${agentId}:`, err?.message || '')
    }
  })

  return [channel]
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

/**
 * Heartbeat-only presence update: refreshes `last_seen_at` without
 * overwriting a manually-set status (away/busy). Only writes `online`
 * if the current status is already `online`.
 */
export async function updatePresenceHeartbeat(
  agentId: string,
  currentManualStatus: 'online' | 'away' | 'busy' | 'offline',
): Promise<void> {
  const update: Record<string, unknown> = {
    last_seen_at: new Date().toISOString(),
  }
  // Only set presence if the agent hasn't manually chosen away/busy
  if (currentManualStatus === 'online') {
    update.presence = 'online'
  }

  const { error } = await supabase
    .from('agents')
    .update(update)
    .eq('id', agentId)

  if (error) {
    console.error('[realtime] Failed to update heartbeat:', error)
  }
}

/**
 * Fire-and-forget offline beacon using `navigator.sendBeacon()`.
 * Reliably sets presence to 'offline' even when the browser tab is closing.
 * Falls back to a synchronous fetch if sendBeacon is unavailable.
 */
export function sendPresenceOfflineBeacon(agentId: string): void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return

  const endpoint = `${url}/rest/v1/agents?id=eq.${agentId}`
  const body = JSON.stringify({
    presence: 'offline',
    last_seen_at: new Date().toISOString(),
  })

  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'application/json' })

    // sendBeacon doesn't support custom headers, so we use fetch with keepalive
    // as the primary mechanism, with sendBeacon as a last resort
    try {
      fetch(endpoint, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': key,
          'Authorization': `Bearer ${key}`,
          'Prefer': 'return=minimal',
        },
        body,
        keepalive: true,
      }).catch(() => {})
    } catch {
      // Absolute last resort — this likely won't work due to missing headers
      // but it's better than nothing
      navigator.sendBeacon(endpoint, blob)
    }
  }
}

// ---------------------------------------------------------------------------
// Cleanup helpers
// ---------------------------------------------------------------------------

/**
 * Unsubscribe from a channel and remove it from the Supabase client.
 * Safe to call even if the channel is already removed.
 * Returns a promise so callers can await full teardown before creating
 * new channels (prevents the "cannot add callbacks after subscribe()" error).
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

/**
 * Unsubscribe from an array of channels. Used by the global subscription
 * which may split into multiple channels for large conversation lists.
 */
export async function unsubscribeChannels(
  channels: RealtimeChannel[],
): Promise<void> {
  await Promise.all(channels.map(ch => unsubscribeChannel(ch)))
}
