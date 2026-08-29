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
  updatePresenceHeartbeat,
  sendPresenceOfflineBeacon,
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

export interface AgentPresenceData {
  presence: 'online' | 'away' | 'busy' | 'offline'
  status_message?: string | null
  last_seen_at?: string | null
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
  /** Set the agent's presence manually (Away/Busy/Online). Heartbeat won't overwrite manual statuses. */
  setManualPresence: (status: 'online' | 'away' | 'busy') => Promise<void>
  /** Live realtime presence map for all agents keyed by agent ID. */
  livePresenceMap: Record<string, AgentPresenceData>
  /** Helper to get an agent's true realtime presence. */
  getLivePresence: (agentId: string, fallback?: any) => 'online' | 'away' | 'busy' | 'offline'
  /** Helper to get an agent's true realtime status message. */
  getLiveStatusMessage: (agentId: string, fallback?: string | null) => string | null
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
  const [livePresenceMap, setLivePresenceMap] = useState<Record<string, AgentPresenceData>>({})

  // Notification preferences — defaults to everything ON
  const notifPrefsRef = useRef({
    desktop_enabled: true,
    toast_enabled: true,
    notify_on_dm: true,
    notify_on_mentions: true,
    notify_on_team_mentions: true,
    notify_on_urgent: true,
  })

  // Keep a ref to the presence heartbeat interval so we can clear it on
  // unmount or sign-out.
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const globalChannelRef = useRef<RealtimeChannel[]>([])
  // Track the agent's manually-chosen status so the heartbeat doesn't overwrite it.
  // 'online' is the default — 'away'/'busy' are manually set by the user.
  const manualStatusRef = useRef<'online' | 'away' | 'busy'>('online')
  // Keep a ref to the current agent ID for use in beforeunload/visibilitychange
  const agentIdRef = useRef<string | null>(null)
  const tabIdRef = useRef<string>(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  )

  const registerActiveTab = useCallback((agentId: string) => {
    try {
      const key = `active_tabs_${agentId}`
      const raw = localStorage.getItem(key)
      const tabs: Record<string, number> = raw ? JSON.parse(raw) : {}
      const now = Date.now()
      tabs[tabIdRef.current] = now
      // Clean up dead tabs older than 30s
      for (const [id, time] of Object.entries(tabs)) {
        if (now - time > 30000) {
          delete tabs[id]
        }
      }
      localStorage.setItem(key, JSON.stringify(tabs))
    } catch {}
  }, [])

  const unregisterTabAndCountRemaining = useCallback((agentId: string): number => {
    try {
      const key = `active_tabs_${agentId}`
      const raw = localStorage.getItem(key)
      const tabs: Record<string, number> = raw ? JSON.parse(raw) : {}
      delete tabs[tabIdRef.current]
      const now = Date.now()
      let count = 0
      for (const [id, time] of Object.entries(tabs)) {
        if (now - time <= 30000) {
          count++
        } else {
          delete tabs[id]
        }
      }
      localStorage.setItem(key, JSON.stringify(tabs))
      return count
    } catch {
      return 0
    }
  }, [])

  // -----------------------------------------------------------------------
  // Realtime Global Presence Subscription for all agents
  // -----------------------------------------------------------------------
  useEffect(() => {
    async function loadInitialPresence() {
      try {
        const { data: agents } = await supabase
          .from('agents')
          .select('id, presence, status_message, last_seen_at')
        if (agents) {
          const map: Record<string, AgentPresenceData> = {}
          agents.forEach((a: any) => {
            map[a.id] = {
              presence: a.presence || 'offline',
              status_message: a.status_message,
              last_seen_at: a.last_seen_at,
            }
          })
          setLivePresenceMap(map)
        }
      } catch (err) {
        console.error('[chatContext] Failed to load initial presence map:', err)
      }
    }

    loadInitialPresence()
    const pollInterval = setInterval(loadInitialPresence, 20_000)

    const presenceChannel = supabase
      .channel('public:agents-presence-feed')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'agents' },
        (payload: any) => {
          const updated = payload.new
          if (updated && updated.id) {
            setLivePresenceMap(prev => ({
              ...prev,
              [updated.id]: {
                presence: updated.presence || 'offline',
                status_message: updated.status_message,
                last_seen_at: updated.last_seen_at,
              },
            }))

            if (agentIdRef.current && agentIdRef.current === updated.id) {
              const currentAgentId = agentIdRef.current
              // If an external event or closed tab beacon marked this agent as offline in the DB,
              // but THIS tab is currently open and active:
              // Immediately re-assert our active presence so this open tab never gets knocked offline!
              if (updated.presence === 'offline') {
                const activeStatus = manualStatusRef.current || 'online'
                updatePresence(currentAgentId, activeStatus).catch(() => {})
                setCurrentAgent(prev => prev ? { ...prev, presence: activeStatus } : null)
                return
              }
              setCurrentAgent(prev => prev ? { ...prev, ...updated } : null)
            }
          }
        }
      )
      .subscribe()

    return () => {
      clearInterval(pollInterval)
      supabase.removeChannel(presenceChannel)
    }
  }, [])

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

      // Preserve busy or away if currently set on agent, otherwise bring online
      const initialStatus = (agent.presence === 'busy' || agent.presence === 'away') ? agent.presence : 'online'
      manualStatusRef.current = initialStatus
      registerActiveTab(agentId)

      setCurrentAgent({ ...agent, presence: initialStatus } as Agent)
      agentIdRef.current = agentId

      // Request browser desktop notification permissions
      requestDesktopPermission().catch(() => {})

      // Load permissions, unread counts, and notification preferences in parallel
      const [perms, counts, notifPrefsResult] = await Promise.all([
        getPermissionsForAgent(agentId),
        getUnreadCounts(agentId),
        supabase
          .from('chat_notification_preferences')
          .select('desktop_enabled, toast_enabled, notify_on_dm, notify_on_mentions, notify_on_team_mentions, notify_on_urgent')
          .eq('agent_id', agentId)
          .single(),
      ])

      setPermissions(perms)
      setUnreadCounts(counts)

      // Load notification preferences (defaults to everything ON if no row exists)
      if (notifPrefsResult.data) {
        notifPrefsRef.current = {
          desktop_enabled: notifPrefsResult.data.desktop_enabled ?? true,
          toast_enabled: notifPrefsResult.data.toast_enabled ?? true,
          notify_on_dm: notifPrefsResult.data.notify_on_dm ?? true,
          notify_on_mentions: notifPrefsResult.data.notify_on_mentions ?? true,
          notify_on_team_mentions: notifPrefsResult.data.notify_on_team_mentions ?? true,
          notify_on_urgent: notifPrefsResult.data.notify_on_urgent ?? true,
        }
      } else {
        // No preferences row exists — create one with all defaults ON
        notifPrefsRef.current = {
          desktop_enabled: true,
          toast_enabled: true,
          notify_on_dm: true,
          notify_on_mentions: true,
          notify_on_team_mentions: true,
          notify_on_urgent: true,
        }
        supabase
          .from('chat_notification_preferences')
          .upsert({
            agent_id: agentId,
            desktop_enabled: true,
            toast_enabled: true,
            notify_on_dm: true,
            notify_on_mentions: true,
            notify_on_team_mentions: true,
            notify_on_urgent: true,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'agent_id' })
          .then(() => {}, () => {})
      }

      // Track last activity time (for 30-min idle auto-away)
      const lastActivityTimeRef = { current: Date.now() }
      const isAutoAwayRef = { current: false }

      // Set presence to initial active status (defaults to online)
      await updatePresence(agentId, initialStatus)

      // Start presence heartbeat (every 15s)
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      heartbeatRef.current = setInterval(() => {
        registerActiveTab(agentId)
        const now = Date.now()
        const idleMs = now - lastActivityTimeRef.current

        // If inactive for > 30 minutes, automatically set to Away
        if (idleMs >= 30 * 60 * 1000) {
          if (!isAutoAwayRef.current && manualStatusRef.current !== 'busy') {
            isAutoAwayRef.current = true
            updatePresence(agentId, 'away').catch(() => {})
            setCurrentAgent(prev => prev ? { ...prev, presence: 'away' } as Agent : null)
          }
          updatePresenceHeartbeat(agentId, 'away').catch(() => {})
        } else {
          // Active on site: keep current status
          updatePresenceHeartbeat(agentId, manualStatusRef.current || 'online').catch(() => {})
        }
      }, 15_000)

      // User activity listeners: when active again after auto-away, restore to Online
      let lastThrottle = 0
      const handleUserActivity = () => {
        registerActiveTab(agentId)
        const now = Date.now()
        if (now - lastThrottle < 2000) return
        lastThrottle = now
        lastActivityTimeRef.current = now

        // If they were auto-set to Away after 30 min, restore to Online as soon as they are active
        if (isAutoAwayRef.current && agentIdRef.current) {
          isAutoAwayRef.current = false
          manualStatusRef.current = 'online'
          updatePresence(agentIdRef.current, 'online').catch(() => {})
          setCurrentAgent(prev => prev ? { ...prev, presence: 'online' } as Agent : null)
        }
      }

      const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll', 'click']
      ACTIVITY_EVENTS.forEach(ev => window.addEventListener(ev, handleUserActivity, { passive: true }))

      // When tab/site actually closes, send offline beacon ONLY IF this is the last open tab for this user
      const handleSiteExit = () => {
        if (agentIdRef.current) {
          const remainingTabs = unregisterTabAndCountRemaining(agentIdRef.current)
          if (remainingTabs === 0) {
            sendPresenceOfflineBeacon(agentIdRef.current)
          }
        }
      }
      window.addEventListener('pagehide', handleSiteExit)
      window.addEventListener('beforeunload', handleSiteExit)

      // Store cleanup functions for unmount
      const prevCleanup = (window as any).__chatPresenceCleanup
      if (prevCleanup) prevCleanup()
      ;(window as any).__chatPresenceCleanup = () => {
        ACTIVITY_EVENTS.forEach(ev => window.removeEventListener(ev, handleUserActivity))
        window.removeEventListener('pagehide', handleSiteExit)
        window.removeEventListener('beforeunload', handleSiteExit)
        if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      }
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

            // Fetch sender & conversation details for notifications
            let senderName = 'Someone'
            let convoName = 'New Message'
            let convoType = 'channel'

            try {
              const [{ data: senderAgent }, { data: convo }] = await Promise.all([
                supabase.from('agents').select('name').eq('id', msg.sender_id).single(),
                supabase.from('chat_conversations').select('name, type').eq('id', msg.conversation_id).single(),
              ])

              if (senderAgent) senderName = senderAgent.name
              if (convo) {
                convoType = convo.type || 'channel'
                convoName = convo.name || (convo.type === 'direct_dm' ? senderName : 'Group Chat')
              }
            } catch (err) {
              console.error('Failed to resolve notification metadata:', err)
            }

            // Check if this message type should be notified based on user preferences
            const prefs = notifPrefsRef.current
            const isDM = convoType === 'direct_dm'
            const shouldNotify = isDM ? prefs.notify_on_dm : true // channels always notify

            if (!shouldNotify) return

            // Update tab alert state (also triggers in-app toast via NotificationBridge)
            setLatestMessageAlert({
              senderName,
              convoName,
              content: msg.content,
              timestamp: Date.now(),
            })

            // Trigger native Desktop Notification if enabled in preferences
            if (prefs.desktop_enabled) {
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
            }
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

    // Cleanup presence lifecycle listeners
    const presenceCleanup = (window as any).__chatPresenceCleanup
    if (presenceCleanup) {
      presenceCleanup()
      delete (window as any).__chatPresenceCleanup
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

    agentIdRef.current = null
    manualStatusRef.current = 'online'
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
  // Manual presence setter — called from sidebar status dropdown
  // -----------------------------------------------------------------------

  const setManualPresence = useCallback(async (status: 'online' | 'away' | 'busy') => {
    if (!currentAgent) return
    manualStatusRef.current = status
    await updatePresence(currentAgent.id, status)
    // Update local agent state and livePresenceMap immediately
    setCurrentAgent(prev => prev ? { ...prev, presence: status } as Agent : null)
    setLivePresenceMap(prev => ({
      ...prev,
      [currentAgent.id]: {
        ...prev[currentAgent.id],
        presence: status,
        last_seen_at: new Date().toISOString(),
      },
    }))
  }, [currentAgent])

  // -----------------------------------------------------------------------
  // Live presence helpers
  // -----------------------------------------------------------------------

  const getLivePresence = useCallback(
    (agentId: string, fallback?: any): 'online' | 'away' | 'busy' | 'offline' => {
      if (agentIdRef.current && agentId === agentIdRef.current && currentAgent) {
        return currentAgent.presence || 'online'
      }
      const data = livePresenceMap[agentId]
      const presence = data?.presence ?? (typeof fallback === 'object' && fallback ? fallback.presence : fallback) ?? 'offline'
      const lastSeenAt = data?.last_seen_at ?? (typeof fallback === 'object' && fallback ? fallback.last_seen_at : null)

      if (presence === 'offline') return 'offline'
      if (presence === 'busy') return 'busy'

      if (!lastSeenAt) return 'offline'
      const lastSeen = new Date(lastSeenAt).getTime()
      const sixtyMinAgo = Date.now() - 60 * 60 * 1000
      if (lastSeen < sixtyMinAgo) return 'offline'

      return presence as 'online' | 'away' | 'busy' | 'offline'
    },
    [currentAgent, livePresenceMap]
  )

  const getLiveStatusMessage = useCallback(
    (agentId: string, fallback: string | null = null): string | null => {
      if (agentIdRef.current && agentId === agentIdRef.current && currentAgent) {
        return currentAgent.status_message ?? null
      }
      const data = livePresenceMap[agentId]
      return data?.status_message ?? fallback
    },
    [currentAgent, livePresenceMap]
  )

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
      setManualPresence,
      livePresenceMap,
      getLivePresence,
      getLiveStatusMessage,
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
      setManualPresence,
      livePresenceMap,
      getLivePresence,
      getLiveStatusMessage,
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
