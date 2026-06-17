'use client'

import { useEffect, useState } from 'react'
import { X, Pin, CornerUpLeft, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getPinnedMessages } from '@/lib/chat/messages'
import type { Message } from './types'

interface PinnedMessagesPanelProps {
  conversationId: string
  onClose: () => void
  onJumpToMessage: (messageId: string) => void
  onUnpinMessage: (messageId: string) => Promise<void>
}

const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-indigo-500',
  'bg-teal-500',
]

function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function PinnedMessagesPanel({
  conversationId,
  onClose,
  onJumpToMessage,
  onUnpinMessage,
}: PinnedMessagesPanelProps) {
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadPinned = async () => {
    setIsLoading(true)
    try {
      const msgs = await getPinnedMessages(conversationId)
      setPinnedMessages(msgs)
    } catch (err) {
      console.error('Failed to load pinned messages:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadPinned()
  }, [conversationId])

  const handleUnpin = async (messageId: string) => {
    try {
      await onUnpinMessage(messageId)
      // Optimistically remove from list
      setPinnedMessages(prev => prev.filter(m => m.id !== messageId))
    } catch (err) {
      console.error('Failed to unpin message:', err)
    }
  }

  return (
    <div className="w-[300px] sm:w-[350px] border-l border-slate-200 bg-white flex flex-col h-full shrink-0 select-none animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-2 text-slate-700">
          <Pin className="w-4 h-4 text-amber-500 shrink-0" />
          <h3 className="text-sm font-semibold">Pinned Messages</h3>
          <span className="text-xs bg-slate-200/80 text-slate-600 px-1.5 py-0.5 rounded-full font-medium">
            {pinnedMessages.length}
          </span>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          title="Close panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
            <span className="text-xs">Loading pins...</span>
          </div>
        ) : pinnedMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400">
            <div className="w-10 h-10 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center mb-3">
              <Pin className="w-4 h-4 text-slate-300" />
            </div>
            <h4 className="text-xs font-semibold text-slate-600 mb-1">No pinned messages</h4>
            <p className="text-[11px] text-slate-400 max-w-[200px]">
              Pin important messages from the message menu to save them here.
            </p>
          </div>
        ) : (
          pinnedMessages.map((msg) => {
            const senderName = msg.sender?.name ?? 'Unknown'
            return (
              <div
                key={msg.id}
                className="group relative border border-slate-200/80 rounded-lg p-3 hover:border-slate-300 hover:bg-slate-50/35 transition-all flex flex-col gap-2"
              >
                {/* Message Header */}
                <div className="flex items-center gap-2 justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={cn(
                        'w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0',
                        getAvatarColor(senderName)
                      )}
                    >
                      {senderName.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-xs font-bold text-slate-700 truncate">
                      {senderName}
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {formatTime(msg.created_at)}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleUnpin(msg.id)}
                      className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Unpin"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Message Content */}
                <div className="text-xs text-slate-600 line-clamp-3 break-words whitespace-pre-wrap pl-1 border-l border-slate-100">
                  {msg.content}
                </div>

                {/* Jump Button */}
                <button
                  onClick={() => onJumpToMessage(msg.id)}
                  className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:text-blue-700 w-fit pl-1 transition-colors self-start"
                >
                  <CornerUpLeft className="w-3 h-3" />
                  Jump to message
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
