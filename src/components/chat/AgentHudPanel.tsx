'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Agent } from '@/lib/chat/types'
import { cn } from '@/lib/utils'
import { Search, LayoutGrid, List, Filter, ChevronDown, Users, Loader2 } from 'lucide-react'
import UserPresenceBadge from '@/components/chat/UserPresenceBadge'

function getEffectivePresence(agent: Agent): 'online' | 'away' | 'busy' | 'offline' {
  if (agent.presence === 'offline') return 'offline'
  if (!agent.last_seen_at) return 'offline'
  const lastSeen = new Date(agent.last_seen_at).getTime()
  const threeMinAgo = Date.now() - 3 * 60 * 1000
  if (lastSeen < threeMinAgo) return 'offline'
  return agent.presence || 'offline'
}

function getAvatarColor(name: string) {
  const colors = [
    'bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-emerald-500', 
    'bg-cyan-500', 'bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-purple-500', 'bg-fuchsia-500', 'bg-pink-500', 'bg-rose-500'
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

function getInitials(name: string) {
  if (!name) return '?'
  const parts = name.split(' ')
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.substring(0, 2).toUpperCase()
}

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
      // Name search
      if (searchQuery && !agent.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false
      }
      
      // Status
      if (statusFilter !== 'all') {
        const presence = getEffectivePresence(agent)
        if (presence !== statusFilter) return false
      }
      
      // Office
      if (officeFilter !== 'all' && agent.office !== officeFilter) {
        return false
      }
      
      // Team
      if (teamFilter !== 'all' && agent.team !== teamFilter) {
        return false
      }
      
      // Spanish
      if (spanishOnly && !agent.speaks_spanish) {
        return false
      }
      
      return true
    })
  }, [agents, searchQuery, statusFilter, officeFilter, teamFilter, spanishOnly])

  const onlineCount = useMemo(() => {
    return filteredAgents.filter(a => getEffectivePresence(a) === 'online').length
  }, [filteredAgents])

  if (isLoading && agents.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  const getRingColor = (presence: string) => {
    switch(presence) {
      case 'online': return 'ring-emerald-500'
      case 'away': return 'ring-amber-500'
      case 'busy': return 'ring-red-500'
      case 'offline': default: return 'ring-slate-300'
    }
  }

  return (
    <div className="flex h-full flex-col bg-slate-50">
      {/* Top Bar */}
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-full rounded-md border border-slate-300 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-md border border-slate-300 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Status</option>
            <option value="online">Online</option>
            <option value="away">Away</option>
            <option value="busy">Busy</option>
            <option value="offline">Offline</option>
          </select>
          
          <select 
            value={officeFilter}
            onChange={(e) => setOfficeFilter(e.target.value)}
            className="h-9 rounded-md border border-slate-300 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Offices</option>
            <option value="MCM">MCM</option>
            <option value="MB">MB</option>
            <option value="RC">RC</option>
            <option value="CH">CH</option>
          </select>
          
          <select 
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="h-9 rounded-md border border-slate-300 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Teams</option>
            <option value="Sales">Sales</option>
            <option value="CSR">CSR</option>
            <option value="EA">EA</option>
            <option value="Managers">Managers</option>
          </select>

          <button
            onClick={() => setSpanishOnly(!spanishOnly)}
            className={cn(
              "flex h-9 items-center justify-center gap-1 rounded-md border px-3 text-sm transition-colors",
              spanishOnly ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            )}
            title="Speaks Spanish"
          >
            <span>🇲🇽</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex h-9 items-center rounded-md border border-slate-300 bg-white p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                "flex h-full items-center justify-center rounded px-2 transition-colors",
                viewMode === 'grid' ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-900"
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                "flex h-full items-center justify-center rounded px-2 transition-colors",
                viewMode === 'list' ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-900"
              )}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 py-2 text-xs font-medium text-slate-500">
        Showing {filteredAgents.length} of {agents.length} agents · {onlineCount} online
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-4">
        {filteredAgents.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-500">
            <Users className="h-8 w-8 text-slate-300" />
            <p>No agents found matching filters.</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {filteredAgents.map(agent => {
              const presence = getEffectivePresence(agent)
              const ringColor = getRingColor(presence)
              const statusText = agent.status_message || (presence.charAt(0).toUpperCase() + presence.slice(1))

              return (
                <div key={agent.id} className="group relative flex flex-col items-center rounded-xl border border-slate-200 bg-white p-3 text-center transition-shadow hover:shadow-sm">
                  <div className="relative mb-2">
                    <div className={cn("flex h-10 w-10 items-center justify-center rounded-full text-white ring-2 ring-offset-2", ringColor, !agent.avatar_url && getAvatarColor(agent.name))}>
                      {agent.avatar_url ? (
                        <img src={agent.avatar_url} alt={agent.name} className="h-full w-full rounded-full object-cover" />
                      ) : (
                        <span className="text-sm font-semibold">{getInitials(agent.name)}</span>
                      )}
                    </div>
                    <div className="absolute -bottom-1 -right-1">
                      <UserPresenceBadge status={presence} size="sm" />
                    </div>
                  </div>
                  
                  <div className="mb-1 w-full truncate font-medium text-slate-900 text-sm" title={agent.name}>
                    {agent.name}
                  </div>
                  
                  <div className="mb-2 w-full truncate text-xs text-slate-500" title={statusText}>
                    {statusText}
                  </div>

                  <div className="mt-auto flex w-full flex-wrap items-center justify-center gap-1">
                    {agent.team && (
                      <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                        {agent.team}
                      </span>
                    )}
                    {agent.office && (
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                        {agent.office}
                      </span>
                    )}
                    {agent.speaks_spanish && (
                      <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700" title="Speaks Spanish">
                        🇲🇽
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Agent</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Team</th>
                  <th className="px-4 py-2 font-medium">Office</th>
                  <th className="px-4 py-2 font-medium">Spanish</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAgents.map(agent => {
                  const presence = getEffectivePresence(agent)
                  const ringColor = getRingColor(presence)
                  const statusText = agent.status_message || (presence.charAt(0).toUpperCase() + presence.slice(1))

                  return (
                    <tr key={agent.id} className="hover:bg-slate-50 h-[44px]">
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="relative shrink-0">
                            <div className={cn("flex h-6 w-6 items-center justify-center rounded-full text-white text-[10px] ring-1 ring-offset-1", ringColor, !agent.avatar_url && getAvatarColor(agent.name))}>
                              {agent.avatar_url ? (
                                <img src={agent.avatar_url} alt={agent.name} className="h-full w-full rounded-full object-cover" />
                              ) : (
                                <span className="font-semibold">{getInitials(agent.name)}</span>
                              )}
                            </div>
                            <div className="absolute -bottom-0.5 -right-0.5">
                              <UserPresenceBadge status={presence} size="sm" />
                            </div>
                          </div>
                          <span className="font-medium text-slate-900">{agent.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-slate-500 truncate max-w-[150px]" title={statusText}>
                        {statusText}
                      </td>
                      <td className="px-4 py-2 text-slate-700">{agent.team || '-'}</td>
                      <td className="px-4 py-2 text-slate-700">{agent.office || '-'}</td>
                      <td className="px-4 py-2">
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
