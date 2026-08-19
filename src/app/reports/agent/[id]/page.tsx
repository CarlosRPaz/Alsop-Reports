"use client"

import { useState, useEffect, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { getAgentMonthlyData, AgentMonthlyData, MetricScorecardItem, getAgentNotes, saveAgentNotes, getAgentHistoricalTrends, AgentHistoricalTrends } from "../actions"
import { formatValue } from "@/lib/formatters"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { DataTable, ColumnDef } from "@/components/ui/DataTable"
import { TrendChart } from "@/components/charts/TrendChart"
import { Badge } from "@/components/ui/Badge"
import { useChat } from "@/lib/chat/chatContext"
import { Button } from "@/components/ui/Button"
import {
  ArrowLeft, CalendarDays, Phone, MessageSquare,
  FileBarChart, ShieldCheck, DollarSign, Trophy, Users, AlertTriangle, AlertCircle, Package, Loader2,
  TrendingUp, TrendingDown, Clock, Sparkles, ChevronDown, Award, Target, Activity, Zap, Eye, EyeOff
} from "lucide-react"

// Month options (past 12 months)
const monthOptions = Array.from({ length: 12 }).map((_, i) => {
  const d = new Date()
  d.setMonth(d.getMonth() - i)
  return {
    label: d.toLocaleString('default', { month: 'long', year: 'numeric' }),
    value: `${d.getFullYear()}-${d.getMonth() + 1}`,
    year: d.getFullYear(),
    month: d.getMonth() + 1
  }
})

// YTD options (current year + previous year)
const ytdOptions = (() => {
  const now = new Date()
  return [
    { label: `${now.getFullYear()} YTD`, year: now.getFullYear() },
    { label: `${now.getFullYear() - 1} YTD`, year: now.getFullYear() - 1 },
  ]
})()

function formatTime(seconds: number) {
  if (!seconds) return "0:00"
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}:${m.toString().padStart(2, '0')}`
}

function formatMinutes(totalSeconds: number) {
  if (!totalSeconds) return "0m"
  const mins = Math.floor(totalSeconds / 60)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

export default function AgentDashboardPage() {
  const params = useParams()
  const router = useRouter()
  const agentId = params.id as string

  const { currentAgent } = useChat()
  const isAuthorizedManager = currentAgent?.role === 'admin' || currentAgent?.team === 'Managers'

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<AgentMonthlyData | null>(null)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [periodMode, setPeriodMode] = useState<"month" | "ytd">("month")
  const [error, setError] = useState<string | null>(null)

  // Trend Ribbon metric selector
  const [activeTrendMetric, setActiveTrendMetric] = useState<"items" | "premium" | "quotes" | "talk_time" | "calls">("items")
  const [trendExpanded, setTrendExpanded] = useState<boolean>(true)

  // Historical Trends
  const [historicalTrends, setHistoricalTrends] = useState<AgentHistoricalTrends | null>(null)
  const [trendsView, setTrendsView] = useState<"wow" | "mom">("wow")

  // Daily Log weekend toggle
  const [hideWeekends, setHideWeekends] = useState(false)

  // Manager notes
  const [managerNotes, setManagerNotes] = useState("")
  const [isAiNote, setIsAiNote] = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)
  const [generatingAi, setGeneratingAi] = useState(false)

  const isCurrentMonth = selectedYear === new Date().getFullYear() && selectedMonth === new Date().getMonth() + 1

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      const res = await getAgentMonthlyData(agentId, selectedYear, selectedMonth, periodMode)
      
      if (!res.success) {
        setError(res.error || "Failed to load agent data")
        setLoading(false)
        return
      }

      // Fetch manager notes for agent
      const notesRes = await getAgentNotes(agentId)
      if (notesRes.success) {
        setManagerNotes(notesRes.notes || "")
        setIsAiNote(!!notesRes.isAi)
      }

      // Fetch historical trends
      const trendsRes = await getAgentHistoricalTrends(agentId, selectedYear)
      if (trendsRes.success && trendsRes.data) {
        setHistoricalTrends(trendsRes.data)
      }

      // Auto-fallback for current month if empty
      if (res.data && res.data.dailyRows.length === 0 && isCurrentMonth && periodMode === "month") {
        const prev = new Date(selectedYear, selectedMonth - 2, 1)
        setSelectedYear(prev.getFullYear())
        setSelectedMonth(prev.getMonth() + 1)
        return
      }

      setData(res.data || null)
      setLoading(false)
    }
    if (agentId) load()
  }, [agentId, selectedYear, selectedMonth, isCurrentMonth, periodMode])

  const handleSaveManagerNotes = async () => {
    setSavingNotes(true)
    const res = await saveAgentNotes(agentId, managerNotes, isAiNote)
    if (!res.success) {
      console.error("Failed to save manager notes:", res.error)
    }
    setSavingNotes(false)
  }

  const handleGenerateAiNote = async () => {
    if (!data) return
    setGeneratingAi(true)
    
    const sc = data.scorecards
    const name = data.agent.name
    const period = data.periodLabel
    
    const itemsSc = sc.find(s => s.metric === "items")
    const premSc = sc.find(s => s.metric === "prem_premium")
    const quotesSc = sc.find(s => s.metric === "quotes")
    const crSc = sc.find(s => s.metric === "close_rate")
    const talkSc = sc.find(s => s.metric === "talk_time_seconds")
    const callsSc = sc.find(s => s.metric === "calls")
    
    const items = itemsSc?.value || 0
    const premium = Math.round(premSc?.value || 0)
    const quotes = quotesSc?.value || 0
    const closeRate = ((crSc?.value || 0) * 100).toFixed(1)
    const calls = callsSc?.value || 0
    // Talk time is now stored in seconds
    const talkTimeSeconds = talkSc?.value || 0
    const talkHours = Math.floor(talkTimeSeconds / 3600)
    const talkMins = Math.floor((talkTimeSeconds % 3600) / 60)
    
    let coachingAdvice = ""
    if ((crSc?.value || 0) < 0.12) {
      coachingAdvice = "Coaching Focus: Work on closing techniques and objection management to lift close rate toward the team average."
    } else if (calls < 200) {
      coachingAdvice = "Coaching Focus: Boost daily outbound dial pacing and follow-ups to expand pipeline."
    } else {
      coachingAdvice = "Performance is solid. Continue maintaining consistent daily activity and pipeline follow-through."
    }

    const aiText = `AI Standup Brief (${period}): ${name} has produced ${items} NB Auto Items ($${premium.toLocaleString()} premium, Team Rank #${itemsSc?.rankInTeam || 1} / ${itemsSc?.totalInTeam || 1}) with ${quotes} quotes (${closeRate}% Close Rate) and ${talkHours}h ${talkMins}m talk time across ${calls} calls. ${coachingAdvice}`
    
    setManagerNotes(aiText)
    setIsAiNote(true)
    
    const res = await saveAgentNotes(agentId, aiText, true)
    if (!res.success) {
      console.error("Failed to save AI generated note:", res.error)
    }
    
    setGeneratingAi(false)
  }

  // Daily Table Columns — expanded to match daily standup report
  const COLUMNS: ColumnDef[] = [
    { key: "date",      label: "Date",         group: "agent",      sortAccessor: (m: any) => m.report_date },
    { key: "calls",     label: "Calls",        group: "calls",      sortAccessor: (m: any) => m.calls || 0 },
    { key: "inbound",   label: "Inbound",      group: "calls",      sortAccessor: (m: any) => m.inbound || 0 },
    { key: "outbound",  label: "Outbound",     group: "calls",      sortAccessor: (m: any) => m.outbound || 0 },
    { key: "talktime",  label: "Talk Time",    group: "calls",      sortAccessor: (m: any) => m.talk_time_seconds || 0 },
    { key: "texts",     label: "Texts",        group: "texts",      sortAccessor: (m: any) => m.texts || 0 },
    { key: "outtexts",  label: "Out Texts",    group: "texts",      sortAccessor: (m: any) => m.out_texts || 0 },
    { key: "quotes",    label: "Quotes",       group: "production", sortAccessor: (m: any) => m.quotes || 0 },
    { key: "nb",        label: "NB",           group: "production", sortAccessor: (m: any) => m.nb_count || 0 },
    { key: "items",     label: "Items",        group: "production", sortAccessor: (m: any) => m.items || 0 },
    { key: "premium",   label: "Premium",      group: "production", sortAccessor: (m: any) => m.prem_premium || 0 },
    { key: "pivots",    label: "Pivots",       group: "eagent",     sortAccessor: (m: any) => m.pivots || 0 },
  ]

  // Filtered daily rows (hide weekends if toggled)
  const filteredDailyRows = useMemo(() => {
    if (!data) return []
    if (!hideWeekends) return data.dailyRows
    return data.dailyRows.filter(row => {
      const d = new Date(row.report_date + "T12:00:00")
      const day = d.getDay()
      return day !== 0 && day !== 6
    })
  }, [data, hideWeekends])

  // Totals for bottom row of daily log
  const tableTotals = useMemo(() => {
    if (!data || data.dailyRows.length === 0) return null
    // Always use full dataset for totals (not filtered)
    return data.dailyRows.reduce((acc, row) => ({
      report_date: "Total",
      calls: acc.calls + (row.calls || 0),
      inbound: acc.inbound + (row.inbound || 0),
      outbound: acc.outbound + (row.outbound || 0),
      talk_time_seconds: acc.talk_time_seconds + (row.talk_time_seconds || 0),
      texts: acc.texts + (row.texts || 0),
      out_texts: acc.out_texts + (row.out_texts || 0),
      quotes: acc.quotes + (row.quotes || 0),
      nb_count: acc.nb_count + (row.nb_count || 0),
      items: acc.items + (row.items || 0),
      prem_premium: acc.prem_premium + (row.prem_premium || 0),
      pivots: acc.pivots + (row.pivots || 0),
    }), {
      report_date: "Total",
      calls: 0, inbound: 0, outbound: 0, talk_time_seconds: 0,
      texts: 0, out_texts: 0, quotes: 0, nb_count: 0, items: 0, prem_premium: 0, pivots: 0,
    })
  }, [data])

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 text-slate-500">
        <Users className="w-6 h-6 animate-pulse text-blue-500" />
        <span className="text-sm font-medium">Loading agent command center...</span>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-6 max-w-7xl mx-auto text-center py-20">
        <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-slate-800">Error Loading Agent</h2>
        <p className="text-slate-500 mt-2 mb-6">{error || "Agent data not found."}</p>
        <Link href="/reports/agent" className="text-blue-600 hover:underline">
          &larr; Back to Agent Directory
        </Link>
      </div>
    )
  }

  const { agent, scorecards, periodLabel, businessDaysTotal, businessDaysPassed, dailyGoals = {} } = data

  // Trend Chart Data mapping
  const trendData = filteredDailyRows.map(r => ({
    date: r.report_date.split("-").slice(1).join("/"), // MM/DD
    Items: r.items || 0,
    Premium: Math.round(r.prem_premium || 0),
    Quotes: r.quotes || 0,
    "Talk Time (min)": Math.round((r.talk_time_seconds || 0) / 60),
    Calls: r.calls || 0,
  }))

  const trendLineConfigs = {
    items: [{ key: "Items", color: "#f59e0b", formatter: (v: number) => `${v}` }],
    premium: [{ key: "Premium", color: "#10b981", formatter: (v: number) => `$${Math.round(v).toLocaleString()}` }],
    quotes: [{ key: "Quotes", color: "#3b82f6", formatter: (v: number) => `${v}` }],
    talk_time: [{ key: "Talk Time (min)", color: "#8b5cf6", formatter: (v: number) => `${v}m` }],
    calls: [{ key: "Calls", color: "#0ea5e9", formatter: (v: number) => `${v}` }],
  }

  // Day-over-day trend helper
  const getDayTrend = (rowIndex: number, key: keyof typeof filteredDailyRows[0]) => {
    if (rowIndex === 0) return null
    const cur = Number(filteredDailyRows[rowIndex][key]) || 0
    const prev = Number(filteredDailyRows[rowIndex - 1][key]) || 0
    if (cur > prev) return "up"
    if (cur < prev) return "down"
    return null
  }



  // Ranking color helper
  const rankBadgeClass = (rank: number, scope: "team" | "agency") => {
    if (rank === 1) return "bg-emerald-100 text-emerald-800 border border-emerald-200"
    if (rank <= 5) return "bg-blue-50 text-blue-800 border border-blue-200"
    return scope === "team" ? "bg-slate-100 text-slate-700" : "bg-slate-50 text-slate-600"
  }

  return (
    <div className="p-3 md:p-5 max-w-[1600px] mx-auto space-y-4 min-h-screen">
      
      {/* ── Top Header Context Bar ───────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <Link 
            href="/reports/agent" 
            className="p-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-colors shadow-sm"
            title="Back to Agent Directory"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>

          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center font-black text-white text-base shadow-sm">
            {agent.name.split(" ").map(n => n[0]).join("").substring(0, 2)}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black tracking-tight text-slate-900">{agent.name}</h1>
              {agent.team && (
                <Badge variant={agent.team === "Sales" ? "default" : agent.team === "CSR" ? "success" : "default"} className="text-[10px] py-0">
                  {agent.team}
                </Badge>
              )}
              {agent.office && <Badge variant="outline" className="text-[10px] font-mono py-0">{agent.office}</Badge>}
              {agent.role === "admin" && <Badge variant="warning" className="text-[10px] py-0">Admin</Badge>}
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              Performance breakdown • {businessDaysPassed} of {businessDaysTotal} working days elapsed ({periodLabel})
            </p>
          </div>
        </div>

        {/* Period Selector — Dual Mode: Monthly / YTD */}
        <div className="flex items-center gap-2 self-stretch md:self-auto justify-between md:justify-start">
          {/* Mode Toggle */}
          <div className="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200 text-[11px] font-bold">
            <button
              onClick={() => setPeriodMode("month")}
              className={`px-2.5 py-1 rounded-md transition-all ${periodMode === "month" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setPeriodMode("ytd")}
              className={`px-2.5 py-1 rounded-md transition-all ${periodMode === "ytd" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
            >
              YTD
            </button>
          </div>

          {/* Dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-50 p-1.5 rounded-lg border border-slate-200 shadow-inner">
            <CalendarDays className="w-4 h-4 text-slate-500 ml-1 shrink-0" />
            {periodMode === "month" ? (
              <select
                value={`${selectedYear}-${selectedMonth}`}
                onChange={e => {
                  const [y, m] = e.target.value.split("-").map(Number)
                  setSelectedYear(y)
                  setSelectedMonth(m)
                }}
                className="bg-transparent font-bold text-xs text-slate-800 py-1 pr-6 pl-1 outline-none cursor-pointer"
              >
                {monthOptions.map(opt => {
                  const isCurr = opt.year === new Date().getFullYear() && opt.month === new Date().getMonth() + 1
                  return (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} {isCurr ? "(MTD)" : ""}
                    </option>
                  )
                })}
              </select>
            ) : (
              <select
                value={String(selectedYear)}
                onChange={e => setSelectedYear(Number(e.target.value))}
                className="bg-transparent font-bold text-xs text-slate-800 py-1 pr-6 pl-1 outline-none cursor-pointer"
              >
                {ytdOptions.map(opt => (
                  <option key={opt.year} value={String(opt.year)}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* ── 8-Metric Ultra-Compact Scorecard Grid ────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
        {scorecards.map((sc) => {
          const isItems = sc.metric === "items"
          const isCloseRate = sc.metric === "close_rate"
          const closeRateGreen = isCloseRate && sc.value >= 0.15

          // Card background class
          let cardBg = "bg-white border-slate-200 shadow-sm hover:border-slate-300"
          if (isItems) cardBg = "bg-amber-50/40 border-amber-300 shadow-sm"
          else if (closeRateGreen) cardBg = "bg-emerald-50/40 border-emerald-300 shadow-sm"

          // Value text color
          let valueColor = "text-slate-900"
          if (isItems) valueColor = "text-amber-900"
          else if (closeRateGreen) valueColor = "text-emerald-900"

          return (
            <div 
              key={sc.metric}
              className={`p-3 rounded-xl border transition-all flex flex-col justify-between ${cardBg}`}
            >
              {/* Metric Label */}
              <div className="flex items-center justify-between gap-1 text-[11px] font-bold text-slate-600 truncate pb-1">
                <span className="truncate">{sc.label}</span>
                {isItems && <Award className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
                {closeRateGreen && <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
              </div>

              {/* Big Metric Value */}
              <div className="my-1">
                <div className={`text-xl font-black font-mono tracking-tight leading-none ${valueColor}`}>
                  {sc.unit === "$" && "$"}
                  {sc.unit === "%" 
                    ? `${(sc.value * 100).toFixed(1)}%` 
                    : sc.unit === "min" 
                      ? formatMinutes(sc.value) 
                      : sc.value.toLocaleString()}
                </div>
                {sc.unit !== "%" && (
                  <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                    Avg: <strong className="text-slate-600">
                      {sc.unit === "min" ? formatMinutes(Math.round(sc.dailyAvg)) : sc.dailyAvg}/d
                    </strong> • <span className="text-slate-500">
                      {sc.unit === "min" ? formatMinutes(Math.round(sc.weeklyAvg)) : sc.weeklyAvg}/w
                    </span>
                  </div>
                )}
                {sc.unit === "%" && (
                  <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                    Team Avg: <strong className="text-slate-600">{sc.teamAvg}%</strong>
                  </div>
                )}
              </div>

              {/* Dual Rankings Badge — #1 green, top 5 blue, else gray */}
              <div className="space-y-1 pt-1.5 border-t border-slate-100 mt-1">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-slate-400">Team:</span>
                  <span className={`px-1.5 py-0.2 rounded font-bold ${rankBadgeClass(sc.rankInTeam, "team")}`}>
                    #{sc.rankInTeam} <span className="font-normal opacity-70">/ {sc.totalInTeam}</span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-slate-400">Agency:</span>
                  <span className={`px-1.5 py-0.2 rounded font-semibold ${rankBadgeClass(sc.rankInAgency, "agency")}`}>
                    #{sc.rankInAgency} <span className="font-normal opacity-70">/ {sc.totalInAgency}</span>
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Performance Trend Ribbon (Full Visibility) ───────────────────────── */}
      <Card className="bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Performance Trend Ribbon</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Metric Pills */}
            <div className="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200 text-[11px] font-bold">
              {(["items", "premium", "quotes", "talk_time", "calls"] as const).map(mKey => {
                const labels = {
                  items: "🚗 Items",
                  premium: "💰 Premium",
                  quotes: "📋 Quotes",
                  talk_time: "⏱️ Talk Time",
                  calls: "📞 Calls",
                }
                return (
                  <button
                    key={mKey}
                    onClick={() => setActiveTrendMetric(mKey)}
                    className={`px-2 py-0.5 rounded-md transition-all ${
                      activeTrendMetric === mKey ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    {labels[mKey]}
                  </button>
                )
              })}
            </div>

            <button 
              onClick={() => setTrendExpanded(!trendExpanded)}
              className="p-1 text-slate-400 hover:text-slate-700 transition-colors"
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${trendExpanded ? "" : "-rotate-90"}`} />
            </button>
          </div>
        </div>

        {trendExpanded && (
          <CardContent className="p-3 pt-2">
            <div className="h-[220px] w-full">
              <TrendChart
                headless
                data={trendData}
                xAxisKey="date"
                lines={trendLineConfigs[activeTrendMetric]}
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── Historical WoW / MoM Trends ──────────────────────────────────────── */}
      {historicalTrends && (
        <Card className="bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Historical Trends</span>
            </div>
            <div className="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200 text-[11px] font-bold">
              <button
                onClick={() => setTrendsView("wow")}
                className={`px-2.5 py-0.5 rounded-md transition-all ${trendsView === "wow" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
              >
                WoW (13 Weeks)
              </button>
              <button
                onClick={() => setTrendsView("mom")}
                className={`px-2.5 py-0.5 rounded-md transition-all ${trendsView === "mom" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
              >
                MoM ({selectedYear})
              </button>
            </div>
          </div>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                    <th className="text-left py-2 px-3 min-w-[110px]">{trendsView === "wow" ? "Week Range" : "Month"}</th>
                    <th className="text-right py-2 px-3 min-w-[130px]">Items</th>
                    <th className="text-right py-2 px-3 min-w-[145px]">Premium</th>
                    <th className="text-right py-2 px-3 min-w-[130px]">Quotes</th>
                    <th className="text-right py-2 px-3 min-w-[135px]">Calls</th>
                    <th className="text-right py-2 px-3 min-w-[90px]">Talk Time <span className="font-normal text-slate-400 lowercase">(h:mm)</span></th>
                    <th className="text-right py-2 px-3 min-w-[80px]">Outbound</th>
                    <th className="text-right py-2 px-3 min-w-[70px]">Texts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {trendsView === "wow" ? (
                    historicalTrends.weeks.map((w) => (
                      <tr key={w.weekStart} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-2 px-3 font-bold text-slate-700 whitespace-nowrap">{w.weekLabel}</td>
                        <TrendGridCell value={w.items} delta={w.itemsDelta} />
                        <TrendGridCell value={w.premium} delta={w.premiumDelta} prefix="$" />
                        <TrendGridCell value={w.quotes} delta={w.quotesDelta} />
                        <TrendGridCell value={w.calls} delta={w.callsDelta} />
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">{formatTime(w.talkTimeSeconds)}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">{w.outbound.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">{w.texts.toLocaleString()}</td>
                      </tr>
                    ))
                  ) : (
                    historicalTrends.months.map((m) => (
                      <tr key={m.month} className={`hover:bg-slate-50/60 transition-colors ${m.isCurrentMonth ? "bg-blue-50/40" : ""}`}>
                        <td className="py-2 px-3 font-bold text-slate-700 whitespace-nowrap">
                          {m.monthLabel}{m.isCurrentMonth && <span className="text-[10px] text-blue-600 font-semibold ml-1.5 px-1.5 py-0.2 rounded bg-blue-100/60">MTD</span>}
                        </td>
                        <TrendGridCell value={m.items} delta={m.itemsDelta} />
                        <TrendGridCell value={m.premium} delta={m.premiumDelta} prefix="$" />
                        <TrendGridCell value={m.quotes} delta={m.quotesDelta} />
                        <TrendGridCell value={m.calls} delta={m.callsDelta} />
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">{formatTime(m.talkTimeSeconds)}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">{m.outbound.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">{m.texts.toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Day-by-Day Activity Audit Table ─────────────────────────────────── */}
      <Card className="bg-white border border-slate-200 shadow-sm">
        <CardHeader className="py-2.5 px-4 border-b border-slate-100">
          <CardTitle className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between">
            <span>Daily Activity Log — {periodLabel}</span>
            <div className="flex items-center gap-3">
              {/* Weekend Toggle */}
              <button
                onClick={() => setHideWeekends(!hideWeekends)}
                className={`flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-md border transition-all ${
                  hideWeekends 
                    ? "bg-blue-50 border-blue-200 text-blue-700" 
                    : "bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-700"
                }`}
              >
                {hideWeekends ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                {hideWeekends ? "Weekends Hidden" : "Hide Weekends"}
              </button>
              <span className="text-[11px] font-mono font-normal text-slate-400">
                ▲▼ = day-over-day trend
              </span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <DataTable
              columns={COLUMNS}
              data={filteredDailyRows}
              totals={tableTotals}
              keyExtractor={(item) => item.report_date}
              renderRow={(item) => {
                const formatDate = (ds: string) => {
                  if (ds === "Total") return "Total"
                  const d = new Date(ds + "T12:00:00")
                  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
                }
                const bdr = (group: string) => {
                  if (group === "calls") return "border-l-2 border-l-emerald-600/50"
                  if (group === "texts") return "border-l-2 border-l-fuchsia-600/50"
                  if (group === "production") return "border-l-2 border-l-amber-500/50"
                  if (group === "eagent") return "border-l-2 border-l-orange-500/50"
                  return ""
                }

                // Get day-over-day trends for this row (only for non-total rows)
                const rowIdx = !item.isTotal ? filteredDailyRows.findIndex(r => r.report_date === item.report_date) : -1
                const itemsTrend = rowIdx >= 0 ? getDayTrend(rowIdx, "items") : null
                const quotesTrend = rowIdx >= 0 ? getDayTrend(rowIdx, "quotes") : null
                const callsTrend = rowIdx >= 0 ? getDayTrend(rowIdx, "calls") : null
                const premTrend = rowIdx >= 0 ? getDayTrend(rowIdx, "prem_premium") : null

                // Clean cell renderer for DAL: Green goal badge takes precedence, Day-over-Day trend pill sits neatly on the right
                const renderCell = (
                  metricKey: string,
                  rawValue: number,
                  trend: "up" | "down" | null = null,
                  extraBorder: string = "",
                  isCurrency: boolean = false
                ) => {
                  const goal = dailyGoals[metricKey]
                  const meetsGoal = !item.isTotal && goal && rawValue >= goal
                  const isZero = !rawValue || rawValue === 0
                  
                  const formattedText = isCurrency
                    ? `$${Math.round(rawValue).toLocaleString()}`
                    : rawValue.toLocaleString()

                  return (
                    <td className={`py-[3px] px-1.5 text-[13.5px] font-mono font-bold text-right ${extraBorder}`}>
                      <div className="inline-flex items-center justify-end gap-1 w-full">
                        {meetsGoal ? (
                          <span className="bg-emerald-100 dark:bg-emerald-950/60 text-emerald-950 dark:text-emerald-100 font-extrabold px-1.5 py-0.5 rounded border border-emerald-300 dark:border-emerald-700/60 shadow-xs">
                            {formattedText}
                          </span>
                        ) : isZero ? (
                          <span className="text-slate-300 dark:text-slate-600 font-normal">
                            {isCurrency ? "$0" : "0"}
                          </span>
                        ) : (
                          <span className="text-slate-800 dark:text-slate-200">
                            {formattedText}
                          </span>
                        )}

                        {trend && !item.isTotal && !isZero && (
                          <span
                            className={`text-[8.5px] font-black px-1 py-0.2 rounded leading-none shrink-0 ${
                              trend === "up"
                                ? "text-emerald-700 bg-emerald-50 border border-emerald-200/80"
                                : "text-rose-700 bg-rose-50 border border-rose-200/80"
                            }`}
                            title={trend === "up" ? "Higher than previous day" : "Lower than previous day"}
                          >
                            {trend === "up" ? "▲" : "▼"}
                          </span>
                        )}
                      </div>
                    </td>
                  )
                }

                // Talk time renderer
                const rawSeconds = item.talk_time_seconds || 0
                const talkMinutes = Math.floor(rawSeconds / 60)
                const talkGoal = dailyGoals["talk_time_seconds"]
                const talkMeetsGoal = !item.isTotal && talkGoal && talkMinutes >= talkGoal
                const talkIsZero = rawSeconds === 0

                return (
                  <>
                    <td className={`py-[3px] px-2 text-[13.5px] whitespace-nowrap sticky left-0 z-10 border-r ${
                      item.isTotal 
                        ? "font-extrabold bg-slate-50 dark:bg-slate-800 border-slate-300 text-slate-900" 
                        : "font-medium bg-white group-hover/row:bg-slate-50 border-slate-200 text-slate-700"
                    }`}>
                      {formatDate(item.report_date)}
                    </td>
                    {renderCell("calls", item.calls || 0, callsTrend, bdr("calls"))}
                    {renderCell("inbound", item.inbound || 0)}
                    {renderCell("outbound", item.outbound || 0)}
                    <td className="py-[3px] px-1.5 text-[13.5px] font-mono font-bold text-right">
                      <div className="inline-flex items-center justify-end gap-1 w-full">
                        {talkMeetsGoal ? (
                          <span className="bg-emerald-100 dark:bg-emerald-950/60 text-emerald-950 dark:text-emerald-100 font-extrabold px-1.5 py-0.5 rounded border border-emerald-300 dark:border-emerald-700/60 shadow-xs">
                            {formatTime(rawSeconds)}
                          </span>
                        ) : talkIsZero ? (
                          <span className="text-slate-300 dark:text-slate-600 font-normal">0:00</span>
                        ) : (
                          <span className="text-slate-800 dark:text-slate-200">{formatTime(rawSeconds)}</span>
                        )}
                      </div>
                    </td>
                    {renderCell("texts", item.texts || 0, null, bdr("texts"))}
                    {renderCell("out_texts", item.out_texts || 0)}
                    {renderCell("quotes", item.quotes || 0, quotesTrend, bdr("production"))}
                    {renderCell("nb_count", item.nb_count || 0)}
                    {renderCell("items", item.items || 0, itemsTrend)}
                    {renderCell("prem_premium", Number(item.prem_premium) || 0, premTrend, "", true)}
                    {renderCell("pivots", item.pivots || 0, null, bdr("eagent"))}
                  </>
                )
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Private Manager Notes (Visible only to Managers & Admins) ─────────── */}
      {isAuthorizedManager && (
        <Card className="border border-slate-200 shadow-sm bg-white overflow-hidden no-print">
          <div className="px-4 py-2.5 border-b border-slate-100 flex flex-row items-center justify-between bg-slate-50/50">
            <div>
              <CardTitle className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <FileBarChart className="w-4 h-4 text-indigo-600" /> Private Manager Coaching Notes
              </CardTitle>
              <p className="text-[11px] text-slate-400 mt-0.5">Confidential 1-on-1 coaching observation notes (auto-saves on blur)</p>
            </div>
            <div className="flex items-center gap-2.5">
              {isAiNote && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 flex items-center gap-1 select-none">
                  ✨ AI Generated
                </span>
              )}
              {savingNotes && (
                <span className="text-xs text-slate-400 font-medium flex items-center gap-1.5 animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin text-indigo-500" /> Saving...
                </span>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={handleGenerateAiNote}
                className="text-xs h-7 gap-1 font-semibold text-indigo-700 bg-indigo-50/60 hover:bg-indigo-100 hover:text-indigo-800 border-indigo-200"
                disabled={generatingAi}
              >
                {generatingAi ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3 text-indigo-600" />
                )}
                <span>Generate AI Brief</span>
              </Button>
            </div>
          </div>
          <CardContent className="p-3">
            <textarea
              value={managerNotes}
              onChange={(e) => {
                setManagerNotes(e.target.value)
                setIsAiNote(false)
              }}
              onBlur={handleSaveManagerNotes}
              placeholder="Record coaching points, objections to roleplay, commitments, or observation notes here. Auto-saved..."
              className="w-full min-h-[70px] p-2.5 text-xs font-medium border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all text-slate-800 placeholder:text-slate-400 resize-y"
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ── Trend Grid Cell Component (Two flush aligned columns for Value + Delta) ──
function TrendGridCell({
  value,
  delta,
  prefix = "",
}: {
  value: number
  delta: number | null
  prefix?: string
}) {
  return (
    <td className="py-2 px-3 text-right">
      <div className="inline-grid grid-cols-[1fr_56px] items-center gap-2 w-full max-w-[130px] ml-auto">
        <span className="font-mono font-bold text-slate-900 text-right">
          {prefix}{value.toLocaleString()}
        </span>
        <div className="flex justify-end">
          {delta !== null ? (
            <DeltaPill delta={delta} />
          ) : (
            <span className="text-[11px] text-slate-300 font-mono text-center w-[52px]">—</span>
          )}
        </div>
      </div>
    </td>
  )
}

// ── Delta Pill Component (Fixed width, clean colors, centered) ──
function DeltaPill({ delta }: { delta: number }) {
  const isPositive = delta > 0
  const isZero = delta === 0
  return (
    <span
      className={`inline-flex items-center justify-center font-mono text-[9.5px] font-bold px-1 py-0.5 rounded w-[52px] tabular-nums leading-none ${
        isZero
          ? "text-slate-500 bg-slate-100 border border-slate-200/60"
          : isPositive
          ? "text-emerald-700 bg-emerald-50 border border-emerald-200/80"
          : "text-rose-700 bg-rose-50 border border-rose-200/80"
      }`}
    >
      <span className="text-[8px] mr-0.5 font-sans">{isZero ? "•" : isPositive ? "▲" : "▼"}</span>
      {isPositive ? "+" : ""}{delta}%
    </span>
  )
}
