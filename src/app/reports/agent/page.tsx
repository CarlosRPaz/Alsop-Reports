"use client"

import { PageGuard } from "@/components/layout/PageGuard";
import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { getAllAgents, AgentInfo } from "./actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import {
  UserCircle, Users, Building2, Search, ChevronRight,
  Briefcase, Headphones, Shield
} from "lucide-react"

const teamIcons: Record<string, any> = {
  Sales: Briefcase,
  CSR: Headphones,
  EA: Shield,
}

const teamColors: Record<string, { bg: string; text: string; border: string; badge: string }> = {
  Sales: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", badge: "bg-blue-100 text-blue-700" },
  CSR: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", badge: "bg-emerald-100 text-emerald-700" },
  EA: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", badge: "bg-purple-100 text-purple-700" },
}

const officeColors: Record<string, string> = {
  Montclair: "bg-sky-100 text-sky-700",
  MCM: "bg-sky-100 text-sky-700",
  Montebello: "bg-amber-100 text-amber-700",
  MB: "bg-amber-100 text-amber-700",
  "Rancho Cucamonga": "bg-rose-100 text-rose-700",
  RC: "bg-rose-100 text-rose-700",
  Chino: "bg-violet-100 text-violet-700",
  CH: "bg-violet-100 text-violet-700",
  Claremont: "bg-violet-100 text-violet-700",
}

export default function AgentPortalPage() {
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filterTeam, setFilterTeam] = useState<string | null>(null)
  const [filterOffice, setFilterOffice] = useState<string | null>(null)

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

  const teams = useMemo(() => [...new Set(agents.map(a => a.team).filter(Boolean))].sort() as string[], [agents])
  const offices = useMemo(() => [...new Set(agents.map(a => a.office).filter(Boolean))].sort() as string[], [agents])

  const filtered = useMemo(() => {
    return agents.filter(a => {
      if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false
      if (filterTeam && a.team !== filterTeam) return false
      if (filterOffice && a.office !== filterOffice) return false
      return true
    })
  }, [agents, search, filterTeam, filterOffice])

  // Group by team
  const grouped = useMemo(() => {
    const groups: Record<string, AgentInfo[]> = {}
    for (const a of filtered) {
      const team = a.team || "Other"
      if (!groups[team]) groups[team] = []
      groups[team].push(a)
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  return (
    <PageGuard pageKey="agent_portal">
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <UserCircle className="w-6 h-6 text-blue-600" />
          Agent Portal
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Select an agent to view their personal performance dashboard
        </p>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search agents..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
          />
        </div>

        {/* Team filter pills */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400 font-medium uppercase tracking-wider mr-1">Team:</span>
          <button
            onClick={() => setFilterTeam(null)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              !filterTeam
                ? "bg-slate-800 text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            All
          </button>
          {teams.map(t => {
            const colors = teamColors[t] || { badge: "bg-slate-100 text-slate-700" }
            return (
              <button
                key={t}
                onClick={() => setFilterTeam(filterTeam === t ? null : t)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  filterTeam === t
                    ? `${colors.badge} ring-1 ring-offset-1 ring-current shadow-sm`
                    : `bg-slate-100 text-slate-600 hover:bg-slate-200`
                }`}
              >
                {t}
              </button>
            )
          })}
        </div>

        {/* Office filter pills */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400 font-medium uppercase tracking-wider mr-1">Office:</span>
          <button
            onClick={() => setFilterOffice(null)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              !filterOffice
                ? "bg-slate-800 text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            All
          </button>
          {offices.map(o => (
            <button
              key={o}
              onClick={() => setFilterOffice(filterOffice === o ? null : o)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                filterOffice === o
                  ? `${officeColors[o] || "bg-slate-200 text-slate-700"} ring-1 ring-offset-1 ring-current shadow-sm`
                  : `bg-slate-100 text-slate-600 hover:bg-slate-200`
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3 text-slate-500">
            <Users className="w-5 h-5 animate-pulse" />
            <span className="text-sm">Loading agents...</span>
          </div>
        </div>
      )}

      {/* Agent Cards grouped by team */}
      {!loading && grouped.map(([team, members]) => {
        const colors = teamColors[team] || { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200", badge: "bg-slate-100 text-slate-700" }
        const TeamIcon = teamIcons[team] || Users

        return (
          <div key={team} className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <TeamIcon className={`w-4 h-4 ${colors.text}`} />
              <h2 className={`text-sm font-semibold uppercase tracking-wider ${colors.text}`}>
                {team}
              </h2>
              <span className="text-xs text-slate-400 font-medium">
                ({members.length} agent{members.length !== 1 ? "s" : ""})
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {members.map(agent => (
                <Link
                  key={agent.id}
                  href={`/reports/agent/${agent.id}`}
                  className={`group relative rounded-xl border ${colors.border} ${colors.bg} p-4 hover:shadow-md hover:scale-[1.02] transition-all duration-200 cursor-pointer`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full ${colors.badge} flex items-center justify-center font-bold text-sm`}>
                      {agent.name.split(" ").map(n => n[0]).join("").substring(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-800 truncate group-hover:text-blue-700 transition-colors">
                        {agent.name}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${colors.badge}`}>
                          {agent.team}
                        </span>
                        {agent.office && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${officeColors[agent.office] || "bg-slate-100 text-slate-600"}`}>
                            {agent.office}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )
      })}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center gap-2">
              <Search className="w-8 h-8 text-slate-300" />
              <p className="text-sm text-slate-500">No agents found matching your filters</p>
              <button
                onClick={() => { setSearch(""); setFilterTeam(null); setFilterOffice(null) }}
                className="text-sm text-blue-600 hover:underline mt-1"
              >
                Clear filters
              </button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
    </PageGuard>
  )
}
