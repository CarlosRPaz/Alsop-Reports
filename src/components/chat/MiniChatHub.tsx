'use client'

import React, { useState, useMemo } from 'react'
import { Search, ExternalLink, X, Bell, Hash, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import UserPresenceBadge from './UserPresenceBadge'
import type { Conversation, Agent, PresenceStatus } from './types'
import { supabase } from '@/lib/supabaseClient'

interface MiniChatHubProps {
  conversations: Conversation[]
  currentAgent: Agent
  unreadCounts: Record<string, number>
  onSelect: (id: string, name: string) => void
  onClose: () => void
  onPopOut?: () => void
  onStatusChange: (status: 'online' | 'away' | 'busy') => void
  getLivePresence: (agentId: string, fallback?: any) => 'online' | 'away' | 'busy' | 'offline'
}

function getDmDisplayName(conversation: Conversation, currentAgentId: string): string {
  if (conversation.type === 'direct_dm' && conversation.members) {
    const other = conversation.members.find((m) => m.agent_id !== currentAgentId)
    return other?.agent?.name ?? conversation.name ?? 'Direct Message'
  }
  if (conversation.type === 'group_dm') {
    if (conversation.name && conversation.name.trim()) return conversation.name
    if (conversation.members) {
      const others = conversation.members.filter((m) => m.agent_id !== currentAgentId)
      if (others.length <= 2) {
        return others.map((o) => o.agent?.name?.split(' ')[0] ?? '?').join(', ')
      }
      return `${others.slice(0, 2).map((o) => o.agent?.name?.split(' ')[0] ?? '?').join(', ')} +${others.length - 2}`
    }
    return conversation.name ?? 'Group Chat'
  }
  return conversation.name ?? 'Conversation'
}

export function MiniChatHub({
  conversations,
  currentAgent,
  unreadCounts,
  onSelect,
  onClose,
  onPopOut,
  onStatusChange,
  getLivePresence
}: MiniChatHubProps) {
  const [tab, setTab] = useState<'recents' | 'mentions'>('recents')
  const [search, setSearch] = useState('')
  const [mentions, setMentions] = useState<any[]>([])

  React.useEffect(() => {
    if (tab === 'mentions') {
      supabase
        .from('chat_notifications')
        .select('*')
        .eq('recipient_id', currentAgent.id)
        .in('type', ['mention'])
        .order('created_at', { ascending: false })
        .limit(20)
        .then(({ data }) => {
          if (data) setMentions(data)
        })
    }
  }, [tab, currentAgent.id])

  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => {
      const aUnread = unreadCounts[a.id] || 0
      const bUnread = unreadCounts[b.id] || 0
      if (aUnread > 0 && bUnread === 0) return -1
      if (bUnread > 0 && aUnread === 0) return 1
      
      const dateA = a.last_message ? new Date(a.last_message.created_at).getTime() : new Date(a.created_at).getTime()
      const dateB = b.last_message ? new Date(b.last_message.created_at).getTime() : new Date(b.created_at).getTime()
      return dateB - dateA
    }).filter(c => {
      if (!search) return true
      const name = getDmDisplayName(c, currentAgent.id).toLowerCase()
      return name.includes(search.toLowerCase())
    })
  }, [conversations, unreadCounts, search, currentAgent.id])

  const myPresence = getLivePresence(currentAgent.id, currentAgent.presence)

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="flex flex-col px-4 pt-4 pb-2 border-b border-slate-200 bg-white shrink-0 gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-800">Communication Hub</h2>
            <div className="relative group">
              <button className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-slate-50 transition-colors">
                <Circle className={cn(
                  "w-2.5 h-2.5 fill-current",
                  myPresence === 'online' ? "text-emerald-500" :
                  myPresence === 'away' ? "text-amber-500" :
                  myPresence === 'busy' ? "text-red-500" : "text-slate-400"
                )} />
                <span className="text-xs font-medium text-slate-600 capitalize">{myPresence}</span>
              </button>
              <div className="absolute top-full left-0 mt-1 hidden group-hover:flex flex-col bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden z-20 min-w-[120px]">
                {['online', 'away', 'busy'].map((status) => (
                  <button
                    key={status}
                    onClick={() => onStatusChange(status as 'online' | 'away' | 'busy')}
                    className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-50 text-left capitalize"
                  >
                    <Circle className={cn(
                      "w-2.5 h-2.5 fill-current",
                      status === 'online' ? "text-emerald-500" :
                      status === 'away' ? "text-amber-500" :
                      status === 'busy' ? "text-red-500" : "text-slate-400"
                    )} />
                    {status}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {onPopOut && (
              <button 
                onClick={onPopOut}
                className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                title="Pop out to new window"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
            )}
            <button 
              onClick={onClose}
              className="p-1.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text"
            placeholder="Search messages..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-100 border-transparent focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 rounded-lg text-sm transition-all outline-none"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center px-4 bg-white border-b border-slate-200 shrink-0">
        <button
          onClick={() => setTab('recents')}
          className={cn(
            "flex-1 py-2.5 text-xs font-semibold border-b-2 transition-colors",
            tab === 'recents' ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
          )}
        >
          Recents
        </button>
        <button
          onClick={() => setTab('mentions')}
          className={cn(
            "flex-1 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center justify-center gap-1.5",
            tab === 'mentions' ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
          )}
        >
          <Bell className="w-3.5 h-3.5" />
          Mentions
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {tab === 'recents' ? (
          sortedConversations.length > 0 ? (
            sortedConversations.map((convo) => {
              const name = getDmDisplayName(convo, currentAgent.id)
              const unread = unreadCounts[convo.id] || 0
              const isGroup = convo.type === 'group_dm'
              const isChannel = convo.type === 'channel'
              
              // Find the other user for direct DMs to show presence
              let otherAgentId: string | undefined
              let otherPresence: any = 'offline'
              
              if (convo.type === 'direct_dm' && convo.members) {
                const other = convo.members.find(m => m.agent_id !== currentAgent.id)
                if (other) {
                  otherAgentId = other.agent_id
                  otherPresence = getLivePresence(other.agent_id, other.agent?.presence)
                }
              }

              return (
                <button
                  key={convo.id}
                  onClick={() => onSelect(convo.id, name)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-100 transition-colors text-left"
                >
                  <div className="relative shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 text-blue-600 font-bold text-sm">
                    {isChannel ? <Hash className="w-5 h-5" /> : name.charAt(0).toUpperCase()}
                    {otherAgentId && (
                      <div className="absolute -bottom-0.5 -right-0.5">
                        <UserPresenceBadge status={otherPresence} />
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("text-sm truncate", unread > 0 ? "font-bold text-slate-900" : "font-medium text-slate-700")}>
                        {name}
                      </span>
                      {convo.last_message && (
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {new Date(convo.last_message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className={cn("text-xs truncate", unread > 0 ? "text-slate-700 font-medium" : "text-slate-500")}>
                        {convo.last_message?.content?.replace(/<[^>]*>/g, '') || 'New conversation'}
                      </p>
                      {unread > 0 && (
                        <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0">
                          {unread > 99 ? '99+' : unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })
          ) : (
            <div className="text-center p-6 text-sm text-slate-500">
              No recent conversations found.
            </div>
          )
        ) : (
          mentions.length > 0 ? (
            mentions.map((notif) => {
              // Find if we have the conversation to get its name
              const convo = conversations.find(c => c.id === notif.conversation_id)
              const convoName = convo ? getDmDisplayName(convo, currentAgent.id) : 'Conversation'
              
              return (
                <button
                  key={notif.id}
                  onClick={async () => {
                    if (!notif.is_read) {
                      try {
                        const { markNotificationRead } = await import('@/lib/chat/notifications')
                        await markNotificationRead(notif.id)
                        setMentions(prev => prev.map(m => m.id === notif.id ? { ...m, is_read: true } : m))
                      } catch {}
                    }
                    if (notif.conversation_id) {
                      onSelect(notif.conversation_id, convoName)
                    }
                  }}
                  className="w-full flex items-start gap-3 p-3 rounded-lg hover:bg-slate-100 transition-colors text-left"
                >
                  <div className="relative shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-rose-100 text-rose-600 font-bold text-sm mt-0.5">
                    <Bell className="w-4 h-4" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("text-sm truncate", !notif.is_read ? "font-bold text-slate-900" : "font-medium text-slate-700")}>
                        {notif.title}
                      </span>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className={cn("text-xs mt-0.5", !notif.is_read ? "text-slate-700 font-medium" : "text-slate-500")}>
                      {notif.body?.replace(/<[^>]*>/g, '') || 'You were mentioned'}
                    </p>
                    {convoName && (
                      <p className="text-[10px] text-slate-400 mt-1 font-medium flex items-center gap-1">
                        <Hash className="w-3 h-3" /> {convoName}
                      </p>
                    )}
                  </div>
                </button>
              )
            })
          ) : (
            <div className="text-center p-6 text-sm text-slate-500 flex flex-col items-center gap-2">
              <Bell className="w-8 h-8 text-slate-300 mx-auto" />
              You have no recent mentions.
            </div>
          )
        )}
      </div>
    </div>
  )
}
