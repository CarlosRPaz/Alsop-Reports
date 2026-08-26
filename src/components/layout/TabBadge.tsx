"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { useChat } from "@/lib/chat/chatContext"

const BRAND_NAME = "Alsop Reports"

const PAGE_TITLES: Record<string, string> = {
  "/": "Overview",
  "/reports/daily": "Daily Standup",
  "/reports/mtd": "MTD Summary",
  "/reports/quotes": "Quotes Report",
  "/reports/agent": "Agent Portal",
  "/reports/heatmap": "Activity Heatmap",
  "/reports/weekly": "Weekly Summary",
  "/rebel-rewards": "Rebel Rewards",
  "/communication": "Chat Hub",
  "/staff": "Staff Directory",
  "/admin/users": "User Management",
  "/admin/agents": "Agent Roster",
  "/admin/docs": "Documentation",
  "/admin/sync": "Sync Manager",
  "/settings": "Settings",
}

function getPageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]
  if (pathname.startsWith("/reports/agent/")) return "Agent Scorecard"
  if (pathname.startsWith("/admin/")) return "Admin Portal"
  if (pathname.startsWith("/reports/")) return "Reports"
  return "Dashboard"
}

/**
 * Dynamically updates the browser tab title:
 * 1. Default: "[Page Name] | Alsop Reports" (e.g. "Daily Standup | Alsop Reports")
 * 2. On New Chat: Alternates every 1.5s between:
 *    - "💬 [Sender] in #[Channel]: [Snippet] · Alsop Reports"
 *    - "(N) [Page Name] | Alsop Reports"
 * 3. On Read: Automatically resets back to "[Page Name] | Alsop Reports".
 */
export function TabBadge() {
  const pathname = usePathname()
  const { unreadCounts, latestMessageAlert } = useChat()
  const total = Object.values(unreadCounts || {}).reduce((sum, count) => sum + (count || 0), 0)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // Clear any active alternating interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    const pageName = getPageTitle(pathname)
    const baseTitle = `${pageName} | ${BRAND_NAME}`

    if (total > 0) {
      const countStr = total > 99 ? "99+" : `${total}`
      const standardUnreadTitle = `(${countStr}) ${pageName} | ${BRAND_NAME}`

      // Create rich sender/channel alert text
      let chatAlertTitle = `💬 (${countStr}) New Message${total > 1 ? "s" : ""} · ${BRAND_NAME}`
      if (latestMessageAlert) {
        const { senderName, convoName, content } = latestMessageAlert
        const isChannel = convoName && convoName !== "Group Chat" && convoName !== "New Message" && convoName !== senderName
        const target = isChannel ? `#${convoName}` : senderName
        const preview = content ? (content.length > 20 ? `${content.substring(0, 18)}...` : content) : "New message"

        if (isChannel) {
          chatAlertTitle = `💬 ${senderName} in ${target} · ${BRAND_NAME}`
        } else {
          chatAlertTitle = `💬 ${senderName}: "${preview}" · ${BRAND_NAME}`
        }
      }

      // Start immediately with the chat alert
      document.title = chatAlertTitle

      // Alternate every 1.5s between the rich alert and the unread count title
      let step = 0
      intervalRef.current = setInterval(() => {
        if (typeof document !== "undefined") {
          step++
          document.title = step % 2 === 0 ? chatAlertTitle : standardUnreadTitle
        }
      }, 1500)
    } else {
      document.title = baseTitle
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      document.title = `${getPageTitle(pathname)} | ${BRAND_NAME}`
    }
  }, [total, latestMessageAlert, pathname])

  return null
}

