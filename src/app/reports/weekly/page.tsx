"use client"

import { PageGuard } from "@/components/layout/PageGuard";
import { useState, useEffect, useMemo, useCallback } from "react"
import { getWeeklyData, getWeekCoverage, getWeeklyAutoSums } from "./actions"
import { runDataSyncPipeline } from "@/app/admin/sync/actions"
import { getWeekStart, getWeekEnd, formatWeekRangeHeader, getPreviousWeekStart, getNextWeekStart, toDateStr, formatWeekRange } from "@/lib/weekUtils"
import { formatValue } from "@/lib/formatters"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { DataTable, ColumnDef } from "@/components/ui/DataTable"
import { FilterBar, FilterState } from "@/components/ui/FilterBar"
import { WeeklyManualModal } from "@/components/reports/WeeklyManualModal"
import AgencyMTDPacing from "@/components/ui/AgencyMTDPacing"
import { toHolidaySet, getBusinessDaysInMonth, getElapsedBusinessDays } from "@/lib/businessDays"

import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Clock, DollarSign, Package, TrendingUp, Trophy, Edit, RefreshCw, Loader2, Calendar, Database, Phone, MessageSquare, FileText, ShieldCheck, Zap, Megaphone, Car } from "lucide-react"
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
  title, subtitle, icon, data, accessor, format, colorClass, className,
  holidays, year, month, goals, agencyTotal
}: { 
  title: string; subtitle?: string; icon: React.ReactNode; data: any[]; 
  accessor: (m: any) => number; format: (v: number) => string;
  colorClass: string; className?: string;
  holidays?: { holiday_date: string }[]; year?: number; month?: number;
  goals?: any[];
  agencyTotal?: number;
}) {
  const topGroups = getTop3Ties(data, accessor)
  if (topGroups.length === 0) return null
  const medals = ["🥇", "🥈", "🥉"]
  const isMTD = title.includes("MTD")
  
  // Projection calculations for Allstate Auto Items MTD
  let totalBizDays = 0
  let elapsed = 0
  let hasProj = false
  if (title === "Allstate Auto Items MTD" && holidays) {
    const holidaySet = toHolidaySet(holidays)
    const now = new Date()
    const currentYear = year ?? now.getFullYear()
    const currentMonth = month ?? (now.getMonth() + 1)
    totalBizDays = getBusinessDaysInMonth(currentYear, currentMonth, holidaySet)

    const isCurrentMonth = now.getFullYear() === currentYear && (now.getMonth() + 1) === currentMonth
    elapsed = totalBizDays
    if (isCurrentMonth) {
      if (now.getDate() > 1) {
        const yesterday = new Date(now)
        yesterday.setDate(now.getDate() - 1)
        elapsed = getElapsedBusinessDays(currentYear, currentMonth, holidaySet, yesterday)
      } else {
        elapsed = 0
      }
    }
    hasProj = true
  }

  // Helper to get agent monthly items goal (default to 40)
  const getAgentMonthlyItemsGoal = (m: any) => {
    if (!goals) return 40;
    const matching = goals.filter((g: any) => g.metric_name === "items" && g.timeframe === "monthly");
    if (!matching.length) return 40;
    const agentOffice = m.agents?.office;
    const agentTeam = m.agents?.team;

    const teamAndOffice = matching.find((g: any) => g.team === agentTeam && g.office === agentOffice);
    if (teamAndOffice) return teamAndOffice.target_value;
    const teamOnly = matching.find((g: any) => g.team === agentTeam && !g.office);
    if (teamOnly) return teamOnly.target_value;
    const officeOnly = matching.find((g: any) => g.office === agentOffice && !g.team);
    if (officeOnly) return officeOnly.target_value;
    const globalGoal = matching.find((g: any) => !g.office && !g.team);
    return globalGoal ? globalGoal.target_value : 40;
  };
  
  return (
    <div className={`${className || ""} flex flex-col`}>
      <Card className="bg-white border border-slate-200 shadow-sm flex-1 flex flex-col">
        <CardContent className={`${isMTD ? "p-5" : "p-3"} flex-1 flex flex-col`}>
          <div className={`flex items-start justify-between gap-2 ${isMTD ? "mb-4" : "mb-2"}`}>
            <div className="min-w-0">
              <p className={`${isMTD ? "text-base" : "text-xs"} font-bold text-slate-800 flex items-center gap-1.5`}>
                <span className={colorClass}>{icon}</span> <span className="truncate">{title}</span>
              </p>
              {subtitle && <p className={`${isMTD ? "text-xs mt-1" : "text-[9px] mt-0.5"} text-slate-400 leading-tight`}>{subtitle}</p>}
            </div>
            <span className={`${isMTD ? "text-[10px] px-2 py-1" : "text-[9px] px-1.5 py-0.5"} font-extrabold uppercase rounded tracking-wider shrink-0 select-none border ${
              isMTD 
                ? "bg-indigo-50 text-indigo-700 border-indigo-100" 
                : "bg-slate-50 text-slate-600 border-slate-200"
            }`}>
              {isMTD ? "MTD" : "Weekly"}
            </span>
          </div>

          {hasProj && (
            <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1.5 mb-2.5">
              <span>Agent</span>
              <div className="flex items-center gap-6 font-mono">
                <span className="w-12 text-right">MTD</span>
                <span className="w-16 text-center bg-slate-50 text-slate-500 rounded border border-slate-200/60 py-0.5">EoM Proj.</span>
              </div>
            </div>
          )}

          <div className={isMTD ? "space-y-3" : "space-y-2"}>
            {topGroups.map((group, i) => {
              const valueColors = ["text-emerald-600", "text-blue-600", "text-blue-400"];
              const valueColor = valueColors[i] || "text-slate-500";
              const projValue = hasProj && elapsed > 0 ? Math.round((group.score / elapsed) * totalBizDays) : 0;
              return (
                <div key={i} className="flex items-center justify-between gap-2 py-0.5">
                  <span className={`flex items-start gap-1.5 ${isMTD ? "text-base" : "text-sm"} min-w-0 flex-1`}>
                    <span className={`${isMTD ? "text-xl" : "text-base"} leading-none shrink-0 mt-[1px]`}>{medals[i]}</span>
                    <span className={`text-slate-900 font-medium leading-tight ${isMTD ? "text-base" : "text-sm"} truncate mt-0.5`}>
                      {group.agents.map((m, idx) => (
                        <span key={m.agent_id}>
                          <Link href={`/reports/agent/${m.agent_id}`} className="hover:text-blue-600 transition-colors">
                            {m.agents?.name}
                          </Link>
                          {idx < group.agents.length - 1 ? <span className="text-slate-400">, </span> : ""}
                        </span>
                      ))}
                    </span>
                  </span>
                  {hasProj ? (
                    <div className="flex items-center gap-6 font-mono shrink-0">
                      <span className={`${isMTD ? "text-base" : "text-sm"} font-bold ${valueColor} w-12 text-right`}>
                        {group.score}
                      </span>
                      {(() => {
                        const goalVal = getAgentMonthlyItemsGoal(group.agents[0]);
                        const meetsGoal = projValue >= goalVal;
                        const projColor = meetsGoal 
                          ? "text-emerald-600 bg-emerald-50 border border-emerald-100" 
                          : "text-rose-600 bg-rose-50 border border-rose-100";
                        return (
                          <span className={`text-xs font-extrabold w-16 text-center rounded py-0.5 ${projColor} shadow-sm`}>
                            {projValue}
                          </span>
                        );
                      })()}
                    </div>
                  ) : (
                    <span className={`${isMTD ? "text-xl" : "text-base"} font-bold font-mono ${valueColor} shrink-0`}>
                      {format(group.score)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {agencyTotal !== undefined && (
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-700">
              <span className="flex items-center gap-1.5 text-slate-500">
                🏢 Agency Total
              </span>
              <div className="flex items-center gap-6 font-mono shrink-0">
                <span className="w-12 text-right text-slate-600">
                  {agencyTotal}
                </span>
                {hasProj && (() => {
                  const projValue = elapsed > 0 ? Math.round((agencyTotal / elapsed) * totalBizDays) : 0;
                  const meetsGoal = projValue >= 500;
                  const projColor = meetsGoal 
                    ? "text-emerald-600 bg-emerald-50 border border-emerald-100" 
                    : "text-rose-600 bg-rose-50 border border-rose-100";
                  return (
                    <span className={`text-[10px] font-extrabold w-16 text-center rounded py-0.5 ${projColor} shadow-sm`}>
                      {projValue}
                    </span>
                  );
                })()}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
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
  const [priorMetrics, setPriorMetrics] = useState<any[]>([])
  const [goals, setGoals] = useState<any[]>([])
  const [manualSubmitted, setManualSubmitted] = useState(false)
  const [filters, setFilters] = useState<FilterState>({ offices: [], teams: [], agents: [], meetings: [] })
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [holidays, setHolidays] = useState<{ holiday_date: string }[]>([])
  const [autoSums, setAutoSums] = useState<Record<string, any>>({})
  const [talkingPointsExpanded, setTalkingPointsExpanded] = useState(true)
  const [agencyItemsMTD, setAgencyItemsMTD] = useState(0)
  const [agencyOfficeBreakdown, setAgencyOfficeBreakdown] = useState<Record<string, number>>({})
  const [lastMonthItems, setLastMonthItems] = useState<number | undefined>(undefined)

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
    const prevWeekStart = getPreviousWeekStart(weekStart)
    const prevWeekEnd = getWeekEnd(prevWeekStart)
    const prevWeekStartStr = toDateStr(prevWeekStart)
    const prevWeekEndStr = toDateStr(prevWeekEnd)

    const [result, coverageResult, autoSumsResult, priorResult] = await Promise.all([
      getWeeklyData(weekStartStr, weekEndStr),
      getWeekCoverage(weekStartStr, weekEndStr),
      getWeeklyAutoSums(weekStartStr, weekEndStr),
      getWeeklyData(prevWeekStartStr, prevWeekEndStr),
    ])

    if (result.success && result.data) {
      setMetrics(result.data.metrics)
      setGoals(result.data.goals)
      setManualSubmitted(result.data.manualSubmitted)
      setHolidays(result.data.holidays || [])
      setAgencyItemsMTD(result.data.agencyItemsMTD || 0)
      setAgencyOfficeBreakdown(result.data.agencyOfficeBreakdown || {})
      setLastMonthItems(result.data.lastMonthItems)
    } else {
      setMetrics([])
    }

    if (priorResult.success && priorResult.data) {
      setPriorMetrics(priorResult.data.metrics || [])
    } else {
      setPriorMetrics([])
    }

    if (coverageResult.success && coverageResult.data) {
      setCoverage(coverageResult.data)
    }
    if (autoSumsResult.success && autoSumsResult.data) {
      setAutoSums(autoSumsResult.data)
    }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [weekStartStr, weekEndStr])

  // Calculate daily eAgent completeness
  const isEagentComplete = useMemo(() => {
    if (!coverage.length) return false
    const todayStr = new Date().toISOString().split("T")[0]
    const bizDays = coverage.filter((d: any) => {
      const dow = new Date(d.date + "T12:00:00").getDay()
      return dow >= 1 && dow <= 5 && d.date < todayStr
    })
    if (!bizDays.length) return false
    return bizDays.every((d: any) => d.sources.eagent)
  }, [coverage])

  const currentTotals = useMemo(() => {
    let premium = 0, items = 0, quotes = 0, outbound = 0, talk = 0
    metrics.forEach(m => {
      premium += Number(m.written_premium || 0)
      items += Number(m.items || 0)
      quotes += Number(m.quotes || 0)
      outbound += Number(m.outbound || 0)
      talk += Number(m.talk_time_seconds || 0)
    })
    return { premium, items, quotes, outbound, talk }
  }, [metrics])

  const priorTotals = useMemo(() => {
    let premium = 0, items = 0, quotes = 0, outbound = 0, talk = 0
    priorMetrics.forEach(m => {
      premium += Number(m.written_premium || 0)
      items += Number(m.items || 0)
      quotes += Number(m.quotes || 0)
      outbound += Number(m.outbound || 0)
      talk += Number(m.talk_time_seconds || 0)
    })
    return { premium, items, quotes, outbound, talk }
  }, [priorMetrics])

  // Count total missing file-based sources across past business days only
  const totalGaps = useMemo(() => {
    if (!coverage.length) return 0
    const todayStr = new Date().toISOString().split("T")[0]
    const FILE_SOURCES = ["calls", "texts", "quotes", "items", "premium"]
    let gaps = 0
    for (const day of coverage) {
      const dow = new Date(day.date + "T12:00:00").getDay()
      if (dow < 1 || dow > 5 || day.date >= todayStr) continue // skip weekends, today, future
      for (const key of FILE_SOURCES) {
        if (!day.sources[key]) gaps++
      }
    }
    return gaps
  }, [coverage])

  // Week-level completeness summary (business days = Mon–Fri, only past days)
  const weekSummary = useMemo(() => {
    if (!coverage.length) return { totalBizDays: 0, completeDays: 0, gapDays: 0, gapDayNames: [] as string[] }
    const todayStr = new Date().toISOString().split("T")[0]
    // Only check past business days (before today — today's data isn't finalized yet)
    const bizDays = coverage.filter((d: any) => {
      const dow = new Date(d.date + "T12:00:00").getDay()
      return dow >= 1 && dow <= 5 && d.date < todayStr // Mon–Fri, past only
    })
    // Check file-based sources only (eAgent is manual entry, not a data gap)
    const FILE_SOURCES = ["calls", "texts", "quotes", "items", "premium"] as const
    const complete = bizDays.filter((d: any) => FILE_SOURCES.every(k => d.sources[k]))
    const withGaps = bizDays.filter((d: any) => !FILE_SOURCES.every(k => d.sources[k]))
    return {
      totalBizDays: bizDays.length,
      completeDays: complete.length,
      gapDays: withGaps.length,
      gapDayNames: withGaps.map((d: any) => d.dayName as string),
    }
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

  const tableTotals = useMemo(() => {
    const totals = {
      inbound: 0,
      outbound: 0,
      calls: 0,
      talk_time_seconds: 0,
      texts: 0,
      unique_leads: 0,
      rico_hot_pipeline: 0,
      pivot: 0,
      saved: 0,
      quotes: 0,
      prem_premium: 0,
      premium_mtd: 0,
      prem_points: 0,
      prev_month_points: 0,
      items_mtd: 0,
      w_dismissed_todos: 0,
      w_past_due_todos: 0,
      rico_past_due_tasks: 0,
    };

    filteredMetrics.forEach(m => {
      totals.inbound += m.inbound || 0;
      totals.outbound += m.outbound || 0;
      totals.calls += m.calls || 0;
      totals.talk_time_seconds += m.talk_time_seconds || 0;
      totals.texts += m.texts || 0;
      totals.unique_leads += m.unique_leads || 0;
      totals.rico_hot_pipeline += m.rico_hot_pipeline || 0;
      totals.pivot += m.pivot || 0;
      totals.saved += m.saved || 0;
      totals.quotes += m.quotes || 0;
      totals.prem_premium += Number(m.prem_premium) || 0;
      totals.premium_mtd += Number(m.premium_mtd) || 0;
      totals.prem_points += m.prem_points || 0;
      totals.prev_month_points += m.prev_month_points || 0;
      totals.items_mtd += m.items_mtd || 0;
      totals.w_dismissed_todos += m.w_dismissed_todos || 0;
      totals.w_past_due_todos += m.w_past_due_todos || 0;
      totals.rico_past_due_tasks += m.rico_past_due_tasks || 0;
    });

    return totals;
  }, [filteredMetrics]);

  return (
    <PageGuard pageKey="weekly">
    <div className="p-4 md:p-6 max-w-[1800px] mx-auto space-y-4">
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

      {/* ── Week Completeness Summary Banner ── */}
      {!loading && coverage.length > 0 && (
        weekSummary.gapDays > 0 ? (
          <div className="flex items-center justify-between gap-4 p-3 bg-amber-50 border border-amber-200 rounded-lg shadow-sm">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-900">
                  ⚠️ {weekSummary.gapDays} of {weekSummary.totalBizDays} business day{weekSummary.totalBizDays !== 1 ? "s" : ""} ha{weekSummary.gapDays === 1 ? "s" : "ve"} gaps
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Days with missing data: {weekSummary.gapDayNames.join(", ")}. Open the coverage panel or upload files to resolve.
                </p>
              </div>
            </div>
            <Link
              href={`/admin/sync`}
              className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-md border border-amber-300 bg-white text-amber-700 hover:bg-amber-100 transition-colors shadow-sm shrink-0"
            >
              Upload missing files →
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-2.5 px-4 bg-emerald-50 border border-emerald-200 rounded-lg shadow-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span className="text-sm font-medium text-emerald-700">✅ Week Complete — All {weekSummary.totalBizDays} business days have full data coverage</span>
          </div>
        )
      )}

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

      {/* ── Dashboard Leaderboards Grid ── */}
      <div className="grid grid-cols-12 gap-4 mb-6">
        {/* Section Header: Month-to-Date (MTD) */}
        <div className="col-span-12 flex items-center gap-3">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Month-to-Date (MTD)</span>
          <div className="h-[1px] w-full bg-slate-200/60" />
        </div>

        {/* Row 1, Col 1-2 (Desktop): Items MTD */}
        <LeaderboardCard
          title="Allstate Auto Items MTD"
          icon={<Car className="w-3.5 h-3.5" />}
          data={metrics}
          accessor={(m) => m.items_mtd || 0}
          format={(v) => `${v} items`}
          colorClass="text-amber-400"
          className="col-span-12 md:col-span-6 lg:col-span-4 order-1 lg:order-none"
          holidays={holidays}
          year={weekEnd ? weekEnd.getFullYear() : undefined}
          month={weekEnd ? weekEnd.getMonth() + 1 : undefined}
          goals={goals}
          agencyTotal={agencyItemsMTD}
        />

        {/* Row 1 & 2, Col 3-12 (Desktop): Agency MTD Pacing */}
        <AgencyMTDPacing
          agencyItemsMTD={agencyItemsMTD}
          agencyOfficeBreakdown={agencyOfficeBreakdown}
          holidays={holidays}
          lastMonthItems={lastMonthItems}
          year={weekEnd ? weekEnd.getFullYear() : undefined}
          month={weekEnd ? weekEnd.getMonth() + 1 : undefined}
        />

        {/* Row 2, Col 1-2 (Desktop): Premium MTD */}
        <LeaderboardCard
          title="Total Premium MTD"
          icon={<Trophy className="w-3.5 h-3.5" />}
          data={metrics}
          accessor={(m) => m.premium_mtd || 0}
          format={(v) => `$${v.toLocaleString()}`}
          colorClass="text-emerald-600"
          className="col-span-12 md:col-span-6 lg:col-span-4 order-2 lg:order-none"
        />

        {/* Section Header: Weekly Leaders */}
        <div className="col-span-12 mt-4 -mb-2 flex items-center gap-3 order-4 lg:order-none">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Weekly Leaders</span>
          <div className="h-[1px] w-full bg-slate-200/60" />
        </div>

        {/* Row 3 (Desktop): Weekly Leaders */}
        {/* Top Premium (Week) — aligned exactly under Premium MTD */}
        <LeaderboardCard
          title="Top Premium (Week)"
          icon={<DollarSign className="w-3.5 h-3.5" />}
          data={metrics}
          accessor={(m) => m.prem_premium || 0}
          format={(v) => `$${v.toLocaleString()}`}
          colorClass="text-emerald-600"
          className="col-span-12 md:col-span-6 lg:col-span-2 order-5 lg:order-none"
        />

        {/* Top Items (Week) */}
        <LeaderboardCard
          title="Top Items (Week)"
          icon={<Car className="w-3.5 h-3.5" />}
          data={metrics}
          accessor={(m) => m.items || 0}
          format={(v) => `${v} items`}
          colorClass="text-amber-400"
          className="col-span-12 md:col-span-6 lg:col-span-2 order-6 lg:order-none"
        />

        {/* Top Talk Time (Week) */}
        <LeaderboardCard
          title="Top Talk Time (Week)"
          icon={<Clock className="w-3.5 h-3.5" />}
          data={metrics}
          accessor={(m) => m.talk_time_seconds || 0}
          format={(v) => formatTime(v)}
          colorClass="text-sky-400"
          className="col-span-12 md:col-span-6 lg:col-span-2 order-7 lg:order-none"
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
              totals={tableTotals}
              keyExtractor={(item) => item.agent_id}
              renderRow={(item) => {
                const bdr = (group: string) => GROUP_CELL_BORDER[group] || "";
                const manualHL = (!manualSubmitted && !item.isTotal) ? "orange" as const : undefined;
                return (
                  <>
                    <td className="py-[2px] px-1.5 text-[15px] whitespace-nowrap">
                      {item.isTotal ? (
                        <span className="font-extrabold text-slate-900">Total</span>
                      ) : (
                        <Link href={`/reports/agent/${item.agent_id}`} className="font-bold text-blue-400 hover:underline">
                          {item.agents?.name}
                        </Link>
                      )}
                    </td>
                    <td className="py-[2px] px-1.5 text-[15px] text-slate-400">{item.isTotal ? "" : (item.agents?.office || "-")}</td>
                    <td className="py-[2px] px-1.5 text-[15px] text-slate-400">
                      {item.isTotal ? "" : (item.agents?.team ? <Badge variant="outline" className="text-[11px] py-0">{item.agents.team}</Badge> : '-')}
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
                    <td className={`py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900 ${bdr("eagent")}`}>{formatValue(item.pivot)}</td>
                    <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{formatValue(item.saved, "", "", null, manualHL)}</td>

                    {/* Production */}
                    <td className={`py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900 ${bdr("production")}`}>{formatValue(item.quotes)}</td>
                    <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{formatValue(item.prem_premium, "$")}</td>
                    <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{formatValue(item.premium_mtd, "$", "", null, "gold")}</td>
                    <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{formatValue(item.prem_points)}</td>
                    <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{formatValue(item.prev_month_points)}</td>
                    <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{formatValue(item.items_mtd, "", "", null, "gold")}</td>

                    {/* Past Due / Dismissed (manual) */}
                    <td className={`py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900 ${bdr("eagent")}`}>{formatValue(item.w_dismissed_todos)}</td>
                    <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{formatValue(item.w_past_due_todos, "", "", null, manualHL)}</td>
                    
                    <td className={`py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900 ${bdr("leads")}`}>{formatValue(item.rico_past_due_tasks, "", "", null, manualHL)}</td>
                  </>
                );
              }}
            />
          )}
        </CardContent>
      </Card>

      {/* ── Insights: Talking Points ──────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 mt-6">
        <Card className="bg-white border border-slate-200 shadow-sm">
          <CardHeader 
            onClick={() => setTalkingPointsExpanded(!talkingPointsExpanded)}
            className="pb-2 flex flex-row items-center justify-between space-y-0 cursor-pointer select-none hover:bg-slate-50/50 transition-colors rounded-t-xl"
          >
            <CardTitle className="flex items-center gap-2 text-sm">
              <Megaphone className="w-4 h-4 text-blue-500" />
              <span className="text-slate-700 font-bold">Weekly Talking Points</span>
              <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-200">Auto-generated</Badge>
            </CardTitle>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${talkingPointsExpanded ? "rotate-180" : ""}`} />
          </CardHeader>
          {talkingPointsExpanded && (
            <CardContent className="pt-0">
              {(() => {
                const data = filteredMetrics;
                if (data.length === 0) return <p className="text-sm text-slate-400 italic">No data available.</p>;

                const points: { icon: React.ReactNode; text: string; color: string; isPositive: boolean }[] = [];

                // Top caller
                const topCaller = [...data].sort((a, b) => (b.outbound || 0) - (a.outbound || 0))[0];
                if (topCaller?.outbound > 0) {
                  points.push({
                    icon: <Phone className="w-3.5 h-3.5" />,
                    text: `${topCaller.agents?.name} led outbound calls with ${topCaller.outbound.toLocaleString()} this week`,
                    color: "text-sky-600",
                    isPositive: true
                  });
                }

                // Top premium
                const topPrem = [...data].sort((a, b) => (Number(b.prem_premium) || 0) - (Number(a.prem_premium) || 0))[0];
                if (Number(topPrem?.prem_premium) > 0) {
                  points.push({
                    icon: <DollarSign className="w-3.5 h-3.5" />,
                    text: `${topPrem.agents?.name} wrote $${Number(topPrem.prem_premium).toLocaleString()} in premium this week`,
                    color: "text-emerald-600",
                    isPositive: true
                  });
                }

                // Auto item leader for the week
                const topItem = [...data].sort((a, b) => (b.items || 0) - (a.items || 0))[0];
                if (topItem?.items > 0) {
                  const ties = data.filter(m => (m.items || 0) === topItem.items);
                  const names = ties.map(m => m.agents?.name).join(" & ");
                  points.push({
                    icon: <Package className="w-3.5 h-3.5" />,
                    text: `${names} led auto items with ${topItem.items} item${topItem.items !== 1 ? "s" : ""} this week`,
                    color: "text-amber-600",
                    isPositive: true
                  });
                }

                // Total items written
                const totalItems = data.reduce((sum, m) => sum + (m.items || 0), 0);
                if (totalItems > 0) {
                  points.push({
                    icon: <Package className="w-3.5 h-3.5" />,
                    text: `Agency wrote ${totalItems} item${totalItems !== 1 ? "s" : ""} in total this week`,
                    color: "text-violet-600",
                    isPositive: true
                  });
                }

                // Top texter
                const topTexter = [...data].sort((a, b) => (b.texts || 0) - (a.texts || 0))[0];
                if (topTexter?.texts > 20) {
                  points.push({
                    icon: <MessageSquare className="w-3.5 h-3.5" />,
                    text: `${topTexter.agents?.name} sent ${topTexter.texts.toLocaleString()} texts this week`,
                    color: "text-teal-600",
                    isPositive: true
                  });
                }

                // Agents with Quotes Goal (e.g. 15+)
                const quotesHitters = data.filter(m => (m.quotes || 0) >= 15);
                if (quotesHitters.length > 0) {
                  points.push({
                    icon: <FileText className="w-3.5 h-3.5" />,
                    text: `${quotesHitters.length} agent${quotesHitters.length > 1 ? "s" : ""} hit the weekly quotes goal (15+)`,
                    color: "text-rose-600",
                    isPositive: true
                  });
                }

                // Agents with 0 calls (Negative)
                const zeroCalls = data.filter(m => !m.outbound || m.outbound === 0).length;
                if (zeroCalls > 0 && zeroCalls < data.length) {
                  points.push({
                    icon: <AlertCircle className="w-3.5 h-3.5" />,
                    text: `${zeroCalls} agent${zeroCalls > 1 ? "s" : ""} had zero outbound calls this week`,
                    color: "text-amber-600",
                    isPositive: false
                  });
                }

                // Agents with no premium (Negative)
                const noPremiumAgents = data.filter(m => !m.prem_premium || Number(m.prem_premium) === 0);
                if (noPremiumAgents.length > 0 && noPremiumAgents.length < data.length) {
                  const names = noPremiumAgents.map(m => m.agents?.name).join(", ");
                  points.push({
                    icon: <AlertCircle className="w-3.5 h-3.5" />,
                    text: `${noPremiumAgents.length === 1 ? "Agent" : "Agents"} with no premium this week: ${names}`,
                    color: "text-rose-600",
                    isPositive: false
                  });
                }

                if (points.length === 0) return <p className="text-sm text-slate-400 italic">Not enough data for insights.</p>;

                // Sort positive points before negative points
                const sortedPoints = [...points].sort((a, b) => {
                  if (a.isPositive === b.isPositive) return 0;
                  return a.isPositive ? -1 : 1;
                });

                return (
                  <ul className="space-y-2">
                    {sortedPoints.map((p, i) => (
                      <li key={i} className={`flex items-start gap-2.5 text-sm ${p.color}`}>
                        <span className="mt-0.5 shrink-0">{p.icon}</span>
                        <span className="text-slate-700">{p.text}</span>
                      </li>
                    ))}
                  </ul>
                );
              })()}
            </CardContent>
          )}
        </Card>
      </div>

      {/* ── Week-over-Week Comparison (WoW) ── */}
      {metrics.length > 0 && priorMetrics.length > 0 && (
        <Card className="no-print border border-slate-200 shadow-sm mt-6 bg-white overflow-hidden">
          <CardHeader className="pb-2 border-b border-slate-100">
            <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-500" /> Week-over-Week Performance Comparison
            </CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">Comparison vs the prior week ({formatWeekRange(getPreviousWeekStart(weekStart))})</p>
          </CardHeader>
          <CardContent className="pt-4 pb-5">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { 
                  label: "Written Premium", 
                  current: currentTotals.premium, 
                  prior: priorTotals.premium, 
                  format: (v: number) => `$${Math.round(v).toLocaleString()}`,
                  color: "text-emerald-600"
                },
                { 
                  label: "Auto Items Written", 
                  current: currentTotals.items, 
                  prior: priorTotals.items, 
                  format: (v: number) => v.toLocaleString(),
                  color: "text-blue-600"
                },
                { 
                  label: "Quotes Provided", 
                  current: currentTotals.quotes, 
                  prior: priorTotals.quotes, 
                  format: (v: number) => v.toLocaleString(),
                  color: "text-amber-600"
                },
                { 
                  label: "Outbound Calls", 
                  current: currentTotals.outbound, 
                  prior: priorTotals.outbound, 
                  format: (v: number) => v.toLocaleString(),
                  color: "text-sky-600"
                },
                { 
                  label: "Talk Time", 
                  current: currentTotals.talk, 
                  prior: priorTotals.talk, 
                  format: (v: number) => formatTime(v),
                  color: "text-violet-600"
                }
              ].map((m, i) => {
                const delta = m.prior > 0 ? ((m.current - m.prior) / m.prior) * 100 : 0
                const isPositive = delta >= 0
                const deltaColor = isPositive ? "text-emerald-600 bg-emerald-50 border-emerald-100" : "text-rose-600 bg-rose-50 border-rose-100"
                return (
                  <div key={i} className="flex flex-col border border-slate-100 rounded-xl p-3 bg-slate-50/50 shadow-sm">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{m.label}</span>
                    <span className={`text-lg font-extrabold mt-1 ${m.color}`}>{m.format(m.current)}</span>
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100/60">
                      <span className="text-[10px] text-slate-400 font-medium">Prior: {m.format(m.prior)}</span>
                      {m.prior > 0 && (
                        <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded border shrink-0 ${deltaColor}`}>
                          {isPositive ? "↑" : "↓"}{Math.abs(delta).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <WeeklyManualModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        weekStartStr={weekStartStr}
        weekLabel={formatWeekRange(weekStart)}
        agents={metrics}
        onSuccess={fetchData}
        autoSums={autoSums}
        manualSubmitted={manualSubmitted}
        eagentComplete={isEagentComplete}
      />
    </div>
    </PageGuard>
  )
}
