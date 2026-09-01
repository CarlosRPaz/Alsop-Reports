'use client'

import { useRef, useEffect, useMemo, useCallback, useState } from 'react'
import { ArrowDown, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import MessageBubble from './MessageBubble'
import type { Message } from './types'

interface MessageListProps {
  messages: Message[]
  currentAgentId: string
  isLoading: boolean
  onReply: (messageId: string) => void
  onEdit: (messageId: string, newContent: string) => Promise<void> | void
  onDelete: (messageId: string) => void
  onPin: (messageId: string) => void
  onReact: (messageId: string, emoji: string) => void
  hasPermission: (key: string) => boolean
  isCompact?: boolean
}

function formatDateDivider(dateStr: string): string {
  const date = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  const isToday =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()

  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()

  if (isToday) return 'Today'
  if (isYesterday) return 'Yesterday'

  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
  })
}

function isSameDay(a: string, b: string): boolean {
  const d1 = new Date(a)
  const d2 = new Date(b)
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  )
}

/** Check whether two consecutive messages should be grouped (same sender, within 5 min) */
function shouldGroup(prev: Message, curr: Message): boolean {
  if (prev.sender_id !== curr.sender_id) return false
  if (prev.is_system || curr.is_system) return false
  if (prev.parent_message_id || curr.parent_message_id) return false // Replies should not be grouped
  const gap = new Date(curr.created_at).getTime() - new Date(prev.created_at).getTime()
  return gap < 5 * 60 * 1000 // 5 minutes
}

export default function MessageList({
  messages,
  currentAgentId,
  isLoading,
  onReply,
  onEdit,
  onDelete,
  onPin,
  onReact,
  hasPermission,
  isCompact = false,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [userScrolledUp, setUserScrolledUp] = useState(false)
  const isInitialLoadRef = useRef(true)

  const scrollToBottom = useCallback((smooth = false) => {
    if (scrollContainerRef.current) {
      if (smooth) {
        scrollContainerRef.current.scrollTo({
          top: scrollContainerRef.current.scrollHeight,
          behavior: 'smooth',
        })
      } else {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
      }
    }
    bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' })
    setShowScrollButton(false)
    setUserScrolledUp(false)
  }, [])

  // Snap to bottom immediately when messages finish loading or conversation loads
  useEffect(() => {
    if (!isLoading && messages.length > 0) {
      // Instant snap to bottom on initial render
      scrollToBottom(false)

      // Double-check after image/font layout reflows settle
      const timer1 = setTimeout(() => scrollToBottom(false), 50)
      const timer2 = setTimeout(() => scrollToBottom(false), 150)
      return () => {
        clearTimeout(timer1)
        clearTimeout(timer2)
      }
    }
  }, [isLoading, scrollToBottom])

  // When new messages are received while already viewing, smoothly scroll if user hasn't scrolled up
  useEffect(() => {
    if (isInitialLoadRef.current) {
      if (!isLoading && messages.length > 0) {
        isInitialLoadRef.current = false
      }
      return
    }

    if (!userScrolledUp && !isLoading && messages.length > 0) {
      scrollToBottom(true)
    }
  }, [messages.length, isLoading, userScrolledUp, scrollToBottom])

  // Track scroll position
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const isNearBottom = distanceFromBottom < 80
    setShowScrollButton(!isNearBottom)
    setUserScrolledUp(!isNearBottom)
  }, [])

  // Filter out deleted messages before rendering and grouping
  const activeMessages = useMemo(() => {
    return messages.filter(m => !m.is_deleted)
  }, [messages])

  // Build grouped message list with date dividers
  const renderedMessages = useMemo(() => {
    const result: React.ReactNode[] = []

    activeMessages.forEach((msg, idx) => {
      const prev = idx > 0 ? activeMessages[idx - 1] : null

      // Date divider
      if (!prev || !isSameDay(prev.created_at, msg.created_at)) {
        result.push(
          <div
            key={`date-${msg.created_at}`}
            className="flex items-center gap-3 px-4 py-3"
          >
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
              {formatDateDivider(msg.created_at)}
            </span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>
        )
      }

      const isGrouped = prev !== null && isSameDay(prev.created_at, msg.created_at) && shouldGroup(prev, msg)

      result.push(
        <MessageBubble
          key={msg.id}
          message={msg}
          currentAgentId={currentAgentId}
          isGrouped={isGrouped}
          onReply={onReply}
          onEdit={onEdit}
          onDelete={onDelete}
          onPin={onPin}
          onReact={onReact}
          hasPermission={hasPermission}
        />
      )
    })

    return result
  }, [activeMessages, currentAgentId, onReply, onEdit, onDelete, onPin, onReact, hasPermission])

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="flex-1 p-4 space-y-4 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-3 animate-pulse">
            <div className="w-8 h-8 rounded-full bg-slate-200 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-3 w-20 bg-slate-200 rounded" />
                <div className="h-3 w-12 bg-slate-100 rounded" />
              </div>
              <div className="h-4 bg-slate-100 rounded w-3/4" />
              {i % 3 === 0 && <div className="h-4 bg-slate-100 rounded w-1/2" />}
            </div>
          </div>
        ))}
      </div>
    )
  }

  // Empty state
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mb-4">
          <MessageSquare className="w-7 h-7 text-slate-400" />
        </div>
        <h3 className="text-base font-semibold text-slate-700 mb-1">
          No messages yet
        </h3>
        <p className="text-sm text-slate-400 text-center max-w-[280px]">
          Start the conversation! Send a message to get things going.
        </p>
      </div>
    )
  }

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="absolute inset-0 overflow-y-auto py-2"
      >
        {renderedMessages}
        <div ref={bottomRef} />
      </div>

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <button
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-4 right-4 w-9 h-9 bg-white border border-slate-200 rounded-full shadow-md flex items-center justify-center text-slate-500 hover:text-blue-600 hover:border-blue-200 transition-all z-20"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
