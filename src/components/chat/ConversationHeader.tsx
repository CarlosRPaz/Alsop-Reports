'use client'

import { Hash, Search, Pin, Settings, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import UserPresenceBadge from './UserPresenceBadge'
import type { Conversation } from './types'

interface ConversationHeaderProps {
  conversation: Conversation
  currentAgentId?: string
  memberCount: number
  pinnedCount: number
  onSearchClick: () => void
  onPinnedClick: () => void
  onSettingsClick: () => void
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

export default function ConversationHeader({
  conversation,
  currentAgentId,
  memberCount,
  pinnedCount,
  onSearchClick,
  onPinnedClick,
  onSettingsClick,
}: ConversationHeaderProps) {
  const isChannel = conversation.type === 'channel'
  const isDm = conversation.type === 'direct_dm'
  const isGroup = conversation.type === 'group_dm'

  // For DMs, get the other person's info
  const dmMember =
    isDm && conversation.members?.length
      ? (conversation.members.find((m) => m.agent_id !== currentAgentId) || conversation.members[0])
      : null

  const displayName = isDm && dmMember?.agent 
    ? dmMember.agent.name 
    : (conversation.name ?? (isGroup ? 'Group Conversation' : 'Conversation'))

  return (
    <div className="px-4 py-3 border-b border-slate-100 bg-white flex items-center justify-between gap-4 shrink-0">
      {/* Left side */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Icon / Avatar */}
        {isChannel ? (
          <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
            <Hash className="w-4.5 h-4.5 text-slate-500" />
          </div>
        ) : isGroup ? (
          <div className="w-9 h-9 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center shrink-0 text-blue-600">
            <Users className="w-4.5 h-4.5" />
          </div>
        ) : (
          <div className="relative shrink-0">
            <div
              className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold',
                getAvatarColor(displayName)
              )}
            >
              {displayName.charAt(0).toUpperCase()}
            </div>
            {isDm && dmMember?.agent && (
              <div className="absolute -bottom-0.5 -right-0.5">
                <UserPresenceBadge status={dmMember.agent.presence} size="sm" />
              </div>
            )}
          </div>
        )}

        {/* Name & description */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-bold text-slate-900 truncate leading-tight">
              {isChannel && (
                <span className="text-slate-400 font-normal mr-0.5">#</span>
              )}
              {displayName}
            </h2>
            {isDm && dmMember?.agent && (
              <span className="text-xs text-slate-400 font-medium capitalize">
                {dmMember.agent.presence}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 truncate leading-tight mt-0.5">
            {conversation.description ??
              (isChannel
                ? `${memberCount} member${memberCount !== 1 ? 's' : ''}`
                : isDm
                  ? 'Direct message'
                  : `Group · ${memberCount} members`)}
          </p>
        </div>
      </div>

      {/* Right side – actions */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Member count pill */}
        <button
          onClick={onSettingsClick}
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
        >
          <Users className="w-3.5 h-3.5" />
          {memberCount}
        </button>

        {/* Search */}
        <button
          onClick={onSearchClick}
          className="w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
          title="Search messages"
        >
          <Search className="w-4 h-4" />
        </button>

        {/* Pinned */}
        <button
          onClick={onPinnedClick}
          className="relative w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
          title="Pinned messages"
        >
          <Pin className="w-4 h-4" />
          {pinnedCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-blue-600 text-white text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full">
              {pinnedCount > 9 ? '9+' : pinnedCount}
            </span>
          )}
        </button>

        {/* Settings */}
        <button
          onClick={onSettingsClick}
          className="w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
          title="Conversation settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
