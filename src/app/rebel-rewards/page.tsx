"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import Link from "next/link"
import Image from "next/image"
import { getRebelRewardsStandings, uploadRebelRewardsExcel } from "./actions"
import { REBEL_TIERS, AgentRebelStandings } from "@/lib/rebelRewards"
import { createSupabaseBrowserClient } from "@/lib/supabaseBrowser"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import {
  Trophy, Sparkles, Upload, Car, Heart, Home, DollarSign,
  ShieldCheck, Info, Star, ChevronRight, Zap, Search, Filter,
  CheckCircle2, XCircle, Clock, Award, Users, AlertCircle, X,
  ArrowRight, Shield, Target, TrendingUp, Check, Crosshair
} from "lucide-react"

export default function RebelRewardsPage() {
  const [standings, setStandings] = useState<AgentRebelStandings[]>([])
  const [summary, setSummary] = useState<any>({
    totalAgents: 0,
    prizeEarnersCount: 0,
    totalAgencyPayout: 0,
    anakinCount: 0,
    reyCount: 0,
    lukeCount: 0,
    obiwanCount: 0,
  })
  const [periodLabel, setPeriodLabel] = useState("YTD July 2026")
  const [lastUpdated, setLastUpdated] = useState("2026-07-31")
  const [loading, setLoading] = useState(true)

  // Current logged in user / admin role check
  const [currentAgent, setCurrentAgent] = useState<any>(null)
  const isManagerOrAdmin = useMemo(() => {
    if (!currentAgent) return false
    const role = currentAgent.role?.toLowerCase()
    const team = currentAgent.team?.toLowerCase()
    return role === "admin" || team === "managers" || team === "support" || currentAgent.name?.toLowerCase().includes("charlie")
  }, [currentAgent])

  // Filters
  const [selectedTierFilter, setSelectedTierFilter] = useState<string>("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [officeFilter, setOfficeFilter] = useState("all")
  const [teamFilter, setTeamFilter] = useState("all")

  // Selected agent for modal inspection
  const [selectedAgent, setSelectedAgent] = useState<AgentRebelStandings | null>(null)

  // Upload Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load standings & agent profile
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
          .from("agents")
          .select("id, name, email, role, team, office")
          .eq("id", user.id)
          .single()
        if (agent) setCurrentAgent(agent)
      }
      loadData()
    }
    init()
  }, [])

  // File Upload Handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadError(null)
    setUploadSuccess(null)

    try {
      const reader = new FileReader()
      reader.onload = async (event) => {
        const base64 = (event.target?.result as string).split(",")[1]
        const res = await uploadRebelRewardsExcel(base64, file.name)
        if (res.success) {
          setUploadSuccess(`Successfully processed ${res.agentCount} agents for ${res.periodLabel}!`)
          await loadData()
          setTimeout(() => {
            setIsUploadModalOpen(false)
            setUploadSuccess(null)
          }, 1500)
        } else {
          setUploadError(res.error || "Failed to parse spreadsheet.")
        }
        setUploading(false)
      }
      reader.readAsDataURL(file)
    } catch (err: any) {
      setUploadError(err.message || "Failed to upload file")
      setUploading(false)
    }
  }

  // Filtered Standings
  const filteredStandings = useMemo(() => {
    return standings.filter((agent) => {
      if (searchTerm) {
        const q = searchTerm.toLowerCase()
        const matchesName = agent.agentName.toLowerCase().includes(q)
        const matchesOffice = agent.office?.toLowerCase().includes(q)
        const matchesTeam = agent.team?.toLowerCase().includes(q)
        if (!matchesName && !matchesOffice && !matchesTeam) return false
      }
      if (officeFilter !== "all" && agent.office !== officeFilter) return false
      if (teamFilter !== "all" && agent.team !== teamFilter) return false
      if (selectedTierFilter === "winners") return agent.totalPayout > 0
      if (selectedTierFilter === "anakin") return agent.anakin.earned
      if (selectedTierFilter === "rey") return agent.rey.earned
      if (selectedTierFilter === "luke") return agent.luke.earned
      if (selectedTierFilter === "obiwan") return agent.obiwan.earned
      if (selectedTierFilter === "padawan") return agent.highestTier === "none"
      return true
    })
  }, [standings, searchTerm, officeFilter, teamFilter, selectedTierFilter])

  // Thematic Styling Maps
  const characterImages: Record<string, string> = {
    anakin: "/images/starwars/anakin.png",
    rey: "/images/starwars/rey.png",
    luke: "/images/starwars/luke.png",
    obiwan: "/images/starwars/obiwan.png",
    yoda: "/images/starwars/yoda.png",
  }

  const tierColors: Record<string, string> = {
    anakin: "from-blue-600 to-blue-900 border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.3)] text-blue-400",
    rey: "from-yellow-500 to-yellow-800 border-yellow-500/50 shadow-[0_0_20px_rgba(234,179,8,0.3)] text-yellow-400",
    luke: "from-emerald-500 to-emerald-800 border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.3)] text-emerald-400",
    obiwan: "from-purple-600 to-purple-900 border-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.3)] text-purple-400",
    none: "from-slate-700 to-slate-900 border-slate-600/50 text-slate-400",
  }

  const tierGradients: Record<string, string> = {
    anakin: "bg-gradient-to-r from-blue-500 to-blue-400",
    rey: "bg-gradient-to-r from-yellow-500 to-yellow-400",
    luke: "bg-gradient-to-r from-emerald-500 to-emerald-400",
    obiwan: "bg-gradient-to-r from-purple-500 to-purple-400",
    none: "bg-slate-700",
  }

  return (
    <div className="min-h-screen bg-[#030712] text-slate-200 selection:bg-blue-500/30 overflow-x-hidden pb-20">
      
      {/* Background Starfield / Glows */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[1000px] h-[500px] bg-blue-900/20 rounded-full blur-[120px] mix-blend-screen opacity-50" />
        <div className="absolute bottom-0 right-1/4 w-[800px] h-[600px] bg-purple-900/10 rounded-full blur-[150px] mix-blend-screen opacity-50" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-yellow-500/5 rounded-full blur-[100px] pointer-events-none" />
      </div>

      <div className="relative z-10 p-4 md:p-6 max-w-[1600px] mx-auto space-y-8 mt-4">
        
        {/* ─── Hero Header (Immersive HUD) ─────────────────────────────── */}
        <div className="flex flex-col lg:flex-row items-center justify-between gap-8 bg-[#0f172a]/60 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
          <div className="space-y-4 flex-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-mono text-blue-300">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              DATA FEED LIVE • {periodLabel}
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white uppercase drop-shadow-md">
              Rebel Rewards <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">Terminal</span>
            </h1>
            <p className="text-slate-400 max-w-2xl text-sm md:text-base leading-relaxed">
              Progress along the Jedi path. Accumulate stats across the year to unlock characters and claim their bounties. Each tier earned is yours to keep on the journey to Grand Mastery.
            </p>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-center p-6 bg-[#020617]/50 rounded-2xl border border-white/5 shadow-inner">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Max Potential Payout</div>
              <div className="text-3xl md:text-4xl font-black font-mono text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]">
                $12,400
              </div>
            </div>
            {isManagerOrAdmin && (
              <Button
                onClick={() => setIsUploadModalOpen(true)}
                className="bg-white/10 hover:bg-white/20 text-white font-bold border border-white/20 h-full py-6 px-4 rounded-xl backdrop-blur-md transition-all"
              >
                <Upload className="w-5 h-5" />
              </Button>
            )}
          </div>
        </div>

        {/* ─── The Character Holocrons (Tiers Grid) ─────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {REBEL_TIERS.map((tier) => {
            const unlockedCount = 
              tier.id === "anakin" ? summary.anakinCount :
              tier.id === "rey" ? summary.reyCount :
              tier.id === "luke" ? summary.lukeCount :
              summary.obiwanCount

            const colorClass = tierColors[tier.id]

            return (
              <div
                key={tier.id}
                className={`relative group bg-gradient-to-b ${colorClass.split(' ')[0]} ${colorClass.split(' ')[1]} bg-opacity-10 backdrop-blur-md rounded-3xl border ${colorClass.split(' ')[2]} p-1 overflow-hidden transition-all hover:scale-[1.02]`}
              >
                <div className="bg-[#030712]/80 h-full w-full rounded-[22px] flex flex-col relative z-10">
                  
                  {/* Portrait & Header (Overlapping) */}
                  <div className="relative h-40 w-full overflow-visible flex justify-center pt-4">
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#030712] z-10" />
                    <Image
                      src={characterImages[tier.id] || "/images/starwars/anakin.png"}
                      alt={tier.name}
                      width={120}
                      height={160}
                      className="object-contain z-0 filter drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)] opacity-90 group-hover:opacity-100 transition-opacity"
                    />
                    <div className="absolute top-4 right-4 z-20 bg-black/50 backdrop-blur-md border border-white/10 px-2 py-1 rounded-lg text-center">
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Qualifiers</div>
                      <div className={`font-mono font-black ${colorClass.split(' ')[4]}`}>{unlockedCount}</div>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="p-5 flex-1 flex flex-col relative z-20 -mt-6">
                    <div className="text-center mb-4">
                      <h3 className="font-black text-2xl text-white uppercase tracking-wider">{tier.name}</h3>
                      <div className={`text-xl font-black font-mono mt-1 ${colorClass.split(' ')[4]} drop-shadow-md`}>
                        {tier.prizeText}
                      </div>
                    </div>

                    <div className="space-y-3 mt-auto">
                      <div className="flex items-center justify-between text-xs bg-white/5 border border-white/5 p-2 rounded-lg">
                        <span className="text-slate-400 font-bold">Auto</span>
                        <span className="font-mono text-white font-bold">{tier.targets.autoItems}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs bg-white/5 border border-white/5 p-2 rounded-lg">
                        <span className="text-slate-400 font-bold">AFS</span>
                        <span className="font-mono text-white font-bold">{tier.targets.ips} / ${tier.targets.afsPc/1000}k</span>
                      </div>
                      <div className="flex items-center justify-between text-xs bg-white/5 border border-white/5 p-2 rounded-lg">
                        <span className="text-slate-400 font-bold">Ivantage</span>
                        <span className="font-mono text-white font-bold">{tier.targets.ivanNlItems}</span>
                      </div>
                    </div>

                    {tier.yodaBonusText && (
                      <div className="mt-4 py-2 px-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl flex items-center gap-2">
                        <Image src="/images/starwars/yoda.png" alt="Yoda" width={24} height={24} className="opacity-80" />
                        <span className="text-[10px] font-bold text-yellow-400 uppercase leading-tight">
                          {tier.yodaBonusText}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* ─── Standings Database (The Matrix) ───────────────────────────────── */}
        <div className="bg-[#0f172a]/80 backdrop-blur-xl border border-white/10 shadow-2xl rounded-3xl overflow-hidden">
          
          <div className="p-6 border-b border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-white uppercase tracking-wider flex items-center gap-2">
                <DatabaseIcon className="w-5 h-5 text-blue-400" /> Agency Roster
              </h2>
              <p className="text-sm text-slate-400 font-mono mt-1">Total Tracked: {standings.length}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <div className="relative w-full md:w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search agent name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 h-10 text-sm bg-black/50 border border-white/10 rounded-xl outline-none focus:border-blue-500 text-white placeholder:text-slate-500 transition-colors font-mono"
                />
              </div>

              <select
                value={officeFilter}
                onChange={(e) => setOfficeFilter(e.target.value)}
                className="h-10 text-sm font-bold px-3 rounded-xl border border-white/10 bg-black/50 text-slate-300 outline-none focus:border-blue-500"
              >
                <option value="all">All Bases</option>
                <option value="MCM">MCM</option>
                <option value="RC">RC</option>
                <option value="CH">CH</option>
                <option value="MB">MB</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap p-4 bg-black/20 gap-2 border-b border-white/10 text-xs font-bold uppercase tracking-wider">
            <FilterPill label={`All (${standings.length})`} active={selectedTierFilter === "all"} onClick={() => setSelectedTierFilter("all")} color="slate" />
            <FilterPill label={`Winners (${summary.prizeEarnersCount})`} active={selectedTierFilter === "winners"} onClick={() => setSelectedTierFilter("winners")} color="emerald" />
            <FilterPill label={`Anakin (${summary.anakinCount})`} active={selectedTierFilter === "anakin"} onClick={() => setSelectedTierFilter("anakin")} color="blue" />
            <FilterPill label={`Rey (${summary.reyCount})`} active={selectedTierFilter === "rey"} onClick={() => setSelectedTierFilter("rey")} color="yellow" />
            <FilterPill label={`Luke (${summary.lukeCount})`} active={selectedTierFilter === "luke"} onClick={() => setSelectedTierFilter("luke")} color="emerald" />
            <FilterPill label={`Obi-Wan (${summary.obiwanCount})`} active={selectedTierFilter === "obiwan"} onClick={() => setSelectedTierFilter("obiwan")} color="purple" />
            <FilterPill label={`Padawans (${standings.length - summary.prizeEarnersCount})`} active={selectedTierFilter === "padawan"} onClick={() => setSelectedTierFilter("padawan")} color="slate" />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead>
                <tr className="bg-black/40 text-[10px] uppercase tracking-widest text-slate-400">
                  <th className="p-4 text-center font-bold">Rnk</th>
                  <th className="p-4 font-bold">Agent</th>
                  <th className="p-4 font-bold">Status</th>
                  <th className="p-4 font-bold text-center">Bounty</th>
                  <th className="p-4 font-bold text-center">Auto</th>
                  <th className="p-4 font-bold text-center">AFS (IPS/PC)</th>
                  <th className="p-4 font-bold text-center">Ivan</th>
                  <th className="p-4 font-bold">Next Target</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm">
                {filteredStandings.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-slate-500 font-mono">NO RECORDS FOUND</td>
                  </tr>
                ) : (
                  filteredStandings.map((agent, i) => {
                    const tColor = tierColors[agent.highestTier]
                    return (
                      <tr 
                        key={agent.agentName} 
                        onClick={() => setSelectedAgent(agent)}
                        className="hover:bg-white/5 transition-colors cursor-pointer group"
                      >
                        <td className="p-4 text-center font-mono text-slate-500">{i + 1}</td>
                        <td className="p-4">
                          <div className="font-bold text-white group-hover:text-blue-400 transition-colors flex items-center gap-2">
                            {agent.agentName}
                            {agent.agentId && (
                              <Link href={`/reports/agent/${agent.agentId}`} onClick={e => e.stopPropagation()} className="text-slate-500 hover:text-blue-400">
                                <ExternalLinkIcon className="w-3 h-3" />
                              </Link>
                            )}
                          </div>
                          <div className="text-[10px] font-mono text-slate-500 mt-0.5 uppercase">{agent.office} // {agent.team}</div>
                        </td>
                        <td className="p-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider border bg-black/50 ${tColor.split(' ')[2]} ${tColor.split(' ')[4]}`}>
                            {agent.highestTier === "none" ? "Padawan" : agent.highestTier}
                          </span>
                        </td>
                        <td className="p-4 text-center font-mono font-bold">
                          {agent.totalPayout > 0 ? (
                            <span className="text-emerald-400">${agent.totalPayout.toLocaleString()}</span>
                          ) : (
                            <span className="text-slate-600">--</span>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          <ProgressBar value={agent.autoItems} max={120} label={agent.autoItems.toString()} color="blue" />
                        </td>
                        <td className="p-4 text-center">
                           <div className="font-mono text-xs text-white">
                             {agent.ips} <span className="text-slate-500">|</span> ${Math.round(agent.afsPc/1000)}k
                           </div>
                        </td>
                        <td className="p-4 text-center">
                          <ProgressBar value={agent.ivanNlItems} max={25} label={agent.ivanNlItems.toString()} color="yellow" />
                        </td>
                        <td className="p-4">
                          {agent.nextTier ? (
                            <div className="text-xs">
                              <div className="font-bold text-slate-300">Path to {agent.nextTier.name}</div>
                              <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate max-w-[200px]">
                                Need {agent.nextTierProgress?.autoItemsNeeded} Auto / {agent.nextTierProgress?.ivanNeeded} Ivan
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs font-bold text-purple-400">MASTERY ACHIEVED</span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* ─── Immersive Jedi HUD Modal ───────────────────────────────────────── */}
      {selectedAgent && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setSelectedAgent(null)}
        >
          <div 
            className="w-full max-w-4xl bg-[#0f172a] border border-blue-500/30 rounded-3xl shadow-[0_0_50px_rgba(37,99,235,0.2)] overflow-hidden flex flex-col md:flex-row relative text-slate-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Close Btn */}
            <button onClick={() => setSelectedAgent(null)} className="absolute top-4 right-4 z-50 p-2 bg-black/50 hover:bg-white/10 rounded-full text-slate-400 transition-colors">
              <X className="w-5 h-5" />
            </button>

            {/* Left Panel: Status & Portrait */}
            <div className={`w-full md:w-1/3 p-8 flex flex-col items-center justify-center relative overflow-hidden bg-gradient-to-b ${tierColors[selectedAgent.highestTier].split(' ')[0]} ${tierColors[selectedAgent.highestTier].split(' ')[1]} bg-opacity-20`}>
              <div className="absolute inset-0 bg-black/40" />
              <div className="relative z-10 w-full flex flex-col items-center text-center">
                <Image 
                  src={characterImages[selectedAgent.highestTier === "none" ? "anakin" : selectedAgent.highestTier]} 
                  alt="Rank" 
                  width={150} height={200} 
                  className="filter drop-shadow-[0_0_30px_rgba(255,255,255,0.2)] mb-4"
                />
                <h2 className="text-3xl font-black text-white uppercase tracking-widest">{selectedAgent.agentName}</h2>
                <div className="text-xs font-mono text-slate-300 mt-2 bg-black/50 px-3 py-1 rounded-full border border-white/10">
                  {selectedAgent.office || "HQ"} // {selectedAgent.team || "OPS"}
                </div>
                
                <div className="mt-8 w-full">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Current Rank</div>
                  <div className={`text-2xl font-black uppercase tracking-wider ${tierColors[selectedAgent.highestTier].split(' ')[4]}`}>
                    {selectedAgent.highestTier === "none" ? "Padawan" : selectedAgent.highestTier}
                  </div>
                </div>

                <div className="mt-4 w-full p-4 bg-black/40 rounded-2xl border border-white/5">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Bounty Earned</div>
                  <div className="text-3xl font-black font-mono text-emerald-400">
                    ${selectedAgent.totalPayout.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Panel: Data & Progression */}
            <div className="w-full md:w-2/3 p-8 bg-[#030712] flex flex-col">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 border-b border-white/10 pb-4 mb-6 flex items-center gap-2">
                <Crosshair className="w-4 h-4 text-blue-500" /> Mission Telemetry
              </h3>

              {/* Progress Stepper */}
              <div className="flex items-center justify-between relative mb-10">
                <div className="absolute top-1/2 left-0 w-full h-1 bg-slate-800 -translate-y-1/2 z-0 rounded-full" />
                <div 
                  className="absolute top-1/2 left-0 h-1 bg-gradient-to-r from-blue-500 to-purple-500 -translate-y-1/2 z-0 rounded-full transition-all duration-1000"
                  style={{ width: `${selectedAgent.highestTier === 'obiwan' ? 100 : selectedAgent.highestTier === 'luke' ? 75 : selectedAgent.highestTier === 'rey' ? 50 : selectedAgent.highestTier === 'anakin' ? 25 : 0}%` }}
                />
                
                {['none', 'anakin', 'rey', 'luke', 'obiwan'].map((tierId, idx) => {
                  const isAchieved = 
                    (tierId === 'none') ||
                    (tierId === 'anakin' && (selectedAgent.anakin.earned || selectedAgent.rey.earned || selectedAgent.luke.earned || selectedAgent.obiwan.earned)) ||
                    (tierId === 'rey' && (selectedAgent.rey.earned || selectedAgent.luke.earned || selectedAgent.obiwan.earned)) ||
                    (tierId === 'luke' && (selectedAgent.luke.earned || selectedAgent.obiwan.earned)) ||
                    (tierId === 'obiwan' && selectedAgent.obiwan.earned)
                  
                  const isCurrent = tierId === selectedAgent.highestTier

                  return (
                    <div key={tierId} className="relative z-10 flex flex-col items-center gap-2">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all ${
                        isCurrent ? "bg-blue-500 border-white shadow-[0_0_15px_rgba(59,130,246,0.8)] scale-125" :
                        isAchieved ? "bg-blue-500 border-blue-500" : "bg-slate-900 border-slate-700"
                      }`}>
                        {isAchieved && !isCurrent && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <span className={`text-[10px] font-bold uppercase absolute -bottom-6 whitespace-nowrap ${isCurrent ? "text-white" : isAchieved ? "text-slate-400" : "text-slate-600"}`}>
                        {tierId === 'none' ? 'Start' : tierId}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Current Status / Next Target Overview */}
              <div className="flex-1 mt-6">
                {selectedAgent.nextTier ? (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xl font-black text-white uppercase">Pursuing: {selectedAgent.nextTier.name}</h4>
                      <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/30 font-mono uppercase tracking-wider">
                        Target Bounty: {selectedAgent.nextTier.prizeText}
                      </Badge>
                    </div>

                    <div className="space-y-4">
                      {/* Auto Category */}
                      <TargetRow 
                        label="Allstate Auto" 
                        current={selectedAgent.autoItems} 
                        target={selectedAgent.nextTier.targets.autoItems}
                        needed={selectedAgent.nextTierProgress?.autoItemsNeeded}
                        color="blue"
                        icon={<Car className="w-4 h-4" />}
                      />
                      {/* AFS Category */}
                      <TargetRow 
                        label="AFS (IPS / PC)" 
                        current={selectedAgent.ips} 
                        target={selectedAgent.nextTier.targets.ips}
                        needed={selectedAgent.nextTierProgress?.ipsNeeded}
                        altCurrent={`$${Math.round(selectedAgent.afsPc/1000)}k PC`}
                        color="rose"
                        icon={<Heart className="w-4 h-4" />}
                      />
                      {/* Ivan Category */}
                      <TargetRow 
                        label="Ivantage + NL" 
                        current={selectedAgent.ivanNlItems} 
                        target={selectedAgent.nextTier.targets.ivanNlItems}
                        needed={selectedAgent.nextTierProgress?.ivanNeeded}
                        color="yellow"
                        icon={<Home className="w-4 h-4" />}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                    <Trophy className="w-16 h-16 text-yellow-400" />
                    <div>
                      <h4 className="text-2xl font-black text-white uppercase">Grand Master Achieved</h4>
                      <p className="text-slate-400 text-sm mt-2 max-w-md">You have completed all tiers of the 2026 Rebel Rewards program and claimed the maximum bounty.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Admin Drag-and-Drop Excel Upload Modal ──────────────────────────── */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsUploadModalOpen(false)}>
          <div className="bg-[#0f172a] rounded-3xl max-w-lg w-full shadow-2xl border border-white/10 p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-black text-lg text-white">Upload Mission Data</h3>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-white/20 hover:border-blue-500 bg-black/50 rounded-2xl p-10 text-center cursor-pointer transition-all"
            >
              <Upload className="w-8 h-8 text-blue-500 mx-auto mb-4" />
              <p className="text-sm font-bold text-white mb-2">{uploading ? "Processing Data Core..." : "Initialize Upload Sequence"}</p>
              <p className="text-xs text-slate-500 font-mono">Accepts .xlsx standard report</p>
              <input ref={fileInputRef} type="file" accept=".xlsx, .xls" onChange={handleFileUpload} className="hidden" />
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

// Helper Components

function FilterPill({ label, active, onClick, color }: { label: string, active: boolean, onClick: () => void, color: string }) {
  const colors: Record<string, string> = {
    slate: "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700",
    blue: "bg-blue-900/50 text-blue-400 border-blue-500/50 hover:bg-blue-900/80",
    yellow: "bg-yellow-900/50 text-yellow-400 border-yellow-500/50 hover:bg-yellow-900/80",
    emerald: "bg-emerald-900/50 text-emerald-400 border-emerald-500/50 hover:bg-emerald-900/80",
    purple: "bg-purple-900/50 text-purple-400 border-purple-500/50 hover:bg-purple-900/80",
  }
  const activeColors: Record<string, string> = {
    slate: "bg-slate-200 text-slate-900 border-white",
    blue: "bg-blue-500 text-white border-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.5)]",
    yellow: "bg-yellow-500 text-black border-yellow-400 shadow-[0_0_10px_rgba(234,179,8,0.5)]",
    emerald: "bg-emerald-500 text-white border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.5)]",
    purple: "bg-purple-500 text-white border-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.5)]",
  }
  return (
    <button onClick={onClick} className={`px-3 py-1.5 rounded-lg border transition-all ${active ? activeColors[color] : colors[color]}`}>
      {label}
    </button>
  )
}

function ProgressBar({ value, max, label, color }: { value: number, max: number, label: string, color: string }) {
  const pct = Math.min(100, (value / max) * 100)
  const bgColors: Record<string, string> = { blue: "bg-blue-500", yellow: "bg-yellow-500", emerald: "bg-emerald-500" }
  return (
    <div className="flex flex-col gap-1 items-center">
      <span className="font-mono text-xs text-white">{label}</span>
      <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full ${bgColors[color] || 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function TargetRow({ label, current, target, needed, altCurrent, color, icon }: any) {
  const pct = Math.min(100, Math.max(0, (current / target) * 100))
  const isComplete = current >= target
  const fillColors: Record<string, string> = {
    blue: "bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]",
    rose: "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.8)]",
    yellow: "bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.8)]"
  }
  const textColors: Record<string, string> = { blue: "text-blue-400", rose: "text-rose-400", yellow: "text-yellow-400" }

  return (
    <div className="p-4 bg-white/5 border border-white/10 rounded-2xl flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-2 font-bold uppercase tracking-wider text-sm ${textColors[color]}`}>
          {icon} {label}
        </div>
        <div className="font-mono text-sm text-slate-300">
          Target: <span className="text-white font-black">{target}</span>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <div className="flex-1 h-3 bg-black/50 rounded-full overflow-hidden border border-white/5 relative">
          <div className={`absolute top-0 left-0 h-full rounded-full transition-all duration-1000 ${fillColors[color]}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="font-mono font-black text-lg w-16 text-right text-white">
          {Math.round(pct)}%
        </div>
      </div>

      <div className="flex items-center justify-between text-xs font-mono">
        <span className="text-slate-400">Current: <span className="text-white font-bold">{current} {altCurrent && `(${altCurrent})`}</span></span>
        {isComplete ? (
          <span className="text-emerald-400 font-bold flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> SECURED</span>
        ) : (
          <span className="text-slate-500">Need <span className="text-white font-bold">{needed}</span> more</span>
        )}
      </div>
    </div>
  )
}

function DatabaseIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
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



