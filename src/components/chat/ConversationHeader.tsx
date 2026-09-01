'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { Hash, Search, Pin, Settings, Users, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import UserPresenceBadge from './UserPresenceBadge'
import UserHoverCard from './UserHoverCard'
import type { Conversation, Agent } from './types'

interface ConversationHeaderProps {
  conversation: Conversation
  currentAgentId?: string
  memberCount: number
  pinnedCount: number
  members?: Agent[]
  onSearchClick: () => void
  onPinnedClick: () => void
  onSettingsClick: () => void
}

import { Avatar } from "@/components/ui/Avatar"

export default function ConversationHeader({
  conversation,
  currentAgentId,
  memberCount,
  pinnedCount,
  members = [],
  onSearchClick,
  onPinnedClick,
  onSettingsClick,
}: ConversationHeaderProps) {
  const [isMembersPinned, setIsMembersPinned] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  const membersRef = useRef<HTMLDivElement>(null)

  const isChannel = conversation.type === 'channel'
  const isDm = conversation.type === 'direct_dm'
  const isGroup = conversation.type === 'group_dm'

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (membersRef.current && !membersRef.current.contains(event.target as Node)) {
        setIsMembersPinned(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // For DMs, get the other person's info
  const dmMember =
    isDm && conversation.members?.length
      ? (conversation.members.find((m) => m.agent_id !== currentAgentId) || conversation.members[0])
      : null

  const displayName = isDm && dmMember?.agent 
    ? dmMember.agent.name 
    : (conversation.name ?? (isGroup ? 'Group Conversation' : 'Conversation'))

  // Sorted list of member names
  const sortedMembers = useMemo(() => {
    if (!members || members.length === 0) return []
    return [...members].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [members])

  // Filtered members by search
  const filteredMembers = useMemo(() => {
    if (!memberSearch.trim()) return sortedMembers
    const q = memberSearch.toLowerCase()
    return sortedMembers.filter(m =>
      (m.name || '').toLowerCase().includes(q) ||
      (m.team || '').toLowerCase().includes(q) ||
      (m.office || '').toLowerCase().includes(q)
    )
  }, [sortedMembers, memberSearch])

  const memberNamesSummary = useMemo(() => {
    if (sortedMembers.length === 0) return ''
    return sortedMembers.map((m) => m.name).join(', ')
  }, [sortedMembers])

  return (
    <div className="px-4 py-3 border-b border-slate-100 bg-white flex items-center justify-between gap-4 shrink-0 relative z-20">
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
          <div className="relative shrink-0 w-9 h-9">
            <Avatar name={displayName} url={dmMember?.agent?.avatar_url} className="w-9 h-9 text-sm shadow-none" fallbackClassName="w-9 h-9 text-sm shadow-none" />
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
            {isDm && dmMember?.agent ? (
              <UserHoverCard agent={dmMember.agent} side="bottom">
                <h2 className="text-[15px] font-bold text-slate-900 truncate leading-tight hover:text-blue-600 cursor-pointer transition-colors">
                  {displayName}
                </h2>
              </UserHoverCard>
            ) : (
              <h2 className="text-[15px] font-bold text-slate-900 truncate leading-tight">
                {isChannel && (
                  <span className="text-slate-400 font-normal mr-0.5">#</span>
                )}
                {displayName}
              </h2>
            )}
            {isDm && dmMember?.agent && (
              <span className="text-xs text-slate-400 font-medium capitalize">
                {dmMember.agent.presence}
              </span>
            )}
          </div>

          <div className="relative group/subhead inline-block">
            <button
              onClick={() => !isDm && setIsMembersPinned(prev => !prev)}
              title={memberNamesSummary ? `Members: ${memberNamesSummary}` : undefined}
              className="text-xs text-slate-400 truncate leading-tight mt-0.5 hover:text-blue-600 transition-colors text-left flex items-center gap-1"
            >
              <span>
                {conversation.description ??
                  (isChannel
                    ? `${memberCount} member${memberCount !== 1 ? 's' : ''}`
                    : isDm
                      ? 'Direct message'
                      : `Group · ${memberCount} members`)}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Right side – actions */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Member count pill with seamless hover + click-to-pin popover */}
        <div ref={membersRef} className="relative group/members">
          <button
            onClick={() => setIsMembersPinned(prev => !prev)}
            title={memberNamesSummary ? `Members: ${memberNamesSummary}` : `${memberCount} members`}
            className={cn(
              "hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer select-none",
              isMembersPinned
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            )}
          >
            <Users className="w-3.5 h-3.5" />
            <span>{memberCount}</span>
          </button>

          {/* Members List Popover (Accessible via hover or click) */}
          {!isDm && sortedMembers.length > 0 && (
            <div
              className={cn(
                "absolute right-0 top-full pt-1.5 z-50 transition-all duration-150",
                "before:absolute before:-top-3 before:left-0 before:right-0 before:h-4 before:content-['']",
                isMembersPinned
                  ? "flex flex-col opacity-100 pointer-events-auto"
                  : "hidden group-hover/members:flex flex-col opacity-0 group-hover/members:opacity-100 group-hover/members:pointer-events-auto"
              )}
            >
              <div className="w-64 bg-slate-900 text-white rounded-xl shadow-2xl border border-slate-800 p-3 text-xs backdrop-blur-md">
                {/* Header */}
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                    <Users className="w-3.5 h-3.5 text-blue-400" />
                    <span>{isChannel ? `#${displayName}` : 'Group Members'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-medium">
                      {sortedMembers.length}
                    </span>
                    {isMembersPinned && (
                      <button
                        onClick={() => setIsMembersPinned(false)}
                        className="text-slate-400 hover:text-white p-0.5 rounded"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Quick Search if more than 6 members */}
                {sortedMembers.length > 6 && (
                  <div className="mb-2">
                    <input
                      type="text"
                      placeholder="Filter members..."
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      className="w-full px-2.5 py-1 text-[11px] bg-slate-800/80 border border-slate-700/60 rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                )}

                {/* Member Roster List */}
                <div className="max-h-60 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                  {filteredMembers.length === 0 ? (
                    <p className="text-[11px] text-slate-500 text-center py-2">No matching members</p>
                  ) : (
                    filteredMembers.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center gap-2 py-1 px-1.5 rounded-md hover:bg-slate-800/70 transition-colors text-slate-200"
                      >
                        {/* Mini Avatar / Presence */}
                        <div className="relative shrink-0">
                          <Avatar name={m.name || ''} url={m.avatar_url} className="w-5 h-5 text-[10px] shadow-none" fallbackClassName="w-5 h-5 text-[10px] shadow-none" />
                          <span className={cn(
                            "w-2 h-2 rounded-full absolute -bottom-0.5 -right-0.5 ring-1 ring-slate-900",
                            m.presence === 'online' ? 'bg-emerald-400' :
                            m.presence === 'away' ? 'bg-amber-400' :
                            m.presence === 'busy' ? 'bg-rose-400' : 'bg-slate-500'
                          )} />
                        </div>

                        {/* Name */}
                        <span className="truncate font-medium text-[12px]">{m.name}</span>

                        {/* Team / Office Tag */}
                        <div className="ml-auto flex items-center gap-1 shrink-0">
                          {m.team && (
                            <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                              {m.team}
                            </span>
                          )}
                          {m.office && (
                            <span className="text-[9px] bg-slate-800/60 text-slate-500 px-1 py-0.5 rounded">
                              {m.office}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

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
