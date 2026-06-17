'use client'

import { useState, useEffect, useMemo } from 'react'
import { Search, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabaseClient'
import type { Agent } from './types'

interface AgentPickerProps {
  onSelect: (agent: Agent) => void
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

export default function AgentPicker({ onSelect }: AgentPickerProps) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchAgents() {
      setIsLoading(true)
      const { data, error } = await supabase
        .from('agents')
        .select('*')
        .eq('active', true)
        .order('name', { ascending: true })

      if (!error && data) {
        setAgents(data as Agent[])
      }
      setIsLoading(false)
    }
    fetchAgents()
  }, [])

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50/50 p-4">
      <div className="w-full max-w-md bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="p-6 pb-4 text-center border-b border-slate-100">
          <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="w-6 h-6 text-blue-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            Welcome to Communication Hub
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Select your name to sign in and start messaging.
          </p>
        </div>

        {/* Search */}
        <div className="p-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, team, or office..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* Agent List */}
        <div className="px-2 pb-2 max-h-[400px] overflow-y-auto">
          {isLoading ? (
            <div className="space-y-1 p-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5 animate-pulse">
                  <div className="w-9 h-9 rounded-full bg-slate-200" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-28 bg-slate-200 rounded" />
                    <div className="h-3 w-20 bg-slate-100 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredAgents.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-slate-400">No agents found.</p>
            </div>
          ) : (
            <div className="space-y-0.5 p-1">
              {filteredAgents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => onSelect(agent)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-200 hover:bg-slate-50 active:bg-slate-100 group"
                >
                  {/* Avatar */}
                  <div
                    className={cn(
                      'w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0 transition-transform duration-200 group-hover:scale-105',
                      getAvatarColor(agent.name)
                    )}
                  >
                    {agent.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {agent.name}
                    </p>
                    <p className="text-xs text-slate-400 truncate">
                      {agent.team} · {agent.office}
                    </p>
                  </div>

                  {/* Arrow hint */}
                  <svg
                    className="w-4 h-4 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/50">
          <p className="text-[11px] text-slate-400 text-center font-medium">
            {agents.length} active team member{agents.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
    </div>
  )
}
