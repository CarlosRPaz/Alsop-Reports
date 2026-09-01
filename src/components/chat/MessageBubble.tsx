'use client'

import { useState, useMemo, useCallback, Fragment } from 'react'
import {
  Reply,
  Smile,
  Pin,
  Pencil,
  Trash2,
  MoreHorizontal,
  AlertTriangle,
  AlertCircle,
  ExternalLink,
  Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChat } from '@/lib/chat/chatContext'
import type { Message, Reaction, Agent } from './types'
import UserPresenceBadge from './UserPresenceBadge'
import UserHoverCard from './UserHoverCard'
import EmojiReactionPicker from './EmojiReactionPicker'

interface MessageBubbleProps {
  message: Message
  currentAgentId: string
  isGrouped: boolean
  onReply: (messageId: string) => void
  onEdit: (messageId: string, newContent: string) => Promise<void> | void
  onDelete: (messageId: string) => void
  onPin: (messageId: string) => void
  onReact: (messageId: string, emoji: string) => void
  hasPermission: (key: string) => boolean
}

import { Avatar } from "@/components/ui/Avatar"

function formatTime(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function parseStatusMessage(msg: string | null): { emoji: string | null; text: string | null } {
  if (!msg) return { emoji: null, text: null }
  
  const emojiRegex = /^([\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]|[\u{1F100}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F300}-\u{1F5FF}])/u
  const match = msg.match(emojiRegex)
  if (match) {
    const emoji = match[1]
    const text = msg.slice(emoji.length).trim()
    return { emoji, text }
  }
  
  return { emoji: null, text: msg }
}

function formatReactionTooltip(r: Reaction, currentAgentId: string): string {
  if (!r.agent_ids || r.agent_ids.length === 0) return ''

  const names = r.agent_ids.map((id, index) => {
    if (id === currentAgentId) return 'You'
    return r.agent_names?.[index] || 'Someone'
  })

  // Sort so 'You' appears first
  const sortedNames = [...names].sort((a, b) => {
    if (a === 'You') return -1
    if (b === 'You') return 1
    return 0
  })

  if (sortedNames.length === 1) {
    return `${sortedNames[0]}`
  }
  if (sortedNames.length === 2) {
    return `${sortedNames[0]} and ${sortedNames[1]}`
  }
  if (sortedNames.length === 3) {
    return `${sortedNames[0]}, ${sortedNames[1]}, and ${sortedNames[2]}`
  }
  const remaining = sortedNames.length - 3
  return `${sortedNames.slice(0, 3).join(', ')}, and ${remaining} other${remaining > 1 ? 's' : ''}`
}

const KNOWN_MULTI_WORD_MENTIONS = [
  'Alex C',
  'Chris E',
  'Nancy G',
  'Rosario D',
  'John Paul',
  'Ric Becerra',
]

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Known image/GIF CDN domains and file extensions for inline rendering
const IMAGE_EXTENSIONS = /\.(gif|png|jpg|jpeg|webp|svg|bmp)(\?.*)?$/i
const IMAGE_CDN_DOMAINS = [
  'media.tenor.com',
  'media.giphy.com',
  'media0.giphy.com',
  'media1.giphy.com',
  'media2.giphy.com',
  'media3.giphy.com',
  'media4.giphy.com',
  'i.giphy.com',
  'i.imgur.com',
  'c.tenor.com',
]

function isImageUrl(url: string): boolean {
  if (IMAGE_EXTENSIONS.test(url)) return true
  if (url.startsWith('data:image/')) return true
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()
    if (parsed.pathname.includes('/storage/v1/object/public/chat-media/')) return true
    return IMAGE_CDN_DOMAINS.some(domain => hostname === domain || hostname.endsWith('.' + domain))
  } catch {
    return false
  }
}

/**
 * Detect GIF platform "view" pages (tenor.com/view/..., giphy.com/gifs/...)
 * and return their embed iframe URL, or null if not a GIF page.
 */
function getGifEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    const path = parsed.pathname

    // tenor.com/view/some-slug-gif-12345 → iframe embed
    if (host === 'tenor.com' && path.startsWith('/view/')) {
      // Extract the numeric ID from the end of the slug
      const match = path.match(/-(\d+)$/)
      if (match) return `https://tenor.com/embed/${match[1]}`
      return `https://tenor.com/embed${path.replace('/view/', '/')}`
    }

    // tenor.com/bXYzA.gif style short URLs
    if (host === 'tenor.com' && /^\/[a-zA-Z0-9]+\.gif$/i.test(path)) {
      return url // These are direct GIF files
    }

    // giphy.com/gifs/some-slug-abc123 → iframe embed
    if (host === 'giphy.com' && path.startsWith('/gifs/')) {
      const slug = path.replace('/gifs/', '')
      const id = slug.includes('-') ? slug.split('-').pop() : slug
      return `https://giphy.com/embed/${id}`
    }

    return null
  } catch {
    return null
  }
}

/**
 * Renders message content with inline markdown, mentions, and media.
 * Supports: **bold**, *italic*, `code`, @Mentions, URLs, inline images/GIFs
 */
function renderContent(content: string, currentAgent?: Agent | null): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  
  // Multi-word mention targets or single word mention targets
  const multiWordPattern = KNOWN_MULTI_WORD_MENTIONS.map((m) => escapeRegExp(m)).join('|')
  const mentionPattern = `@(?:${multiWordPattern}|[a-zA-Z0-9_]+)`

  const regex = new RegExp(
    `(\\*\\*(.+?)\\*\\*|\\*(.+?)\\*|\`([^\`]+)\`|(${mentionPattern})|https?:\\/\\/[^\\s<]+|data:image\\/[^\\s<]+)`,
    'g'
  )

  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    // Push plain text before match
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index))
    }

    const full = match[0]

    if (match[2]) {
      // **bold**
      parts.push(
        <strong key={match.index} className="font-bold">
          {match[2]}
        </strong>
      )
    } else if (match[3]) {
      // *italic*
      parts.push(
        <em key={match.index} className="italic">
          {match[3]}
        </em>
      )
    } else if (match[4]) {
      // `code`
      parts.push(
        <code
          key={match.index}
          className="bg-slate-100 text-pink-600 px-1 py-0.5 rounded text-[13px] font-mono dark:bg-slate-800 dark:text-pink-400"
        >
          {match[4]}
        </code>
      )
    } else if (full.startsWith('@')) {
      // @Mention — only the exact target name is highlighted as a blue pill
      const targetName = full.slice(1).toLowerCase()
      const isTargetingMe = currentAgent && (
        currentAgent.name.toLowerCase() === targetName ||
        targetName === 'everyone' ||
        targetName === 'all' ||
        currentAgent.team?.toLowerCase() === targetName ||
        currentAgent.office?.toLowerCase() === targetName ||
        (currentAgent.role === 'admin' && targetName === 'admin')
      )

      parts.push(
        <span
          key={match.index}
          className={cn(
            'font-semibold rounded px-1.5 py-0.5 inline-flex items-center gap-0.5 transition-colors select-none text-[13px]',
            isTargetingMe
              ? 'bg-blue-600 text-white font-bold shadow-xs'
              : 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50'
          )}
        >
          {full}
        </span>
      )
    } else if (full.startsWith('http') || full.startsWith('data:image/')) {
      // 1. Check for GIF platform view pages (tenor.com/view, giphy.com/gifs)
      const embedUrl = full.startsWith('http') ? getGifEmbedUrl(full) : null
      if (embedUrl && embedUrl !== full) {
        // Render as iframe embed for view pages
        parts.push(
          <div key={match.index} className="my-1">
            <iframe
              src={embedUrl}
              className="rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm"
              width="280"
              height="220"
              frameBorder="0"
              allowFullScreen
              loading="lazy"
              title="GIF"
              style={{ maxWidth: '100%' }}
            />
          </div>
        )
      } else if (isImageUrl(full) || (embedUrl === full)) {
        // 2. Direct image/GIF CDN URLs — render inline
        parts.push(
          <a
            key={match.index}
            href={full}
            target="_blank"
            rel="noopener noreferrer"
            className="block my-1"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={full}
              alt="Shared image"
              className="rounded-lg max-w-xs sm:max-w-sm max-h-64 object-contain border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              loading="lazy"
              onError={(e) => {
                // Fallback: if image fails to load, replace with a text link
                const target = e.currentTarget
                const parent = target.parentElement
                if (parent) {
                  parent.className = 'text-blue-600 hover:text-blue-700 hover:underline inline-flex items-center gap-0.5 dark:text-blue-400'
                  target.replaceWith(document.createTextNode(full.length > 50 ? full.slice(0, 50) + '…' : full))
                }
              }}
            />
          </a>
        )
      } else {
        // 3. Regular URL — render as clickable text link
        parts.push(
          <a
            key={match.index}
            href={full}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-700 hover:underline inline-flex items-center gap-0.5 dark:text-blue-400"
          >
            {full.length > 50 ? full.slice(0, 50) + '…' : full}
            <ExternalLink className="w-3 h-3 inline shrink-0" />
          </a>
        )
      }
    }

    lastIndex = match.index + full.length
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex))
  }

  return parts.length > 0 ? parts : [content]
}

export default function MessageBubble({
  message,
  currentAgentId,
  isGrouped,
  onReply,
  onEdit,
  onDelete,
  onPin,
  onReact,
  hasPermission,
}: MessageBubbleProps) {
  const [showActions, setShowActions] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(message.content)
  const [isSaving, setIsSaving] = useState(false)

  const handleSaveEdit = async () => {
    if (editValue.trim() === '' || editValue === message.content) {
      setIsEditing(false)
      setEditValue(message.content)
      return
    }
    setIsSaving(true)
    try {
      await onEdit(message.id, editValue)
      setIsEditing(false)
    } finally {
      setIsSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSaveEdit()
    } else if (e.key === 'Escape') {
      setIsEditing(false)
      setEditValue(message.content)
    }
  }

  let chat: any = null
  try {
    chat = useChat()
  } catch {
    // optional fallback outside provider
  }
  const currentAgent = chat?.currentAgent ?? null

  const isOwn = message.sender_id === currentAgentId
  const isAdmin = hasPermission('admin')
  const senderName = message.sender?.name ?? 'Unknown'
  const senderId = message.sender_id || message.sender?.id

  const isSelf = Boolean(
    currentAgent && (senderId === currentAgent.id || senderName.toLowerCase() === currentAgent.name.toLowerCase())
  )

  const senderPresence = senderId && chat?.getLivePresence
    ? chat.getLivePresence(senderId, message.sender)
    : (message.sender?.presence || 'offline')

  const senderStatusMsg = isSelf
    ? currentAgent?.status_message
    : (senderId && chat?.getLiveStatusMessage ? chat.getLiveStatusMessage(senderId, message.sender?.status_message) : message.sender?.status_message)

  const statusInfo = useMemo(() => parseStatusMessage(senderStatusMsg ?? null), [senderStatusMsg])

  // Check if current user is @mentioned in this message
  const isMentioned = useMemo(() => {
    if (!currentAgent || !message.content || message.is_deleted || message.is_system) return false
    const name = currentAgent.name.toLowerCase()
    const team = currentAgent.team?.toLowerCase()
    const office = currentAgent.office?.toLowerCase()
    const role = currentAgent.role?.toLowerCase()
    const text = message.content.toLowerCase()

    const directMention = new RegExp(`@${escapeRegExp(name)}\\b`, 'i').test(text)
    const everyoneMention = /@(everyone|all)\b/i.test(text)
    const teamMention = team ? new RegExp(`@${escapeRegExp(team)}\\b`, 'i').test(text) : false
    const officeMention = office ? new RegExp(`@${escapeRegExp(office)}\\b`, 'i').test(text) : false
    const roleMention = role === 'admin' ? /@admin\b/i.test(text) : false

    return directMention || everyoneMention || teamMention || officeMention || roleMention
  }, [currentAgent, message.content, message.is_deleted, message.is_system])

  // System messages
  if (message.is_system) {
    return (
      <div className="flex justify-center py-1">
        <span className="text-xs text-slate-400 italic bg-slate-50 px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    )
  }

  // Deleted messages
  if (message.is_deleted) {
    return (
      <div id={`message-${message.id}`} className={cn('flex gap-3 px-4 py-1', isGrouped ? 'pl-[60px]' : '')}>
        {!isGrouped && <div className="w-8 h-8 shrink-0" />}
        <p className="text-sm text-slate-400 italic">This message was deleted</p>
      </div>
    )
  }

  return (
    <div
      id={`message-${message.id}`}
      className={cn(
        'group relative flex flex-col transition-all duration-150',
        isGrouped ? 'py-0.5' : 'py-1.5',
        isMentioned
          ? 'bg-amber-500/[0.08] dark:bg-amber-500/[0.14] border-l-[3px] border-amber-400 dark:border-amber-500 hover:bg-amber-500/[0.12] -ml-2 pl-2'
          : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { if (showEmojiPicker) return; setShowActions(false); setShowEmojiPicker(false); }}
    >
      {isGrouped && (
        <div className="absolute left-[16px] top-1/2 -translate-y-1/2 w-[36px] text-right opacity-0 group-hover:opacity-100 transition-opacity duration-150 select-none pointer-events-none z-10">
          <span className="text-[9px] font-bold text-slate-400 font-mono">
            {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
          </span>
        </div>
      )}
      {/* Reply Context Header */}
      {message.parent_preview && (
        <div className="flex items-center gap-2 pl-[60px] pr-4 mb-0.5 text-[11px] text-slate-400 select-none relative">
          {/* Curved line connector */}
          <div className="absolute left-[28px] top-[7px] w-[24px] h-[14px] border-l-2 border-t-2 border-slate-200 rounded-tl-md" />
          
          {/* Mini Avatar for reply parent */}
          <div className="w-4 h-4 rounded-full bg-slate-200/80 flex items-center justify-center text-[9px] font-bold text-slate-600 shrink-0 select-none">
            {message.parent_preview.sender_name.charAt(0).toUpperCase()}
          </div>
          
          <span className="font-semibold text-slate-600 hover:text-blue-500 hover:underline cursor-pointer transition-colors">
            {message.parent_preview.sender_name}
          </span>
          <span className="truncate max-w-[400px] text-slate-400 italic">
            "{message.parent_preview.content}"
          </span>
        </div>
      )}

      {/* Message Row */}
      <div className={cn('flex items-start gap-3 px-4', isGrouped ? 'pl-[60px]' : '')}>
        {/* Avatar with presence status dot overlay */}
        {!isGrouped && (
          <UserHoverCard agent={message.sender ? { ...message.sender, id: senderId, presence: senderPresence, status_message: senderStatusMsg } : { id: senderId, name: senderName, presence: senderPresence, status_message: senderStatusMsg }} side="top" className="shrink-0 self-start">
            <div className="relative shrink-0 mt-0.5 w-8 h-8 cursor-pointer group/avatar">
              <Avatar name={senderName} url={message.sender?.avatar_url} className="w-8 h-8 text-xs select-none transition-transform group-hover/avatar:scale-105 shadow-none" fallbackClassName="w-8 h-8 text-xs select-none transition-transform group-hover/avatar:scale-105 shadow-none" />
              <UserPresenceBadge
                status={senderPresence as any}
                size="sm"
                className="absolute -bottom-0.5 -right-0.5 ring-[2px] ring-white dark:ring-slate-900"
              />
            </div>
          </UserHoverCard>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Name + status + timestamp (only on first in group) */}
          {!isGrouped && (
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <UserHoverCard agent={message.sender || { name: senderName }} side="top">
                <span className="text-[13px] font-bold text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer transition-colors">
                  {senderName}
                </span>
              </UserHoverCard>
              
              {/* Premium Inline Status Badge */}
              {statusInfo.text && (
                <span 
                  className="inline-flex items-center gap-1 text-[11px] font-normal text-slate-500 bg-slate-50 border border-slate-200/50 px-1.5 py-0.5 rounded-full select-none max-w-[200px]"
                  title={message.sender?.status_message || ''}
                >
                  {statusInfo.emoji && <span className="text-xs shrink-0 select-none">{statusInfo.emoji}</span>}
                  <span className="truncate">{statusInfo.text}</span>
                </span>
              )}
              
              <span className="text-[11px] text-slate-400 font-medium">
                {formatTime(message.created_at)}
              </span>
              {message.is_pinned && (
                <Pin className="w-3 h-3 text-amber-500 shrink-0" />
              )}
              {message.priority === 'important' && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                  <AlertTriangle className="w-3 h-3" />
                  Important
                </span>
              )}
              {message.priority === 'urgent' && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">
                  <AlertCircle className="w-3 h-3" />
                  Urgent
                </span>
              )}
            </div>
          )}

          {/* Message text */}
          <div className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed break-words whitespace-pre-wrap">
            {isEditing ? (
              <div className="flex flex-col gap-2 mt-1">
                <textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  rows={3}
                  autoFocus
                  disabled={isSaving}
                />
                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    onClick={handleSaveEdit}
                    disabled={isSaving}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.25 rounded transition-colors font-medium disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setIsEditing(false)
                      setEditValue(message.content)
                    }}
                    disabled={isSaving}
                    className="text-slate-500 hover:text-slate-700 font-medium px-2 py-1.25 transition-colors"
                  >
                    Cancel
                  </button>
                  <span className="text-slate-400 ml-auto hidden sm:inline">escape to cancel • enter to save</span>
                </div>
              </div>
            ) : (
              <>
                {renderContent(message.content, currentAgent)}
                {message.is_edited && (
                  <span className="text-[11px] text-slate-400 ml-1">(edited)</span>
                )}
              </>
            )}
          </div>

          {/* Reactions */}
          {message.reactions && message.reactions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {message.reactions.map((r) => {
                const isReactedByMe = r.agent_ids.includes(currentAgentId)
                const reactorNames = formatReactionTooltip(r, currentAgentId)
                return (
                  <div key={r.emoji} className="relative group/reaction inline-flex">
                    <button
                      onClick={() => onReact(message.id, r.emoji)}
                      title={`${r.emoji} ${reactorNames}`}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border transition-all duration-150 cursor-pointer select-none',
                        isReactedByMe
                          ? 'bg-blue-50 border-blue-200 text-blue-700 font-medium hover:bg-blue-100 hover:border-blue-300'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300'
                      )}
                    >
                      <span className="text-[13px] leading-none">{r.emoji}</span>
                      <span className="font-semibold text-[11px]">{r.count}</span>
                    </button>

                    {/* Floating Tooltip Showing Who Reacted on Hover */}
                    <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/reaction:flex flex-col items-center z-30">
                      <div className="bg-slate-900/95 text-white text-[11px] font-medium px-2.5 py-1 rounded-md shadow-xl whitespace-nowrap backdrop-blur-sm border border-slate-800 flex items-center gap-1.5">
                        <span className="text-xs">{r.emoji}</span>
                        <span>{reactorNames}</span>
                      </div>
                      <div className="w-2 h-1 bg-slate-900 rotate-45 -mt-0.5" />
                    </div>
                  </div>
                )
              })}

              {/* Quick Add Reaction Button on Reaction Pill Row */}
              <div className="relative inline-flex">
                <button
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-dashed border-slate-300 text-slate-400 hover:text-slate-600 hover:border-slate-400 hover:bg-slate-50 transition-all text-xs cursor-pointer select-none"
                  title="Add reaction"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hover action bar */}
      {showActions && (
        <div className="absolute right-3 -top-3 flex items-center gap-0.5 bg-white border border-slate-200 rounded-lg shadow-sm px-1 py-0.5 z-10">
          <button
            onClick={() => onReply(message.id)}
            className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title="Reply"
          >
            <Reply className="w-3.5 h-3.5" />
          </button>

          <div className="relative">
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-amber-500 hover:bg-amber-50 transition-colors cursor-pointer"
              title="React"
            >
              <Smile className="w-3.5 h-3.5" />
            </button>
            {showEmojiPicker && (
              <EmojiReactionPicker
                align="right"
                onSelect={(emoji) => onReact(message.id, emoji)}
                onClose={() => { setShowEmojiPicker(false); setShowActions(false); }}
              />
            )}
          </div>

          <button
            onClick={() => onPin(message.id)}
            className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-amber-500 hover:bg-amber-50 transition-colors"
            title={message.is_pinned ? 'Unpin' : 'Pin'}
          >
            <Pin className="w-3.5 h-3.5" />
          </button>

          {isOwn && (
            <button
              onClick={() => {
                setIsEditing(true)
                setEditValue(message.content)
              }}
              className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              title="Edit"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}

          {(isOwn || isAdmin) && (
            <button
              onClick={() => onDelete(message.id)}
              className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
