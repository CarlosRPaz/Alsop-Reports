"use client"

import { useEffect } from "react"
import { useChat } from "@/lib/chat/chatContext"

const BASE_TITLE = "DSR Command Center"

/**
 * Updates the browser tab title dynamically with the unread message count.
 * Shows: "(3) DSR Command Center" when there are 3 unread messages.
 * Reverts to: "DSR Command Center" when all messages are read.
 */
export function TabBadge() {
  const { unreadCounts } = useChat()
  const total = Object.values(unreadCounts || {}).reduce((sum, count) => sum + (count || 0), 0)

  useEffect(() => {
    if (total > 0) {
      document.title = `(${total > 99 ? "99+" : total}) ${BASE_TITLE}`
    } else {
      document.title = BASE_TITLE
    }

    return () => {
      document.title = BASE_TITLE
    }
  }, [total])

  return null
}
