'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Agent } from '@/lib/chat/types'
import { cn } from '@/lib/utils'
import {
  Search,
  LayoutGrid,
  List,
  Users,
  Loader2,
  X,
  Phone,
  PhoneCall,
  Mail,
  Copy,
  Check,
  Building2,
  Briefcase
} from 'lucide-react'
import UserPresenceBadge from '@/components/chat/UserPresenceBadge'

type DirectoryEntryContact = {
  name: string
  position?: string | null
  ring_central_phone?: string | null
  ricochet_phone?: string | null
  email?: string | null
}

type EnrichedAgent = Agent & {
  position?: string | null
  ring_central_phone?: string | null
  ricochet_phone?: string | null
}

function getEffectivePresence(agent: Agent): 'online' | 'away' | 'busy' | 'offline' {
  if (agent.presence === 'offline') return 'offline'
  if (!agent.last_seen_at) return 'offline'
  const lastSeen = new Date(agent.last_seen_at).getTime()
  const threeMinAgo = Date.now() - 3 * 60 * 1000
  if (lastSeen < threeMinAgo) return 'offline'
  return agent.presence || 'offline'
}

/**
 * Extracts pure phone number and optional extension
 * E.g. "909-267-3582 Ext 103" -> { phone: "909-267-3582", ext: "Ext 103" }
 */
function parsePhoneAndExt(raw?: string | null): { phone: string; ext: string | null } {
  if (!raw) return { phone: '', ext: null }
  const match = raw.match(/^(.*?)(?:\s*(?:ext\.?|x)\s*(\d+))?$/i)
  if (match && match[1]) {
    return {
      phone: match[1].trim(),
      ext: match[2] ? `Ext ${match[2]}` : null,
    }
  }
  return { phone: raw.trim(), ext: null }
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

// Known name alias mapping from agent name -> directory name
const ALIAS_MAP: Record<string, string> = {
  'charlie paz': 'carlos charlie paz',
  'ric becerra': 'ricardo becerra',
  'gabby': 'carmen “gabby” davis',
  'rosie': 'rosario delgado',
  'roxana': 'roxanna topete',
}

export default function AgentHudPanel() {
  const [agents, setAgents] = useState<EnrichedAgent[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Filters: only "all" and "online"
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'online'>('all')
  const [officeFilter, setOfficeFilter] = useState<string>('all')
  const [teamFilter, setTeamFilter] = useState<string>('all')
  const [spanishOnly, setSpanishOnly] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  // Click-to-open Modal state
  const [selectedAgent, setSelectedAgent] = useState<EnrichedAgent | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const copyToClipboard = useCallback((text: string, key: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    if (!text) return
    navigator.clipboard.writeText(text).catch(() => {
      const textArea = document.createElement('textarea')
      textArea.value = text
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
    })
    setCopiedKey(key)
    setTimeout(() => {
      setCopiedKey(prev => prev === key ? null : prev)
    }, 1500)
  }, [])

  const fetchAgentsAndDirectory = useCallback(async () => {
    try {
      const [{ data: rawAgents, error: agentErr }, { data: rawEntries, error: entErr }] = await Promise.all([
        supabase.from('agents').select('*').eq('active', true).order('name'),
        supabase.from('directory_entries').select('name, position, ring_central_phone, ricochet_phone, email').eq('is_active', true)
      ])

      if (agentErr) {
        console.error('Error fetching agents:', agentErr)
        return
      }

      // Build lookup map from directory entries
      const dirMap = new Map<string, DirectoryEntryContact>()
      if (rawEntries) {
        rawEntries.forEach((e: DirectoryEntryContact) => {
          const clean = e.name.replace(/\s*\(\s*Mgr\.?\s*\)/i, '').trim().toLowerCase()
          dirMap.set(clean, e)
          const first = clean.split(' ')[0]
          if (!dirMap.has(first)) {
            dirMap.set(first, e)
          }
        })
      }

      const enriched: EnrichedAgent[] = (rawAgents || []).map((agent: Agent) => {
        const lowerName = agent.name.trim().toLowerCase()
        const aliasTarget = ALIAS_MAP[lowerName] || lowerName
        const entry = dirMap.get(aliasTarget) || dirMap.get(lowerName.split(' ')[0])

        return {
          ...agent,
          position: entry?.position || agent.role || agent.team || null,
          ring_central_phone: entry?.ring_central_phone || null,
          ricochet_phone: entry?.ricochet_phone || null,
          email: agent.email || entry?.email || null,
        }
      })

      setAgents(enriched)
    } catch (err) {
      console.error('Error in fetchAgentsAndDirectory:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAgentsAndDirectory()
    const interval = setInterval(fetchAgentsAndDirectory, 30000)
    return () => clearInterval(interval)
  }, [fetchAgentsAndDirectory])

  // Filtered agent list
  const filteredAgents = useMemo(() => {
    return agents.filter(agent => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const matchName = agent.name.toLowerCase().includes(q)
        const matchRc = agent.ring_central_phone?.toLowerCase().includes(q)
        const matchRico = agent.ricochet_phone?.toLowerCase().includes(q)
        const matchEmail = agent.email?.toLowerCase().includes(q)
        if (!matchName && !matchRc && !matchRico && !matchEmail) return false
      }
      if (statusFilter === 'online' && getEffectivePresence(agent) !== 'online') return false
      if (officeFilter !== 'all' && agent.office !== officeFilter) return false
      if (teamFilter !== 'all' && agent.team !== teamFilter) return false
      if (spanishOnly && !agent.speaks_spanish) return false
      return true
    })
  }, [agents, searchQuery, statusFilter, officeFilter, teamFilter, spanishOnly])

  const onlineCount = useMemo(() => agents.filter(a => getEffectivePresence(a) === 'online').length, [agents])

  const hasActiveFilters = searchQuery || statusFilter !== 'all' || officeFilter !== 'all' || teamFilter !== 'all' || spanishOnly

  const clearFilters = () => {
    setSearchQuery('')
    setStatusFilter('all')
    setOfficeFilter('all')
    setTeamFilter('all')
    setSpanishOnly(false)
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

  if (isLoading && agents.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="relative flex h-full flex-col bg-slate-50/50">
      {/* ── Filter Bar ── */}
      <div className="border-b border-slate-200 bg-white px-3 py-2 sm:px-4 sm:py-2.5 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search Input */}
          <div className="relative min-w-[150px] flex-1 max-w-[240px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search agent or phone..."
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

          {/* Status Filter: Only 'All' and 'Online' */}
          <div className="flex items-center rounded-lg bg-slate-100 p-0.5 border border-slate-200/60">
            <button
              onClick={() => setStatusFilter('all')}
              className={cn(
                "px-2.5 py-1 rounded-md text-[12px] font-medium transition-all cursor-pointer",
                statusFilter === 'all'
                  ? "bg-white text-slate-900 shadow-xs font-semibold"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              All Status
            </button>
            <button
              onClick={() => setStatusFilter('online')}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition-all cursor-pointer",
                statusFilter === 'online'
                  ? "bg-white text-slate-900 shadow-xs font-semibold"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Online ({onlineCount})
            </button>
          </div>

          {/* Office Filter */}
          <select
            value={officeFilter}
            onChange={(e) => setOfficeFilter(e.target.value)}
            className={cn(
              "h-8 rounded-md border px-2 pr-6 text-[12px] font-medium appearance-none bg-[right_6px_center] bg-[length:10px] bg-no-repeat cursor-pointer transition-colors",
              officeFilter !== 'all'
                ? "border-blue-300 bg-blue-50 text-blue-700 font-semibold"
                : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
            )}
            style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")` }}
          >
            <option value="all">All Offices</option>
            <option value="MCM">MCM</option>
            <option value="MB">MB</option>
            <option value="RC">RC</option>
            <option value="CH">CH</option>
          </select>

          {/* Team Filter */}
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className={cn(
              "h-8 rounded-md border px-2 pr-6 text-[12px] font-medium appearance-none bg-[right_6px_center] bg-[length:10px] bg-no-repeat cursor-pointer transition-colors",
              teamFilter !== 'all'
                ? "border-blue-300 bg-blue-50 text-blue-700 font-semibold"
                : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
            )}
            style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")` }}
          >
            <option value="all">All Teams</option>
            <option value="Sales">Sales</option>
            <option value="CSR">CSR</option>
            <option value="EA">EA</option>
            <option value="Managers">Managers</option>
          </select>

          {/* Spanish Filter Button (No 'mx' flag) */}
          <button
            onClick={() => setSpanishOnly(!spanishOnly)}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium transition-all cursor-pointer",
              spanishOnly
                ? "border-amber-400 bg-amber-50 text-amber-800 shadow-xs font-semibold"
                : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
            )}
            title="Filter Spanish-speaking agents"
          >
            <span className={cn("px-1 py-0.5 rounded text-[10px] font-bold", spanishOnly ? "bg-amber-200 text-amber-900" : "bg-slate-200 text-slate-700")}>
              Spa
            </span>
            <span>Spanish</span>
          </button>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex h-8 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* View Mode Toggle + Counts */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-slate-400 hidden lg:inline">
              {filteredAgents.length} agents
            </span>
            <div className="flex h-7 items-center rounded-md border border-slate-200 bg-slate-50 p-0.5">
              <button
                onClick={() => setViewMode('grid')}
                className={cn(
                  "flex h-full items-center justify-center rounded px-1.5 transition-colors cursor-pointer",
                  viewMode === 'grid' ? "bg-white text-slate-900 shadow-xs" : "text-slate-400 hover:text-slate-600"
                )}
                title="Grid View"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={cn(
                  "flex h-full items-center justify-center rounded px-1.5 transition-colors cursor-pointer",
                  viewMode === 'list' ? "bg-white text-slate-900 shadow-xs" : "text-slate-400 hover:text-slate-600"
                )}
                title="List View"
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Content Area ── */}
      <div className="flex-1 overflow-auto p-3">
        {filteredAgents.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-500">
            <Users className="h-8 w-8 text-slate-300" />
            <p className="text-sm">No agents found matching filters.</p>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-xs text-blue-600 hover:underline cursor-pointer">
                Clear all filters
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          /* ── Compact Grid View (Click to Open Detail Modal) ── */
          <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-2">
            {filteredAgents.map(agent => {
              const presence = getEffectivePresence(agent)
              const ringColor = getPresenceColor(presence)

              return (
                <div
                  key={agent.id}
                  onClick={() => setSelectedAgent(agent)}
                  className={cn(
                    "group relative flex flex-col items-center rounded-lg border bg-white p-2 text-center transition-all cursor-pointer select-none",
                    selectedAgent?.id === agent.id
                      ? "border-blue-500 ring-2 ring-blue-500/20 shadow-sm"
                      : "border-slate-200 hover:border-slate-300 hover:shadow-xs active:scale-[0.98]"
                  )}
                >
                  {/* Avatar with status ring */}
                  <div className="relative mb-1.5">
                    <div className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full text-white ring-2 ring-offset-1 transition-transform group-hover:scale-105",
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
                  <div className="w-full truncate text-[12px] font-semibold text-slate-800 leading-tight" title={agent.name}>
                    {agent.name.split(' ')[0]}
                    {agent.name.split(' ').length > 1 && (
                      <span className="text-slate-400 font-normal"> {agent.name.split(' ').slice(1).map(n => n[0]).join('')}</span>
                    )}
                  </div>

                  {/* Badges row: Office, Team, Spa */}
                  <div className="mt-1 flex items-center gap-1 flex-wrap justify-center">
                    {agent.office && (
                      <span className="rounded bg-slate-100 px-1 py-px text-[9px] font-medium text-slate-600">
                        {agent.office}
                      </span>
                    )}
                    {agent.speaks_spanish && (
                      <span className="rounded bg-amber-50 border border-amber-200/80 px-1 py-px text-[9px] font-bold text-amber-700" title="Speaks Spanish">
                        Spa
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* ── List View ── */
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-xs">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 font-semibold">Agent</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">RingCentral</th>
                  <th className="px-3 py-2 font-semibold">Ricochet</th>
                  <th className="px-3 py-2 font-semibold">Office</th>
                  <th className="px-3 py-2 font-semibold w-12 text-center">Spa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAgents.map(agent => {
                  const presence = getEffectivePresence(agent)
                  const statusText = agent.status_message || (presence.charAt(0).toUpperCase() + presence.slice(1))
                  const rc = parsePhoneAndExt(agent.ring_central_phone)

                  return (
                    <tr
                      key={agent.id}
                      onClick={() => setSelectedAgent(agent)}
                      className="hover:bg-blue-50/40 h-10 cursor-pointer transition-colors"
                    >
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
                          <span className="font-semibold text-slate-800">{agent.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className={cn("w-2 h-2 rounded-full shrink-0", getPresenceDot(presence))} />
                          <span className="text-slate-600 truncate max-w-[110px] text-[12px]">{statusText}</span>
                        </div>
                      </td>
                      <td className="px-3 py-1.5">
                        {rc.phone ? (
                          <button
                            onClick={(e) => copyToClipboard(rc.phone, `rc-${agent.id}`, e)}
                            className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 font-mono text-[12px] text-slate-700 hover:bg-slate-100 hover:text-blue-600 transition-colors"
                            title={`Copy number: ${rc.phone}${rc.ext ? ` (${rc.ext})` : ''}`}
                          >
                            <Phone className="h-3 w-3 text-slate-400" />
                            <span>{rc.phone}</span>
                            {rc.ext && (
                              <span className="text-slate-400 text-[10px] font-sans"> {rc.ext}</span>
                            )}
                            {copiedKey === `rc-${agent.id}` ? (
                              <Check className="h-3 w-3 text-emerald-600" />
                            ) : (
                              <Copy className="h-2.5 w-2.5 text-slate-300 opacity-0 group-hover:opacity-100" />
                            )}
                          </button>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        {agent.ricochet_phone ? (
                          <button
                            onClick={(e) => copyToClipboard(agent.ricochet_phone!, `rico-${agent.id}`, e)}
                            className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 font-mono text-[12px] text-slate-700 hover:bg-slate-100 hover:text-blue-600 transition-colors"
                            title="Click to copy Ricochet phone"
                          >
                            <PhoneCall className="h-3 w-3 text-slate-400" />
                            <span>{agent.ricochet_phone}</span>
                            {copiedKey === `rico-${agent.id}` ? (
                              <Check className="h-3 w-3 text-emerald-600" />
                            ) : (
                              <Copy className="h-2.5 w-2.5 text-slate-300 opacity-0 group-hover:opacity-100" />
                            )}
                          </button>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-slate-600 text-[12px]">{agent.office || '—'}</td>
                      <td className="px-3 py-1.5 text-center">
                        {agent.speaks_spanish && (
                          <span className="inline-flex items-center rounded bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 text-[10px] font-bold text-amber-700" title="Speaks Spanish">
                            Spa
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Quick Contact Detail Modal (Triggered on Click) ── */}
      {selectedAgent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
          onClick={() => setSelectedAgent(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl transition-all scale-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative shrink-0">
                  <div className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-full text-white ring-2 ring-offset-2 text-base font-bold",
                    getPresenceColor(getEffectivePresence(selectedAgent)),
                    !selectedAgent.avatar_url && getAvatarColor(selectedAgent.name)
                  )}>
                    {selectedAgent.avatar_url ? (
                      <img src={selectedAgent.avatar_url} alt={selectedAgent.name} className="h-full w-full rounded-full object-cover" />
                    ) : (
                      getInitials(selectedAgent.name)
                    )}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5">
                    <UserPresenceBadge status={getEffectivePresence(selectedAgent)} size="md" />
                  </div>
                </div>

                <div className="min-w-0">
                  <h3 className="text-base font-bold text-slate-900 truncate flex items-center gap-1.5">
                    {selectedAgent.name}
                    {selectedAgent.speaks_spanish && (
                      <span className="rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                        Spa
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-500 truncate">
                    {selectedAgent.position || selectedAgent.team || 'Agent'}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-400">
                    {selectedAgent.office && (
                      <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-slate-600 font-medium">
                        <Building2 className="h-3 w-3 text-slate-400" />
                        {selectedAgent.office}
                      </span>
                    )}
                    {selectedAgent.team && (
                      <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-blue-700 font-medium">
                        <Briefcase className="h-3 w-3 text-blue-400" />
                        {selectedAgent.team}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelectedAgent(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Status Section */}
            <div className="my-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
              <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", getPresenceDot(getEffectivePresence(selectedAgent)))} />
              <span className="font-semibold text-slate-700 capitalize">
                {getEffectivePresence(selectedAgent)}
              </span>
              {selectedAgent.status_message && (
                <span className="text-slate-500 italic truncate">— "{selectedAgent.status_message}"</span>
              )}
            </div>

            {/* Contact Actions (Speed-optimized for click-to-copy) */}
            <div className="space-y-2 mt-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Quick Contact Numbers
              </p>

              {/* RingCentral (copies phone without extension) */}
              {selectedAgent.ring_central_phone ? (() => {
                const rc = parsePhoneAndExt(selectedAgent.ring_central_phone)
                return (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-100 text-blue-600">
                        <Phone className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase text-slate-400">RingCentral</p>
                        <p className="text-xs font-mono font-bold text-slate-800 truncate flex items-center gap-1.5">
                          <span>{rc.phone}</span>
                          {rc.ext && (
                            <span className="rounded bg-slate-200/80 px-1 py-0.5 text-[10px] font-sans font-semibold text-slate-600">
                              {rc.ext}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => copyToClipboard(rc.phone, 'modal-rc', e)}
                      className={cn(
                        "flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-all shadow-xs shrink-0 cursor-pointer",
                        copiedKey === 'modal-rc'
                          ? "bg-emerald-600 text-white"
                          : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                      )}
                      title={`Copy phone number ${rc.phone}`}
                    >
                      {copiedKey === 'modal-rc' ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                )
              })() : null}

              {/* Ricochet Phone */}
              {selectedAgent.ricochet_phone ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-600">
                      <PhoneCall className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase text-slate-400">Ricochet</p>
                      <p className="text-xs font-mono font-bold text-slate-800 truncate">
                        {selectedAgent.ricochet_phone}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => copyToClipboard(selectedAgent.ricochet_phone!, 'modal-rico', e)}
                    className={cn(
                      "flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-all shadow-xs shrink-0 cursor-pointer",
                      copiedKey === 'modal-rico'
                        ? "bg-emerald-600 text-white"
                        : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                    )}
                  >
                    {copiedKey === 'modal-rico' ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              ) : null}

              {/* Email */}
              {selectedAgent.email ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-indigo-100 text-indigo-600">
                      <Mail className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase text-slate-400">Email</p>
                      <p className="text-xs font-mono text-slate-800 truncate">
                        {selectedAgent.email}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => copyToClipboard(selectedAgent.email!, 'modal-email', e)}
                    className={cn(
                      "flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-all shadow-xs shrink-0 cursor-pointer",
                      copiedKey === 'modal-email'
                        ? "bg-emerald-600 text-white"
                        : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                    )}
                  >
                    {copiedKey === 'modal-email' ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              ) : null}

              {!selectedAgent.ring_central_phone && !selectedAgent.ricochet_phone && !selectedAgent.email && (
                <p className="text-xs text-slate-400 italic py-2 text-center">
                  No direct phone or email on file in directory.
                </p>
              )}
            </div>

            {/* Modal Footer */}
            <div className="mt-5 pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedAgent(null)}
                className="rounded-lg bg-slate-100 px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
