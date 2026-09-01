"use client"

import { useEffect, useRef } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useChat } from "@/lib/chat/chatContext"
import { useToast } from "@/components/ui/Toast"

/**
 * Bridge component that listens to incoming message alerts from ChatContext
 * and fires in-app toast notifications via the ToastProvider.
 * 
 * Must be rendered inside both <ChatProvider> and <ToastProvider>.
 */
export function NotificationBridge() {
  const { latestMessageAlert, unreadCounts } = useChat()
  const { addToast, dismissToasts } = useToast()
  const router = useRouter()
  const pathname = usePathname()
  const lastTimestampRef = useRef<number>(0)

  useEffect(() => {
    if (!latestMessageAlert) return
    // Prevent duplicate fires for the same alert
    if (latestMessageAlert.timestamp <= lastTimestampRef.current) return
    lastTimestampRef.current = latestMessageAlert.timestamp

    const { senderName, convoName, content, conversationId } = latestMessageAlert

    // Build a clean preview (strip HTML tags from rich text content)
    const cleanContent = content
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    const isChannel = convoName && convoName !== 'Group Chat' && convoName !== 'New Message' && convoName !== senderName
    const title = isChannel ? `💬 ${senderName} in #${convoName}` : `💬 ${senderName}`
    const preview = cleanContent.length > 80 ? `${cleanContent.substring(0, 78)}...` : cleanContent

    // Consolidate popups for the same conversation
    dismissToasts((t) => t.metadata?.conversationId === conversationId)

    const unreadCount = unreadCounts[conversationId] || 1
    const displayMessage = unreadCount > 1 
      ? `(${unreadCount} unread) ${preview}` 
      : preview || 'New message'

    // Check user preference for persistent toasts
    const isPersistent = typeof window !== 'undefined' && localStorage.getItem('persistent_toasts') === 'true';

    addToast({
      title,
      message: displayMessage,
      variant: 'notification',
      duration: isPersistent ? 0 : 10000, // 0 = Persistent, 10000 = 10s
      metadata: { conversationId },
      onClick: () => {
        // Only route if not in the popout widget
        if (pathname !== '/communication/popout') {
          router.push(`/communication?id=${conversationId}`)
        }
      }
    })
  }, [latestMessageAlert, addToast, dismissToasts, router, pathname, unreadCounts])

  return null
}
