"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { getWeeklyData, getWeekCoverage } from "./actions"
import { runDataSyncPipeline } from "@/app/admin/sync/actions"
import { getWeekStart, getWeekEnd, formatWeekRangeHeader, getPreviousWeekStart, getNextWeekStart, toDateStr, formatWeekRange } from "@/lib/weekUtils"
import { formatValue } from "@/lib/formatters"
import { getBusinessDaysInMonth, getElapsedBusinessDays, calcPacing, toHolidaySet } from "@/lib/businessDays"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { DataTable, ColumnDef } from "@/components/ui/DataTable"
import { FilterBar, FilterState } from "@/components/ui/FilterBar"
import { WeeklyManualModal } from "@/components/reports/WeeklyManualModal"

import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Clock, DollarSign, Package, TrendingUp, Trophy, Edit, RefreshCw, Loader2, Calendar, Database, Phone, MessageSquare, FileText, ShieldCheck, Zap } from "lucide-react"
import Link from "next/link"

// ── Data Source Labels ──
const SOURCE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  calls:   { label: "Calls",   icon: <Phone className="w-3.5 h-3.5" />,        color: "text-sky-600" },
  texts:   { label: "Texts",   icon: <MessageSquare className="w-3.5 h-3.5" />, color: "text-purple-600" },
  quotes:  { label: "Quotes",  icon: <FileText className="w-3.5 h-3.5" />,      color: "text-amber-600" },
  items:   { label: "Items/NB", icon: <Package className="w-3.5 h-3.5" />,      color: "text-violet-600" },
  premium: { label: "Premium", icon: <DollarSign className="w-3.5 h-3.5" />,    color: "text-emerald-600" },
  eagent:  { label: "eAgent",  icon: <ShieldCheck className="w-3.5 h-3.5" />,   color: "text-rose-600" },
}
const SOURCE_KEYS = Object.keys(SOURCE_META) as (keyof typeof SOURCE_META)[]

const COLUMNS: ColumnDef[] = [
  { key: "agent", label: "Agent", group: "agent", sortAccessor: (i) => i.agents?.name },
  { key: "office", label: "Office", group: "agent", sortAccessor: (i) => i.agents?.office },
  { key: "team", label: "Team", group: "agent", sortAccessor: (i) => i.agents?.team },

  { key: "calls", label: "In Calls", group: "calls", sortAccessor: (i) => i.inbound },
  { key: "outbound", label: "Out Calls", group: "calls", sortAccessor: (i) => i.outbound },
  { key: "total_calls", label: "Total Calls", group: "calls", sortAccessor: (i) => i.calls },
  { key: "talk", label: "Talk Time", group: "calls", sortAccessor: (i) => i.talk_time_seconds },
  { key: "texts", label: "Texts", group: "texts", sortAccessor: (i) => i.texts },

  { key: "unique_leads", label: "Unique Leads", group: "leads", sortAccessor: (i) => i.unique_leads },
  { key: "rico_hot", label: "Rico Hot", group: "leads", sortAccessor: (i) => i.rico_hot_pipeline },

  { key: "pivot", label: "#PIVOT", group: "eagent", sortAccessor: (i) => i.pivot },
  { key: "saved", label: "#SAVED", group: "eagent", sortAccessor: (i) => i.saved },

  { key: "auto_quotes", label: "Auto Quotes", group: "production", sortAccessor: (i) => i.quotes },
  { key: "total_prem_wk", label: "Written Prem Wk", group: "production", sortAccessor: (i) => i.written_premium },
  { key: "mtd_total_prem", label: "MTD Total Prem", group: "production", sortAccessor: (i) => i.premium_mtd },
  { key: "auto_pts_wk", label: "Auto Pts Wk", group: "production", sortAccessor: (i) => i.prem_points },
  { key: "prev_mo_pts", label: "Prev Mo Pts", group: "production", sortAccessor: (i) => i.prev_month_points },
  { key: "mtd_auto_items", label: "MTD Auto Items", group: "production", sortAccessor: (i) => i.items_mtd },

  { key: "dismissed", label: "Dismissed To-do's", group: "eagent", sortAccessor: (i) => i.w_dismissed_todos },
  { key: "past_due", label: "Past Due To-do's", group: "eagent", sortAccessor: (i) => i.w_past_due_todos },
  
  { key: "rico_pd", label: "Rico Past Due", group: "leads", sortAccessor: (i) => i.rico_past_due_tasks },
]

const formatTime = (seconds: number) => {
  if (!seconds) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}:${m.toString().padStart(2, '0')}`;
};

// ── Shared UI Helpers ──
function getTop3Ties(data: any[], accessor: (m: any) => number) {
  const scoreMap = new Map<number, any[]>();
  data.forEach(m => {
    const score = accessor(m);
    if (score <= 0) return;
    if (!scoreMap.has(score)) scoreMap.set(score, []);
    scoreMap.get(score)!.push(m);
  });
  const sortedScores = Array.from(scoreMap.keys()).sort((a, b) => b - a);
  const topScores = sortedScores.slice(0, 3);
  return topScores.map(score => ({
    score,
    agents: scoreMap.get(score)!.sort((a, b) => (a.agents?.name || "").localeCompare(b.agents?.name || ""))
  }));
}

function LeaderboardCard({ 
  title, subtitle, icon, data, accessor, format, colorClass, borderClass 
}: { 
  title: string; subtitle?: string; icon: React.ReactNode; data: any[]; 
  accessor: (m: any) => number; format: (v: number) => string;
  colorClass: string; borderClass: string; 
}) {
  const topGroups = getTop3Ties(data, accessor)
  if (topGroups.length === 0) return null
  const medals = ["🥇", "🥈", "🥉"]
  
  return (
    <Card className={`bg-white border border-slate-200 shadow-sm ${borderClass}`}>
      <CardContent className="p-3">
        <div>
          <p className={`text-xs font-semibold ${colorClass} flex items-center gap-1.5`}>
            {icon} {title}
          </p>
          {subtitle && <p className="text-[9px] text-slate-400 mb-2 leading-tight mt-0.5">{subtitle}</p>}
          {!subtitle && <div className="mb-2" />}
        </div>
        <div className="space-y-2">
          {topGroups.map((group, i) => (
            <div key={i} className="flex items-start justify-between gap-2">
              <span className="flex items-start gap-1.5 text-sm">
                <span className="text-base leading-none shrink-0 mt-[1px]">{medals[i]}</span>
                <span className="text-slate-700 font-medium leading-tight text-sm flex flex-wrap gap-x-1 mt-0.5">
                  {group.agents.map((m, idx) => (
                    <span key={m.agent_id}>
                      <Link href={`/reports/agent/${m.agent_id}`} className="hover:text-blue-600 transition-colors">
                        {m.agents?.name}
                      </Link>
                      {idx < group.agents.length - 1 ? <span className="text-slate-400">,</span> : ""}
                    </span>
                  ))}
                </span>
              </span>
              <span className={`text-base font-bold font-mono ${colorClass} shrink-0`}>
                {format(group.score)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

const GROUP_CELL_BORDER: Record<string, string> = {
  calls:      "border-l-2 border-l-emerald-600/40",
  texts:      "border-l-2 border-l-purple-600/40",
  leads:      "border-l-2 border-l-rose-600/40",
  eagent:     "border-l-2 border-l-amber-600/40",
  production: "border-l-2 border-l-amber-500/40",
}

export default function WeeklyReport() {
  const [weekStart, setWeekStart] = useState<Date>(() => {
    const today = new Date()
    return getPreviousWeekStart(getWeekStart(today))
  })
  
  const [metrics, setMetrics] = useState<any[]>([])
  const [goals, setGoals] = useState<any[]>([])
  const [manualSubmitted, setManualSubmitted] = useState(false)
  const [filters, setFilters] = useState<FilterState>({ offices: [], teams: [], agents: [], meetings: [] })
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [holidays, setHolidays] = useState<{ holiday_date: string }[]>([])

  // ── Coverage panel state ──
  const [coverage, setCoverage] = useState<any[]>([])
  const [coverageOpen, setCoverageOpen] = useState(false)
  const [syncingDate, setSyncingDate] = useState<string | null>(null)
  const [syncLogs, setSyncLogs] = useState<Record<string, { success: boolean; logs: string }>>({})

  const weekEnd = getWeekEnd(weekStart)
  const weekStartStr = toDateStr(weekStart)
  const weekEndStr = toDateStr(weekEnd)

  const fetchData = async () => {
    setLoading(true)
    const [result, coverageResult] = await Promise.all([
      getWeeklyData(weekStartStr, weekEndStr),
      getWeekCoverage(weekStartStr, weekEndStr),
    ])
    if (result.success && result.data) {
      setMetrics(result.data.metrics)
      setGoals(result.data.goals)
      setManualSubmitted(result.data.manualSubmitted)
      setHolidays(result.data.holidays || [])
    } else {
      setMetrics([])
    }
    if (coverageResult.success && coverageResult.data) {
      setCoverage(coverageResult.data)
    }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [weekStartStr, weekEndStr])

  // Count total missing sources across all days
  const totalGaps = useMemo(() => {
    if (!coverage.length) return 0
    let gaps = 0
    for (const day of coverage) {
      for (const key of SOURCE_KEYS) {
        if (!day.sources[key]) gaps++
      }
    }
    return gaps
  }, [coverage])

  // Handle per-day sync
  const handleSync = useCallback(async (dateStr: string) => {
    setSyncingDate(dateStr)
    try {
      const result = await runDataSyncPipeline(dateStr)
      setSyncLogs(prev => ({ ...prev, [dateStr]: { success: result.success, logs: result.logs || "" } }))
      // Refresh all data after sync
      const [updatedData, updatedCoverage] = await Promise.all([
        getWeeklyData(weekStartStr, weekEndStr),
        getWeekCoverage(weekStartStr, weekEndStr),
      ])
      if (updatedData.success && updatedData.data) {
        setMetrics(updatedData.data.metrics)
        setGoals(updatedData.data.goals)
        setManualSubmitted(updatedData.data.manualSubmitted)
        setHolidays(updatedData.data.holidays || [])
      }
      if (updatedCoverage.success && updatedCoverage.data) {
        setCoverage(updatedCoverage.data)
      }
    } catch (err) {
      setSyncLogs(prev => ({ ...prev, [dateStr]: { success: false, logs: String(err) } }))
    } finally {
      setSyncingDate(null)
    }
  }, [weekStartStr, weekEndStr])

  const availableMeetings = useMemo(() => {
    return Array.from(new Set(metrics.map(m => m.agents?.meeting_time).filter(Boolean))).sort()
  }, [metrics])

  const availableAgents = useMemo(() => {
    return Array.from(new Set(metrics.map(m => m.agents?.name).filter(Boolean))).sort()
  }, [metrics])

  const filteredMetrics = useMemo(() => {
    return metrics.filter(m => {
      const agent = m.agents || {}
      return (filters.offices.length === 0 || filters.offices.includes(agent.office)) &&
             (filters.teams.length === 0 || filters.teams.includes(agent.team)) &&
             (filters.agents.length === 0 || filters.agents.includes(agent.name)) &&
             (filters.meetings.length === 0 || filters.meetings.includes(agent.meeting_time))
    })
  }, [metrics, filters])

  return (
    <div className="p-4 md:p-6 max-w-[1800px] mx-auto space-y-4">
      <div className="bg-amber-50 text-amber-800 p-3 text-center text-sm font-medium rounded-md shadow-sm border border-amber-200 shrink-0 flex items-center justify-center gap-2 mb-2">
        <span className="text-amber-500">🚧</span> Under Construction; message Charlie with requests
      </div>
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">Weekly Production</h1>
          <p className="text-slate-500">Aggregated performance and manual inputs for the week.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 bg-white border border-slate-200 shadow-sm rounded-md p-1">
            <button 
              onClick={() => setWeekStart(getPreviousWeekStart(weekStart))}
              className="p-1 hover:bg-slate-100 rounded text-slate-600"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-3 py-1 flex items-center gap-2 min-w-[160px] justify-center">
              <Calendar className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-semibold text-slate-700">
                {formatWeekRange(weekStart)}
              </span>
            </div>
            <button 
              onClick={() => setWeekStart(getNextWeekStart(weekStart))}
              className="p-1 hover:bg-slate-100 rounded text-slate-600"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {!manualSubmitted ? (
            <Button 
              onClick={() => setIsModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-2 animate-pulse"
            >
              <AlertCircle className="w-4 h-4" /> Enter Weekly Data
            </Button>
          ) : (
            <Button 
              onClick={() => setIsModalOpen(true)}
              variant="outline"
              className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Weekly Data Submitted
              <Edit className="w-3 h-3 ml-1" />
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => setCoverageOpen(!coverageOpen)}
            className={`flex items-center gap-2 ${
              totalGaps > 0
                ? "border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            }`}
          >
            <Database className="w-4 h-4" />
            Data Coverage
            {totalGaps > 0 && (
              <span className="bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                {totalGaps}
              </span>
            )}
            {totalGaps === 0 && coverage.length > 0 && (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            )}
            {coverageOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </header>

      {/* ── Data Coverage Panel (collapsible) ── */}
      {coverageOpen && (
        <Card className="bg-white border border-slate-200 shadow-sm overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <Database className="w-4 h-4 text-blue-600" /> Data Source Coverage — Mon–Sun
                </h3>
                {totalGaps > 0 ? (
                  <p className="text-xs text-orange-600 mt-0.5 font-medium">
                    {totalGaps} missing source{totalGaps !== 1 ? "s" : ""} detected. Sync individual days to fill gaps.
                  </p>
                ) : coverage.length > 0 ? (
                  <p className="text-xs text-emerald-600 mt-0.5 font-medium">
                    All sources present for every business day.
                  </p>
                ) : null}
              </div>
            </div>

            {/* Coverage grid */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-2 text-xs font-semibold text-slate-500 uppercase tracking-wider w-28">Day</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">Date</th>
                    {SOURCE_KEYS.map(key => (
                      <th key={key} className="text-center py-2 px-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        <div className={`flex items-center justify-center gap-1 ${SOURCE_META[key].color}`}>
                          {SOURCE_META[key].icon}
                          <span className="hidden md:inline">{SOURCE_META[key].label}</span>
                        </div>
                      </th>
                    ))}
                    <th className="text-center py-2 px-2 text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">Agents</th>
                    <th className="text-right py-2 px-2 text-xs font-semibold text-slate-500 uppercase tracking-wider w-28">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {coverage.map((day: any) => {
                    const allGood = SOURCE_KEYS.every(k => day.sources[k])
                    const isSyncing = syncingDate === day.date
                    const log = syncLogs[day.date]
                    return (
                      <tr key={day.date} className={`border-b border-slate-100 ${allGood ? "" : "bg-orange-50/30"}`}>
                        <td className="py-2 px-2 font-semibold text-slate-700">{day.dayName}</td>
                        <td className="py-2 px-2 text-slate-500 font-mono text-xs">
                          {new Date(day.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </td>
                        {SOURCE_KEYS.map(key => (
                          <td key={key} className="py-2 px-2 text-center">
                            {day.sources[key] ? (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-600">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </span>
                            ) : (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-500">
                                <AlertCircle className="w-3.5 h-3.5" />
                              </span>
                            )}
                          </td>
                        ))}
                        <td className="py-2 px-2 text-center">
                          <span className={`text-xs font-mono font-bold ${day.agentCount > 0 ? "text-slate-700" : "text-slate-300"}`}>
                            {day.agentCount}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right">
                          {allGood ? (
                            <span className="text-xs font-medium text-emerald-600 flex items-center justify-end gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Complete
                            </span>
                          ) : isSyncing ? (
                            <span className="text-xs font-medium text-blue-600 flex items-center justify-end gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" /> Syncing...
                            </span>
                          ) : (
                            <button
                              onClick={() => handleSync(day.date)}
                              className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded shadow-sm transition-colors flex items-center gap-1 ml-auto"
                            >
                              <Zap className="w-3 h-3" /> Sync
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Sync logs (show last result if any) */}
            {Object.entries(syncLogs).length > 0 && (
              <details className="mt-3">
                <summary className="text-xs font-semibold text-slate-500 cursor-pointer hover:text-slate-700">Sync Logs</summary>
                <div className="mt-2 max-h-48 overflow-y-auto bg-slate-900 rounded-md p-3">
                  {Object.entries(syncLogs).map(([dateStr, log]) => (
                    <div key={dateStr} className="mb-2">
                      <p className={`text-xs font-bold ${log.success ? "text-emerald-400" : "text-red-400"}`}>
                        {dateStr}: {log.success ? "SUCCESS" : "FAILED"}
                      </p>
                      <pre className="text-[10px] text-slate-400 whitespace-pre-wrap font-mono leading-relaxed">
                        {log.logs.slice(-500)}
                      </pre>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </CardContent>
        </Card>
      )}

      <FilterBar onFilterChange={setFilters} availableAgents={availableAgents} availableMeetings={availableMeetings} />

      {/* ── Elite Agency-Wide MTD Pacing Tracker ── */}
      {(() => {
        const AGENCY_GOAL = 500;
        const totalItemsMTD = metrics.reduce((sum: number, m: any) => sum + (m.items_mtd || 0), 0);
        const remaining = Math.max(0, AGENCY_GOAL - totalItemsMTD);
        
        const officeMap: Record<string, number> = {};
        metrics.forEach((m: any) => {
          const office = m.agents?.office || "Other";
          officeMap[office] = (officeMap[office] || 0) + (m.items_mtd || 0);
        });
        const offices = Object.entries(officeMap).sort((a, b) => b[1] - a[1]);
        const officeColors: Record<string, string> = {
          MCM: "bg-amber-500", MB: "bg-violet-500", RC: "bg-blue-500",
          CH: "bg-emerald-500", Other: "bg-slate-500"
        };
        const officeTextColors: Record<string, string> = {
          MCM: "text-amber-400", MB: "text-violet-400", RC: "text-blue-400",
          CH: "text-emerald-400", Other: "text-slate-400"
        };

        const scaleMax = Math.max(AGENCY_GOAL, totalItemsMTD);
        const holidaySet = toHolidaySet(holidays)
        
        // Pacing logic (same as daily)
        const now = new Date()
        const currentYear = weekEnd.getFullYear()
        const currentMonth = weekEnd.getMonth() + 1
        const totalBizDays = getBusinessDaysInMonth(currentYear, currentMonth, holidaySet)
        
        let elapsed = 0
        if (now.getDate() > 1) {
          const yesterday = new Date(now)
          yesterday.setDate(now.getDate() - 1)
          elapsed = getElapsedBusinessDays(currentYear, currentMonth, holidaySet, yesterday)
        }
        
        const remainingBizDays = totalBizDays - elapsed
        const pacing = calcPacing(totalItemsMTD, elapsed, remainingBizDays, AGENCY_GOAL)

        const statusColor = pacing.status === "ahead"
          ? "text-emerald-600 bg-emerald-50 border-emerald-200"
          : pacing.status === "close"
          ? "text-amber-600 bg-amber-50 border-amber-200"
          : "text-red-600 bg-red-50 border-red-200"
        const statusIcon = pacing.status === "ahead" ? "🟢" : pacing.status === "close" ? "🟡" : "🔴"
        const statusLabel = pacing.status === "ahead" ? "On Track" : pacing.status === "close" ? "Close" : "Behind Pace"

        return (
          <Card className="bg-white border border-slate-200 shadow-sm overflow-hidden relative mb-6">
            <CardContent className="p-5 relative z-10">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2 tracking-tight">
                      <TrendingUp className="w-4 h-4 text-blue-600" /> Agency MTD Pacing
                    </h2>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusColor}`}>
                      {statusIcon} {statusLabel}
                    </span>
                  </div>
                  <p className="text-[13px] text-slate-500 flex items-center gap-2">
                    Items vs {AGENCY_GOAL} goal
                    <span className="text-slate-300">•</span>
                    <span className="text-slate-600 font-medium tracking-tight">
                      📅 {elapsed} of {totalBizDays} biz days <span className="text-slate-400 font-normal">({remainingBizDays} left)</span>
                    </span>
                  </p>
                </div>
                <div className="text-left md:text-right mt-3 md:mt-0">
                  <div className="flex items-baseline gap-1.5 justify-start md:justify-end leading-none">
                    <span className="text-3xl font-black text-slate-900 font-mono tracking-tighter">{totalItemsMTD}</span>
                    <span className="text-lg text-slate-400 font-mono font-medium">/ {AGENCY_GOAL}</span>
                  </div>
                  {remaining > 0 ? (
                    <p className="text-[11px] font-medium text-amber-500 mt-1.5 tracking-wide uppercase">{remaining} needed</p>
                  ) : (
                    <p className="text-[11px] font-bold text-emerald-500 mt-1.5 tracking-wide uppercase">Goal exceeded by {totalItemsMTD - AGENCY_GOAL}! 🚀</p>
                  )}
                </div>
              </div>

              {/* The Elite Stacked Bar */}
              <div className="relative pt-4 pb-2">
                <div 
                  className="absolute top-0 bottom-0 border-l-2 border-dashed border-slate-300 z-10 transition-all duration-1000" 
                  style={{ left: `${(AGENCY_GOAL / scaleMax) * 100}%` }}
                >
                  <div className="absolute -top-5 -translate-x-1/2 bg-white border border-slate-200 text-slate-600 shadow-sm text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest whitespace-nowrap">
                    Goal
                  </div>
                </div>

                <div className="w-full h-6 bg-slate-100 rounded-md overflow-hidden flex ring-1 ring-inset ring-slate-200 shadow-inner">
                  {offices.map(([office, count]) => {
                    const w = (count / scaleMax) * 100;
                    if (w === 0) return null;
                    return (
                      <div 
                        key={office}
                        className={`h-full ${officeColors[office]} border-r border-white/20 transition-all duration-1000 relative group`}
                        style={{ width: `${w}%` }}
                      >
                        <div className="opacity-0 group-hover:opacity-100 absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-0.5 rounded shadow-md whitespace-nowrap transition-opacity z-20 pointer-events-none">
                          {office}: {count}
                        </div>
                      </div>
                    );
                  })}
                  {remaining > 0 && (
                    <div 
                      className="h-full bg-[repeating-linear-gradient(45deg,transparent,transparent_8px,rgba(0,0,0,0.03)_8px,rgba(0,0,0,0.03)_16px)] transition-all duration-1000"
                      style={{ width: `${(remaining / scaleMax) * 100}%` }}
                    />
                  )}
                </div>
              </div>

              {/* Legend & Stats Row */}
              <div className="mt-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  {offices.map(([office, count]) => {
                    const offPct = totalItemsMTD > 0 ? Math.round((count / totalItemsMTD) * 100) : 0;
                    return (
                      <div key={office} className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded px-3 py-1.5">
                        <div className={`w-2.5 h-2.5 rounded-full ${officeColors[office]} ring-1 ring-black/5`} />
                        <span className={`text-[11px] font-bold ${officeTextColors[office]}`}>{office}</span>
                        <span className="text-sm font-mono font-bold text-slate-700 ml-0.5">{count}</span>
                        <span className="text-[10px] font-sans text-slate-400 hidden sm:inline">({offPct}%)</span>
                      </div>
                    );
                  })}
                </div>

                {/* Updated Labels for context */}
                <div className="flex items-center gap-3">
                  <div className="bg-slate-50 border border-slate-200/60 rounded px-4 py-2.5 text-center min-w-[110px]">
                    <p className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Current Rate</p>
                    <p className="text-lg font-black font-mono text-slate-900 leading-none">{pacing.dailyRate.toFixed(1)}</p>
                    <p className="text-[9px] text-slate-400 font-medium mt-1.5">items / day</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200/60 rounded px-4 py-2.5 text-center min-w-[110px]">
                    <p className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Projected</p>
                    <p className={`text-lg font-black font-mono leading-none ${
                      pacing.projectedEOM >= AGENCY_GOAL ? "text-emerald-600" : "text-red-600"
                    }`}>
                      ~{pacing.projectedEOM}
                    </p>
                    <p className="text-[9px] text-slate-400 font-medium mt-1.5">total items at month end</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200/60 rounded px-4 py-2.5 text-center min-w-[110px]">
                    <p className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Required</p>
                    <p className={`text-lg font-black font-mono leading-none ${
                      pacing.requiredDaily <= pacing.dailyRate ? "text-emerald-600" : "text-amber-600"
                    }`}>
                      {pacing.requiredDaily.toFixed(1)}
                    </p>
                    <p className="text-[9px] text-slate-400 font-medium mt-1.5">items / day required</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* ── Top 3 Leaderboards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <LeaderboardCard
          title="Top Items (Week)"
          icon={<Package className="w-3.5 h-3.5" />}
          data={metrics}
          accessor={(m) => m.items || 0}
          format={(v) => `${v} items`}
          colorClass="text-amber-400"
          borderClass="border-amber-500/30"
        />
        <LeaderboardCard
          title="Top Premium (Week)"
          icon={<DollarSign className="w-3.5 h-3.5" />}
          data={metrics}
          accessor={(m) => m.prem_premium || 0}
          format={(v) => `$${v.toLocaleString()}`}
          colorClass="text-emerald-400"
          borderClass="border-emerald-500/30"
        />
        <LeaderboardCard
          title="Top Talk Time"
          icon={<Clock className="w-3.5 h-3.5" />}
          data={metrics}
          accessor={(m) => m.talk_time_seconds || 0}
          format={(v) => formatTime(v)}
          colorClass="text-sky-400"
          borderClass="border-sky-500/30"
        />
        <LeaderboardCard
          title="Items MTD"
          icon={<TrendingUp className="w-3.5 h-3.5" />}
          data={metrics}
          accessor={(m) => m.items_mtd || 0}
          format={(v) => `${v} items`}
          colorClass="text-amber-400"
          borderClass="border-amber-500/30"
        />
        <LeaderboardCard
          title="Premium MTD"
          icon={<Trophy className="w-3.5 h-3.5" />}
          data={metrics}
          accessor={(m) => m.premium_mtd || 0}
          format={(v) => `$${v.toLocaleString()}`}
          colorClass="text-emerald-400"
          borderClass="border-emerald-500/30"
        />
      </div>

      {/* ── Main Data Table ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Weekly Production Report — {formatWeekRangeHeader(weekStart)}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="h-32 flex justify-center items-center"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div></div>
          ) : (
            <DataTable 
              columns={COLUMNS}
              data={filteredMetrics}
              keyExtractor={(item) => item.agent_id}
              renderRow={(item) => {
                const bdr = (group: string) => GROUP_CELL_BORDER[group] || "";
                const manualHL = !manualSubmitted ? "orange" as const : undefined;
                return (
                  <>
                    <td className="py-[2px] px-1.5 text-[15px] whitespace-nowrap">
                      <Link href={`/reports/agent/${item.agent_id}`} className="font-bold text-blue-400 hover:underline">
                        {item.agents?.name}
                      </Link>
                    </td>
                    <td className="py-[2px] px-1.5 text-[15px] text-slate-400">{item.agents?.office || "-"}</td>
                    <td className="py-[2px] px-1.5 text-[15px] text-slate-400">
                      {item.agents?.team ? <Badge variant="outline" className="text-[11px] py-0">{item.agents.team}</Badge> : '-'}
                    </td>

                    {/* RC / Ricochet */}
                    <td className={`py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900 ${bdr("calls")}`}>{formatValue(item.inbound)}</td>
                    <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{formatValue(item.outbound)}</td>
                    <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{formatValue(item.calls)}</td>
                    <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{formatTime(item.talk_time_seconds)}</td>
                    
                    {/* Hearsay */}
                    <td className={`py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900 ${bdr("texts")}`}>{formatValue(item.texts)}</td>

                    {/* Leads (manual) */}
                    <td className={`py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900 ${bdr("leads")}`}>{formatValue(item.unique_leads, "", "", null, manualHL)}</td>
                    <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{formatValue(item.rico_hot_pipeline, "", "", null, manualHL)}</td>

                    {/* eAgent (manual) */}
                    <td className={`py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900 ${bdr("eagent")}`}>{formatValue(item.pivot, "", "", null, manualHL)}</td>
                    <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{formatValue(item.saved, "", "", null, manualHL)}</td>

                    {/* Production */}
                    <td className={`py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900 ${bdr("production")}`}>{formatValue(item.quotes)}</td>
                    <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{formatValue(item.prem_premium, "$")}</td>
                    <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{formatValue(item.premium_mtd, "$", "", null, "gold")}</td>
                    <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{formatValue(item.prem_points)}</td>
                    <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{formatValue(item.prev_month_points)}</td>
                    <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{formatValue(item.items_mtd, "", "", null, "gold")}</td>

                    {/* Past Due / Dismissed (manual) */}
                    <td className={`py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900 ${bdr("eagent")}`}>{formatValue(item.w_dismissed_todos, "", "", null, manualHL)}</td>
                    <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{formatValue(item.w_past_due_todos, "", "", null, manualHL)}</td>
                    
                    <td className={`py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900 ${bdr("leads")}`}>{formatValue(item.rico_past_due_tasks, "", "", null, manualHL)}</td>
                  </>
                );
              }}
            />
          )}
        </CardContent>
      </Card>

      <WeeklyManualModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        weekStartStr={weekStartStr}
        weekLabel={formatWeekRange(weekStart)}
        agents={metrics}
        onSuccess={fetchData}
      />
    </div>
  )
}
