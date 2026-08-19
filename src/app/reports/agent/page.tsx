"use client"

import { PageGuard } from "@/components/layout/PageGuard"
import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { getAllAgents, AgentInfo } from "./actions"
import { Search, UserCircle, Users } from "lucide-react"

export default function AgentPortalPage() {
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filterTeam, setFilterTeam] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const res = await getAllAgents()
      if (res.success && res.data) {
        setAgents(res.data)
      }
      setLoading(false)
    }
    load()
  }, [])

  // 1. Filter out 'Other' and 'Support' teams entirely
  const visibleAgents = useMemo(() => {
    return agents.filter(a => a.team && !["Other", "Support"].includes(a.team))
  }, [agents])

  // 2. Derive available teams
  const teams = useMemo(() => {
    return [...new Set(visibleAgents.map(a => a.team).filter(Boolean))]
      .sort() as string[]
  }, [visibleAgents])

  // 3. Apply active filters & search
  const filtered = useMemo(() => {
    return visibleAgents.filter(a => {
      if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false
      if (filterTeam && a.team !== filterTeam) return false
      return true
    }).sort((a, b) => a.name.localeCompare(b.name))
  }, [visibleAgents, search, filterTeam])

  // 4. Group by team for the display
  const grouped = useMemo(() => {
    const groups: Record<string, AgentInfo[]> = {}
    for (const a of filtered) {
      const team = a.team!
      if (!groups[team]) groups[team] = []
      groups[team].push(a)
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  return (
    <PageGuard pageKey="agent_portal">
      <div className="p-2 md:p-3 mx-auto min-h-screen">
        
        {/* Ultra-compact Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3 bg-white p-1.5 px-3 rounded-lg border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2">
            <UserCircle className="w-4 h-4 text-blue-600" />
            <h1 className="text-[13px] font-black text-slate-800 uppercase tracking-tight">Directory</h1>
            <span className="text-[10px] text-slate-400 font-mono bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
              {filtered.length}
            </span>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {/* Search */}
            <div className="relative w-40 sm:w-56">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-6 pr-2 py-1 text-[11px] bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-slate-800 placeholder:text-slate-400"
              />
            </div>

            {/* Team Pills */}
            <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-md">
              <button
                onClick={() => setFilterTeam(null)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                  !filterTeam ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                All
              </button>
              {teams.map(t => (
                <button
                  key={t}
                  onClick={() => setFilterTeam(filterTeam === t ? null : t)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                    filterTeam === t ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-10 text-slate-400 text-xs gap-2">
            <div className="w-3 h-3 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
            Loading...
          </div>
        )}

        {/* High-Density Grid */}
        {!loading && (
          <div className="space-y-3">
            {grouped.map(([team, members]) => (
              <section key={team} className="bg-white p-2 rounded-lg border border-slate-100 shadow-sm">
                <div className="flex items-center gap-2 mb-2 px-1 border-b border-slate-50 pb-1">
                  <Users className="w-3 h-3 text-slate-400" />
                  <h2 className="text-[11px] font-black text-slate-700 uppercase">{team}</h2>
                  <span className="text-[9px] text-slate-400 font-mono">({members.length})</span>
                </div>
                
                {/* auto-fill with min 130px allows squeezing 8-10 cards on wide screens */}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-1.5">
                  {members.map(agent => (
                    <Link
                      key={agent.id}
                      href={`/reports/agent/${agent.id}`}
                      className="group flex items-center gap-2 p-1.5 bg-slate-50 rounded-md border border-slate-100 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                    >
                      <div className="w-6 h-6 rounded bg-slate-200 text-slate-600 font-bold text-[9px] flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        {agent.name.split(" ").map(n => n[0]).join("").substring(0, 2)}
                      </div>
                      
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-bold text-slate-800 truncate group-hover:text-blue-900 leading-tight">
                          {agent.name}
                        </div>
                        <div className="flex items-center gap-1 mt-[1px]">
                          {agent.office && (
                            <span className="text-[8px] text-slate-500 truncate leading-none">
                              {agent.office}
                            </span>
                          )}
                          {agent.role === "admin" && (
                            <span className="text-[7px] px-1 py-[1px] rounded bg-amber-100 text-amber-800 font-bold leading-none">
                              ADM
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && filtered.length === 0 && (
          <div className="py-10 text-center">
            <p className="text-[11px] font-bold text-slate-500">No matching agents</p>
          </div>
        )}

      </div>
    </PageGuard>
  )
}


