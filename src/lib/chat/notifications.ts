// ============================================================================
// Chat System — Notification Management
// ============================================================================

import { supabase } from '@/lib/supabaseClient'
import type { ChatNotification, CreateNotificationInput } from './types'

// ---------------------------------------------------------------------------
// Unread counts
// ---------------------------------------------------------------------------

/**
 * Compute unread message counts for every conversation the agent belongs to.
 * Returns `{ [conversationId]: unreadCount }`.
 *
 * A message is "unread" if it was created after the member's `last_read_at`
 * and was not sent by the agent themselves.
 */
export async function getUnreadCounts(
  agentId: string,
): Promise<Record<string, number>> {
  // 1. Get all memberships
  const { data: memberships, error } = await supabase
    .from('chat_conversation_members')
    .select('conversation_id, last_read_at')
    .eq('agent_id', agentId)

  if (error) {
    console.error('[notifications] Failed to fetch memberships:', error)
    throw error
  }

  if (!memberships || memberships.length === 0) return {}

  // 2. Count unread for each conversation in parallel
  const counts: Record<string, number> = {}

  await Promise.all(
    memberships.map(async (m) => {
      const lastRead = m.last_read_at ?? '1970-01-01T00:00:00Z'

      const { count } = await supabase
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', m.conversation_id)
        .eq('is_deleted', false)
        .neq('sender_id', agentId)
        .gt('created_at', lastRead)

      counts[m.conversation_id] = count ?? 0
    }),
  )

  return counts
}

// ---------------------------------------------------------------------------
// Mark conversation as read
// ---------------------------------------------------------------------------

/**
 * Set `last_read_at` to the current timestamp for a specific membership.
 */
export async function markConversationRead(
  conversationId: string,
  agentId: string,
): Promise<void> {
  const { error } = await supabase
    .from('chat_conversation_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('agent_id', agentId)

  if (error) {
    console.error('[notifications] Failed to mark conversation read:', error)
    throw error
  }
}

// ---------------------------------------------------------------------------
// Notification CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new notification row in `chat_notifications`.
 */
export async function createNotification(
  data: CreateNotificationInput,
): Promise<void> {
  const { error } = await supabase.from('chat_notifications').insert({
    recipient_id: data.agent_id,
    type: data.type,
    title: data.title,
    body: data.body,
    conversation_id: data.conversation_id ?? null,
    message_id: data.message_id ?? null,
    is_read: false,
  })

  if (error) {
    console.error('[notifications] Failed to create notification:', error)
    throw error
  }
}

/**
 * Fetch notifications for an agent, optionally filtered to unread only.
 * Sorted newest-first.
 */
export async function getNotifications(
  agentId: string,
  unreadOnly = false,
): Promise<ChatNotification[]> {
  let query = supabase
    .from('chat_notifications')
    .select('*')
    .eq('recipient_id', agentId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (unreadOnly) {
    query = query.eq('is_read', false)
  }

  const { data, error } = await query

  if (error) {
    console.error('[notifications] Failed to fetch notifications:', error)
    throw error
  }

  return (data ?? []) as ChatNotification[]
}

/**
 * Mark a single notification as read.
 */
export async function markNotificationRead(
  notificationId: string,
): Promise<void> {
  const { error } = await supabase
    .from('chat_notifications')
    .update({ is_read: true })
    .eq('id', notificationId)

  if (error) {
    console.error('[notifications] Failed to mark notification read:', error)
    throw error
  }
}

/**
 * Mark all of an agent's notifications as read.
 */
export async function markAllNotificationsRead(
  agentId: string,
): Promise<void> {
  const { error } = await supabase
    .from('chat_notifications')
    .update({ is_read: true })
    .eq('recipient_id', agentId)
    .eq('is_read', false)

  if (error) {
    console.error('[notifications] Failed to mark all notifications read:', error)
    throw error
  }
}

// ---------------------------------------------------------------------------
// Desktop (browser) notifications
// ---------------------------------------------------------------------------

/**
 * Request permission to display desktop notifications via the browser
 * Notification API. Returns the resulting permission state.
 */
export function requestDesktopPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return Promise.resolve('denied' as NotificationPermission)
  }

  if (Notification.permission === 'granted') {
    return Promise.resolve('granted')
  }

  return Notification.requestPermission()
}

/**
 * Display a native desktop notification.
 * Silently no-ops if permission hasn't been granted or if running on the
 * server side.
 */
export function sendDesktopNotification(
  title: string,
  body: string,
  onClick?: () => void,
): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return

  const notification = new Notification(title, {
    body,
    icon: '/favicon.ico',
    tag: `chat-${Date.now()}`, // prevent duplicate stacking
  })

  if (onClick) {
    notification.onclick = () => {
      window.focus()
      onClick()
      notification.close()
    }
  }

  // Auto-close after 5 seconds
  setTimeout(() => notification.close(), 5000)
}
