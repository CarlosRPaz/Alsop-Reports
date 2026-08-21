"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import Link from "next/link"
import { getRebelRewardsStandings, uploadRebelRewardsExcel } from "./actions"
import { REBEL_TIERS, AgentRebelStandings } from "@/lib/rebelRewards"
import { createSupabaseBrowserClient } from "@/lib/supabaseBrowser"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import {
  Trophy, Upload, Car, Heart, Home,
  Search, CheckCircle2, X, Target, Check,
  ArrowUpDown, ArrowUp, ArrowDown
} from "lucide-react"

// Tier milestone thresholds for the multi-tier progress bars
const MILESTONES = {
  auto:  [120, 240, 360, 500],
  ips:   [1, 3, 5, 10],
  afsPc: [1000, 5000, 10000, 20000],
  ivan:  [25, 45, 65, 75],
}
const TIER_LABELS = ["Anakin", "Rey", "Luke", "Obi-Wan"]
const TIER_IDS = ["anakin", "rey", "luke", "obiwan"] as const

export default function RebelRewardsPage() {
  const [standings, setStandings] = useState<AgentRebelStandings[]>([])
  const [summary, setSummary] = useState<any>({
    totalAgents: 0, prizeEarnersCount: 0, totalAgencyPayout: 0,
    anakinCount: 0, reyCount: 0, lukeCount: 0, obiwanCount: 0,
  })
  const [periodLabel, setPeriodLabel] = useState("YTD July 2026")
  const [lastUpdated, setLastUpdated] = useState("2026-07-31")
  const [loading, setLoading] = useState(true)
  const [currentAgent, setCurrentAgent] = useState<any>(null)
  const isManagerOrAdmin = useMemo(() => {
    if (!currentAgent) return false
    const role = currentAgent.role?.toLowerCase()
    const team = currentAgent.team?.toLowerCase()
    return role === "admin" || team === "managers" || team === "support" || currentAgent.name?.toLowerCase().includes("charlie")
  }, [currentAgent])

  const [selectedTierFilter, setSelectedTierFilter] = useState<string>("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [officeFilter, setOfficeFilter] = useState("all")
  const [sortKey, setSortKey] = useState<string>("rank")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const [selectedAgent, setSelectedAgent] = useState<AgentRebelStandings | null>(null)
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadData = async () => {
    setLoading(true)
    const res = await getRebelRewardsStandings()
    if (res.success) {
      setStandings(res.standings)
      setSummary(res.summary)
      setPeriodLabel(res.periodLabel)
      setLastUpdated(res.lastUpdated)
    }
    setLoading(false)
  }

  useEffect(() => {
    async function init() {
      const supabase = createSupabaseBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: agent } = await supabase
          .from("agents").select("id, name, email, role, team, office").eq("id", user.id).single()
        if (agent) setCurrentAgent(agent)
      }
      loadData()
    }
    init()
  }, [])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setUploadError(null); setUploadSuccess(null)
    try {
      const reader = new FileReader()
      reader.onload = async (event) => {
        const base64 = (event.target?.result as string).split(",")[1]
        const res = await uploadRebelRewardsExcel(base64, file.name)
        if (res.success) {
          setUploadSuccess(`Successfully processed ${res.agentCount} agents for ${res.periodLabel}!`)
          await loadData()
          setTimeout(() => { setIsUploadModalOpen(false); setUploadSuccess(null) }, 1500)
        } else { setUploadError(res.error || "Failed to parse spreadsheet.") }
        setUploading(false)
      }
      reader.readAsDataURL(file)
    } catch (err: any) { setUploadError(err.message || "Failed to upload file"); setUploading(false) }
  }

  const tierRank: Record<string, number> = { none: 0, anakin: 1, rey: 2, luke: 3, obiwan: 4 }

  const filteredStandings = useMemo(() => {
    const filtered = standings.filter((agent) => {
      if (searchTerm) {
        const q = searchTerm.toLowerCase()
        if (!agent.agentName.toLowerCase().includes(q) && !agent.office?.toLowerCase().includes(q) && !agent.team?.toLowerCase().includes(q)) return false
      }
      if (officeFilter !== "all" && agent.office !== officeFilter) return false
      if (selectedTierFilter === "winners") return agent.totalPayout > 0
      if (selectedTierFilter === "anakin") return agent.anakin.earned
      if (selectedTierFilter === "rey") return agent.rey.earned
      if (selectedTierFilter === "luke") return agent.luke.earned
      if (selectedTierFilter === "obiwan") return agent.obiwan.earned
      if (selectedTierFilter === "padawan") return agent.highestTier === "none"
      return true
    })
    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case "name": cmp = a.agentName.localeCompare(b.agentName); break
        case "tier": cmp = tierRank[a.highestTier] - tierRank[b.highestTier]; break
        case "bounty": cmp = a.totalPayout - b.totalPayout; break
        case "auto": cmp = a.autoItems - b.autoItems; break
        case "afs": cmp = a.ips - b.ips; break
        case "ivan": cmp = a.ivanNlItems - b.ivanNlItems; break
        default: cmp = 0
      }
      return sortDir === "desc" ? -cmp : cmp
    })
    return sorted
  }, [standings, searchTerm, officeFilter, selectedTierFilter, sortKey, sortDir])

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortKey(key); setSortDir(key === "bounty" || key === "auto" || key === "afs" || key === "ivan" ? "desc" : "asc") }
  }
  const SortIcon = ({ col }: { col: string }) => {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 text-slate-300 ml-0.5 inline" />
    return sortDir === "asc" ? <ArrowUp className="w-3 h-3 text-blue-500 ml-0.5 inline" /> : <ArrowDown className="w-3 h-3 text-blue-500 ml-0.5 inline" />
  }

  const characterImages: Record<string, string> = {
    anakin: "/images/starwars/anakin.png", rey: "/images/starwars/rey.png",
    luke: "/images/starwars/luke.png", obiwan: "/images/starwars/obiwan.png",
    yoda: "/images/starwars/yoda.png",
  }

  // Saber-based colors
  const tierColors: Record<string, { bg: string; border: string; text: string; badge: string; glow: string }> = {
    anakin: { bg: "from-blue-50 to-white", border: "border-blue-200", text: "text-blue-900", badge: "bg-blue-100 text-blue-800 border-blue-200", glow: "rgba(59,130,246,0.5)" },
    rey:    { bg: "from-blue-50/60 to-white", border: "border-blue-200", text: "text-blue-900", badge: "bg-blue-100 text-blue-800 border-blue-200", glow: "rgba(59,130,246,0.5)" },
    luke:   { bg: "from-green-50 to-white", border: "border-green-200", text: "text-green-900", badge: "bg-green-100 text-green-800 border-green-200", glow: "rgba(34,197,94,0.5)" },
    obiwan: { bg: "from-blue-50/40 to-white", border: "border-blue-200", text: "text-blue-900", badge: "bg-blue-100 text-blue-800 border-blue-200", glow: "rgba(59,130,246,0.5)" },
    none:   { bg: "from-slate-50 to-white", border: "border-slate-200", text: "text-slate-800", badge: "bg-slate-100 text-slate-700 border-slate-200", glow: "rgba(148,163,184,0.3)" },
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 overflow-x-hidden pb-12">
      <div className="p-3 sm:p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6 md:space-y-8">
        
        {/* ─── Hero Header — Lightspeed Background ─────────────────────────────── */}
        <div className="relative rounded-2xl overflow-hidden shadow-lg border border-slate-700/30">
          {/* Background image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/starwars/lightspeed.jpg" alt="" className="absolute inset-0 w-full h-full object-cover" />
          {/* Dark overlay for readability */}
          <div className="absolute inset-0 bg-black/40" />

          <div className="relative z-10 p-4 sm:p-6 md:p-8">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <div className="space-y-2 flex-1 min-w-0">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-[11px] font-semibold text-blue-300">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-400" />
                  </span>
                  LIVE • {periodLabel}
                </div>
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight text-white uppercase drop-shadow-lg">
                  Rebel Rewards <span className="text-blue-400">2026</span>
                </h1>
                <p className="text-blue-100/80 text-xs sm:text-sm leading-relaxed max-w-2xl">
                  Accumulate stats across Auto, AFS, and Ivantage+NL to unlock higher tiers and stack cumulative cash bounties.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                <div className="flex-1 sm:flex-none p-3 sm:p-4 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 text-center min-w-[140px]">
                  <div className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">Max Bounty</div>
                  <div className="text-xl sm:text-2xl font-black font-mono text-white">$12,400</div>
                </div>
                <div className="flex-1 sm:flex-none p-3 sm:p-4 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 text-center min-w-[140px]">
                  <div className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">Agency Payout</div>
                  <div className="text-xl sm:text-2xl font-black font-mono text-white">${summary.totalAgencyPayout.toLocaleString()}</div>
                  <div className="text-[10px] text-emerald-300/80 font-medium">{summary.prizeEarnersCount} in prize tiers</div>
                </div>
                {isManagerOrAdmin && (
                  <Button onClick={() => setIsUploadModalOpen(true)} className="bg-white/20 hover:bg-white/30 backdrop-blur-md text-white font-bold py-3 px-4 rounded-xl border border-white/20 shadow-sm flex items-center gap-2 text-sm">
                    <Upload className="w-4 h-4" /> Upload
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ─── Tier Cards — Clean, no saber stripe ─────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {REBEL_TIERS.map((tier) => {
            const unlockedCount = tier.id === "anakin" ? summary.anakinCount : tier.id === "rey" ? summary.reyCount : tier.id === "luke" ? summary.lukeCount : summary.obiwanCount
            const colors = tierColors[tier.id]
            return (
              <div key={tier.id} className={`relative bg-gradient-to-br ${colors.bg} rounded-2xl border ${colors.border} shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden`}>
                {/* Character watermark — right-aligned, behind text, consistent height */}
                <div className="absolute right-0 bottom-0 w-[50%] h-full pointer-events-none opacity-[0.10] overflow-hidden flex items-end justify-end">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={characterImages[tier.id]} alt="" className="h-full w-auto object-contain object-bottom" loading="lazy" />
                </div>

                <div className="relative z-10 p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${colors.badge}`}>
                      {tier.id === "anakin" || tier.id === "luke" ? "Hit 2 of 3" : "Hit 3 of 3"}
                    </span>
                    <div className="text-right">
                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Qualifiers</div>
                      <div className={`font-mono font-black text-sm ${colors.text}`}>{unlockedCount}</div>
                    </div>
                  </div>

                  <h3 className={`font-black text-lg uppercase tracking-wide ${colors.text} leading-tight`}>{tier.name}</h3>
                  <div className={`text-xl sm:text-2xl font-black font-mono mt-0.5 ${colors.text}`}>{tier.prizeText}</div>

                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs bg-white/70 border border-slate-100 p-2 rounded-lg">
                      <span className="flex items-center gap-1 font-semibold text-slate-600"><Car className="w-3 h-3 text-blue-500" /> Auto</span>
                      <span className="font-mono font-bold text-slate-900">{tier.targets.autoItems}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs bg-white/70 border border-slate-100 p-2 rounded-lg">
                      <span className="flex items-center gap-1 font-semibold text-slate-600"><Heart className="w-3 h-3 text-rose-500" /> AFS</span>
                      <span className="font-mono font-bold text-slate-900">{tier.targets.ips} <span className="text-slate-300 font-normal">or</span> ${tier.targets.afsPc/1000}k</span>
                    </div>
                    <div className="flex items-center justify-between text-xs bg-white/70 border border-slate-100 p-2 rounded-lg">
                      <span className="flex items-center gap-1 font-semibold text-slate-600"><Home className="w-3 h-3 text-amber-500" /> Ivan+NL</span>
                      <span className="font-mono font-bold text-slate-900">{tier.targets.ivanNlItems}</span>
                    </div>
                  </div>

                  {/* Yoda Bonus - skip for Obi-Wan */}
                  {tier.yodaBonusText && tier.id !== "obiwan" && (
                    <div className="mt-2.5 p-2 bg-amber-50/80 border border-amber-200/60 rounded-lg flex items-start gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/images/starwars/yoda.png" alt="Yoda" className="w-5 h-5 object-contain flex-shrink-0 mt-0.5" />
                      <span className="text-[10px] font-semibold text-amber-800 leading-tight">{tier.yodaBonusText}</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* ─── Standings Table ───────────────────────────────── */}
        <div className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden">
          <div className="p-3 sm:p-4 border-b border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-500 flex-shrink-0" /> Leaderboard
              </h2>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5 hidden sm:block">Click any advisor for full progress breakdown</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 sm:flex-none">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full sm:w-48 pl-8 pr-3 h-8 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:bg-white text-slate-900 placeholder:text-slate-400" />
              </div>
              <select value={officeFilter} onChange={(e) => setOfficeFilter(e.target.value)}
                className="h-8 text-xs font-semibold px-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 outline-none focus:border-blue-500">
                <option value="all">All</option><option value="MCM">MCM</option><option value="RC">RC</option><option value="CH">CH</option><option value="MB">MB</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap p-2 sm:p-2.5 bg-slate-50/70 gap-1.5 border-b border-slate-100">
            <FilterPill label={`All (${standings.length})`} active={selectedTierFilter === "all"} onClick={() => setSelectedTierFilter("all")} color="slate" />
            <FilterPill label={`Winners (${summary.prizeEarnersCount})`} active={selectedTierFilter === "winners"} onClick={() => setSelectedTierFilter("winners")} color="emerald" />
            <FilterPill label={`Anakin (${summary.anakinCount})`} active={selectedTierFilter === "anakin"} onClick={() => setSelectedTierFilter("anakin")} color="blue" />
            <FilterPill label={`Rey (${summary.reyCount})`} active={selectedTierFilter === "rey"} onClick={() => setSelectedTierFilter("rey")} color="blue" />
            <FilterPill label={`Luke (${summary.lukeCount})`} active={selectedTierFilter === "luke"} onClick={() => setSelectedTierFilter("luke")} color="green" />
            <FilterPill label={`Obi-Wan (${summary.obiwanCount})`} active={selectedTierFilter === "obiwan"} onClick={() => setSelectedTierFilter("obiwan")} color="blue" />
            <FilterPill label="Padawans" active={selectedTierFilter === "padawan"} onClick={() => setSelectedTierFilter("padawan")} color="slate" />
          </div>

          {/* Desktop Table — shows pacing toward next tier */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50/50 text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <Th col="rank" label="#" center onClick={toggleSort}><SortIcon col="rank" /></Th>
                  <Th col="name" label="Advisor" onClick={toggleSort}><SortIcon col="name" /></Th>
                  <Th col="tier" label="Tier" center onClick={toggleSort}><SortIcon col="tier" /></Th>
                  <Th col="bounty" label="Bounty" center onClick={toggleSort}><SortIcon col="bounty" /></Th>
                  <Th col="auto" label="Auto" center onClick={toggleSort}><SortIcon col="auto" /></Th>
                  <Th col="afs" label="AFS (IPS)" center onClick={toggleSort}><SortIcon col="afs" /></Th>
                  <Th col="ivan" label="Ivan+NL" center onClick={toggleSort}><SortIcon col="ivan" /></Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-xs">
                {filteredStandings.length === 0 ? (
                  <tr><td colSpan={7} className="py-10 text-center text-slate-400 text-sm">No advisors found.</td></tr>
                ) : (
                  filteredStandings.map((agent, i) => {
                    const colors = tierColors[agent.highestTier]
                    const nt = agent.nextTier
                    return (
                      <tr key={agent.agentName} onClick={() => setSelectedAgent(agent)} className="hover:bg-blue-50/40 transition-colors cursor-pointer group">
                        <td className="py-2 px-3 text-center font-mono font-bold text-slate-300 text-[11px]">{i + 1}</td>
                        <td className="py-2 px-3">
                          <div className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors text-xs flex items-center gap-1.5">
                            {agent.agentName}
                            {agent.agentId && (
                              <Link href={`/reports/agent/${agent.agentId}`} onClick={e => e.stopPropagation()} className="text-slate-300 hover:text-blue-600"><ExternalLinkIcon className="w-3 h-3" /></Link>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{agent.office} • {agent.team}</div>
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${colors.badge}`}>
                            {agent.highestTier === "none" ? "Padawan" : agent.highestTier}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-xs">
                          {agent.totalPayout > 0 ? <span className="text-emerald-700">${agent.totalPayout.toLocaleString()}</span> : <span className="text-slate-300">--</span>}
                        </td>
                        {/* Auto — pacing toward next tier */}
                        <td className="py-2 px-3 text-center">
                          <PaceCell current={agent.autoItems} target={nt?.targets.autoItems} />
                        </td>
                        {/* AFS — pacing toward next tier */}
                        <td className="py-2 px-3 text-center">
                          <PaceCell current={agent.ips} target={nt?.targets.ips} suffix={`$${Math.round(agent.afsPc/1000)}k`} />
                        </td>
                        {/* Ivan — pacing toward next tier */}
                        <td className="py-2 px-3 text-center">
                          <PaceCell current={agent.ivanNlItems} target={nt?.targets.ivanNlItems} />
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List */}
          <div className="md:hidden divide-y divide-slate-100">
            {filteredStandings.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm">No advisors found.</div>
            ) : (
              filteredStandings.map((agent, i) => {
                const colors = tierColors[agent.highestTier]
                const nt = agent.nextTier
                return (
                  <div key={agent.agentName} onClick={() => setSelectedAgent(agent)} className="p-3 cursor-pointer hover:bg-blue-50/30 transition-colors active:bg-blue-50/50">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-mono font-bold text-slate-300 w-5 text-center flex-shrink-0">{i + 1}</span>
                        <div className="min-w-0">
                          <div className="font-bold text-sm text-slate-900 truncate">{agent.agentName}</div>
                          <div className="text-[10px] text-slate-400">{agent.office} • {agent.team}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${colors.badge}`}>
                          {agent.highestTier === "none" ? "Padawan" : agent.highestTier}
                        </span>
                        {agent.totalPayout > 0 && <span className="font-mono font-bold text-xs text-emerald-700">${agent.totalPayout.toLocaleString()}</span>}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <MobilePace label="Auto" current={agent.autoItems} target={nt?.targets.autoItems} />
                      <MobilePace label="AFS" current={agent.ips} target={nt?.targets.ips} />
                      <MobilePace label="Ivan" current={agent.ivanNlItems} target={nt?.targets.ivanNlItems} />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* ─── Comprehensive Agent Modal ─────────────────────────────── */}
      {selectedAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedAgent(null)}>
          <div className="w-full max-w-4xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <button onClick={() => setSelectedAgent(null)} className="absolute top-3 right-3 z-50 p-1.5 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500"><X className="w-4 h-4" /></button>

            {/* Top banner — rank + bounty */}
            <div className={`relative p-5 sm:p-6 bg-gradient-to-r ${tierColors[selectedAgent.highestTier].bg} border-b border-slate-200 overflow-hidden`}>
              {/* Character watermark */}
              <div className="absolute right-0 top-0 h-full w-40 opacity-[0.08] pointer-events-none flex items-end justify-end overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={characterImages[selectedAgent.highestTier === "none" ? "anakin" : selectedAgent.highestTier]} alt="" className="h-full w-auto object-contain" />
              </div>
              <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{selectedAgent.agentName}</h2>
                  <div className="text-xs text-slate-500 mt-0.5">{selectedAgent.office || "HQ"} • {selectedAgent.team || "OPS"}</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-center">
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Rank</div>
                    <div className={`text-sm font-black uppercase ${tierColors[selectedAgent.highestTier].text}`}>
                      {selectedAgent.highestTier === "none" ? "Padawan" : selectedAgent.highestTier}
                    </div>
                  </div>
                  <div className="p-2.5 bg-white/80 rounded-xl border border-slate-200/80">
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Bounty</div>
                    <div className="text-lg font-black font-mono text-emerald-700">${selectedAgent.totalPayout.toLocaleString()}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5 sm:p-6 space-y-5">
              {/* Tiers Earned */}
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Tiers Unlocked</div>
                <div className="flex flex-wrap gap-2">
                  {REBEL_TIERS.map((t) => {
                    const earned = (selectedAgent as any)[t.id]?.earned
                    return (
                      <div key={t.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold ${earned ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                        {earned ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-300" />}
                        {t.name}
                        <span className="font-mono text-[10px] ml-1 opacity-70">{t.prizeText}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Multi-Tier Milestone Progress for each metric */}
              <div className="space-y-4">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Metric Progress Across All Tiers</div>
                
                <MilestoneBar
                  label="Allstate Auto Items"
                  icon={<Car className="w-4 h-4 text-blue-500" />}
                  current={selectedAgent.autoItems}
                  milestones={MILESTONES.auto}
                  tierLabels={TIER_LABELS}
                  color="blue"
                  agent={selectedAgent}
                />
                <MilestoneBar
                  label="AFS (IPS)"
                  icon={<Heart className="w-4 h-4 text-rose-500" />}
                  current={selectedAgent.ips}
                  milestones={MILESTONES.ips}
                  tierLabels={TIER_LABELS}
                  color="rose"
                  agent={selectedAgent}
                  altValue={`$${Math.round(selectedAgent.afsPc / 1000)}k PC`}
                />
                <MilestoneBar
                  label="Ivantage + NL Items"
                  icon={<Home className="w-4 h-4 text-amber-500" />}
                  current={selectedAgent.ivanNlItems}
                  milestones={MILESTONES.ivan}
                  tierLabels={TIER_LABELS}
                  color="amber"
                  agent={selectedAgent}
                />
              </div>

              {/* Next tier criteria summary */}
              {selectedAgent.nextTier && (() => {
                const ntId = selectedAgent.nextTier!.id
                const tierData = (selectedAgent as any)[ntId]
                const autoHit = tierData?.autoHit || false
                const afsHit = tierData?.afsHit || false
                const ivanHit = tierData?.ivanHit || false
                const hitsCount = (autoHit ? 1 : 0) + (afsHit ? 1 : 0) + (ivanHit ? 1 : 0)
                const required = selectedAgent.nextTier!.requiredHits
                return (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-blue-500" />
                      <span className="text-xs font-bold text-slate-700">Next: {selectedAgent.nextTier!.name}</span>
                      <span className="text-[10px] font-mono text-slate-400">({selectedAgent.nextTier!.ruleText})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-black font-mono ${hitsCount >= required ? 'text-emerald-600' : 'text-slate-700'}`}>
                        {hitsCount}/{required} Met
                      </span>
                      <div className="flex gap-1">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${autoHit ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>Auto {autoHit ? '✓' : '✗'}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${afsHit ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>AFS {afsHit ? '✓' : '✗'}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${ivanHit ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>Ivan {ivanHit ? '✓' : '✗'}</span>
                      </div>
                    </div>
                  </div>
                )
              })()}

              {!selectedAgent.nextTier && (
                <div className="p-4 bg-blue-50 rounded-xl border border-blue-200 text-center">
                  <Trophy className="w-8 h-8 text-blue-600 mx-auto mb-1" />
                  <div className="text-sm font-black text-blue-900 uppercase">Grand Jedi Master!</div>
                  <p className="text-xs text-slate-500 mt-0.5">All tiers completed. Maximum bounty claimed.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Upload Modal ───────────────────────────────── */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsUploadModalOpen(false)}>
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-black text-base text-slate-900">Upload Monthly Report</h3>
              <button onClick={() => setIsUploadModalOpen(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
            </div>
            <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50 hover:bg-blue-50/30 rounded-xl p-6 text-center cursor-pointer transition-all">
              <Upload className="w-7 h-7 text-blue-600 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-800 mb-1">{uploading ? "Processing..." : "Click to select Excel file"}</p>
              <p className="text-xs text-slate-500 font-mono">.xlsx or .xls</p>
              <input ref={fileInputRef} type="file" accept=".xlsx, .xls" onChange={handleFileUpload} className="hidden" />
            </div>
            {uploadSuccess && <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg font-medium">{uploadSuccess}</div>}
            {uploadError && <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg font-medium">{uploadError}</div>}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Helper Components ────────────────────────────

function Th({ col, label, center, onClick, children }: { col: string; label: string; center?: boolean; onClick: (col: string) => void; children: React.ReactNode }) {
  return (
    <th className={`py-2.5 px-3 font-bold cursor-pointer select-none hover:text-slate-600 ${center ? 'text-center' : ''}`} onClick={() => onClick(col)}>
      <span className={`inline-flex items-center ${center ? 'justify-center' : ''}`}>{label} {children}</span>
    </th>
  )
}

function FilterPill({ label, active, onClick, color }: { label: string; active: boolean; onClick: () => void; color: string }) {
  const colors: Record<string, string> = { slate: "bg-white text-slate-600 border-slate-200", blue: "bg-white text-blue-700 border-blue-200", green: "bg-white text-green-700 border-green-200", emerald: "bg-white text-emerald-700 border-emerald-200" }
  const actColors: Record<string, string> = { slate: "bg-slate-900 text-white border-slate-900", blue: "bg-blue-600 text-white border-blue-600", green: "bg-green-600 text-white border-green-600", emerald: "bg-emerald-600 text-white border-emerald-600" }
  return <button onClick={onClick} className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-all ${active ? actColors[color] || actColors.slate : colors[color] || colors.slate}`}>{label}</button>
}

/** Table cell showing current/target pacing with a mini progress bar */
function PaceCell({ current, target, suffix }: { current: number; target?: number; suffix?: string }) {
  if (!target) {
    // Grand Master — no next target
    return (
      <div className="flex flex-col items-center gap-0.5">
        <span className="font-mono text-[11px] font-bold text-emerald-700">{current} ✓</span>
        {suffix && <span className="text-[9px] text-slate-400">{suffix}</span>}
      </div>
    )
  }
  const pct = Math.min(100, Math.round((current / target) * 100))
  const met = current >= target
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-[60px]">
      <div className="font-mono text-[11px] font-bold">
        <span className={met ? "text-emerald-700" : "text-slate-800"}>{current}</span>
        <span className="text-slate-300">/{target}</span>
      </div>
      <div className="w-full max-w-[56px] h-1 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${met ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
      </div>
      {suffix && <span className="text-[9px] text-slate-400">{suffix}</span>}
    </div>
  )
}

/** Mobile pacing cell */
function MobilePace({ label, current, target }: { label: string; current: number; target?: number }) {
  const pct = target ? Math.min(100, Math.round((current / target) * 100)) : 100
  const met = target ? current >= target : true
  return (
    <div className="text-center">
      <div className="text-[9px] font-bold text-slate-400 uppercase">{label}</div>
      <div className="font-mono font-bold text-xs text-slate-800">
        {current}{target ? <span className="text-slate-300">/{target}</span> : null}
      </div>
      {target && (
        <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden mt-0.5">
          <div className={`h-full rounded-full ${met ? 'bg-emerald-500' : 'bg-blue-400'}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  )
}

/** Multi-tier milestone progress bar for the modal */
function MilestoneBar({ label, icon, current, milestones, tierLabels, color, agent, altValue }: {
  label: string; icon: React.ReactNode; current: number; milestones: number[]; tierLabels: string[]; color: string; agent: AgentRebelStandings; altValue?: string
}) {
  const max = milestones[milestones.length - 1]
  const pct = Math.min(100, (current / max) * 100)
  const fillColors: Record<string, string> = { blue: "bg-blue-500", rose: "bg-rose-500", amber: "bg-amber-500" }

  return (
    <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 font-bold text-xs text-slate-700 uppercase tracking-wide">{icon} {label}</div>
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-sm text-slate-900">{current}</span>
          {altValue && <span className="text-[10px] text-slate-400 font-mono">({altValue})</span>}
        </div>
      </div>

      {/* Progress bar with milestone markers */}
      <div className="relative h-3 bg-slate-200/80 rounded-full overflow-visible">
        <div className={`absolute top-0 left-0 h-full rounded-full transition-all duration-500 ${fillColors[color] || 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
        
        {/* Milestone markers */}
        {milestones.map((ms, idx) => {
          const msPct = (ms / max) * 100
          const reached = current >= ms
          return (
            <div key={idx} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2" style={{ left: `${msPct}%` }}>
              <div className={`w-2.5 h-2.5 rounded-full border-2 ${reached ? 'bg-emerald-500 border-white' : 'bg-white border-slate-300'}`} />
            </div>
          )
        })}
      </div>

      {/* Milestone labels below */}
      <div className="relative mt-1 h-4">
        {milestones.map((ms, idx) => {
          const msPct = (ms / max) * 100
          const reached = current >= ms
          return (
            <div key={idx} className="absolute -translate-x-1/2 text-center" style={{ left: `${msPct}%` }}>
              <div className={`text-[8px] font-bold ${reached ? 'text-emerald-600' : 'text-slate-400'}`}>{ms}</div>
            </div>
          )
        })}
      </div>

      {/* Tier labels */}
      <div className="relative h-3">
        {milestones.map((ms, idx) => {
          const msPct = (ms / max) * 100
          const reached = current >= ms
          return (
            <div key={idx} className="absolute -translate-x-1/2" style={{ left: `${msPct}%` }}>
              <div className={`text-[7px] font-bold uppercase tracking-wider ${reached ? 'text-emerald-600' : 'text-slate-300'}`}>{tierLabels[idx]}</div>
            </div>
          )
        })}
      </div>

      {/* Next target callout */}
      {agent.nextTier && (
        <div className="flex items-center justify-between mt-1 text-[10px]">
          <span className="text-slate-500">
            Next: <span className="font-bold text-slate-700">{(agent.nextTier.targets as any)[label === "Allstate Auto Items" ? "autoItems" : label === "AFS (IPS)" ? "ips" : "ivanNlItems"]}</span>
          </span>
          {(() => {
            const targetKey = label === "Allstate Auto Items" ? "autoItems" : label === "AFS (IPS)" ? "ips" : "ivanNlItems"
            const targetVal = (agent.nextTier!.targets as any)[targetKey]
            const needed = Math.max(0, targetVal - current)
            return needed > 0 ? <span className="text-slate-400">Need <span className="font-bold text-blue-600">{needed}</span> more</span> : <span className="text-emerald-600 font-bold">✓ Met</span>
          })()}
        </div>
      )}
    </div>
  )
}

function ExternalLinkIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}
