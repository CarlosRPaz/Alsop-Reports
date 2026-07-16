"use client"

import { useState, useEffect, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { getAgentMonthlyData, AgentMonthlyData, RankingEntry, getAgentNotes, saveAgentNotes } from "../actions"
import { formatValue } from "@/lib/formatters"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { DataTable, ColumnDef } from "@/components/ui/DataTable"
import { TrendChart } from "@/components/charts/TrendChart"
import { Badge } from "@/components/ui/Badge"
import { useChat } from "@/lib/chat/chatContext"
import { Button } from "@/components/ui/Button"
import {
  ArrowLeft, CalendarDays, Phone, MessageSquare,
  FileBarChart, ShieldCheck, DollarSign, Trophy, Users, AlertTriangle, AlertCircle, Package, Loader2
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

function RankCard({ ranking }: { ranking: RankingEntry }) {
  const isTop3 = ranking.rank <= 3
  const isAboveAvg = ranking.value > ranking.teamAvg

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
          ranking.rank === 1 ? "bg-amber-100 text-amber-600" :
          ranking.rank === 2 ? "bg-slate-200 text-slate-600" :
          ranking.rank === 3 ? "bg-orange-100 text-orange-700" :
          "bg-blue-50 text-blue-600"
        }`}>
          {isTop3 ? <Trophy className="w-4 h-4" /> : <span className="text-xs font-bold">#{ranking.rank}</span>}
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{ranking.label}</p>
          <p className="text-sm font-semibold text-slate-800">
            {ranking.metric === "close_rate" 
              ? (ranking.value * 100).toFixed(1) + "%" 
              : ranking.value.toLocaleString()}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-xs font-medium text-slate-500">Rank</p>
        <p className="text-sm font-bold text-slate-800">{ranking.rank} <span className="text-slate-400 font-normal">/ {ranking.total}</span></p>
      </div>
    </div>
  )
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
  const [error, setError] = useState<string | null>(null)

  const [managerNotes, setManagerNotes] = useState("")
  const [isAiNote, setIsAiNote] = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)
  const [generatingAi, setGeneratingAi] = useState(false)

  const isCurrentMonth = selectedYear === new Date().getFullYear() && selectedMonth === new Date().getMonth() + 1

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      const res = await getAgentMonthlyData(agentId, selectedYear, selectedMonth)
      
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

      // Auto-fallback for current month if empty
      if (res.data && res.data.dailyRows.length === 0 && isCurrentMonth) {
        const prev = new Date(selectedYear, selectedMonth - 2, 1)
        setSelectedYear(prev.getFullYear())
        setSelectedMonth(prev.getMonth() + 1)
        return // Effect re-triggers
      }

      setData(res.data || null)
      setLoading(false)
    }
    if (agentId) load()
  }, [agentId, selectedYear, selectedMonth, isCurrentMonth])

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
    
    const kpis = data.kpis
    const name = data.agent.name
    const period = data.periodLabel
    
    const items = kpis.items
    const premium = Math.round(kpis.written_premium)
    const quotes = kpis.quotes
    const closeRate = (kpis.close_rate * 100).toFixed(1)
    const calls = kpis.calls
    const hours = Math.floor(kpis.talk_time_seconds / 3600)
    const mins = Math.floor((kpis.talk_time_seconds % 3600) / 60)
    
    let coachingAdvice = ""
    if (kpis.close_rate < 0.12) {
      coachingAdvice = "Focus coaching on close rate conversion and overcoming common objections."
    } else if (kpis.calls < 200) {
      coachingAdvice = "Focus coaching on daily outbound dials and active lead follow-up to increase pipeline."
    } else {
      coachingAdvice = "Performance is solid. Continue maintaining current activity and close rate standard."
    }

    const aiText = `AI Summary (${period}): ${name} has written $${premium.toLocaleString()} premium across ${items} items. DSR metrics include: ${quotes} quotes with a close rate of ${closeRate}%, ${calls} outbound calls, and ${hours}h ${mins}m talk time. ${coachingAdvice}`
    
    setManagerNotes(aiText)
    setIsAiNote(true)
    
    const res = await saveAgentNotes(agentId, aiText, true)
    if (!res.success) {
      console.error("Failed to save AI generated note:", res.error)
    }
    
    setGeneratingAi(false)
  }

  // Table Columns (matching ColumnDef interface)
  const COLUMNS: ColumnDef[] = [
    { key: "date",      label: "Date",         group: "agent",      sortAccessor: (m: any) => m.report_date },
    { key: "calls",     label: "Calls",        group: "calls",      sortAccessor: (m: any) => m.calls || 0 },
    { key: "outbound",  label: "Outbound",     group: "calls",      sortAccessor: (m: any) => m.outbound || 0 },
    { key: "talktime",  label: "Talk Time",    group: "calls",      sortAccessor: (m: any) => m.talk_time_seconds || 0 },
    { key: "texts",     label: "Texts",        group: "texts",      sortAccessor: (m: any) => m.texts || 0 },
    { key: "quotes",    label: "Quotes",       group: "production", sortAccessor: (m: any) => m.quotes || 0 },
    { key: "nb",        label: "NB",           group: "production", sortAccessor: (m: any) => m.nb_count || 0 },
    { key: "items",     label: "Items",        group: "production", sortAccessor: (m: any) => m.items || 0 },
    { key: "wp",        label: "Written Prem", group: "production", sortAccessor: (m: any) => m.written_premium || 0 },
    { key: "pivots",    label: "Pivots",       group: "eagent",     sortAccessor: (m: any) => m.pivots || 0 },
    { key: "dismissed", label: "Dismissed",    group: "eagent",     sortAccessor: (m: any) => m.dismissed_todos || 0 },
  ]

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 text-slate-500">
        <Users className="w-6 h-6 animate-pulse" />
        <span>Loading agent profile...</span>
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

  const { agent, kpis, dailyRows, rankings, periodLabel, businessDaysTotal, businessDaysPassed } = data

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* ── Top Bar ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <Link href="/reports/agent" className="text-sm font-medium text-slate-500 hover:text-slate-900 flex items-center gap-1.5 mb-2 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Directory
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-bold text-white text-lg shadow-sm">
              {agent.name.split(" ").map(n => n[0]).join("").substring(0, 2)}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{agent.name}</h1>
              <div className="flex gap-2 mt-1">
                {agent.team && (
                  <Badge variant={agent.team === "Sales" ? "default" : agent.team === "CSR" ? "success" : "default"}>
                    {agent.team}
                  </Badge>
                )}
                {agent.office && <Badge variant="outline">{agent.office}</Badge>}
                {agent.role === "admin" && <Badge variant="warning">Admin</Badge>}
              </div>
            </div>
          </div>
        </div>

        {/* Month Selector */}
        <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
          <CalendarDays className="w-5 h-5 text-slate-400 ml-2" />
          <select
            value={`${selectedYear}-${selectedMonth}`}
            onChange={e => {
              const [y, m] = e.target.value.split("-").map(Number)
              setSelectedYear(y)
              setSelectedMonth(m)
            }}
            className="appearance-none bg-transparent font-semibold text-slate-700 py-1.5 pr-8 pl-2 outline-none cursor-pointer"
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
        </div>
      </div>

      {dailyRows.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-200">
          <CardContent className="py-16 text-center">
            <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-slate-700">No Data Available</h3>
            <p className="text-slate-500 mt-1">There is no recorded activity for {periodLabel}.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── KPI Grid ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                  <Package className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500">Items {isCurrentMonth ? "MTD" : ""}</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-slate-900">{kpis.items}</span>
                    <span className="text-xs font-medium text-slate-400">
                      pacing: {Math.round((kpis.items / businessDaysPassed) * businessDaysTotal)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                  <FileBarChart className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500">Quotes {isCurrentMonth ? "MTD" : ""}</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-slate-900">{kpis.quotes}</span>
                    <span className="text-xs font-medium text-slate-400">
                      pacing: {Math.round((kpis.quotes / businessDaysPassed) * businessDaysTotal)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500">NB Policies {isCurrentMonth ? "MTD" : ""}</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-slate-900">{kpis.nb_count}</span>
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                      {(kpis.close_rate * 100).toFixed(1)}% Close
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                  <Phone className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500">Total Calls {isCurrentMonth ? "MTD" : ""}</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-slate-900">{kpis.calls.toLocaleString()}</span>
                    <span className="text-xs font-medium text-slate-400">
                      {kpis.outbound} out / {kpis.inbound} in
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                  <DollarSign className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500">Written Premium</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-slate-900">
                      ${kpis.written_premium.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* ── Main Content: Chart & Table (Spans 3 cols) ── */}
            <div className="lg:col-span-3 space-y-6">
              <Card>
                <CardHeader className="border-b border-slate-100 pb-4">
                  <CardTitle className="text-base font-semibold text-slate-800">
                    Performance Trend
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="h-[300px]">
                    <TrendChart
                      title="Activity Trends"
                      data={dailyRows.map(r => ({
                        date: r.report_date,
                        Quotes: r.quotes,
                        "New Business": r.nb_count,
                        Calls: r.calls
                      }))}
                      xAxisKey="date"
                      lines={[
                        { key: "Quotes", color: "#3b82f6" },       // blue-500
                        { key: "New Business", color: "#10b981" }, // emerald-500
                        { key: "Calls", color: "#8b5cf6" },        // violet-500
                      ]}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="border-b border-slate-100 pb-4 flex flex-row items-center justify-between">
                  <CardTitle className="text-base font-semibold text-slate-800">
                    Daily Log
                  </CardTitle>
                </CardHeader>
                <div className="overflow-x-auto">
                  <DataTable
                    columns={COLUMNS}
                    data={dailyRows}
                    keyExtractor={(item) => item.report_date}
                    renderRow={(item) => {
                      const formatDate = (ds: string) => {
                        const d = new Date(ds + "T12:00:00")
                        return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
                      }
                      const formatTime = (sec: number) => {
                        if (!sec) return "0:00"
                        const h = Math.floor(sec / 3600)
                        const m = Math.floor((sec % 3600) / 60)
                        return `${h}:${m.toString().padStart(2, '0')}`
                      }
                      return (
                        <>
                          <td className="py-[2px] px-1.5 text-[15px] whitespace-nowrap font-medium text-slate-700">{formatDate(item.report_date)}</td>
                          <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900 border-l-2 border-l-emerald-600/50">{formatValue(item.calls)}</td>
                          <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{formatValue(item.outbound)}</td>
                          <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{item.talk_time_seconds ? formatTime(item.talk_time_seconds) : <span className="text-slate-300 font-normal">0:00</span>}</td>
                          <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900 border-l-2 border-l-fuchsia-600/50">{formatValue(item.texts)}</td>
                          <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900 border-l-2 border-l-amber-500/50">{formatValue(item.quotes)}</td>
                          <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{formatValue(item.nb_count)}</td>
                          <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{formatValue(item.items)}</td>
                          <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{item.written_premium ? formatValue(Number(item.written_premium), "$") : formatValue(0)}</td>
                          <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900 border-l-2 border-l-orange-500/50">{formatValue(item.pivots)}</td>
                          <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{formatValue(item.dismissed_todos)}</td>
                        </>
                      )
                    }}
                  />
                </div>
              </Card>
            </div>

            {/* ── Sidebar Context: Rankings (Spans 1 col) ── */}
            <div className="space-y-6">
              <Card>
                <CardHeader className="bg-slate-50 border-b border-slate-100 pb-4 rounded-t-xl">
                  <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2 uppercase tracking-wider">
                    <Trophy className="w-4 h-4 text-amber-500" />
                    {agent.team || "Agency"} Rankings
                  </CardTitle>
                  <p className="text-xs text-slate-500 mt-1">Compared to {rankings[0]?.total || 0} peers for {periodLabel}</p>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  {rankings.map(r => (
                    <RankCard key={r.metric} ranking={r} />
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="border-b border-slate-100 pb-3">
                  <CardTitle className="text-sm font-semibold text-slate-800">
                    Additional Metrics
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-slate-100">
                    <div className="flex justify-between p-4">
                      <span className="text-sm text-slate-600">Total Talk Time</span>
                      <span className="text-sm font-semibold text-slate-900">
                        {Math.floor(kpis.talk_time_seconds / 3600)}h {Math.floor((kpis.talk_time_seconds % 3600) / 60)}m
                      </span>
                    </div>
                    <div className="flex justify-between p-4">
                      <span className="text-sm text-slate-600">Items Sold</span>
                      <span className="text-sm font-semibold text-slate-900">{kpis.items}</span>
                    </div>
                    <div className="flex justify-between p-4 bg-slate-50">
                      <span className="text-sm text-slate-600">eAgent Pivots</span>
                      <span className="text-sm font-semibold text-slate-900">{kpis.pivots}</span>
                    </div>
                    <div className="flex justify-between p-4 bg-slate-50">
                      <span className="text-sm text-slate-600">Past Due To-Dos</span>
                      <span className="text-sm font-semibold text-rose-600">{kpis.past_due_todos}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* ── Manager Notes (Only visible to Managers & Admins) ── */}
          {isAuthorizedManager && (
            <Card className="mt-6 border border-slate-200 shadow-sm bg-white overflow-hidden no-print">
              <CardHeader className="pb-2 border-b border-slate-100 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
                    <FileBarChart className="w-5 h-5 text-indigo-500" /> Manager Feedback & Notes
                  </CardTitle>
                  <p className="text-xs text-slate-500 mt-0.5">Private notes on agent performance (visible only to managers & admins)</p>
                </div>
                <div className="flex items-center gap-3">
                  {isAiNote && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 flex items-center gap-1 select-none">
                      ✨ AI Generated
                    </span>
                  )}
                  {savingNotes && (
                    <span className="text-xs text-slate-400 font-medium flex items-center gap-1.5 animate-pulse">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" /> Saving...
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleGenerateAiNote}
                    className="text-xs h-7 gap-1 font-semibold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50/50 border-indigo-200"
                    disabled={generatingAi}
                  >
                    {generatingAi ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <span>✨ Generate AI Summary</span>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <textarea
                  value={managerNotes}
                  onChange={(e) => {
                    setManagerNotes(e.target.value)
                    setIsAiNote(false) // If they start typing/editing, remove the AI flag
                  }}
                  onBlur={handleSaveManagerNotes}
                  placeholder="Write feedback, coaching notes, or observation details here. Changes auto-save on blur..."
                  className="w-full min-h-[100px] p-3 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all text-slate-800 placeholder:text-slate-400 resize-y"
                />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
