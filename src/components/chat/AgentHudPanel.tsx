'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Agent } from '@/lib/chat/types'
import { cn } from '@/lib/utils'
import { Search, LayoutGrid, List, Users, Loader2, X } from 'lucide-react'
import UserPresenceBadge from '@/components/chat/UserPresenceBadge'

function getEffectivePresence(agent: Agent): 'online' | 'away' | 'busy' | 'offline' {
  if (agent.presence === 'offline') return 'offline'
  if (!agent.last_seen_at) return 'offline'
  const lastSeen = new Date(agent.last_seen_at).getTime()
  const threeMinAgo = Date.now() - 3 * 60 * 1000
  if (lastSeen < threeMinAgo) return 'offline'
  return agent.presence || 'offline'
}

const AVATAR_COLORS = [
  'bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-emerald-500',
  'bg-cyan-500', 'bg-blue-500', 'bg-indigo-500', 'bg-violet-500',
  'bg-purple-500', 'bg-fuchsia-500', 'bg-pink-500', 'bg-rose-500',
]

function getAvatarColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function getInitials(name: string) {
  if (!name) return '?'
  const parts = name.split(' ')
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.substring(0, 2).toUpperCase()
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status', dot: '' },
  { value: 'online', label: 'Online', dot: 'bg-emerald-500' },
  { value: 'away', label: 'Away', dot: 'bg-amber-500' },
  { value: 'busy', label: 'Busy', dot: 'bg-red-500' },
  { value: 'offline', label: 'Offline', dot: 'bg-slate-300' },
] as const

export default function AgentHudPanel() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [officeFilter, setOfficeFilter] = useState<string>('all')
  const [teamFilter, setTeamFilter] = useState<string>('all')
  const [spanishOnly, setSpanishOnly] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  const fetchAgents = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('agents')
        .select('*')
        .eq('active', true)
        .order('name')

      if (error) {
        console.error('Error fetching agents:', error)
        return
      }

      setAgents(data || [])
    } catch (err) {
      console.error('Error in fetchAgents:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAgents()
    const interval = setInterval(fetchAgents, 30000)
    return () => clearInterval(interval)
  }, [fetchAgents])

  const filteredAgents = useMemo(() => {
    return agents.filter(agent => {
      if (searchQuery && !agent.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
      if (statusFilter !== 'all' && getEffectivePresence(agent) !== statusFilter) return false
      if (officeFilter !== 'all' && agent.office !== officeFilter) return false
      if (teamFilter !== 'all' && agent.team !== teamFilter) return false
      if (spanishOnly && !agent.speaks_spanish) return false
      return true
    })
  }, [agents, searchQuery, statusFilter, officeFilter, teamFilter, spanishOnly])

  const onlineCount = useMemo(() => filteredAgents.filter(a => getEffectivePresence(a) === 'online').length, [filteredAgents])
  const awayCount = useMemo(() => filteredAgents.filter(a => getEffectivePresence(a) === 'away').length, [filteredAgents])
  const busyCount = useMemo(() => filteredAgents.filter(a => getEffectivePresence(a) === 'busy').length, [filteredAgents])

  const hasActiveFilters = searchQuery || statusFilter !== 'all' || officeFilter !== 'all' || teamFilter !== 'all' || spanishOnly

  const clearFilters = () => {
    setSearchQuery('')
    setStatusFilter('all')
    setOfficeFilter('all')
    setTeamFilter('all')
    setSpanishOnly(false)
  }

  if (isLoading && agents.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  const getPresenceColor = (presence: string) => {
    switch (presence) {
      case 'online': return 'ring-emerald-500'
      case 'away': return 'ring-amber-500'
      case 'busy': return 'ring-red-500'
      default: return 'ring-slate-300'
    }
  }

  const getPresenceDot = (presence: string) => {
    switch (presence) {
      case 'online': return 'bg-emerald-500'
      case 'away': return 'bg-amber-500'
      case 'busy': return 'bg-red-500'
      default: return 'bg-slate-300'
    }
  }

  return (
    <div className="flex h-full flex-col bg-slate-50/50">
      {/* ── Filter Bar ── */}
      <div className="border-b border-slate-200 bg-white px-4 py-2.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative min-w-[180px] flex-1 max-w-[260px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-full rounded-md border border-slate-200 bg-slate-50 pl-8 pr-3 text-[13px] placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600" />
              </button>
            )}
          </div>

          {/* Divider */}
          <div className="h-5 w-px bg-slate-200 hidden sm:block" />

          {/* Status Filter — pill buttons */}
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(statusFilter === opt.value ? 'all' : opt.value)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition-all",
                  statusFilter === opt.value
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                {opt.dot && <span className={cn("w-2 h-2 rounded-full shrink-0", opt.dot)} />}
                {opt.label}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="h-5 w-px bg-slate-200 hidden sm:block" />

          {/* Office */}
          <select
            value={officeFilter}
            onChange={(e) => setOfficeFilter(e.target.value)}
            className={cn(
              "h-8 rounded-md border px-2 pr-7 text-[12px] font-medium appearance-none bg-[right_6px_center] bg-[length:12px] bg-no-repeat cursor-pointer transition-colors",
              officeFilter !== 'all'
                ? "border-blue-300 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
            )}
            style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")` }}
          >
            <option value="all">Office</option>
            <option value="MCM">MCM</option>
            <option value="MB">MB</option>
            <option value="RC">RC</option>
            <option value="CH">CH</option>
          </select>

          {/* Team */}
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className={cn(
              "h-8 rounded-md border px-2 pr-7 text-[12px] font-medium appearance-none bg-[right_6px_center] bg-[length:12px] bg-no-repeat cursor-pointer transition-colors",
              teamFilter !== 'all'
                ? "border-blue-300 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
            )}
            style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")` }}
          >
            <option value="all">Team</option>
            <option value="Sales">Sales</option>
            <option value="CSR">CSR</option>
            <option value="EA">EA</option>
            <option value="Managers">Managers</option>
          </select>

          {/* Spanish Toggle */}
          <button
            onClick={() => setSpanishOnly(!spanishOnly)}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium transition-all cursor-pointer",
              spanishOnly
                ? "border-blue-300 bg-blue-50 text-blue-700 shadow-sm"
                : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
            )}
          >
            🇲🇽 Spanish
          </button>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex h-8 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* View Toggle + Count */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-slate-400 hidden sm:inline">
              {filteredAgents.length} agents
              {onlineCount > 0 && <span className="text-emerald-600"> · {onlineCount} on</span>}
              {awayCount > 0 && <span className="text-amber-600"> · {awayCount} away</span>}
              {busyCount > 0 && <span className="text-red-600"> · {busyCount} busy</span>}
            </span>
            <div className="flex h-7 items-center rounded-md border border-slate-200 bg-slate-50 p-0.5">
              <button
                onClick={() => setViewMode('grid')}
                className={cn(
                  "flex h-full items-center justify-center rounded px-1.5 transition-colors",
                  viewMode === 'grid' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={cn(
                  "flex h-full items-center justify-center rounded px-1.5 transition-colors",
                  viewMode === 'list' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                )}
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 overflow-auto p-3">
        {filteredAgents.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-500">
            <Users className="h-8 w-8 text-slate-300" />
            <p className="text-sm">No agents found matching filters.</p>
          </div>
        ) : viewMode === 'grid' ? (
          /* ── Grid View (Compact) ── */
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10">
            {filteredAgents.map(agent => {
              const presence = getEffectivePresence(agent)
              const ringColor = getPresenceColor(presence)

              return (
                <div
                  key={agent.id}
                  className="group relative flex flex-col items-center rounded-lg border border-slate-200 bg-white px-2 py-2.5 text-center transition-all hover:shadow-sm hover:border-slate-300"
                >
                  {/* Avatar with presence ring */}
                  <div className="relative mb-1.5">
                    <div className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full text-white ring-2 ring-offset-1",
                      ringColor,
                      !agent.avatar_url && getAvatarColor(agent.name)
                    )}>
                      {agent.avatar_url ? (
                        <img src={agent.avatar_url} alt={agent.name} className="h-full w-full rounded-full object-cover" />
                      ) : (
                        <span className="text-xs font-semibold">{getInitials(agent.name)}</span>
                      )}
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5">
                      <UserPresenceBadge status={presence} size="sm" />
                    </div>
                  </div>

                  {/* Name */}
                  <div className="w-full truncate text-[12px] font-medium text-slate-800 leading-tight" title={agent.name}>
                    {agent.name.split(' ')[0]}
                    {agent.name.split(' ').length > 1 && (
                      <span className="text-slate-400"> {agent.name.split(' ').slice(1).map(n => n[0]).join('')}</span>
                    )}
                  </div>

                  {/* Badges row */}
                  <div className="mt-1 flex items-center gap-0.5 flex-wrap justify-center">
                    {agent.office && (
                      <span className="rounded bg-slate-100 px-1 py-px text-[9px] font-medium text-slate-500">
                        {agent.office}
                      </span>
                    )}
                    {agent.speaks_spanish && (
                      <span className="text-[9px]" title="Spanish">🇲🇽</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* ── List View ── */
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2 font-semibold">Agent</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Team</th>
                  <th className="px-3 py-2 font-semibold">Office</th>
                  <th className="px-3 py-2 font-semibold w-16">🇲🇽</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAgents.map(agent => {
                  const presence = getEffectivePresence(agent)
                  const statusText = agent.status_message || (presence.charAt(0).toUpperCase() + presence.slice(1))

                  return (
                    <tr key={agent.id} className="hover:bg-slate-50/80 h-10">
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          <div className="relative shrink-0">
                            <div className={cn(
                              "flex h-6 w-6 items-center justify-center rounded-full text-white text-[9px] ring-1 ring-offset-1",
                              getPresenceColor(presence),
                              !agent.avatar_url && getAvatarColor(agent.name)
                            )}>
                              {agent.avatar_url ? (
                                <img src={agent.avatar_url} alt={agent.name} className="h-full w-full rounded-full object-cover" />
                              ) : (
                                <span className="font-semibold">{getInitials(agent.name)}</span>
                              )}
                            </div>
                          </div>
                          <span className="font-medium text-slate-800">{agent.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className={cn("w-2 h-2 rounded-full shrink-0", getPresenceDot(presence))} />
                          <span className="text-slate-600 truncate max-w-[120px]">{statusText}</span>
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-slate-600">{agent.team || '—'}</td>
                      <td className="px-3 py-1.5 text-slate-600">{agent.office || '—'}</td>
                      <td className="px-3 py-1.5">
                        {agent.speaks_spanish && <span title="Speaks Spanish">🇲🇽</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
