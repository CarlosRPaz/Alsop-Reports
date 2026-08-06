'use client'

import { useState, useMemo } from 'react'
import {
  Search,
  Hash,
  Plus,
  ChevronDown,
  ChevronRight,
  Circle,
  Pin,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import UserPresenceBadge from './UserPresenceBadge'
import type { Agent, Conversation, PresenceStatus } from './types'

interface ConversationSidebarProps {
  conversations: Conversation[]
  selectedId: string | null
  unreadCounts: Record<string, number>
  currentAgent: Agent
  onSelect: (conversationId: string) => void
  onCreateNew: (defaultTab?: 'dm' | 'group' | 'channel') => void
  onStatusChange: (status: PresenceStatus) => void
  onTogglePin: (conversationId: string, currentlyPinned: boolean) => void
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

function getDmDisplayName(conversation: Conversation, currentAgentId: string): string {
  if (conversation.type === 'direct_dm' && conversation.members) {
    const other = conversation.members.find((m) => m.agent_id !== currentAgentId)
    return other?.agent?.name ?? conversation.name ?? 'Direct Message'
  }
  if (conversation.type === 'group_dm') {
    if (conversation.name && conversation.name.trim()) {
      return conversation.name
    }
    if (conversation.members) {
      const others = conversation.members.filter((m) => m.agent_id !== currentAgentId)
      if (others.length <= 3) {
        return others.map((o) => o.agent?.name?.split(' ')[0] ?? '?').join(', ')
      }
      return `${others.slice(0, 2).map((o) => o.agent?.name?.split(' ')[0] ?? '?').join(', ')} +${others.length - 2}`
    }
    return conversation.name ?? 'Group Chat'
  }
  return conversation.name ?? 'Conversation'
}

function getDmPresence(conversation: Conversation, currentAgentId: string): PresenceStatus {
  if (conversation.type === 'direct_dm' && conversation.members) {
    const other = conversation.members.find((m) => m.agent_id !== currentAgentId)
    return other?.agent?.presence ?? 'offline'
  }
  return 'offline'
}

const STATUS_OPTIONS: { value: PresenceStatus; label: string; emoji: string }[] = [
  { value: 'online', label: 'Online', emoji: '🟢' },
  { value: 'away', label: 'Away', emoji: '🟡' },
  { value: 'busy', label: 'Busy', emoji: '🔴' },
  { value: 'offline', label: 'Offline', emoji: '⚫' },
]

export default function ConversationSidebar({
  conversations,
  selectedId,
  unreadCounts,
  currentAgent,
  onSelect,
  onCreateNew,
  onStatusChange,
  onTogglePin,
}: ConversationSidebarProps) {
  const [search, setSearch] = useState('')
  const [channelsOpen, setChannelsOpen] = useState(true)
  const [dmsOpen, setDmsOpen] = useState(true)

  const channels = useMemo(() => {
    const list = conversations.filter((c) => c.type === 'channel')
    return list.sort((a, b) => {
      // 1. Pinned channels first
      if (a.is_pinned && !b.is_pinned) return -1
      if (!a.is_pinned && b.is_pinned) return 1

      // 2. 'All' channel always comes first among unpinned (or top of pinned if pinned)
      const isAllA = a.name?.trim().toLowerCase() === 'all'
      const isAllB = b.name?.trim().toLowerCase() === 'all'
      if (isAllA && !isAllB) return -1
      if (!isAllA && isAllB) return 1

      // 3. Otherwise sort by last message / activity time descending
      const aTime = a.last_message?.created_at ?? a.updated_at
      const bTime = b.last_message?.created_at ?? b.updated_at
      return new Date(bTime).getTime() - new Date(aTime).getTime()
    })
  }, [conversations])

  const directMessages = useMemo(
    () => conversations.filter((c) => c.type === 'direct_dm' || c.type === 'group_dm'),
    [conversations]
  )

  const filteredChannels = useMemo(() => {
    if (!search.trim()) return channels
    const q = search.toLowerCase()
    return channels.filter((c) => (c.name ?? '').toLowerCase().includes(q))
  }, [channels, search])

  const filteredDMs = useMemo(() => {
    if (!search.trim()) return directMessages
    const q = search.toLowerCase()
    return directMessages.filter((c) => {
      const displayName = getDmDisplayName(c, currentAgent.id)
      return displayName.toLowerCase().includes(q)
    })
  }, [directMessages, search, currentAgent.id])

  return (
    <div className="w-[280px] flex flex-col bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden shrink-0">
      {/* Search */}
      <div className="p-3 border-b border-slate-100">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Channels */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 pt-3 pb-1">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setChannelsOpen(!channelsOpen)}
              className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
            >
              {channelsOpen ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              Channels
            </button>
            {currentAgent.role === 'admin' && (
              <button
                onClick={() => onCreateNew('channel')}
                className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
                title="New channel"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {channelsOpen && (
          <div className="px-2 pb-1 space-y-0.5">
            {filteredChannels.map((conv) => {
              const unread = unreadCounts[conv.id] ?? 0
              const isSelected = selectedId === conv.id
              return (
                <button
                  key={conv.id}
                  onClick={() => onSelect(conv.id)}
                  className={cn(
                    'group/item w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-all duration-200',
                    isSelected
                      ? 'bg-blue-50 text-blue-700 font-semibold ring-1 ring-blue-600/10'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                    unread > 0 && !isSelected && 'font-semibold text-slate-900'
                  )}
                >
                  <span className="text-base leading-none shrink-0">
                    <Hash
                      className={cn(
                        'w-4 h-4',
                        isSelected ? 'text-blue-500' : 'text-slate-400'
                      )}
                    />
                  </span>
                  <span className="truncate flex-1 text-left">{conv.name ?? 'Unnamed Channel'}</span>
                  <span
                    role="button"
                    onClick={(e) => { e.stopPropagation(); onTogglePin(conv.id, !!conv.is_pinned) }}
                    className={cn(
                      'shrink-0 w-5 h-5 flex items-center justify-center rounded transition-all',
                      conv.is_pinned
                        ? 'text-amber-500 hover:text-amber-600'
                        : 'text-slate-300 opacity-0 group-hover/item:opacity-100 hover:text-amber-500'
                    )}
                    title={conv.is_pinned ? 'Unpin' : 'Pin'}
                  >
                    <Pin className={cn('w-3 h-3', conv.is_pinned && 'fill-current')} />
                  </span>
                  {unread > 0 && (
                    <span className="ml-auto bg-blue-600 text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1 shrink-0">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Direct Messages */}
        <div className="px-3 pt-3 pb-1">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setDmsOpen(!dmsOpen)}
              className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
            >
              {dmsOpen ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              Direct Messages
            </button>
            <button
              onClick={() => onCreateNew('dm')}
              className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
              title="New conversation"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {dmsOpen && (
          <div className="px-2 pb-2 space-y-0.5">
            {filteredDMs.map((conv) => {
              const unread = unreadCounts[conv.id] ?? 0
              const isSelected = selectedId === conv.id
              const displayName = getDmDisplayName(conv, currentAgent.id)
              const presence = getDmPresence(conv, currentAgent.id)

              return (
                <button
                  key={conv.id}
                  onClick={() => onSelect(conv.id)}
                  className={cn(
                    'group/item w-full flex items-start gap-2.5 px-3 py-2 rounded-md text-sm transition-all duration-200',
                    isSelected
                      ? 'bg-blue-50 text-blue-700 font-semibold ring-1 ring-blue-600/10'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                    unread > 0 && !isSelected && 'font-semibold text-slate-900'
                  )}
                >
                  {/* Avatar with presence */}
                  <div className="relative shrink-0 mt-0.5">
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold',
                        getAvatarColor(displayName)
                      )}
                    >
                      {conv.type === 'group_dm' ? (
                        <Users className="w-4 h-4" />
                      ) : (
                        displayName.charAt(0).toUpperCase()
                      )}
                    </div>
                    {conv.type === 'direct_dm' && (
                      <div className="absolute -bottom-0.5 -right-0.5">
                        <UserPresenceBadge status={presence} size="sm" />
                      </div>
                    )}
                  </div>

                  {/* Name + subtitle */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-left leading-tight">{displayName}</span>
                      {conv.type === 'group_dm' && conv.members && conv.members.length > 0 && (
                        <span className="shrink-0 text-[10px] font-medium text-slate-400 bg-slate-100 rounded px-1 py-px leading-tight">
                          {conv.members.length}
                        </span>
                      )}
                    </div>
                    {/* Subtitle: member names for groups, last message for DMs */}
                    {conv.type === 'group_dm' && conv.members && conv.members.length > 0 ? (
                      <p className="text-[11px] text-slate-400 truncate mt-0.5 font-normal leading-tight">
                        {conv.members
                          .filter((m) => m.agent_id !== currentAgent.id)
                          .map((m) => m.agent?.name?.split(' ')[0] ?? '?')
                          .join(', ')}
                      </p>
                    ) : conv.last_message ? (
                      <p className="text-[11px] text-slate-400 truncate mt-0.5 font-normal leading-tight">
                        {conv.last_message.content.substring(0, 60)}
                      </p>
                    ) : null}
                  </div>

                  {/* Pin + Unread */}
                  <div className="flex items-center gap-1 shrink-0 mt-0.5">
                    <span
                      role="button"
                      onClick={(e) => { e.stopPropagation(); onTogglePin(conv.id, !!conv.is_pinned) }}
                      className={cn(
                        'w-5 h-5 flex items-center justify-center rounded transition-all',
                        conv.is_pinned
                          ? 'text-amber-500 hover:text-amber-600'
                          : 'text-slate-300 opacity-0 group-hover/item:opacity-100 hover:text-amber-500'
                      )}
                      title={conv.is_pinned ? 'Unpin' : 'Pin'}
                    >
                      <Pin className={cn('w-3 h-3', conv.is_pinned && 'fill-current')} />
                    </span>
                    {unread > 0 && (
                      <span className="bg-blue-600 text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1 shrink-0">
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Current User Footer */}
      <div className="border-t border-slate-100 p-3">
        <div className="flex items-center gap-2.5">
          <div className="relative shrink-0">
            <div
              className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold',
                getAvatarColor(currentAgent.name)
              )}
            >
              {currentAgent.name.charAt(0).toUpperCase()}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate leading-tight">
              {currentAgent.name}
            </p>
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
              <span>{STATUS_OPTIONS.find((s) => s.value === currentAgent.presence)?.emoji}</span>
              <span>{STATUS_OPTIONS.find((s) => s.value === currentAgent.presence)?.label}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
