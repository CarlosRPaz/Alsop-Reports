"use client"

import { PageGuard } from "@/components/layout/PageGuard";
import { useEffect, useState, useMemo } from "react"
import { getDailyData, getDailyCoverage, getDailyInsights } from "./actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { DataTable, ColumnDef } from "@/components/ui/DataTable"
import { FilterBar, FilterState } from "@/components/ui/FilterBar"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Trophy, TrendingUp, Calendar, AlertCircle, Edit, CheckCircle2, Clock, DollarSign, Package, Car, RefreshCw, Loader2, MessageSquare, Phone, FileText, ShieldCheck, Zap, ChevronDown, ChevronLeft, ChevronRight, Flame, Lightbulb, Megaphone } from "lucide-react"
import Link from "next/link"
import { formatValue } from "@/lib/formatters"
import { EAgentModal } from "@/components/reports/EAgentModal"
import { LeadsModal } from "@/components/reports/LeadsModal"
import AgencyMTDPacing from "@/components/ui/AgencyMTDPacing"
import { runDataSyncPipeline } from "@/app/admin/sync/actions"
import { toHolidaySet, getBusinessDaysInMonth, getElapsedBusinessDays } from "@/lib/businessDays"

function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

function formatHeaderDate(dateStr: string) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split('-');
  const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[dateObj.getDay()]}, ${Number(m)}/${Number(d)}/${y.slice(2)}`;
}

// ── Column definitions matching Excel ordering with color groups ──
const COLUMNS: ColumnDef[] = [
  // Agent Info
  { key: "agent",  label: "Agent",  group: "agent", sortAccessor: (m: any) => m.agents?.name || "" },
  { key: "office", label: "Office", group: "agent", sortAccessor: (m: any) => m.agents?.office || "" },
  { key: "team",   label: "Team",   group: "agent", sortAccessor: (m: any) => m.agents?.team || "" },
  // RC / Ricochet
  { key: "calls",     label: "Calls",     group: "calls", sortAccessor: (m: any) => m.calls || 0 },
  { key: "inbound",   label: "Inbound",   group: "calls", sortAccessor: (m: any) => m.inbound || 0 },
  { key: "outbound",  label: "Outbound",  group: "calls", sortAccessor: (m: any) => m.outbound || 0 },
  { key: "talktime",  label: "Talk Time", group: "calls", sortAccessor: (m: any) => m.talk_time_seconds || 0 },
  // Hearsay
  { key: "texts",    label: "Texts",     group: "texts", sortAccessor: (m: any) => m.texts || 0 },
  { key: "outtexts", label: "Out Texts", group: "texts", sortAccessor: (m: any) => m.out_texts || 0 },
  { key: "optins",   label: "Opt-Ins",   group: "texts", sortAccessor: (m: any) => m.opt_ins || 0 },
  { key: "optouts",  label: "Opt-Outs",  group: "texts", sortAccessor: (m: any) => m.opt_outs || 0 },
  // Production (Gold)
  { key: "quotes",   label: "Quotes",      group: "production", sortAccessor: (m: any) => m.quotes || 0 },
  { key: "nb",       label: "NB",          group: "production", sortAccessor: (m: any) => m.nb_count || 0 },
  { key: "premium",  label: "Premium",     group: "production", sortAccessor: (m: any) => Number(m.prem_premium) || 0 },
  { key: "items",    label: "Items",       group: "production", sortAccessor: (m: any) => m.items || 0 },
  { key: "itemsmtd", label: "Items MTD",   group: "production", sortAccessor: (m: any) => m.items_mtd || 0 },
  // Leads Pipeline (Red/Orange)
  { key: "contact", label: "Contact",    group: "leads", sortAccessor: (m: any) => m.leads_snapshot?.contact || 0 },
  { key: "quoted",  label: "Quoted",     group: "leads", sortAccessor: (m: any) => m.leads_snapshot?.quoted || 0 },
  { key: "hot",     label: "Hot",        group: "leads", sortAccessor: (m: any) => m.leads_snapshot?.hot || 0 },
  { key: "xdate",   label: "X-Date",    group: "leads", sortAccessor: (m: any) => m.leads_snapshot?.xsale || 0 },
  // eAgent/RICO
  { key: "dismissed", label: "Dismissed",  group: "eagent", sortAccessor: (m: any) => m.dismissed_todos || 0 },
  { key: "pastdue",   label: "Past Due",   group: "eagent", sortAccessor: (m: any) => m.past_due_todos || 0 },
  { key: "pivots",    label: "Pivots",     group: "eagent", sortAccessor: (m: any) => m.pivots || 0 },
]

// ── Helpers ──
function formatTime(seconds: number) {
  if (!seconds) return "0:00"
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}:${m.toString().padStart(2, '0')}`
}

function getTop3Ties(data: any[], accessor: (m: any) => number) {
  const valid = data.filter(m => accessor(m) > 0);
  if (valid.length === 0) return [];

  const scoreMap = new Map<number, any[]>();
  valid.forEach(m => {
    const score = accessor(m);
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

// ── Leaderboard Card ──
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
              {isMTD ? "MTD" : "Daily"}
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

// ── Group border colors for table cells ──
const GROUP_CELL_BORDER: Record<string, string> = {
  calls:      "border-l-2 border-l-sky-700/40",
  texts:      "border-l-2 border-l-teal-700/40",
  production: "border-l-2 border-l-amber-600/40",
  leads:      "border-l-2 border-l-rose-600/40",
  eagent:     "border-l-2 border-l-violet-600/40",
}

// ── Main Component ──
export default function DailyReport() {
  const [date, setDate] = useState<string>(getYesterday())
  const [metrics, setMetrics] = useState<any[]>([])
  const [goals, setGoals] = useState<any[]>([])
  const [eagentSubmitted, setEagentSubmitted] = useState(false)
  const [filters, setFilters] = useState<FilterState>({ offices: [], teams: [], agents: [], meetings: [] })
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isLeadsModalOpen, setIsLeadsModalOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<"idle" | "success" | "error">("idle")
  const [holidays, setHolidays] = useState<{ holiday_date: string }[]>([])
  const [agencyItemsMTD, setAgencyItemsMTD] = useState(0)
  const [agencyOfficeBreakdown, setAgencyOfficeBreakdown] = useState<Record<string, number>>({})
  const [coverage, setCoverage] = useState<Record<string, { present: boolean; agentCount: number }> | null>(null)
  const [coverageLoading, setCoverageLoading] = useState(true)
  const [coverageExpanded, setCoverageExpanded] = useState<boolean | null>(null)
  const [streaks, setStreaks] = useState<any[]>([])
  const [talkingPointsExpanded, setTalkingPointsExpanded] = useState(true)
  const [streaksExpanded, setStreaksExpanded] = useState(true)

  // Derive which specific sources are missing from the coverage state
  const SOURCE_LABELS: Record<string, string> = {
    calls: "Calls", texts: "Texts", quotes: "Quotes",
    items: "Items", premium: "Premium", eagent: "eAgent", leads: "Leads",
  }
  const missingSources = useMemo(() => {
    if (!coverage) return []
    return Object.entries(coverage)
      .filter(([_, v]) => !v.present)
      .map(([key]) => key)
  }, [coverage])

  const hasMissingSources = missingSources.length > 0
  const allSourcesPresent = useMemo(() => {
    if (!coverage) return false
    return Object.values(coverage).every(s => s.present)
  }, [coverage])

  const handleSync = async () => {
    setSyncing(true)
    setSyncResult("idle")
    try {
      const result = await runDataSyncPipeline(date)
      setSyncResult(result.success ? "success" : "error")
      if (result.success) {
        // Refresh data after successful sync
        await fetchData(date)
      }
    } catch {
      setSyncResult("error")
    } finally {
      setSyncing(false)
    }
  }

  const fetchData = async (selectedDate: string) => {
    setLoading(true)
    const result = await getDailyData(selectedDate)
    if (result.success && result.data) {
      setMetrics(result.data.metrics)
      setGoals(result.data.goals)
      setEagentSubmitted(result.data.eagentSubmitted)
      setHolidays(result.data.holidays || [])
      setAgencyItemsMTD(result.data.agencyItemsMTD || 0)
      setAgencyOfficeBreakdown(result.data.agencyOfficeBreakdown || {})
    } else {
      console.error(result.error)
      setMetrics([])
    }
    setLoading(false)
  }

  useEffect(() => { fetchData(date) }, [date])

  // Fetch streak/insights data when date changes
  useEffect(() => {
    const fetchInsights = async () => {
      const result = await getDailyInsights(date)
      if (result.success && result.data) {
        setStreaks(result.data.streaks || [])
      }
    }
    fetchInsights()
  }, [date])

  // Fetch coverage data when date changes
  useEffect(() => {
    let cancelled = false
    const fetchCoverage = async () => {
      setCoverageLoading(true)
      const result = await getDailyCoverage(date)
      if (!cancelled && result.success && result.data) {
        setCoverage(result.data)
        // Auto-expand if any source is missing, auto-collapse if all present
        const hasGaps = Object.values(result.data).some(s => !s.present)
        setCoverageExpanded(hasGaps)
      }
      if (!cancelled) setCoverageLoading(false)
    }
    fetchCoverage()
    return () => { cancelled = true }
  }, [date])

  const availableMeetings = useMemo(() => {
    const times = metrics
      .map(m => m.agents?.meeting_time)
      .filter(Boolean)
      .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i)
      .sort();
    return times;
  }, [metrics]);

  const availableAgents = useMemo(() => {
    return metrics
      .map(m => m.agents).filter(Boolean)
      .filter(a => {
        const matchOffice = filters.offices.length === 0 || filters.offices.includes(a.office);
        const matchTeam = filters.teams.length === 0 || filters.teams.includes(a.team);
        const matchMeeting = filters.meetings.length === 0 || filters.meetings.includes(a.meeting_time);
        return matchOffice && matchTeam && matchMeeting;
      })
      .map(a => a.name)
      .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i)
      .sort();
  }, [metrics, filters]);

  const filteredMetrics = useMemo(() => {
    return metrics.filter(m => {
      const agent = m.agents || {};
      const matchOffice = filters.offices.length === 0 || filters.offices.includes(agent.office);
      const matchTeam = filters.teams.length === 0 || filters.teams.includes(agent.team);
      const matchAgent = filters.agents.length === 0 || filters.agents.includes(agent.name);
      const matchMeeting = filters.meetings.length === 0 || filters.meetings.includes(agent.meeting_time);
      return matchOffice && matchTeam && matchAgent && matchMeeting;
    });
  }, [metrics, filters]);

  const tableTotals = useMemo(() => {
    const totals = {
      calls: 0,
      inbound: 0,
      outbound: 0,
      talk_time_seconds: 0,
      texts: 0,
      out_texts: 0,
      opt_ins: 0,
      opt_outs: 0,
      quotes: 0,
      nb_count: 0,
      prem_premium: 0,
      items: 0,
      items_mtd: 0,
      leads_snapshot: {
        contact: 0,
        quoted: 0,
        hot: 0,
        xsale: 0,
      },
      dismissed_todos: 0,
      past_due_todos: 0,
      pivots: 0,
    };

    filteredMetrics.forEach(m => {
      totals.calls += m.calls || 0;
      totals.inbound += m.inbound || 0;
      totals.outbound += m.outbound || 0;
      totals.talk_time_seconds += m.talk_time_seconds || 0;
      totals.texts += m.texts || 0;
      totals.out_texts += m.out_texts || 0;
      totals.opt_ins += m.opt_ins || 0;
      totals.opt_outs += m.opt_outs || 0;
      totals.quotes += m.quotes || 0;
      totals.nb_count += m.nb_count || 0;
      totals.prem_premium += Number(m.prem_premium) || 0;
      totals.items += m.items || 0;
      totals.items_mtd += m.items_mtd || 0;

      if (m.leads_snapshot) {
        totals.leads_snapshot.contact += m.leads_snapshot.contact || 0;
        totals.leads_snapshot.quoted += m.leads_snapshot.quoted || 0;
        totals.leads_snapshot.hot += m.leads_snapshot.hot || 0;
        totals.leads_snapshot.xsale += m.leads_snapshot.xsale || 0;
      }
      totals.dismissed_todos += m.dismissed_todos || 0;
      totals.past_due_todos += m.past_due_todos || 0;
      totals.pivots += m.pivots || 0;
    });

    return totals;
  }, [filteredMetrics]);

  const handlePrevDay = () => {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() - 1);
    setDate(d.toISOString().split("T")[0]);
  };

  const handleNextDay = () => {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() + 1);
    setDate(d.toISOString().split("T")[0]);
  };



  return (
    <PageGuard pageKey="daily">
    <div className="p-4 md:p-6 max-w-[1800px] mx-auto space-y-4">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">Daily Standup</h1>
          <p className="text-slate-500">Comprehensive daily breakdown of agent activities.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-white border border-slate-200 shadow-sm rounded-md overflow-hidden">
            <button 
              onClick={handlePrevDay} 
              className="p-2.5 hover:bg-slate-50 border-r border-slate-100 text-slate-500 hover:text-slate-900 transition-colors flex items-center justify-center"
              title="Previous Day"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 px-3 py-2">
              <Calendar className="w-4 h-4 text-slate-500" />
              <input 
                type="date" 
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-transparent text-sm text-slate-700 border-none outline-none focus:ring-0 p-0"
              />
            </div>
            <button 
              onClick={handleNextDay} 
              className="p-2.5 hover:bg-slate-50 border-l border-slate-100 text-slate-500 hover:text-slate-900 transition-colors flex items-center justify-center"
              title="Next Day"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {!eagentSubmitted ? (
            <Button 
              onClick={() => setIsModalOpen(true)}
              className="bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-2 animate-pulse"
            >
              <AlertCircle className="w-4 h-4" /> Enter eAgent Data
            </Button>
          ) : (
            <Button 
              onClick={() => setIsModalOpen(true)}
              variant="outline"
              className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> eAgent Submitted
              <Edit className="w-3 h-3 ml-1" />
            </Button>
          )}

          {/* Lead Pipeline Manual Entry */}
          {coverage && !coverage.leads?.present ? (
            <Button 
              onClick={() => setIsLeadsModalOpen(true)}
              className="bg-orange-600 hover:bg-orange-500 text-white flex items-center gap-2 animate-pulse"
            >
              <Zap className="w-4 h-4" /> Enter Lead Data
            </Button>
          ) : coverage ? (
            <Button 
              onClick={() => setIsLeadsModalOpen(true)}
              variant="outline"
              className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Leads Entered
              <Edit className="w-3 h-3 ml-1" />
            </Button>
          ) : null}
        </div>
      </header>

      {/* ── Completeness Banner ── */}
      {!loading && !coverageLoading && coverage && (
        hasMissingSources ? (
          <div className="flex items-center justify-between gap-4 p-4 bg-amber-50 border border-amber-200 rounded-lg shadow-sm">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-900">
                  ⚠️ Data Incomplete for {formatHeaderDate(date)} — Missing: {missingSources.map(k => SOURCE_LABELS[k] || k).join(", ")}
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  {missingSources.length} of {Object.keys(coverage).length} data sources have not been synced for this date.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {syncResult === "success" && (
                <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Synced
                </span>
              )}
              {syncResult === "error" && (
                <span className="text-xs text-red-600 font-medium">Failed — check Admin &gt; Sync</span>
              )}
              <Link
                href={`/admin/sync?date=${date}`}
                className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-md border border-amber-300 bg-white text-amber-700 hover:bg-amber-100 transition-colors shadow-sm"
              >
                Upload Files →
              </Link>
              <Button 
                onClick={handleSync} 
                disabled={syncing}
                className="bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-2 text-sm px-4 py-2"
              >
                {syncing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Syncing...</>
                ) : (
                  <><RefreshCw className="w-4 h-4" /> Sync Now</>
                )}
              </Button>
            </div>
          </div>
        ) : allSourcesPresent ? (
          <div className="flex items-center gap-2 p-2.5 px-4 bg-emerald-50 border border-emerald-200 rounded-lg shadow-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span className="text-sm font-medium text-emerald-700">✅ All data sources present for {formatHeaderDate(date)}</span>
          </div>
        ) : null
      )}

      {/* ── Data Source Coverage Strip ── */}
      {!loading && (() => {
        const sources = [
          { key: "calls",   label: "Calls",   icon: Phone,       color: "sky" },
          { key: "texts",   label: "Texts",   icon: MessageSquare, color: "purple" },
          { key: "quotes",  label: "Quotes",  icon: FileText,    color: "amber" },
          { key: "items",   label: "Items",   icon: Package,     color: "violet" },
          { key: "premium", label: "Premium", icon: DollarSign,  color: "emerald" },
          { key: "eagent",  label: "eAgent",  icon: ShieldCheck, color: "rose" },
          { key: "leads",   label: "Leads",   icon: Zap,         color: "orange" },
        ] as const

        const hasGaps = coverage ? Object.values(coverage).some(s => !s.present) : false
        const allPresent = coverage ? Object.values(coverage).every(s => s.present) : false
        if (allPresent) return null
        const isExpanded = coverageExpanded ?? hasGaps

        const chipBg: Record<string, string> = {
          sky: "bg-sky-50 border-sky-200 text-sky-700",
          purple: "bg-purple-50 border-purple-200 text-purple-700",
          amber: "bg-amber-50 border-amber-200 text-amber-700",
          violet: "bg-violet-50 border-violet-200 text-violet-700",
          emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
          rose: "bg-rose-50 border-rose-200 text-rose-700",
          orange: "bg-orange-50 border-orange-200 text-orange-700",
        }
        const chipMissing: Record<string, string> = {
          sky: "bg-sky-50/50 border-sky-200/50 text-sky-400",
          purple: "bg-purple-50/50 border-purple-200/50 text-purple-400",
          amber: "bg-amber-50/50 border-amber-200/50 text-amber-400",
          violet: "bg-violet-50/50 border-violet-200/50 text-violet-400",
          emerald: "bg-emerald-50/50 border-emerald-200/50 text-emerald-400",
          rose: "bg-rose-50/50 border-rose-200/50 text-rose-400",
          orange: "bg-orange-50/50 border-orange-200/50 text-orange-400",
        }

        return (
          <div className={`rounded-lg border shadow-sm transition-colors duration-300 ${
            allPresent 
              ? "bg-emerald-50/50 border-emerald-200" 
              : hasGaps 
              ? "bg-amber-50/50 border-amber-200" 
              : "bg-white border-slate-200"
          }`}>
            <button
              onClick={() => setCoverageExpanded(!isExpanded)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-left cursor-pointer select-none hover:bg-slate-50/50 transition-colors rounded-t-lg"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Data Sources</span>
                {coverageLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
                ) : allPresent ? (
                  <span className="text-xs font-medium text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> All data present
                  </span>
                ) : hasGaps ? (
                  <span className="text-xs font-medium text-amber-600">
                    {Object.values(coverage!).filter(s => !s.present).length} source{Object.values(coverage!).filter(s => !s.present).length > 1 ? "s" : ""} missing
                  </span>
                ) : null}
              </div>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
            </button>
            {isExpanded && (
              <div className="px-4 pb-3 flex flex-wrap items-center gap-2">
                {sources.map(({ key, label, icon: Icon, color }) => {
                  const source = coverage?.[key]
                  const isPresent = source?.present ?? false
                  const count = source?.agentCount ?? 0
                  return (
                    <div
                      key={key}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-all duration-200 ${
                        isPresent ? chipBg[color] : `${chipMissing[color]} animate-pulse`
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{label}</span>
                      {isPresent ? (
                        <span className="flex items-center gap-0.5">
                          <span className="text-emerald-500">✓</span>
                          <span className="font-mono text-[11px]">{count}</span>
                        </span>
                      ) : (
                        <span className="text-red-400">✗</span>
                      )}
                    </div>
                  )
                })}
                {hasGaps && (
                  <Link
                    href={`/admin/sync?date=${date}`}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-md bg-amber-100 border border-amber-300 text-amber-700 text-xs font-semibold hover:bg-amber-200 transition-colors"
                  >
                    Upload missing →
                  </Link>
                )}
              </div>
            )}
          </div>
        )
      })()}

      <FilterBar 
        onFilterChange={setFilters} 
        availableAgents={availableAgents} 
        availableMeetings={availableMeetings} 
      />

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
          year={date ? Number(date.split('-')[0]) : undefined}
          month={date ? Number(date.split('-')[1]) : undefined}
          goals={goals}
          agencyTotal={agencyItemsMTD}
        />

        {/* Row 1 & 2, Col 3-12 (Desktop): Agency MTD Pacing */}
        <AgencyMTDPacing
          agencyItemsMTD={agencyItemsMTD}
          agencyOfficeBreakdown={agencyOfficeBreakdown}
          holidays={holidays}
          year={date ? Number(date.split('-')[0]) : undefined}
          month={date ? Number(date.split('-')[1]) : undefined}
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

        {/* Section Header: Daily Leaders */}
        <div className="col-span-12 mt-4 -mb-2 flex items-center gap-3 order-4 lg:order-none">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Daily Leaders</span>
          <div className="h-[1px] w-full bg-slate-200/60" />
        </div>

        {/* Row 3 (Desktop): Daily Leaders */}
        {/* Top Total Premium (Daily) — aligned exactly under Premium MTD */}
        <LeaderboardCard
          title="Top Total Premium (Daily)"
          icon={<DollarSign className="w-3.5 h-3.5" />}
          data={metrics}
          accessor={(m) => Number(m.prem_premium) || 0}
          format={(v) => `$${v.toLocaleString()}`}
          colorClass="text-emerald-600"
          className="col-span-12 md:col-span-6 lg:col-span-2 order-5 lg:order-none"
        />

        {/* Top Items (Issued) */}
        <LeaderboardCard
          title="Top Items (Issued)"
          icon={<Car className="w-3.5 h-3.5" />}
          data={metrics}
          accessor={(m) => m.items || 0}
          format={(v) => `${v} items`}
          colorClass="text-amber-400"
          className="col-span-12 md:col-span-6 lg:col-span-2 order-6 lg:order-none"
        />

        {/* Top Talk Time (Daily) */}
        <LeaderboardCard
          title="Top Talk Time (Daily)"
          icon={<Clock className="w-3.5 h-3.5" />}
          data={metrics}
          accessor={(m) => m.talk_time_seconds || 0}
          format={(v) => formatTime(v)}
          colorClass="text-sky-400"
          className="col-span-12 md:col-span-6 lg:col-span-2 order-7 lg:order-none"
        />

        {/* Top Texts (Daily) */}
        <LeaderboardCard
          title="Top Texts (Daily)"
          icon={<MessageSquare className="w-3.5 h-3.5" />}
          data={metrics}
          accessor={(m) => m.texts || 0}
          format={(v) => `${v.toLocaleString()}`}
          colorClass="text-fuchsia-400"
          className="col-span-12 md:col-span-6 lg:col-span-2 order-8 lg:order-none"
        />
      </div>

      {/* ── Main Data Table ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Daily Standup Report — {formatHeaderDate(date)}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="h-32 flex justify-center items-center"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div></div>
          ) : (
            <DataTable 
              columns={COLUMNS}
              data={filteredMetrics}
              totals={tableTotals}
              keyExtractor={(item) => item.id || item.agent_id}
              renderRow={(item) => {
                // Goal resolution: most specific match wins
                // Priority: team+office > team > office > default (no team, no office)
                const getGoal = (metric: string) => {
                  if (item.isTotal) return null;
                  const matching = goals.filter((g: any) => 
                    g.metric_name === metric && g.timeframe === "daily"
                  );
                  if (!matching.length) return null;

                  const agentOffice = item.agents?.office;
                  const agentTeam = item.agents?.team;

                  // 1. Team + Office match (most specific)
                  const teamAndOffice = matching.find((g: any) => g.team === agentTeam && g.office === agentOffice);
                  if (teamAndOffice) return teamAndOffice;

                  // 2. Team match only
                  const teamOnly = matching.find((g: any) => g.team === agentTeam && !g.office);
                  if (teamOnly) return teamOnly;

                  // 3. Office match only
                  const officeOnly = matching.find((g: any) => g.office === agentOffice && !g.team);
                  if (officeOnly) return officeOnly;

                  // 4. Default (agency-wide)
                  return matching.find((g: any) => !g.office && !g.team) || null;
                };

                // Monthly goal resolution (same priority logic, different timeframe)
                const getMonthlyGoal = (metric: string) => {
                  if (item.isTotal) return null;
                  const matching = goals.filter((g: any) => 
                    g.metric_name === metric && g.timeframe === "monthly"
                  );
                  if (!matching.length) return null;

                  const agentOffice = item.agents?.office;
                  const agentTeam = item.agents?.team;

                  const teamAndOffice = matching.find((g: any) => g.team === agentTeam && g.office === agentOffice);
                  if (teamAndOffice) return teamAndOffice;
                  const teamOnly = matching.find((g: any) => g.team === agentTeam && !g.office);
                  if (teamOnly) return teamOnly;
                  const officeOnly = matching.find((g: any) => g.office === agentOffice && !g.team);
                  if (officeOnly) return officeOnly;
                  return matching.find((g: any) => !g.office && !g.team) || null;
                };

                // Determine if column is the first of its group for border
                const bdr = (group: string) => GROUP_CELL_BORDER[group] || "";

                return (
                  <>
                    {/* ── Agent Info ── */}
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

                    {/* ── RingCentral (Sky) ── */}
                    <td className={`py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900 ${bdr("calls")}`}>{formatValue(item.calls, "", "", getGoal("calls"))}</td>
                    <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{formatValue(item.inbound, "", "", getGoal("inbound"))}</td>
                    <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{formatValue(item.outbound, "", "", getGoal("outbound"))}</td>
                    <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{(() => {
                      const talkGoal = getGoal("talk_time_seconds");
                      const minutes = item.talk_time_seconds ? Math.floor(item.talk_time_seconds / 60) : 0;
                      const display = formatTime(item.talk_time_seconds);
                      if (!item.talk_time_seconds) return <span className="text-slate-300 font-normal">0:00</span>;
                      if (talkGoal && talkGoal.target_value > 0 && minutes >= talkGoal.target_value) {
                        return <span className="bg-emerald-200 text-emerald-900 rounded px-1.5 -mx-1">{display}</span>;
                      }
                      return display;
                    })()}</td>

                    {/* ── Hearsay (Teal) ── */}
                    <td className={`py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900 ${bdr("texts")}`}>{formatValue(item.texts, "", "", getGoal("texts"))}</td>
                    <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{formatValue(item.out_texts, "", "", getGoal("out_texts"))}</td>
                    <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{formatValue(item.opt_ins, "", "", getGoal("opt_ins"))}</td>
                    <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{formatValue(item.opt_outs)}</td>

                    {/* ── Production (Amber/Gold) ── */}
                    <td className={`py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900 ${bdr("production")}`}>{formatValue(item.quotes, "", "", getGoal("quotes"))}</td>
                    <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{formatValue(item.nb_count, "", "", getGoal("nb_count"))}</td>
                    <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{item.prem_premium ? formatValue(Number(item.prem_premium), "$", "", getGoal("prem_premium")) : formatValue(0)}</td>
                    <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{formatValue(item.items, "", "", getGoal("items"))}</td>
                    <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{formatValue(item.items_mtd, "", "", getMonthlyGoal("items"), "gold")}</td>

                    {/* ── Leads Pipeline (Rose/Red) ── */}
                    <td className={`py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900 ${bdr("leads")}`}>{formatValue(item.leads_snapshot?.contact || 0)}</td>
                    <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{formatValue(item.leads_snapshot?.quoted || 0)}</td>
                    <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{formatValue(item.leads_snapshot?.hot || 0)}</td>
                    <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{formatValue(item.leads_snapshot?.xsale || 0)}</td>

                    {/* ── eAgent Tasks (Violet) ── */}
                    {(() => {
                      const manualHL = (!eagentSubmitted && !item.isTotal) ? "orange" as const : undefined;
                      return (
                        <>
                          <td className={`py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900 ${bdr("eagent")}`}>{formatValue(item.dismissed_todos, "", "", getGoal("dismissed_todos"), manualHL)}</td>
                          <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{formatValue(item.past_due_todos, "", "", getGoal("past_due_todos"), manualHL)}</td>
                          <td className="py-[2px] px-1.5 text-[15px] font-mono font-bold text-slate-900">{formatValue(item.pivots, "", "", getGoal("pivots"), manualHL)}</td>
                        </>
                      );
                    })()}
                  </>
                );
              }}
            />
          )}
        </CardContent>
      </Card>

      {/* ── Insights: Talking Points & Streaks ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Talking Points */}
        <Card className="bg-white border border-slate-200 shadow-sm">
          <CardHeader 
            onClick={() => setTalkingPointsExpanded(!talkingPointsExpanded)}
            className="pb-2 flex flex-row items-center justify-between space-y-0 cursor-pointer select-none hover:bg-slate-50/50 transition-colors rounded-t-xl"
          >
            <CardTitle className="flex items-center gap-2 text-sm">
              <Megaphone className="w-4 h-4 text-blue-500" />
              <span className="text-slate-700">Talking Points</span>
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
                    text: `${topCaller.agents?.name} led outbound calls with ${topCaller.outbound.toLocaleString()}`,
                    color: "text-sky-600",
                    isPositive: true
                  });
                }

                // Top premium
                const topPrem = [...data].sort((a, b) => (Number(b.prem_premium) || 0) - (Number(a.prem_premium) || 0))[0];
                if (Number(topPrem?.prem_premium) > 0) {
                  points.push({
                    icon: <DollarSign className="w-3.5 h-3.5" />,
                    text: `${topPrem.agents?.name} wrote $${Number(topPrem.prem_premium).toLocaleString()} in premium`,
                    color: "text-emerald-600",
                    isPositive: true
                  });
                }

                // Auto item leader for the day
                const topItem = [...data].sort((a, b) => (b.items || 0) - (a.items || 0))[0];
                if (topItem?.items > 0) {
                  const ties = data.filter(m => (m.items || 0) === topItem.items);
                  const names = ties.map(m => m.agents?.name).join(" & ");
                  points.push({
                    icon: <Car className="w-3.5 h-3.5" />,
                    text: `${names} led auto items with ${topItem.items} item${topItem.items !== 1 ? "s" : ""}`,
                    color: "text-amber-600",
                    isPositive: true
                  });
                }

                // Total items written — always use full unfiltered metrics for true agency count
                const agencyTotalItems = metrics.reduce((sum: number, m: any) => sum + (m.items || 0), 0);
                if (agencyTotalItems > 0) {
                  points.push({
                    icon: <Car className="w-3.5 h-3.5" />,
                    text: `Agency wrote ${agencyTotalItems} item${agencyTotalItems !== 1 ? "s" : ""} on ${formatHeaderDate(date)}`,
                    color: "text-violet-600",
                    isPositive: true
                  });
                }

                // Top texter
                const topTexter = [...data].sort((a, b) => (b.out_texts || 0) - (a.out_texts || 0))[0];
                if (topTexter?.out_texts > 20) {
                  points.push({
                    icon: <MessageSquare className="w-3.5 h-3.5" />,
                    text: `${topTexter.agents?.name} sent ${topTexter.out_texts.toLocaleString()} outbound texts`,
                    color: "text-teal-600",
                    isPositive: true
                  });
                }

                // Agents who hit quotes goal (4+)
                const quotesHitters = data.filter(m => (m.quotes || 0) >= 4);
                if (quotesHitters.length > 0) {
                  points.push({
                    icon: <FileText className="w-3.5 h-3.5" />,
                    text: `${quotesHitters.length} agent${quotesHitters.length > 1 ? "s" : ""} hit the quotes goal (4+)`,
                    color: "text-rose-600",
                    isPositive: true
                  });
                }

                // Agents with 0 calls (Negative)
                const zeroCalls = data.filter(m => !m.outbound || m.outbound === 0).length;
                if (zeroCalls > 0 && zeroCalls < data.length) {
                  points.push({
                    icon: <AlertCircle className="w-3.5 h-3.5" />,
                    text: `${zeroCalls} agent${zeroCalls > 1 ? "s" : ""} had zero outbound calls`,
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
                    text: `${noPremiumAgents.length === 1 ? "Agent" : "Agents"} with no premium: ${names}`,
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

        {/* Streaks */}
        <Card className="bg-white border border-slate-200 shadow-sm">
          <CardHeader 
            onClick={() => setStreaksExpanded(!streaksExpanded)}
            className="pb-2 flex flex-col justify-center cursor-pointer select-none hover:bg-slate-50/50 transition-colors rounded-t-xl"
          >
            <div className="flex flex-row items-center justify-between w-full">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Flame className="w-4 h-4 text-orange-500" />
                <span className="text-slate-700">Active Streaks</span>
                <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-200">3+ days</Badge>
              </CardTitle>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${streaksExpanded ? "rotate-180" : ""}`} />
            </div>
            <p className="text-[10px] text-slate-400 leading-tight mt-1">Consecutive days meeting daily KPI goals & targets</p>
          </CardHeader>
          {streaksExpanded && (
            <CardContent className="pt-0">
              {(() => {
                // Filter streaks by current filters
                const filtered = streaks.filter(s => {
                  const matchOffice = filters.offices.length === 0 || filters.offices.includes(s.office);
                  const matchTeam = filters.teams.length === 0 || filters.teams.includes(s.team);
                  const matchAgent = filters.agents.length === 0 || filters.agents.includes(s.name);
                  const matchMeeting = filters.meetings.length === 0 || filters.meetings.includes(s.meeting_time);
                  return matchOffice && matchTeam && matchAgent && matchMeeting;
                });

                if (filtered.length === 0) {
                  return <p className="text-sm text-slate-400 italic">No active streaks (3+ consecutive days).</p>;
                }

                // Group streaks by agent name
                const groupedByAgent: Record<string, typeof filtered> = {};
                filtered.forEach(s => {
                  if (!groupedByAgent[s.name]) {
                    groupedByAgent[s.name] = [];
                  }
                  groupedByAgent[s.name].push(s);
                });

                // Sort agents by their maximum streak length descending
                const sortedAgents = Object.keys(groupedByAgent).sort((a, b) => {
                  const maxA = Math.max(...groupedByAgent[a].map(s => s.streak));
                  const maxB = Math.max(...groupedByAgent[b].map(s => s.streak));
                  return maxB - maxA || a.localeCompare(b);
                });

                const metricColors: Record<string, string> = {
                  outbound: "bg-sky-50 text-sky-700 border-sky-200",
                  items: "bg-violet-50 text-violet-700 border-violet-200",
                  quotes: "bg-rose-50 text-rose-700 border-rose-200",
                  out_texts: "bg-teal-50 text-teal-700 border-teal-200",
                  inbound: "bg-indigo-50 text-indigo-700 border-indigo-200",
                  talk_time_seconds: "bg-cyan-50 text-cyan-700 border-cyan-200",
                };

                return (
                  <div className="space-y-3">
                    <div className="space-y-3">
                      {sortedAgents.map((agentName) => {
                        const agentStreaks = groupedByAgent[agentName];
                        // Sort streaks inside each agent by length descending
                        const sortedAgentStreaks = [...agentStreaks].sort((a, b) => b.streak - a.streak);

                        return (
                          <div key={agentName} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4 border-b border-slate-100 pb-2.5 last:border-b-0 last:pb-0">
                            <span className="text-sm font-semibold text-slate-800 shrink-0 sm:w-40">{agentName}</span>
                            <div className="flex flex-wrap gap-1.5 items-center">
                              {sortedAgentStreaks.map((s, idx) => {
                                const isLongStreak = s.streak >= 5;
                                const isSuperStreak = s.streak >= 10;
                                
                                // Base color from metric type
                                const baseColor = metricColors[s.metric] || "";
                                
                                // Add visual distinction for long streaks
                                let badgeClasses = `text-[11px] px-2 py-0.5 flex items-center gap-1.5 font-bold shadow-sm border ${baseColor}`;
                                if (isSuperStreak) {
                                  // Glowing crimson background for super streaks
                                  badgeClasses = `text-[11px] px-2 py-0.5 flex items-center gap-1.5 font-bold shadow-[0_0_10px_rgba(239,68,68,0.5)] border border-red-400 bg-red-100 text-red-900 animate-pulse`;
                                } else if (isLongStreak) {
                                  // Hot orange glow for long streaks
                                  badgeClasses = `text-[11px] px-2 py-0.5 flex items-center gap-1.5 font-bold shadow-[0_0_8px_rgba(249,115,22,0.4)] border border-orange-400 bg-orange-50 text-orange-950`;
                                }

                                return (
                                  <Badge
                                    key={idx}
                                    variant="outline"
                                    className={badgeClasses}
                                  >
                                    <span className="flex items-center">
                                      <Flame className={`w-3.5 h-3.5 text-orange-500 fill-orange-500 ${isSuperStreak ? "animate-bounce" : ""}`} />
                                      {isLongStreak && <Flame className="w-3 h-3 -ml-1.5 text-red-500 fill-red-500" />}
                                      {isSuperStreak && <Flame className="w-2.5 h-2.5 -ml-1 text-yellow-500 fill-yellow-500" />}
                                    </span>
                                    <span className="tabular-nums">{s.streak}d</span>
                                    <span className="opacity-80 font-normal">{s.label}</span>
                                  </Badge>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-slate-400 italic pt-2 border-t border-slate-100 flex items-center gap-1">
                      <span>✨ Note: Weekends are streak-friendly! Maintaining your streak from Friday to Monday adds Saturday & Sunday to your streak count.</span>
                    </p>
                  </div>
                );
              })()}
            </CardContent>
          )}
        </Card>
      </div>

      <EAgentModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        dateStr={date}
        agents={metrics}
        onSuccess={async () => {
          await fetchData(date)
          const covResult = await getDailyCoverage(date)
          if (covResult.success && covResult.data) setCoverage(covResult.data)
        }}
      />

      <LeadsModal
        isOpen={isLeadsModalOpen}
        onClose={() => setIsLeadsModalOpen(false)}
        dateStr={date}
        onSuccess={async () => {
          await fetchData(date)
          const covResult = await getDailyCoverage(date)
          if (covResult.success && covResult.data) setCoverage(covResult.data)
        }}
      />
    </div>
    </PageGuard>
  )
}
