"use client"

import { useEffect, useRef } from "react"
import { useChat } from "@/lib/chat/chatContext"

const BASE_TITLE = "DSR Command Center"

/**
 * Dynamically notifies the user in the browser tab title when new messages arrive.
 * - Flashes "💬 (N) New Message!" when there are unread chats.
 * - Alternates title smoothly when the tab is in the background (hidden) to catch the user's attention.
 * - Reverts back to "DSR Command Center" when all chats are read.
 */
export function TabBadge() {
  const { unreadCounts } = useChat()
  const total = Object.values(unreadCounts || {}).reduce((sum, count) => sum + (count || 0), 0)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // Clear any previous interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    if (total > 0) {
      const countStr = total > 99 ? "99+" : `${total}`
      const newMsgTitle = `💬 (${countStr}) New Message${total > 1 ? "s" : ""}!`
      const standardTitle = `(${countStr}) ${BASE_TITLE}`

      // Start with the clear new message indicator
      document.title = newMsgTitle

      // If document is in background, alternate title every 1.5s to draw attention
      let step = 0
      intervalRef.current = setInterval(() => {
        if (typeof document !== "undefined") {
          step++
          document.title = step % 2 === 0 ? newMsgTitle : standardTitle
        }
      }, 1500)
    } else {
      document.title = BASE_TITLE
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      document.title = BASE_TITLE
    }
  }, [total])

  return null
}

