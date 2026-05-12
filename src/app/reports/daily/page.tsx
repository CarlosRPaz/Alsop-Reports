"use client"

import { useEffect, useState, useMemo } from "react"
import { getDailyData } from "./actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { DataTable, ColumnDef } from "@/components/ui/DataTable"
import { FilterBar, FilterState } from "@/components/ui/FilterBar"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Trophy, TrendingUp, Calendar, AlertCircle, Edit, CheckCircle2, Clock, DollarSign, Package, RefreshCw, Loader2, MessageSquare } from "lucide-react"
import Link from "next/link"
import { formatValue } from "@/lib/formatters"
import { EAgentModal } from "@/components/reports/EAgentModal"
import { toHolidaySet, getBusinessDaysInMonth, getElapsedBusinessDays, getRemainingBusinessDays, calcPacing } from "@/lib/businessDays"
import { runDataSyncPipeline } from "@/app/admin/sync/actions"

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
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<"idle" | "success" | "error">("idle")
  const [holidays, setHolidays] = useState<{ holiday_date: string }[]>([])

  // Check if data for this date looks incomplete (no data, or most agents have all zeros)
  const isSyncIncomplete = useMemo(() => {
    if (loading) return false;
    // No data at all for this date
    if (metrics.length === 0) return true;
    const withData = metrics.filter(m => 
      (m.calls || 0) > 0 || (m.texts || 0) > 0 || (m.quotes || 0) > 0 || 
      (m.nb_count || 0) > 0 || (m.items || 0) > 0 || Number(m.prem_premium || 0) > 0
    );
    // If less than 30% of agents have any data, consider it incomplete
    return withData.length < metrics.length * 0.3;
  }, [metrics, loading]);

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
    } else {
      console.error(result.error)
      setMetrics([])
    }
    setLoading(false)
  }

  useEffect(() => { fetchData(date) }, [date])

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

  return (
    <div className="p-4 md:p-6 max-w-[1800px] mx-auto space-y-4">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">Daily Standup</h1>
          <p className="text-slate-500">Comprehensive daily breakdown of agent activities.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-slate-200 shadow-sm rounded-md px-3 py-2">
            <Calendar className="w-4 h-4 text-slate-500" />
            <input 
              type="date" 
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent text-sm text-slate-700 border-none outline-none focus:ring-0 p-0"
            />
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
        </div>
      </header>

      {/* ── Sync CTA Banner (shown when data is incomplete) ── */}
      {!loading && isSyncIncomplete && (
        <div className="flex items-center justify-between gap-4 p-4 bg-amber-50 border border-amber-200 rounded-lg shadow-sm">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-900">
                Data for {formatHeaderDate(date)} looks incomplete
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Most agents have no metrics synced for this date. Run the pipeline to pull in the latest data.
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
      )}

      <FilterBar onFilterChange={setFilters} availableAgents={availableAgents} availableMeetings={availableMeetings} />

      {/* ── Elite Agency-Wide MTD Pacing Tracker ── */}
      {(() => {
        const AGENCY_GOAL = 500;
        const totalItemsMTD = metrics.reduce((sum: number, m: any) => sum + (m.items_mtd || 0), 0);
        const remaining = Math.max(0, AGENCY_GOAL - totalItemsMTD);
        const pct = Math.min(100, Math.round((totalItemsMTD / AGENCY_GOAL) * 100));

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
        const now = new Date()
        const currentYear = now.getFullYear()
        const currentMonth = now.getMonth() + 1 // 1-indexed
        const totalBizDays = getBusinessDaysInMonth(currentYear, currentMonth, holidaySet)
        
        // Pacing is based on data up through yesterday (since we meet in the AM)
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
                {/* Goal marker line */}
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
                  {/* Remaining empty space if any */}
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
                {/* Office Legend */}
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

                {/* Pacing Stats */}
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

      {/* ── Top 3 Leaderboards (Agency-Wide, unfiltered) ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <LeaderboardCard
          title="Top Items (Issued)"
          subtitle="Auto items only"
          icon={<Package className="w-3.5 h-3.5" />}
          data={metrics}
          accessor={(m) => m.items || 0}
          format={(v) => `${v} items`}
          colorClass="text-amber-400"
          borderClass="border-amber-500/30"
        />
        <LeaderboardCard
          title="Top Premium (Daily)"
          subtitle="Total premium"
          icon={<DollarSign className="w-3.5 h-3.5" />}
          data={metrics}
          accessor={(m) => Number(m.prem_premium) || 0}
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
          title="Top Texts"
          icon={<MessageSquare className="w-3.5 h-3.5" />}
          data={metrics}
          accessor={(m) => m.texts || 0}
          format={(v) => `${v.toLocaleString()}`}
          colorClass="text-fuchsia-400"
          borderClass="border-fuchsia-500/30"
        />
        <LeaderboardCard
          title="Items MTD"
          subtitle="Auto items only"
          icon={<TrendingUp className="w-3.5 h-3.5" />}
          data={metrics}
          accessor={(m) => m.items_mtd || 0}
          format={(v) => `${v} items`}
          colorClass="text-amber-400"
          borderClass="border-amber-500/30"
        />
        <LeaderboardCard
          title="Premium MTD"
          subtitle="Total premium"
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
          <CardTitle className="text-base">Daily Standup Report — {formatHeaderDate(date)}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="h-32 flex justify-center items-center"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div></div>
          ) : (
            <DataTable 
              columns={COLUMNS}
              data={filteredMetrics}
              keyExtractor={(item) => item.id || item.agent_id}
              renderRow={(item) => {
                // Goal resolution: most specific match wins
                // Priority: team+office > team > office > default (no team, no office)
                const getGoal = (metric: string) => {
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
                      <Link href={`/reports/agent/${item.agent_id}`} className="font-bold text-blue-400 hover:underline">
                        {item.agents?.name}
                      </Link>
                    </td>
                    <td className="py-[2px] px-1.5 text-[15px] text-slate-400">{item.agents?.office || "-"}</td>
                    <td className="py-[2px] px-1.5 text-[15px] text-slate-400">
                      {item.agents?.team ? <Badge variant="outline" className="text-[11px] py-0">{item.agents.team}</Badge> : '-'}
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
                      const manualHL = !eagentSubmitted ? "orange" as const : undefined;
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

      <EAgentModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        dateStr={date}
        agents={metrics}
        onSuccess={() => fetchData(date)}
      />
    </div>
  )
}
