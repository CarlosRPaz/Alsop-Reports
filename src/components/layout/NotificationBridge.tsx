"use client"

import { useEffect, useRef } from "react"
import { useChat } from "@/lib/chat/chatContext"
import { useToast } from "@/components/ui/Toast"

/**
 * Bridge component that listens to incoming message alerts from ChatContext
 * and fires in-app toast notifications via the ToastProvider.
 * 
 * Must be rendered inside both <ChatProvider> and <ToastProvider>.
 */
export function NotificationBridge() {
  const { latestMessageAlert } = useChat()
  const { addToast } = useToast()
  const lastTimestampRef = useRef<number>(0)

  useEffect(() => {
    if (!latestMessageAlert) return
    // Prevent duplicate fires for the same alert
    if (latestMessageAlert.timestamp <= lastTimestampRef.current) return
    lastTimestampRef.current = latestMessageAlert.timestamp

    const { senderName, convoName, content } = latestMessageAlert

    // Build a clean preview (strip HTML tags from rich text content)
    const cleanContent = content
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    const isChannel = convoName && convoName !== 'Group Chat' && convoName !== 'New Message' && convoName !== senderName
    const title = isChannel ? `💬 ${senderName} in #${convoName}` : `💬 ${senderName}`
    const preview = cleanContent.length > 80 ? `${cleanContent.substring(0, 78)}...` : cleanContent

    addToast({
      title,
      message: preview || 'New message',
      variant: 'notification',
      duration: 0, // Persistent — stays until manually dismissed
    })
  }, [latestMessageAlert, addToast])

  return null
}
