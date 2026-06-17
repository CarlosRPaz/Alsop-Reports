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
import { getUnreadCounts } from './notifications'
import { updatePresence, unsubscribeChannel } from './realtime'
import type { RealtimeChannel } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

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

  // Keep a ref to the presence heartbeat interval so we can clear it on
  // unmount or sign-out.
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const globalChannelRef = useRef<RealtimeChannel | null>(null)

  // -----------------------------------------------------------------------
  // Hydrate agent from localStorage on mount
  // -----------------------------------------------------------------------

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      hydrateAgent(stored).finally(() => setIsLoading(false))
    } else {
      setIsLoading(false)
    }

    const handleAgentUpdate = () => {
      const storedId = localStorage.getItem(STORAGE_KEY)
      if (storedId) hydrateAgent(storedId)
    }
    window.addEventListener('agent-updated', handleAgentUpdate)

    return () => {
      window.removeEventListener('agent-updated', handleAgentUpdate)
      // Cleanup heartbeat & channel on unmount
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      if (globalChannelRef.current) {
        unsubscribeChannel(globalChannelRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (globalChannelRef.current) {
      unsubscribeChannel(globalChannelRef.current)
      globalChannelRef.current = null
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
