"use client"

import { useEffect, useState } from "react"
import { createSupabaseBrowserClient } from "@/lib/supabaseBrowser"

const BASE_TITLE = "DSR Command Center"

/**
 * Updates the browser tab title with the total unread message count.
 * Shows: "(3) DSR Command Center" when there are 3 unread messages.
 * Reverts to: "DSR Command Center" when all are read.
 *
 * Subscribes to real-time changes on chat_messages to stay up-to-date.
 * Mount this once in LayoutShell — it runs silently in the background.
 */
export function TabBadge() {
  const [total, setTotal] = useState(0)

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    let agentId: string | null = null

    async function fetchUnreadCount() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get the agent ID
      const { data: agent } = await supabase
        .from("agents")
        .select("id")
        .eq("auth_user_id", user.id)
        .single()

      if (!agent) return
      agentId = agent.id

      // Count unread messages across all conversations the agent is a member of
      const { data: memberships } = await supabase
        .from("chat_conversation_members")
        .select("conversation_id, last_read_at")
        .eq("agent_id", agentId)

      if (!memberships || memberships.length === 0) {
        setTotal(0)
        return
      }

      let unread = 0
      for (const m of memberships) {
        let query = supabase
          .from("chat_messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", m.conversation_id)
          .neq("sender_id", agentId)

        if (m.last_read_at) {
          query = query.gt("created_at", m.last_read_at)
        }

        const { count } = await query
        unread += count || 0
      }

      setTotal(unread)
    }

    fetchUnreadCount()

    // Subscribe to new messages to update count in real-time
    const channel = supabase
      .channel("tab-badge-unread")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        () => {
          // Re-fetch count when a new message arrives
          fetchUnreadCount()
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_conversation_members" },
        () => {
          // Re-fetch when last_read_at changes (user read messages)
          fetchUnreadCount()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      document.title = BASE_TITLE
    }
  }, [])

  // Update document title whenever total changes
  useEffect(() => {
    if (total > 0) {
      document.title = `(${total > 99 ? "99+" : total}) ${BASE_TITLE}`
    } else {
      document.title = BASE_TITLE
    }
  }, [total])

  return null
}
