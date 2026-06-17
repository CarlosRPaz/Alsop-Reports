'use client'

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type KeyboardEvent,
  type ChangeEvent,
} from 'react'
import { Send, X, ChevronDown, AlertTriangle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import MentionAutocomplete from './MentionAutocomplete'
import type { Agent, Message } from './types'

interface MessageComposerProps {
  conversationId: string
  currentAgentId: string
  replyTo: Message | null
  members: Agent[]
  onSend: (content: string, parentId?: string, priority?: string) => Promise<void>
  onCancelReply: () => void
  hasPermission: (key: string) => boolean
}

type PriorityLevel = 'normal' | 'important' | 'urgent'

const PRIORITY_OPTIONS: { value: PriorityLevel; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'normal', label: 'Normal', icon: null, color: 'text-slate-600' },
  {
    value: 'important',
    label: 'Important',
    icon: <AlertTriangle className="w-3 h-3 text-amber-500" />,
    color: 'text-amber-600',
  },
  {
    value: 'urgent',
    label: 'Urgent',
    icon: <AlertCircle className="w-3 h-3 text-red-500" />,
    color: 'text-red-600',
  },
]

export default function MessageComposer({
  conversationId,
  currentAgentId,
  replyTo,
  members,
  onSend,
  onCancelReply,
  hasPermission,
}: MessageComposerProps) {
  const [content, setContent] = useState('')
  const [priority, setPriority] = useState<PriorityLevel>('normal')
  const [isSending, setIsSending] = useState(false)
  const [showPriority, setShowPriority] = useState(false)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 })
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [content])

  // Focus textarea on mount and conversation change
  useEffect(() => {
    textareaRef.current?.focus()
  }, [conversationId, replyTo])

  const handleSend = useCallback(async () => {
    const text = content.trim()
    if (!text || isSending) return

    setIsSending(true)
    try {
      await onSend(text, replyTo?.id, priority)
      setContent('')
      setPriority('normal')
    } finally {
      setIsSending(false)
    }
  }, [content, isSending, onSend, replyTo, priority])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Don't intercept if mention picker is open
      if (mentionQuery !== null) return

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend, mentionQuery]
  )

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value
      setContent(val)

      // Check for @ mention trigger
      const cursorPos = e.target.selectionStart
      const textBefore = val.slice(0, cursorPos)
      const atMatch = textBefore.match(/@(\w*)$/)

      if (atMatch) {
        setMentionQuery(atMatch[1])
        // Calculate position (approximate)
        const rect = e.target.getBoundingClientRect()
        setMentionPosition({
          top: rect.top,
          left: rect.left + 20,
        })
      } else {
        setMentionQuery(null)
      }
    },
    []
  )

  const handleMentionSelect = useCallback(
    (mention: string) => {
      const cursorPos = textareaRef.current?.selectionStart ?? content.length
      const textBefore = content.slice(0, cursorPos)
      const textAfter = content.slice(cursorPos)
      const newBefore = textBefore.replace(/@\w*$/, mention + ' ')
      setContent(newBefore + textAfter)
      setMentionQuery(null)

      // Refocus and set cursor
      setTimeout(() => {
        const el = textareaRef.current
        if (el) {
          el.focus()
          el.selectionStart = newBefore.length
          el.selectionEnd = newBefore.length
        }
      }, 0)
    },
    [content]
  )

  const canSendUrgent = hasPermission('send_urgent_messages')

  return (
    <div className="border-t border-slate-100 bg-white">
      {/* Reply preview */}
      {replyTo && (
        <div className="px-4 pt-3 pb-0">
          <div className="flex items-center gap-2 bg-blue-50/80 border border-blue-100 rounded-lg px-3 py-2">
            <div className="w-0.5 h-5 bg-blue-400 rounded-full shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-blue-600">
                Replying to {replyTo.sender?.name ?? 'Unknown'}
              </p>
              <p className="text-xs text-slate-500 truncate">{replyTo.content}</p>
            </div>
            <button
              onClick={onCancelReply}
              className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-white/50 transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="p-4">
        <div className="flex items-end gap-3 bg-slate-50 border border-slate-200 rounded-xl p-2 focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-400 transition-all">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Write a message..."
            disabled={isSending}
            className="flex-1 bg-transparent border-none px-3 py-2 text-sm text-slate-900 focus:outline-none resize-none min-h-[40px] max-h-[160px] placeholder:text-slate-400 disabled:opacity-50"
            rows={1}
          />

          {/* Priority selector */}
          {canSendUrgent && (
            <div className="relative shrink-0">
              <button
                onClick={() => setShowPriority(!showPriority)}
                className={cn(
                  'flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors',
                  priority === 'normal'
                    ? 'text-slate-400 hover:text-slate-600 hover:bg-white'
                    : priority === 'important'
                      ? 'text-amber-600 bg-amber-50'
                      : 'text-red-600 bg-red-50'
                )}
              >
                {PRIORITY_OPTIONS.find((p) => p.value === priority)?.icon}
                {priority !== 'normal' && (
                  <span className="capitalize">{priority}</span>
                )}
                <ChevronDown className="w-3 h-3" />
              </button>

              {showPriority && (
                <div className="absolute bottom-full right-0 mb-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[130px] z-20">
                  {PRIORITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setPriority(opt.value)
                        setShowPriority(false)
                      }}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors hover:bg-slate-50',
                        priority === opt.value ? 'font-medium' : '',
                        opt.color
                      )}
                    >
                      {opt.icon}
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!content.trim() || isSending}
            className={cn(
              'rounded-lg px-4 h-10 flex items-center gap-2 text-sm font-semibold transition-all shrink-0',
              content.trim() && !isSending
                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm active:scale-[0.97]'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            )}
          >
            <Send className="w-4 h-4" />
            Send
          </button>
        </div>

        {/* Footer hints */}
        <div className="flex justify-between items-center mt-2 px-2">
          <p className="text-[11px] font-medium text-slate-400">
            <kbd className="font-mono bg-slate-100 border border-slate-200 rounded px-1">
              Enter
            </kbd>{' '}
            to send ·{' '}
            <kbd className="font-mono bg-slate-100 border border-slate-200 rounded px-1">
              Shift+Enter
            </kbd>{' '}
            for newline
          </p>
          <p className="text-[11px] text-slate-400">
            <span className="text-slate-300">**bold**</span>{' '}
            <span className="text-slate-300">*italic*</span>{' '}
            <span className="text-slate-300">`code`</span>
          </p>
        </div>
      </div>

      {/* Mention autocomplete */}
      {mentionQuery !== null && (
        <MentionAutocomplete
          query={mentionQuery}
          members={members}
          position={mentionPosition}
          onSelect={handleMentionSelect}
          onClose={() => setMentionQuery(null)}
          hasPermission={hasPermission}
        />
      )}
    </div>
  )
}
