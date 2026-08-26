'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  X,
  Hash,
  Users,
  Search,
  Check,
  UserPlus,
  UserMinus,
  Trash2,
  Save,
  Loader2,
  Shield,
  Building2,
  Info,
  Lock,
  Globe
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabaseClient'
import {
  updateConversation,
  addMembers,
  removeMember,
  getConversationMembers,
} from '@/lib/chat/conversations'
import UserPresenceBadge from './UserPresenceBadge'
import type { Conversation, Agent } from './types'

interface ConversationSettingsModalProps {
  conversation: Conversation
  currentAgent: Agent
  isOpen: boolean
  onClose: () => void
  onConversationUpdated: (updated: Conversation) => void
  onMembersUpdated: () => void
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

export default function ConversationSettingsModal({
  conversation,
  currentAgent,
  isOpen,
  onClose,
  onConversationUpdated,
  onMembersUpdated,
}: ConversationSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'members' | 'invite'>('details')

  // Channel details state
  const [name, setName] = useState(conversation.name || '')
  const [description, setDescription] = useState(conversation.description || '')
  const [isSavingDetails, setIsSavingDetails] = useState(false)
  const [detailsSuccess, setDetailsSuccess] = useState(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)

  // Members state
  const [members, setMembers] = useState<Agent[]>([])
  const [isLoadingMembers, setIsLoadingMembers] = useState(true)
  const [memberSearch, setMemberSearch] = useState('')
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null)

  // Invite state
  const [allAvailableAgents, setAllAvailableAgents] = useState<Agent[]>([])
  const [isLoadingAvailable, setIsLoadingAvailable] = useState(false)
  const [inviteSearch, setInviteSearch] = useState('')
  const [selectedInviteIds, setSelectedInviteIds] = useState<Set<string>>(new Set())
  const [isInviting, setIsInviting] = useState(false)
  const [inviteSuccess, setInviteSuccess] = useState(false)

  const canManage = useMemo(() => {
    return (
      currentAgent.role === 'admin' ||
      currentAgent.team === 'Managers' ||
      conversation.created_by === currentAgent.id
    )
  }, [currentAgent, conversation])

  const isChannel = conversation.type === 'channel' || (conversation.type as string) === 'private_channel'

  // Reset form when conversation changes
  useEffect(() => {
    setName(conversation.name || '')
    setDescription(conversation.description || '')
    setDetailsSuccess(false)
    setDetailsError(null)
  }, [conversation])

  // Fetch current conversation members
  const fetchMembers = useCallback(async () => {
    if (!conversation.id) return
    setIsLoadingMembers(true)
    try {
      const memberData = await getConversationMembers(conversation.id)
      const agentMembers = memberData
        .filter((m) => m.agent)
        .map((m) => m.agent as Agent)
      setMembers(agentMembers)
    } catch (err) {
      console.error('Failed to fetch members:', err)
    } finally {
      setIsLoadingMembers(false)
    }
  }, [conversation.id])

  // Fetch all active agents available to be invited
  const fetchAvailableAgents = useCallback(async () => {
    setIsLoadingAvailable(true)
    try {
      const { data } = await supabase
        .from('agents')
        .select('*')
        .eq('active', true)
        .eq('report_visible', true)
        .order('name', { ascending: true })

      if (data) {
        setAllAvailableAgents(data as Agent[])
      }
    } catch (err) {
      console.error('Failed to fetch available agents:', err)
    } finally {
      setIsLoadingAvailable(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      fetchMembers()
      fetchAvailableAgents()
      setSelectedInviteIds(new Set())
      setInviteSuccess(false)
    }
  }, [isOpen, fetchMembers, fetchAvailableAgents])

  if (!isOpen) return null

  // Filtered members
  const filteredMembers = members.filter((m) =>
    m.name.toLowerCase().includes(memberSearch.toLowerCase()) ||
    m.office?.toLowerCase().includes(memberSearch.toLowerCase()) ||
    m.team?.toLowerCase().includes(memberSearch.toLowerCase())
  )

  // Eligible agents to invite (not already members)
  const currentMemberIds = new Set(members.map((m) => m.id))
  const unjoinedAgents = allAvailableAgents.filter(
    (a) => !currentMemberIds.has(a.id)
  )

  const filteredUnjoinedAgents = unjoinedAgents.filter((a) =>
    a.name.toLowerCase().includes(inviteSearch.toLowerCase()) ||
    a.office?.toLowerCase().includes(inviteSearch.toLowerCase()) ||
    a.team?.toLowerCase().includes(inviteSearch.toLowerCase())
  )

  // Save Channel Details
  const handleSaveDetails = async () => {
    if (!canManage) return
    const trimmedName = name.trim()
    if (isChannel && !trimmedName) {
      setDetailsError('Channel name cannot be empty')
      return
    }

    setIsSavingDetails(true)
    setDetailsError(null)
    setDetailsSuccess(false)

    try {
      await updateConversation(conversation.id, {
        name: trimmedName || null,
        description: description.trim() || null,
      })

      const updatedConv: Conversation = {
        ...conversation,
        name: trimmedName || null,
        description: description.trim() || null,
      }

      onConversationUpdated(updatedConv)
      setDetailsSuccess(true)
      setTimeout(() => setDetailsSuccess(false), 2500)
    } catch (err: any) {
      console.error('Failed to update channel:', err)
      setDetailsError(err.message || 'Failed to update channel details')
    } finally {
      setIsSavingDetails(false)
    }
  }

  // Remove Member
  const handleRemoveMember = async (agentId: string) => {
    if (!canManage) return
    setRemovingMemberId(agentId)
    try {
      await removeMember(conversation.id, agentId)
      setMembers((prev) => prev.filter((m) => m.id !== agentId))
      onMembersUpdated()
    } catch (err) {
      console.error('Failed to remove member:', err)
    } finally {
      setRemovingMemberId(null)
    }
  }

  // Toggle Invite selection
  const toggleInviteAgent = (agentId: string) => {
    setSelectedInviteIds((prev) => {
      const next = new Set(prev)
      if (next.has(agentId)) {
        next.delete(agentId)
      } else {
        next.add(agentId)
      }
      return next
    })
  }

  // Submit Invites
  const handleAddSelectedMembers = async () => {
    if (!canManage || selectedInviteIds.size === 0) return
    setIsInviting(true)
    try {
      await addMembers(conversation.id, Array.from(selectedInviteIds))
      setSelectedInviteIds(new Set())
      setInviteSuccess(true)
      await fetchMembers()
      onMembersUpdated()
      setTimeout(() => {
        setInviteSuccess(false)
        setActiveTab('members')
      }, 1000)
    } catch (err) {
      console.error('Failed to add members:', err)
    } finally {
      setIsInviting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Modal Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400">
              {isChannel ? <Hash className="w-5 h-5" /> : <Users className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-tight">
                {isChannel ? `#${conversation.name}` : conversation.name || 'Conversation'}
              </h2>
              <p className="text-xs text-slate-400">
                {isChannel ? 'Channel Settings & Members' : 'Conversation Settings'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Tabs Navigation ── */}
        <div className="flex border-b border-slate-100 dark:border-slate-800 px-6 shrink-0 bg-slate-50/50 dark:bg-slate-800/30">
          <button
            onClick={() => setActiveTab('details')}
            className={cn(
              'px-4 py-3 text-xs font-bold border-b-2 transition-all',
              activeTab === 'details'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            )}
          >
            Channel Details
          </button>
          <button
            onClick={() => setActiveTab('members')}
            className={cn(
              'px-4 py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5',
              activeTab === 'members'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            )}
          >
            Members
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
              {members.length}
            </span>
          </button>
          {canManage && (
            <button
              onClick={() => setActiveTab('invite')}
              className={cn(
                'px-4 py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5',
                activeTab === 'invite'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
              )}
            >
              <UserPlus className="w-3.5 h-3.5" />
              Add Members
              {unjoinedAgents.length > 0 && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                  +{unjoinedAgents.length}
                </span>
              )}
            </button>
          )}
        </div>

        {/* ── Tab Contents ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* TAB 1: Channel Details */}
          {activeTab === 'details' && (
            <div className="space-y-4">
              {!canManage && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
                  <Info className="w-4 h-4 shrink-0" />
                  <span>Only Admins and Managers have permission to change channel settings.</span>
                </div>
              )}

              {/* Channel Name */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Channel Name
                </label>
                <div className="relative">
                  {isChannel && (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                      #
                    </span>
                  )}
                  <input
                    type="text"
                    disabled={!canManage || isSavingDetails}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Chula Vista, Sales, Managers"
                    className={cn(
                      'w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 text-sm text-slate-900 dark:text-slate-100 outline-none transition shadow-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
                      isChannel ? 'pl-7 pr-3' : 'px-3'
                    )}
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Changing the channel name updates it across the Communication Hub and sidebar for all members.
                </p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Description / Topic
                </label>
                <textarea
                  disabled={!canManage || isSavingDetails}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="What is this channel about?"
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm text-slate-900 dark:text-slate-100 outline-none transition shadow-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                />
              </div>

              {/* Privacy Type Badge */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 text-xs">
                <div className="flex items-center gap-2">
                  {conversation.is_private ? (
                    <Lock className="w-4 h-4 text-amber-500" />
                  ) : (
                    <Globe className="w-4 h-4 text-emerald-500" />
                  )}
                  <div>
                    <div className="font-bold text-slate-800 dark:text-slate-200 capitalize">
                      {conversation.type.replace('_', ' ')}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {conversation.is_private
                        ? 'Only invited members can view this conversation.'
                        : 'Anyone in the agency can join and read.'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Error or Success feedback */}
              {detailsError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs rounded-xl border border-red-200 dark:border-red-800">
                  {detailsError}
                </div>
              )}
              {detailsSuccess && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs rounded-xl border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5">
                  <Check className="w-4 h-4" />
                  <span>Channel details updated successfully!</span>
                </div>
              )}

              {/* Action Buttons */}
              {canManage && (
                <div className="pt-2 flex justify-end">
                  <button
                    onClick={handleSaveDetails}
                    disabled={isSavingDetails}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-colors"
                  >
                    {isSavingDetails ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    Save Changes
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Members List */}
          {activeTab === 'members' && (
            <div className="space-y-3">
              {/* Search filter */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter channel members..."
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {isLoadingMembers ? (
                <div className="py-8 flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                </div>
              ) : filteredMembers.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No members found matching your search.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
                  {filteredMembers.map((member) => {
                    const isSelf = member.id === currentAgent.id
                    const isRemoving = removingMemberId === member.id

                    return (
                      <div
                        key={member.id}
                        className="py-2.5 px-2 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="relative shrink-0 w-8 h-8">
                            <div
                              className={cn(
                                'w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold select-none shadow-xs',
                                getAvatarColor(member.name)
                              )}
                            >
                              {member.name.charAt(0).toUpperCase()}
                            </div>
                            {member.presence && (
                              <UserPresenceBadge
                                status={member.presence as any}
                                size="sm"
                                className="absolute -bottom-0.5 -right-0.5 ring-2 ring-white dark:ring-slate-900"
                              />
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                                {member.name}
                              </span>
                              {isSelf && (
                                <span className="text-[10px] text-slate-400 font-normal">
                                  (You)
                                </span>
                              )}
                              {member.role === 'admin' && (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200/60">
                                  Admin
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                              {member.team && (
                                <span>{member.team}</span>
                              )}
                              {member.office && (
                                <span>• {member.office}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Remove Action */}
                        {canManage && !isSelf && (
                          <button
                            onClick={() => handleRemoveMember(member.id)}
                            disabled={isRemoving}
                            title={`Remove ${member.name} from channel`}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                          >
                            {isRemoving ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Add / Invite Members */}
          {activeTab === 'invite' && canManage && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search agents to invite..."
                  value={inviteSearch}
                  onChange={(e) => setInviteSearch(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {inviteSuccess && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs rounded-xl border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5">
                  <Check className="w-4 h-4" />
                  <span>Members added successfully!</span>
                </div>
              )}

              {isLoadingAvailable ? (
                <div className="py-8 flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                </div>
              ) : filteredUnjoinedAgents.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  {unjoinedAgents.length === 0
                    ? 'All active agents are already members of this channel!'
                    : 'No agents match your search.'}
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
                  {filteredUnjoinedAgents.map((agent) => {
                    const isSelected = selectedInviteIds.has(agent.id)

                    return (
                      <div
                        key={agent.id}
                        onClick={() => toggleInviteAgent(agent.id)}
                        className={cn(
                          'py-2 px-2.5 flex items-center justify-between rounded-lg cursor-pointer transition-colors',
                          isSelected
                            ? 'bg-blue-50/80 dark:bg-blue-950/40'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={cn(
                              'w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold select-none shrink-0 shadow-xs',
                              getAvatarColor(agent.name)
                            )}
                          >
                            {agent.name.charAt(0).toUpperCase()}
                          </div>

                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                              {agent.name}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400">
                              {agent.team && <span>{agent.team}</span>}
                              {agent.office && <span>• {agent.office}</span>}
                            </div>
                          </div>
                        </div>

                        <div
                          className={cn(
                            'w-5 h-5 rounded-md border flex items-center justify-center transition-colors',
                            isSelected
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'border-slate-300 dark:border-slate-600'
                          )}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5" />}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {selectedInviteIds.size > 0 && (
                <div className="pt-2 flex items-center justify-between border-t border-slate-100 dark:border-slate-800">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {selectedInviteIds.size} agent{selectedInviteIds.size !== 1 && 's'} selected
                  </span>
                  <button
                    onClick={handleAddSelectedMembers}
                    disabled={isInviting}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-colors"
                  >
                    {isInviting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <UserPlus className="w-4 h-4" />
                    )}
                    Add to Channel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
