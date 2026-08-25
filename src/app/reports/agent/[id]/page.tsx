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
import { REBEL_REWARDS_2026_SEED } from "@/lib/rebelRewardsSeed"
import { calculateAgentRebelStatus } from "@/lib/rebelRewards"
import {
  ArrowLeft, CalendarDays, Phone, MessageSquare,
  FileBarChart, ShieldCheck, Shield, DollarSign, Trophy, Users, AlertTriangle, AlertCircle, Package, Loader2,
  TrendingUp, TrendingDown, Clock, Sparkles, ChevronDown, ChevronRight, Award, Target, Activity, Zap, Eye, EyeOff,
  Car, Heart, Home
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
    { label: `${now.getFullYear() - 1} Full Year`, year: now.getFullYear() - 1 },
  ]
})()

function formatTime(seconds: number) {
  if (!seconds) return "0:00"
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}:${m.toString().padStart(2, '0')}`
}

// Helper to format minutes as h:mm or mm
function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

// Helper to format seconds as h:mm or mm
function formatSeconds(totalSeconds: number): string {
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

  const { currentAgent, isLoading: isAuthLoading } = useChat()
  const isAuthorizedManager = currentAgent?.role === 'admin' || currentAgent?.team === 'Managers'
  const isSelf = currentAgent?.id === agentId
  const isForbidden = !isAuthLoading && !!currentAgent && !isAuthorizedManager && !isSelf

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
  type DailyMetricRow = { report_date: string; [key: string]: string | number | null }
  const COLUMNS: ColumnDef[] = [
    { key: "date",      label: "Date",         group: "agent",      sortAccessor: (m: DailyMetricRow) => m.report_date },
    { key: "calls",     label: "Calls",        group: "calls",      sortAccessor: (m: DailyMetricRow) => m.calls || 0 },
    { key: "inbound",   label: "Inbound",      group: "calls",      sortAccessor: (m: DailyMetricRow) => m.inbound || 0 },
    { key: "outbound",  label: "Outbound",     group: "calls",      sortAccessor: (m: DailyMetricRow) => m.outbound || 0 },
    { key: "talktime",  label: "Talk Time",    group: "calls",      sortAccessor: (m: DailyMetricRow) => m.talk_time_seconds || 0 },
    { key: "texts",     label: "Texts",        group: "texts",      sortAccessor: (m: DailyMetricRow) => m.texts || 0 },
    { key: "outtexts",  label: "Out Texts",    group: "texts",      sortAccessor: (m: DailyMetricRow) => m.out_texts || 0 },
    { key: "quotes",    label: "Quotes",       group: "production", sortAccessor: (m: DailyMetricRow) => m.quotes || 0 },
    { key: "nb",        label: "NB",           group: "production", sortAccessor: (m: DailyMetricRow) => m.nb_count || 0 },
    { key: "items",     label: "Items",        group: "production", sortAccessor: (m: DailyMetricRow) => m.items || 0 },
    { key: "premium",   label: "Premium",      group: "production", sortAccessor: (m: DailyMetricRow) => m.prem_premium || 0 },
    { key: "pivots",    label: "Pivots",       group: "eagent",     sortAccessor: (m: DailyMetricRow) => m.pivots || 0 },
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

  // Daily Goal Playbook Calculations (must be declared at top level before early returns)
  const playbookData = useMemo(() => {
    if (!data) return null
    const monthlyItemsGoal = 40 // Standard Agency benchmark
    const currentItems = data.scorecards.find(s => s.metric === "items")?.value || 0
    const itemsNeeded = Math.max(0, monthlyItemsGoal - currentItems)
    const bizDaysTotal = data.businessDaysTotal || 22
    const bizDaysPassed = data.businessDaysPassed || 1
    const bizDaysRemaining = Math.max(1, bizDaysTotal - bizDaysPassed)

    const requiredDailyPace = Number((itemsNeeded / bizDaysRemaining).toFixed(1))
    const currentDailyPace = Number((currentItems / Math.max(1, bizDaysPassed)).toFixed(1))
    const percent = Math.min(100, Math.round((currentItems / monthlyItemsGoal) * 100))
    const isGoalMet = currentItems >= monthlyItemsGoal

    let statusLabel = ""
    let statusColor = ""
    let adviceText = ""

    if (isGoalMet) {
      statusLabel = "Goal Crushed! 🏆"
      statusColor = "text-emerald-800 bg-emerald-100 border-emerald-300"
      adviceText = `Incredible work! You've already reached ${currentItems} NB Auto Items, surpassing your monthly goal of ${monthlyItemsGoal}. Every additional policy this month pushes your agency rank even higher!`
    } else if (currentDailyPace >= requiredDailyPace) {
      statusLabel = "Ahead of Pace 🟢"
      statusColor = "text-emerald-800 bg-emerald-100 border-emerald-300"
      adviceText = `You're in great shape! You have written ${currentItems} items (${percent}% of your ${monthlyItemsGoal}-item target). With ${bizDaysRemaining} working days remaining, maintaining a steady pace of just ${requiredDailyPace} items/day guarantees you win the month!`
    } else if (requiredDailyPace <= 2.5) {
      statusLabel = "Within Reach 🟡"
      statusColor = "text-amber-800 bg-amber-100 border-amber-300"
      adviceText = `You are within striking distance! You need ${itemsNeeded} more items to hit your ${monthlyItemsGoal}-item milestone. Writing ${requiredDailyPace} items/day over the next ${bizDaysRemaining} working days gets you there.`
    } else {
      statusLabel = "Push Pace 🚀"
      statusColor = "text-blue-800 bg-blue-100 border-blue-300"
      adviceText = `Focus on high-volume quote follow-ups and outbound dials today. Writing ${requiredDailyPace} items/day across the remaining ${bizDaysRemaining} working days will close the gap and secure your ${monthlyItemsGoal}-item goal.`
    }

    return {
      monthlyItemsGoal,
      currentItems,
      itemsNeeded,
      bizDaysTotal,
      bizDaysPassed,
      bizDaysRemaining,
      requiredDailyPace,
      currentDailyPace,
      percent,
      isGoalMet,
      statusLabel,
      statusColor,
      adviceText
    }
  }, [data])

  // Rebel Rewards YTD Jedi Tracker Calculation
  const rebelStatus = useMemo(() => {
    if (!data?.agent?.name) return null
    const name = data.agent.name.toLowerCase().trim()
    const match = REBEL_REWARDS_2026_SEED.find(r => {
      const rName = r.name.toLowerCase().trim()
      return rName === name || name.includes(rName.split(" ")[0]) || rName.includes(name.split(" ")[0])
    })
    if (!match) return null

    // Use live YTD auto items from daily uploads if available
    const liveAuto = data.ytdAutoItems !== undefined ? data.ytdAutoItems : match.autoItems

    return calculateAgentRebelStatus(
      match.name,
      liveAuto,
      match.ips,
      match.afsPc,
      match.ivanNlItems,
      {
        agentId: data.agent.id,
        office: data.agent.office || undefined,
        team: data.agent.team || undefined,
        reyByJune30: match.reyByJune30,
      }
    )
  }, [data])

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 text-slate-500">
        <Users className="w-6 h-6 animate-pulse text-blue-500" />
        <span className="text-sm font-medium">Loading agent command center...</span>
      </div>
    )
  }

  if (isForbidden) {
    return (
      <div className="p-6 max-w-md mx-auto my-20 text-center bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-500">
          <Shield className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-800">Private Agent Portal</h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          Individual agent performance records are strictly confidential. You only have access to your own personal portal.
        </p>
        {currentAgent?.id && (
          <Link
            href={`/reports/agent/${currentAgent.id}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm"
          >
            Go to My Portal &rarr;
          </Link>
        )}
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-6 max-w-7xl mx-auto text-center py-20">
        <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-slate-800">Error Loading Agent</h2>
        <p className="text-slate-500 mt-2 mb-6">{error || "Agent data not found."}</p>
        {isAuthorizedManager ? (
          <Link href="/reports/agent" className="text-blue-600 hover:underline">
            &larr; Back to Agent Directory
          </Link>
        ) : currentAgent?.id ? (
          <Link href={`/reports/agent/${currentAgent.id}`} className="text-blue-600 hover:underline">
            &larr; Go to My Portal
          </Link>
        ) : null}
      </div>
    )
  }

  const { agent, scorecards, periodLabel, businessDaysTotal, businessDaysPassed, dailyGoals = {} } = data

  // Trend Chart Data mapping (includes Day of Week + Date, e.g. Mon 8/18)
  const trendData = filteredDailyRows.map(r => {
    const d = new Date(r.report_date + "T12:00:00")
    const weekday = d.toLocaleDateString("en-US", { weekday: "short" })
    const monthDay = `${d.getMonth() + 1}/${d.getDate()}`
    return {
      date: `${weekday} ${monthDay}`,
      Items: r.items || 0,
      Premium: Math.round(r.prem_premium || 0),
      Quotes: r.quotes || 0,
      "Talk Time (min)": Math.round((r.talk_time_seconds || 0) / 60),
      Calls: r.calls || 0,
    }
  })

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
          {isAuthorizedManager && (
            <Link 
              href="/reports/agent" 
              className="p-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-colors shadow-sm shrink-0"
              title="Back to Agent Directory"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
          )}

          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center font-black text-white text-base shadow-sm shrink-0">
            {agent.name.split(" ").map(n => n[0]).join("").substring(0, 2)}
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-black tracking-tight text-slate-900">{agent.name}</h1>
              {agent.team && (
                <Badge variant={agent.team === "Sales" ? "default" : agent.team === "CSR" ? "success" : "default"} className="text-[10px] py-0">
                  {agent.team}
                </Badge>
              )}
              {agent.office && <Badge variant="outline" className="text-[10px] font-mono py-0">{agent.office}</Badge>}
              {agent.role === "admin" && <Badge variant="warning" className="text-[10px] py-0">Admin</Badge>}
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200/80 rounded-md px-2 py-0.5">
                <ShieldCheck className="w-3 h-3 text-emerald-600 shrink-0" />
                <span>Confidential • Visible only to you & management</span>
              </span>
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

      {/* ── Daily Goal Playbook Banner (Compact & Sleek) ── */}
      {playbookData && periodMode === "month" && (
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white rounded-xl px-3.5 py-2 md:py-2.5 shadow-md border border-indigo-800/40 relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-2.5">
          {/* Left: Badge + Crisp Advice */}
          <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-400 text-slate-950 shrink-0">
              <Sparkles className="w-3 h-3" /> Goal Playbook
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0 ${playbookData.statusColor}`}>
              {playbookData.statusLabel}
            </span>
            <p className="text-xs text-slate-300 font-medium">
              {playbookData.isGoalMet 
                ? `Target Crushed! ${playbookData.currentItems} items written (surpassed 40-item goal).`
                : `${playbookData.currentItems} / ${playbookData.monthlyItemsGoal} items (${playbookData.percent}%) • Need ${playbookData.itemsNeeded} more (${playbookData.requiredDailyPace}/day over ${playbookData.bizDaysRemaining} days)`
              }
            </p>
          </div>

          {/* Right: Quick Pace Pill */}
          <div className="inline-flex items-center gap-2 bg-black/40 border border-white/10 rounded-lg px-2.5 py-1 text-[11px] font-mono shrink-0">
            <span className="text-slate-400">Pace: <strong className="text-amber-300 font-bold">{playbookData.isGoalMet ? "0" : `${playbookData.requiredDailyPace}/d`}</strong></span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">{playbookData.bizDaysRemaining}d left</span>
          </div>
        </div>
      )}

      {/* ── Rebel Rewards Jedi Milestone Tracker Card (High-End Dark Theme) ── */}
      {rebelStatus && (
        <div className="relative overflow-hidden rounded-2xl p-6 md:p-8 shadow-2xl border flex flex-col lg:flex-row items-center gap-8 bg-[#030712] border-blue-500/30">
          {/* Background effects */}
          <div className="absolute top-1/2 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[100px] -translate-y-1/2 pointer-events-none" />
          <div className="absolute top-1/2 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-[100px] -translate-y-1/2 pointer-events-none" />

          {/* Left: Portrait & Status */}
          <div className="flex flex-col sm:flex-row items-center gap-6 relative z-10 w-full lg:w-auto">
            {/* Portrait Box — centered full-body character artwork */}
            <div className={`relative w-28 h-36 md:w-32 md:h-44 rounded-2xl flex items-end justify-center border bg-gradient-to-b overflow-hidden shrink-0 shadow-lg
              ${rebelStatus.highestTier === 'none' ? 'from-slate-800 to-slate-950 border-slate-700' :
                rebelStatus.highestTier === 'anakin' ? 'from-blue-800 to-blue-950 border-blue-500/50 shadow-[0_0_25px_rgba(59,130,246,0.35)]' :
                rebelStatus.highestTier === 'rey' ? 'from-cyan-800 to-cyan-950 border-cyan-500/50 shadow-[0_0_25px_rgba(6,182,212,0.35)]' :
                rebelStatus.highestTier === 'luke' ? 'from-amber-700 to-yellow-950 border-amber-500/50 shadow-[0_0_25px_rgba(245,158,11,0.35)]' :
                'from-purple-800 to-indigo-950 border-purple-500/50 shadow-[0_0_25px_rgba(168,85,247,0.35)]'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={`/images/starwars/${rebelStatus.highestTier === 'none' ? 'anakin' : rebelStatus.highestTier}.png`} 
                alt="Jedi Rank" 
                className="h-[88%] w-auto max-w-none object-contain object-bottom filter drop-shadow-[0_10px_15px_rgba(0,0,0,0.9)] transition-transform duration-300 hover:scale-105"
              />
              <div className="absolute top-2 left-2 right-2 flex justify-between items-center z-20">
                <div className="bg-black/75 backdrop-blur-md px-2 py-0.5 rounded-md text-[9px] font-black uppercase text-white tracking-widest border border-white/20 shadow-xs">
                  {rebelStatus.highestTier === "none" ? "Padawan" : rebelStatus.highestTier}
                </div>
              </div>
            </div>

            {/* Status & Goals */}
            <div className="text-center sm:text-left space-y-2 flex-1">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-blue-900/60 text-blue-400 border border-blue-500/30">
                  <Sparkles className="w-3 h-3 text-blue-400" /> Jedi Telemetry
                </div>
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold text-slate-300 bg-white/5 border border-white/10">
                  Current: <strong className="text-white capitalize">{rebelStatus.highestTier === "none" ? "Padawan" : rebelStatus.highestTier}</strong>
                </div>
              </div>

              <div>
                <h3 className="text-2xl md:text-3xl font-black text-white uppercase tracking-wider drop-shadow-md">
                  {rebelStatus.nextTier ? `Pursuing ${rebelStatus.nextTier.name}` : "Grand Jedi Master"}
                </h3>
                {rebelStatus.nextTier && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    Goal Prize: <span className="font-semibold text-emerald-400">{rebelStatus.nextTier.prizeText} Bounty</span> • <span className="font-mono text-slate-400">{rebelStatus.nextTier.ruleText}</span>
                  </p>
                )}
              </div>

              {/* Checklist Badges for Next Goal */}
              {rebelStatus.nextTier && (() => {
                const ntId = rebelStatus.nextTier.id
                const tierData = (rebelStatus as any)[ntId]
                const autoHit = tierData?.autoHit || false
                const afsHit = tierData?.afsHit || false
                const ivanHit = tierData?.ivanHit || false
                const hitsCount = (autoHit ? 1 : 0) + (afsHit ? 1 : 0) + (ivanHit ? 1 : 0)
                const required = rebelStatus.nextTier.requiredHits
                const isAllMet = hitsCount >= required

                return (
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 pt-0.5">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold ${
                      isAllMet ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-white/10 text-slate-300 border border-white/10'
                    }`}>
                      {hitsCount}/{required} Met
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${autoHit ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-white/5 text-slate-500 border border-white/5'}`}>
                      Auto {autoHit ? '✓' : '✗'}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${afsHit ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-white/5 text-slate-500 border border-white/5'}`}>
                      AFS {afsHit ? '✓' : '✗'}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${ivanHit ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-white/5 text-slate-500 border border-white/5'}`}>
                      Ivan {ivanHit ? '✓' : '✗'}
                    </span>
                  </div>
                )
              })()}

              {rebelStatus.totalPayout > 0 && (
                <div className="inline-flex items-center gap-2 bg-black/50 border border-emerald-500/30 rounded-xl px-3 py-1 text-emerald-400 shadow-inner mt-1">
                  <div className="text-[9px] font-bold uppercase tracking-widest opacity-80 leading-none">Bounty:</div>
                  <div className="text-base font-black font-mono leading-none">${rebelStatus.totalPayout.toLocaleString()}</div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Data Targets with Multi-Tier Milestone Pins */}
          {rebelStatus.nextTier ? (
            <div className="flex-1 w-full lg:w-auto bg-black/40 border border-white/5 rounded-2xl p-4 sm:p-5 relative z-10 grid grid-cols-1 md:grid-cols-3 gap-3.5">
              
              {/* Auto Metric */}
              {(() => {
                const maxVal = 500 // Obi-Wan max
                const targetVal = rebelStatus.nextTier.targets.autoItems
                const currentVal = rebelStatus.autoItems
                const isZero = currentVal === 0
                const isMet = currentVal >= targetVal
                const pctOfMax = Math.min(100, Math.round((currentVal / maxVal) * 100))
                const needed = Math.max(0, targetVal - currentVal)
                const milestones = [120, 240, 360, 500]

                return (
                  <div className={`p-3 rounded-xl border transition-all ${
                    isZero 
                      ? 'opacity-40 hover:opacity-100 bg-white/[0.02] border-white/5' 
                      : isMet 
                        ? 'opacity-100 bg-emerald-950/20 border-emerald-500/30' 
                        : 'opacity-100 bg-white/[0.04] border-white/10'
                  }`}>
                    <div className="flex justify-between items-end text-xs font-bold uppercase tracking-wider mb-2">
                      <span className={`flex items-center gap-1.5 ${isZero ? 'text-slate-500' : isMet ? 'text-emerald-400' : 'text-blue-400'}`}>
                        <Car className="w-3.5 h-3.5"/> Auto
                      </span>
                      <span className="font-mono">
                        <strong className={isZero ? 'text-slate-500' : 'text-white'}>{currentVal}</strong>
                        <span className="text-slate-500 font-normal"> / {targetVal}</span>
                      </span>
                    </div>

                    {/* Progress track with milestone markers */}
                    <div className="relative h-2 bg-black/60 rounded-full overflow-visible border border-white/5 my-2.5">
                      <div className={`h-full rounded-full transition-all duration-1000 ${
                        isMet 
                          ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]' 
                          : isZero 
                            ? 'bg-slate-700' 
                            : 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]'
                      }`} style={{ width: `${pctOfMax}%` }} />

                      {!isZero && milestones.map((ms, idx) => {
                        const msPct = (ms / maxVal) * 100
                        const reached = currentVal >= ms
                        const isGoal = targetVal === ms
                        const tierName = ["Anakin", "Rey", "Luke", "Obi-Wan"][idx]
                        return (
                          <div key={idx} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 group/pin z-20" style={{ left: `${msPct}%` }}>
                            <div className={`w-2.5 h-2.5 rounded-full border transition-all cursor-pointer group-hover/pin:scale-150 ${
                              reached 
                                ? 'bg-emerald-500 border-white' 
                                : isGoal 
                                  ? 'bg-blue-500 border-white ring-2 ring-blue-400 shadow-sm' 
                                  : 'bg-slate-800 border-slate-600'
                            }`} />
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/pin:flex flex-col items-center pointer-events-none z-40">
                              <div className="bg-slate-900 text-white text-[9px] font-mono px-2 py-0.5 rounded shadow-xl whitespace-nowrap border border-slate-700">
                                <span className="font-bold">{tierName} ({ms}):</span> {reached ? "✓ Reached" : `${Math.max(0, ms - currentVal)} more`}
                              </div>
                              <div className="w-1.5 h-1.5 bg-slate-900 rotate-45 -mt-0.5" />
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <div className="text-[10px] font-mono mt-1.5 flex justify-between items-center">
                      {isMet ? (
                        <span className="text-emerald-400 font-bold">✓ Target Met</span>
                      ) : isZero ? (
                        <span className="text-slate-500">0 written • Inactive</span>
                      ) : (
                        <span className="text-slate-400">Need <strong className="text-blue-400 font-bold">{needed}</strong> for {rebelStatus.nextTier.character}</span>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* AFS Metric */}
              {(() => {
                const maxVal = 10 // Obi-Wan max
                const targetVal = rebelStatus.nextTier.targets.ips
                const currentVal = rebelStatus.ips
                const isZero = currentVal === 0 && rebelStatus.afsPc === 0
                const isMet = currentVal >= targetVal || rebelStatus.afsPc >= rebelStatus.nextTier.targets.afsPc
                const pctOfMax = Math.min(100, Math.max(
                  Math.round((currentVal / maxVal) * 100),
                  Math.round((rebelStatus.afsPc / 20000) * 100)
                ))
                const neededIps = Math.max(0, targetVal - currentVal)
                const neededPc = Math.max(0, rebelStatus.nextTier.targets.afsPc - rebelStatus.afsPc)
                const milestones = [1, 3, 5, 10]

                return (
                  <div className={`p-3 rounded-xl border transition-all ${
                    isZero 
                      ? 'opacity-40 hover:opacity-100 bg-white/[0.02] border-white/5' 
                      : isMet 
                        ? 'opacity-100 bg-emerald-950/20 border-emerald-500/30' 
                        : 'opacity-100 bg-white/[0.04] border-white/10'
                  }`}>
                    <div className="flex justify-between items-end text-xs font-bold uppercase tracking-wider mb-2">
                      <span className={`flex items-center gap-1.5 ${isZero ? 'text-slate-500' : isMet ? 'text-emerald-400' : 'text-rose-400'}`}>
                        <Heart className="w-3.5 h-3.5"/> AFS
                      </span>
                      <span className="font-mono">
                        <strong className={isZero ? 'text-slate-500' : 'text-white'}>{currentVal}</strong>
                        <span className="text-slate-500 font-normal"> / {targetVal}</span>
                        {rebelStatus.afsPc > 0 && <span className="text-slate-400 text-[10px] ml-1">(${Math.round(rebelStatus.afsPc/1000)}k)</span>}
                      </span>
                    </div>

                    {/* Progress track with milestone markers */}
                    <div className="relative h-2 bg-black/60 rounded-full overflow-visible border border-white/5 my-2.5">
                      <div className={`h-full rounded-full transition-all duration-1000 ${
                        isMet 
                          ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]' 
                          : isZero 
                            ? 'bg-slate-700' 
                            : 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.8)]'
                      }`} style={{ width: `${pctOfMax}%` }} />

                      {!isZero && milestones.map((ms, idx) => {
                        const msPct = (ms / maxVal) * 100
                        const reached = currentVal >= ms
                        const isGoal = targetVal === ms
                        const tierName = ["Anakin", "Rey", "Luke", "Obi-Wan"][idx]
                        return (
                          <div key={idx} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 group/pin z-20" style={{ left: `${msPct}%` }}>
                            <div className={`w-2.5 h-2.5 rounded-full border transition-all cursor-pointer group-hover/pin:scale-150 ${
                              reached 
                                ? 'bg-emerald-500 border-white' 
                                : isGoal 
                                  ? 'bg-rose-500 border-white ring-2 ring-rose-400 shadow-sm' 
                                  : 'bg-slate-800 border-slate-600'
                            }`} />
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/pin:flex flex-col items-center pointer-events-none z-40">
                              <div className="bg-slate-900 text-white text-[9px] font-mono px-2 py-0.5 rounded shadow-xl whitespace-nowrap border border-slate-700">
                                <span className="font-bold">{tierName} ({ms}):</span> {reached ? "✓ Reached" : `${Math.max(0, ms - currentVal)} more`}
                              </div>
                              <div className="w-1.5 h-1.5 bg-slate-900 rotate-45 -mt-0.5" />
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <div className="text-[10px] font-mono mt-1.5 flex justify-between items-center">
                      {isMet ? (
                        <span className="text-emerald-400 font-bold">✓ Target Met</span>
                      ) : isZero ? (
                        <span className="text-slate-500">0 written • Inactive</span>
                      ) : (
                        <span className="text-slate-400">Need <strong className="text-rose-400 font-bold">{neededIps} IPS</strong> or <span className="text-slate-300">${Math.round(neededPc/1000)}k PC</span></span>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* Ivan Metric */}
              {(() => {
                const maxVal = 75 // Obi-Wan max
                const targetVal = rebelStatus.nextTier.targets.ivanNlItems
                const currentVal = rebelStatus.ivanNlItems
                const isZero = currentVal === 0
                const isMet = currentVal >= targetVal
                const pctOfMax = Math.min(100, Math.round((currentVal / maxVal) * 100))
                const needed = Math.max(0, targetVal - currentVal)
                const milestones = [25, 45, 65, 75]

                return (
                  <div className={`p-3 rounded-xl border transition-all ${
                    isZero 
                      ? 'opacity-40 hover:opacity-100 bg-white/[0.02] border-white/5' 
                      : isMet 
                        ? 'opacity-100 bg-emerald-950/20 border-emerald-500/30' 
                        : 'opacity-100 bg-white/[0.04] border-white/10'
                  }`}>
                    <div className="flex justify-between items-end text-xs font-bold uppercase tracking-wider mb-2">
                      <span className={`flex items-center gap-1.5 ${isZero ? 'text-slate-500' : isMet ? 'text-emerald-400' : 'text-amber-400'}`}>
                        <Home className="w-3.5 h-3.5"/> Ivan
                      </span>
                      <span className="font-mono">
                        <strong className={isZero ? 'text-slate-500' : 'text-white'}>{currentVal}</strong>
                        <span className="text-slate-500 font-normal"> / {targetVal}</span>
                      </span>
                    </div>

                    {/* Progress track with milestone markers */}
                    <div className="relative h-2 bg-black/60 rounded-full overflow-visible border border-white/5 my-2.5">
                      <div className={`h-full rounded-full transition-all duration-1000 ${
                        isMet 
                          ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]' 
                          : isZero 
                            ? 'bg-slate-700' 
                            : 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.8)]'
                      }`} style={{ width: `${pctOfMax}%` }} />

                      {!isZero && milestones.map((ms, idx) => {
                        const msPct = (ms / maxVal) * 100
                        const reached = currentVal >= ms
                        const isGoal = targetVal === ms
                        const tierName = ["Anakin", "Rey", "Luke", "Obi-Wan"][idx]
                        return (
                          <div key={idx} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 group/pin z-20" style={{ left: `${msPct}%` }}>
                            <div className={`w-2.5 h-2.5 rounded-full border transition-all cursor-pointer group-hover/pin:scale-150 ${
                              reached 
                                ? 'bg-emerald-500 border-white' 
                                : isGoal 
                                  ? 'bg-amber-500 border-white ring-2 ring-amber-400 shadow-sm' 
                                  : 'bg-slate-800 border-slate-600'
                            }`} />
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/pin:flex flex-col items-center pointer-events-none z-40">
                              <div className="bg-slate-900 text-white text-[9px] font-mono px-2 py-0.5 rounded shadow-xl whitespace-nowrap border border-slate-700">
                                <span className="font-bold">{tierName} ({ms}):</span> {reached ? "✓ Reached" : `${Math.max(0, ms - currentVal)} more`}
                              </div>
                              <div className="w-1.5 h-1.5 bg-slate-900 rotate-45 -mt-0.5" />
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <div className="text-[10px] font-mono mt-1.5 flex justify-between items-center">
                      {isMet ? (
                        <span className="text-emerald-400 font-bold">✓ Target Met</span>
                      ) : isZero ? (
                        <span className="text-slate-500">0 written • Inactive</span>
                      ) : (
                        <span className="text-slate-400">Need <strong className="text-amber-400 font-bold">{needed}</strong> for {rebelStatus.nextTier.character}</span>
                      )}
                    </div>
                  </div>
                )
              })()}

            </div>
          ) : (
             <div className="flex-1 w-full text-center p-6 border border-yellow-500/30 rounded-2xl bg-yellow-500/5 relative z-10">
               <Trophy className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
               <div className="text-yellow-400 font-bold uppercase tracking-widest text-sm">Maximum Bounty Claimed</div>
               <div className="text-slate-400 text-xs mt-1">You have dominated the 2026 Rebel Rewards program.</div>
             </div>
          )}
        </div>
      )}

      {/* ── 8-Metric Spacious Responsive Scorecard Grid ────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 2xl:grid-cols-8 gap-3">
        {scorecards.map((sc) => {
          const isItems = sc.metric === "items"
          const isCloseRate = sc.metric === "close_rate"
          const closeRateGreen = isCloseRate && sc.value >= 0.15

          // Card background class
          let cardBg = "bg-white border-slate-200 shadow-xs hover:border-slate-300"
          if (isItems) cardBg = "bg-amber-50/40 border-amber-300 shadow-xs"
          else if (closeRateGreen) cardBg = "bg-emerald-50/40 border-emerald-300 shadow-xs"

          // Value text color
          let valueColor = "text-slate-900"
          if (isItems) valueColor = "text-amber-900"
          else if (closeRateGreen) valueColor = "text-emerald-900"

          return (
            <div 
              key={sc.metric}
              className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between ${cardBg}`}
            >
              {/* Metric Label */}
              <div className="flex items-start justify-between gap-1 text-[11px] font-bold text-slate-700 pb-1">
                <span className="leading-tight">{sc.label}</span>
                {isItems && <Award className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />}
                {closeRateGreen && <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />}
              </div>

              {/* Big Metric Value */}
              <div className="my-1.5">
                <div className={`text-2xl font-black font-mono tracking-tight leading-none ${valueColor}`}>
                  {sc.unit === "$" && "$"}
                  {sc.unit === "%" 
                    ? `${(sc.value * 100).toFixed(1)}%` 
                    : sc.metric === "talk_time_seconds" || sc.unit === "min"
                      ? formatSeconds(sc.value) 
                      : sc.value.toLocaleString()}
                </div>
                {sc.unit !== "%" && (
                  <div className="text-[10px] font-mono text-slate-400 mt-1">
                    Avg: <strong className="text-slate-600">
                      {sc.metric === "talk_time_seconds" || sc.unit === "min" ? formatSeconds(Math.round(sc.dailyAvg)) : sc.dailyAvg}/d
                    </strong> • <span className="text-slate-500">
                      {sc.metric === "talk_time_seconds" || sc.unit === "min" ? formatSeconds(Math.round(sc.weeklyAvg)) : sc.weeklyAvg}/w
                    </span>
                  </div>
                )}
                {sc.unit === "%" && (
                  <div className="text-[10px] font-mono text-slate-400 mt-1">
                    Team Avg: <strong className="text-slate-600">{sc.teamAvg}%</strong>
                  </div>
                )}
              </div>

              {/* Dual Rankings Badge — #1 green, top 5 blue, else gray */}
              <div className="space-y-1 pt-2 border-t border-slate-100 mt-auto">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-slate-400 font-medium">Team Rank:</span>
                  <span className={`px-1.5 py-0.5 rounded font-bold ${rankBadgeClass(sc.rankInTeam, "team")}`}>
                    #{sc.rankInTeam} <span className="font-normal opacity-70">/ {sc.totalInTeam}</span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-slate-400 font-medium">Agency Rank:</span>
                  <span className={`px-1.5 py-0.5 rounded font-semibold ${rankBadgeClass(sc.rankInAgency, "agency")}`}>
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
        <div className="px-3.5 py-2.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Performance Trend Ribbon</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Metric Pills */}
            <div className="inline-flex flex-wrap p-0.5 bg-slate-100 rounded-lg border border-slate-200 text-[11px] font-bold">
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
