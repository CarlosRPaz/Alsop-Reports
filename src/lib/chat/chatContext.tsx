'use client'

// ============================================================================
// Chat System — React Context & Provider
// ============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { Agent } from './types'
import { getPermissionsForAgent } from './permissions'
import {
  getUnreadCounts,
  requestDesktopPermission,
  sendDesktopNotification,
} from './notifications'
import { playNotificationSound } from './sound'
import {
  updatePresence,
  unsubscribeChannel,
  unsubscribeChannels,
  subscribeToAllConversations,
} from './realtime'
import type { RealtimeChannel } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

export interface LatestMessageAlert {
  senderName: string
  convoName: string
  content: string
  timestamp: number
}

export interface ChatContextValue {
  /** The currently signed-in agent, or `null` while loading / signed out. */
  currentAgent: Agent | null
  /** `true` while the initial agent hydration is in progress. */
  isLoading: boolean
  /** Sign in as a specific agent (stores ID in localStorage). */
  signIn: (agentId: string) => Promise<void>
  /** Sign out — clears identity and sets presence to offline. */
  signOut: () => void
  /** Pre-computed permission map: `{ [permissionKey]: boolean }`. */
  permissions: Record<string, boolean>
  /** Convenience helper — returns `false` if the key is unknown. */
  hasPermission: (key: string) => boolean
  /** Unread counts keyed by conversation ID. */
  unreadCounts: Record<string, number>
  /** Re-fetch unread counts from the server. */
  refreshUnreadCounts: () => Promise<void>
  /** Latest incoming message alert details for tab title notifications. */
  latestMessageAlert: LatestMessageAlert | null
}

const ChatContext = createContext<ChatContextValue | null>(null)

// ---------------------------------------------------------------------------
// localStorage key
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'chat_agent_id'

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ChatProvider({ children }: { children: ReactNode }) {
  const [currentAgent, setCurrentAgent] = useState<Agent | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [permissions, setPermissions] = useState<Record<string, boolean>>({})
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
  const [latestMessageAlert, setLatestMessageAlert] = useState<LatestMessageAlert | null>(null)

  // Keep a ref to the presence heartbeat interval so we can clear it on
  // unmount or sign-out.
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const globalChannelRef = useRef<RealtimeChannel[]>([])

  // -----------------------------------------------------------------------
  // Hydrate agent from localStorage on mount
  // -----------------------------------------------------------------------

  useEffect(() => {
    async function init() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          // 1. Try to find agent by matching auth_user_id
          const { data: agent } = await supabase
            .from('agents')
            .select('id')
            .eq('auth_user_id', user.id)
            .single()

          if (agent) {
            localStorage.setItem(STORAGE_KEY, agent.id)
            await hydrateAgent(agent.id)
            return
          }

          // 2. Fallback: try finding by email if auth_user_id is not linked yet
          if (user.email) {
            const { data: agentByEmail } = await supabase
              .from('agents')
              .select('id')
              .eq('email', user.email.trim().toLowerCase())
              .single()

            if (agentByEmail) {
              // Auto-link the auth_user_id
              await supabase
                .from('agents')
                .update({ auth_user_id: user.id })
                .eq('id', agentByEmail.id)

              localStorage.setItem(STORAGE_KEY, agentByEmail.id)
              await hydrateAgent(agentByEmail.id)
              return
            }
          }
        }
      } catch (err) {
        console.error('[chatContext] Failed to auto-resolve agent from session:', err)
      }

      // 3. Fallback to localStorage for legacy local development
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        await hydrateAgent(stored)
      }
    }

    init().finally(() => setIsLoading(false))

    const handleAgentUpdate = () => {
      const storedId = localStorage.getItem(STORAGE_KEY)
      if (storedId) hydrateAgent(storedId)
    }
    window.addEventListener('agent-updated', handleAgentUpdate)

    return () => {
      window.removeEventListener('agent-updated', handleAgentUpdate)
      // Cleanup heartbeat & channel on unmount
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      if (globalChannelRef.current.length > 0) {
        unsubscribeChannels(globalChannelRef.current)
        globalChannelRef.current = []
      }
    }
  }, [])

  // -----------------------------------------------------------------------
  // Core hydration — fetch agent row, permissions, unread counts
  // -----------------------------------------------------------------------

  async function hydrateAgent(agentId: string) {
    try {
      const { data: agent, error } = await supabase
        .from('agents')
        .select('*')
        .eq('id', agentId)
        .single()

      if (error || !agent) {
        console.error('[chatContext] Agent not found, clearing stored ID')
        localStorage.removeItem(STORAGE_KEY)
        setCurrentAgent(null)
        return
      }

      setCurrentAgent(agent as Agent)

      // Request browser desktop notification permissions silently
      requestDesktopPermission().catch(() => {})

      // Load permissions and unread counts in parallel
      const [perms, counts] = await Promise.all([
        getPermissionsForAgent(agentId),
        getUnreadCounts(agentId),
      ])

      setPermissions(perms)
      setUnreadCounts(counts)

      // Set presence to online
      await updatePresence(agentId, 'online')

      // Start presence heartbeat (every 60s)
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      heartbeatRef.current = setInterval(
        () => updatePresence(agentId, 'online'),
        60_000,
      )
    } catch (err) {
      console.error('[chatContext] Hydration failed:', err)
      localStorage.removeItem(STORAGE_KEY)
      setCurrentAgent(null)
    }
  }

  // -----------------------------------------------------------------------
  // Global Realtime Subscription for incoming messages, sound & desktop alerts
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!currentAgent) return

    let isSubscribed = true

    async function setupGlobalSubscription() {
      if (!currentAgent) return

      try {
        const { data: memberships } = await supabase
          .from('chat_conversation_members')
          .select('conversation_id')
          .eq('agent_id', currentAgent.id)

        if (!memberships || memberships.length === 0 || !isSubscribed) return

        const convIds = memberships.map((m) => m.conversation_id)

        // IMPORTANT: await cleanup of old channels BEFORE creating new ones.
        // Without await, the old channel teardown races with the new channel
        // setup, causing "cannot add postgres_changes callbacks after subscribe()"
        if (globalChannelRef.current.length > 0) {
          await unsubscribeChannels(globalChannelRef.current)
          globalChannelRef.current = []
        }

        if (!isSubscribed) return

        const channels = subscribeToAllConversations(currentAgent.id, convIds, {
          onNewMessage: async (msg) => {
            if (msg.sender_id === currentAgent.id) return

            // Play notification sound for all incoming messages from others
            playNotificationSound()

            // Refresh unread counts
            try {
              const counts = await getUnreadCounts(currentAgent.id)
              if (isSubscribed) setUnreadCounts(counts)
            } catch {}

            // Fetch sender & conversation details for Desktop Notification
            let senderName = 'Someone'
            let convoName = 'New Message'

            try {
              const [{ data: senderAgent }, { data: convo }] = await Promise.all([
                supabase.from('agents').select('name').eq('id', msg.sender_id).single(),
                supabase.from('chat_conversations').select('name, type').eq('id', msg.conversation_id).single(),
              ])

              if (senderAgent) senderName = senderAgent.name
              if (convo) convoName = convo.name || (convo.type === 'direct_dm' ? senderName : 'Group Chat')
            } catch (err) {
              console.error('Failed to resolve notification metadata:', err)
            }

            // Update tab alert state
            setLatestMessageAlert({
              senderName,
              convoName,
              content: msg.content,
              timestamp: Date.now(),
            })

            // Trigger native Desktop Notification (works across browser tabs & desktop windows)
            sendDesktopNotification(
              convoName,
              `${senderName}: ${msg.content.substring(0, 100)}`,
              () => {
                if (typeof window !== 'undefined') {
                  window.focus()
                  window.location.href = `/communication?id=${msg.conversation_id}`
                }
              }
            )
          },
        })

        globalChannelRef.current = channels
      } catch (err) {
        console.error('[chatContext] Failed to setup global subscription:', err)
      }
    }

    setupGlobalSubscription()

    return () => {
      isSubscribed = false
      if (globalChannelRef.current.length > 0) {
        unsubscribeChannels(globalChannelRef.current)
        globalChannelRef.current = []
      }
    }
  }, [currentAgent?.id])

  // -----------------------------------------------------------------------
  // Sign in
  // -----------------------------------------------------------------------

  const signIn = useCallback(async (agentId: string) => {
    setIsLoading(true)
    localStorage.setItem(STORAGE_KEY, agentId)
    await hydrateAgent(agentId)
    setIsLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // -----------------------------------------------------------------------
  // Sign out
  // -----------------------------------------------------------------------

  const signOut = useCallback(() => {
    const agentId = currentAgent?.id
    if (agentId) {
      updatePresence(agentId, 'offline').catch(() => {})
    }

    // Cleanup
    localStorage.removeItem(STORAGE_KEY)
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current)
      heartbeatRef.current = null
    }
    if (globalChannelRef.current.length > 0) {
      unsubscribeChannels(globalChannelRef.current)
      globalChannelRef.current = []
    }

    setCurrentAgent(null)
    setPermissions({})
    setUnreadCounts({})
  }, [currentAgent?.id])

  // -----------------------------------------------------------------------
  // Permission helper
  // -----------------------------------------------------------------------

  const hasPermission = useCallback(
    (key: string) => permissions[key] ?? false,
    [permissions],
  )

  // -----------------------------------------------------------------------
  // Refresh unread counts
  // -----------------------------------------------------------------------

  const refreshUnreadCounts = useCallback(async () => {
    if (!currentAgent) return
    try {
      const counts = await getUnreadCounts(currentAgent.id)
      setUnreadCounts(counts)
    } catch (err) {
      console.error('[chatContext] Failed to refresh unread counts:', err)
    }
  }, [currentAgent])

  // -----------------------------------------------------------------------
  // Memoized context value
  // -----------------------------------------------------------------------

  const value = useMemo<ChatContextValue>(
    () => ({
      currentAgent,
      isLoading,
      signIn,
      signOut,
      permissions,
      hasPermission,
      unreadCounts,
      refreshUnreadCounts,
      latestMessageAlert,
    }),
    [
      currentAgent,
      isLoading,
      signIn,
      signOut,
      permissions,
      hasPermission,
      unreadCounts,
      refreshUnreadCounts,
      latestMessageAlert,
    ],
  )

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Access the chat context. Must be used within a `<ChatProvider>`.
 */
export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext)
  if (!ctx) {
    throw new Error('useChat() must be used within a <ChatProvider>')
  }
  return ctx
}
