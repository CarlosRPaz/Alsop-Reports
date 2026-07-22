'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  X,
  Search,
  Hash,
  Users,
  MessageSquare,
  Check,
  Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabaseClient'
import UserPresenceBadge from './UserPresenceBadge'
import type { Agent } from './types'

interface CreateConversationModalProps {
  currentAgent: Agent
  isOpen: boolean
  onClose: () => void
  onCreateDM: (agentId: string) => Promise<void>
  onCreateGroup: (name: string, memberIds: string[]) => void
  onCreateChannel: (name: string, description: string, icon: string, teams: string[]) => void
  defaultTab?: 'dm' | 'group' | 'channel'
}

const TABS = [
  { key: 'dm' as const, label: 'Direct Message', icon: MessageSquare },
  { key: 'group' as const, label: 'Group Chat', icon: Users },
  { key: 'channel' as const, label: 'New Channel', icon: Hash, adminOnly: true },
]

const TEAM_OPTIONS = ['Sales', 'CSR', 'EA', 'Managers']

const EMOJI_OPTIONS = ['💬', '📢', '🎯', '📊', '🏢', '🔔', '⚡', '🎉', '📋', '❓', '💡', '🔧']

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

export default function CreateConversationModal({
  currentAgent,
  isOpen,
  onClose,
  onCreateDM,
  onCreateGroup,
  onCreateChannel,
  defaultTab = 'dm',
}: CreateConversationModalProps) {
  const [activeTab, setActiveTab] = useState<'dm' | 'group' | 'channel'>('dm')
  const [agents, setAgents] = useState<Agent[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  // Group chat state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [groupName, setGroupName] = useState('')

  // Channel state
  const [channelName, setChannelName] = useState('')
  const [channelDescription, setChannelDescription] = useState('')
  const [channelIcon, setChannelIcon] = useState('💬')
  const [channelTeams, setChannelTeams] = useState<Set<string>>(new Set())
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  // DM creation state
  const [dmLoadingId, setDmLoadingId] = useState<string | null>(null)
  const [dmError, setDmError] = useState<string | null>(null)

  const isAdmin = currentAgent.role === 'admin'

  // Fetch agents
  useEffect(() => {
    if (!isOpen) return

    async function fetchAgents() {
      setIsLoading(true)
      const { data, error } = await supabase
        .from('agents')
        .select('*')
        .eq('active', true)
        .neq('id', currentAgent.id)
        .order('name', { ascending: true })

      if (!error && data) {
        setAgents(data as Agent[])
      }
      setIsLoading(false)
    }
    fetchAgents()
  }, [isOpen, currentAgent.id])

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearch('')
      setSelectedIds(new Set())
      setGroupName('')
      setChannelName('')
      setChannelDescription('')
      setChannelIcon('💬')
      setChannelTeams(new Set())
      setActiveTab(defaultTab)
      setDmLoadingId(null)
      setDmError(null)
    }
  }, [isOpen, defaultTab])

  const filteredAgents = useMemo(() => {
    if (!search.trim()) return agents
    const q = search.toLowerCase()
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.team.toLowerCase().includes(q) ||
        a.office.toLowerCase().includes(q)
    )
  }, [agents, search])

  const toggleAgent = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleTeam = (team: string) => {
    setChannelTeams((prev) => {
      const next = new Set(prev)
      if (next.has(team)) {
        next.delete(team)
      } else {
        next.add(team)
      }
      return next
    })
  }

  const handleCreate = () => {
    if (activeTab === 'group') {
      if (selectedIds.size < 1 || !groupName.trim()) return
      onCreateGroup(groupName.trim(), Array.from(selectedIds))
    } else if (activeTab === 'channel') {
      if (!channelName.trim()) return
      onCreateChannel(
        channelName.trim(),
        channelDescription.trim(),
        channelIcon,
        Array.from(channelTeams)
      )
    }
  }

  if (!isOpen) return null

  const availableTabs = TABS.filter((t) => !t.adminOnly || isAdmin)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-lg font-bold text-slate-900">New Conversation</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab selector */}
        <div className="flex border-b border-slate-100 px-5 shrink-0">
          {availableTabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key)
                  setSearch('')
                }}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px',
                  activeTab === tab.key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Search (DM & Group) */}
          {(activeTab === 'dm' || activeTab === 'group') && (
            <div className="p-4 pb-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search agents by name, team, or office..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all placeholder:text-slate-400"
                />
              </div>

              {/* Selected agents (Group only) */}
              {activeTab === 'group' && selectedIds.size > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {Array.from(selectedIds).map((id) => {
                    const agent = agents.find((a) => a.id === id)
                    if (!agent) return null
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 border border-blue-100 rounded-md text-xs font-medium text-blue-700"
                      >
                        {agent.name}
                        <button
                          onClick={() => toggleAgent(id)}
                          className="text-blue-400 hover:text-blue-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Agent list (DM & Group) */}
          {(activeTab === 'dm' || activeTab === 'group') && (
            <div className="px-2 pb-2">
              {isLoading ? (
                <div className="space-y-1 p-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2.5 animate-pulse">
                      <div className="w-8 h-8 rounded-full bg-slate-200" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3.5 w-28 bg-slate-200 rounded" />
                        <div className="h-3 w-20 bg-slate-100 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredAgents.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-slate-400">No agents found.</p>
                </div>
              ) : (
                <div className="space-y-0.5 p-1">
                  {filteredAgents.map((agent) => (
                    <button
                      key={agent.id}
                      onClick={async () => {
                        if (activeTab === 'dm') {
                          setDmLoadingId(agent.id)
                          setDmError(null)
                          try {
                            await onCreateDM(agent.id)
                          } catch (err: any) {
                            console.error('[CreateConversationModal] DM creation failed:', err)
                            setDmError(err?.message || 'Failed to create direct message. Please try again.')
                          } finally {
                            setDmLoadingId(null)
                          }
                        } else {
                          toggleAgent(agent.id)
                        }
                      }}
                      disabled={dmLoadingId !== null}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-200',
                        activeTab === 'group' && selectedIds.has(agent.id)
                          ? 'bg-blue-50 ring-1 ring-blue-200'
                          : 'hover:bg-slate-50',
                        dmLoadingId === agent.id && 'bg-blue-50/50 ring-1 ring-blue-200',
                        dmLoadingId !== null && dmLoadingId !== agent.id && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      {/* Checkbox (Group) */}
                      {activeTab === 'group' && (
                        <div
                          className={cn(
                            'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                            selectedIds.has(agent.id)
                              ? 'bg-blue-600 border-blue-600'
                              : 'border-slate-300'
                          )}
                        >
                          {selectedIds.has(agent.id) && (
                            <Check className="w-3 h-3 text-white" />
                          )}
                        </div>
                      )}

                      {/* Avatar */}
                      <div className="relative shrink-0">
                        <div
                          className={cn(
                            'w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold',
                            getAvatarColor(agent.name)
                          )}
                        >
                          {agent.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="absolute -bottom-0.5 -right-0.5">
                          <UserPresenceBadge status={agent.presence} size="sm" />
                        </div>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {agent.name}
                        </p>
                        <p className="text-xs text-slate-400 truncate">
                          {agent.team} · {agent.office}
                        </p>
                      </div>

                      {/* Loading indicator for DM creation */}
                      {dmLoadingId === agent.id && (
                        <div className="shrink-0 w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* DM Error Message */}
          {dmError && activeTab === 'dm' && (
            <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {dmError}
            </div>
          )}

          {/* Channel form */}
          {activeTab === 'channel' && (
            <div className="p-5 space-y-4">
              {/* Channel name */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Channel Name
                </label>
                <div className="flex items-center gap-2">
                  {/* Emoji picker */}
                  <div className="relative">
                    <button
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-50 border border-slate-200 text-lg hover:bg-slate-100 transition-colors"
                    >
                      {channelIcon}
                    </button>
                    {showEmojiPicker && (
                      <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg p-2 grid grid-cols-6 gap-1 z-10 min-w-[200px]">
                        {EMOJI_OPTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => {
                              setChannelIcon(emoji)
                              setShowEmojiPicker(false)
                            }}
                            className={cn(
                              'w-8 h-8 flex items-center justify-center rounded hover:bg-slate-100 transition-colors text-lg',
                              channelIcon === emoji && 'bg-blue-50 ring-1 ring-blue-200'
                            )}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. general, announcements..."
                    value={channelName}
                    onChange={(e) => setChannelName(e.target.value)}
                    className="flex-1 px-3 py-2.5 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Description
                  <span className="text-slate-400 font-normal ml-1">(optional)</span>
                </label>
                <textarea
                  placeholder="What is this channel about?"
                  value={channelDescription}
                  onChange={(e) => setChannelDescription(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all placeholder:text-slate-400 resize-none min-h-[60px]"
                  rows={2}
                />
              </div>

              {/* Team restriction */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Team Access
                  <span className="text-slate-400 font-normal ml-1">
                    (leave empty for all teams)
                  </span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {TEAM_OPTIONS.map((team) => (
                    <button
                      key={team}
                      onClick={() => toggleTeam(team)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                        channelTeams.has(team)
                          ? 'bg-blue-50 border-blue-200 text-blue-700'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      )}
                    >
                      {team}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer - Group & Channel have a create button */}
        {(activeTab === 'group' || activeTab === 'channel') && (
          <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/50 shrink-0">
            {activeTab === 'group' && (
              <div className="mb-3">
                <input
                  type="text"
                  placeholder="Group name (required)"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all placeholder:text-slate-400"
                />
              </div>
            )}
            <button
              onClick={handleCreate}
              disabled={
                (activeTab === 'group' && (selectedIds.size < 1 || !groupName.trim())) ||
                (activeTab === 'channel' && !channelName.trim())
              }
              className={cn(
                'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all',
                (activeTab === 'group' && selectedIds.size >= 1 && groupName.trim()) ||
                  (activeTab === 'channel' && channelName.trim())
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              )}
            >
              <Plus className="w-4 h-4" />
              Create {activeTab === 'group' ? 'Group Chat' : 'Channel'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
