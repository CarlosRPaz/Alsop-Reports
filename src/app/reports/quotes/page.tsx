"use client"

import { useState, useEffect, useMemo } from "react"
import { getQuotesData, getDailyBreakdown, ViewMode, QuotesAgentRow, DailyBreakdownPoint } from "./actions"
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, LabelList, ReferenceArea
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { FilterBar, FilterState } from "@/components/ui/FilterBar"
import {
  FileBarChart, TrendingUp, Target, Calendar, ChevronDown,
  ArrowUpDown, ArrowUp, ArrowDown, Users, Building2, BarChart3,
  CalendarCheck, Package, AlertTriangle
} from "lucide-react"

// ── Constants ──
const AVG_ITEMS_PER_POLICY = 1.25
const TARGET_AUTOS = 40
const BENCHMARK_CR = 0.15
const POLICIES_NEEDED = TARGET_AUTOS / AVG_ITEMS_PER_POLICY // 32

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

// ── Helpers ──
function pct(n: number, d: number): number {
  return d > 0 ? n / d : 0
}
function fmtPct(val: number): string {
  return (val * 100).toFixed(2) + "%"
}
function fmtNum(val: number, decimals = 1): string {
  return val.toFixed(decimals)
}

function crColorClass(cr: number): string {
  if (cr >= 0.15) return "text-emerald-700 bg-emerald-50"
  if (cr >= 0.10) return "text-amber-700 bg-amber-50"
  return "text-red-700 bg-red-50"
}

type SortField = "name" | "nb" | "quotes" | "cr" | "monthly" | "dailyGoal" | "benchmark" | "dailyActual"
type SortDir = "asc" | "desc"

// ── Computed row type ──
interface ComputedRow extends QuotesAgentRow {
  close_rate: number
  monthly_target: number
  daily_goal: number
  benchmark_15: number
  daily_actual: number
}

export default function QuotesPage() {
  // ── State ──
  const [mode, setMode] = useState<ViewMode>("mtd")
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [data, setData] = useState<{
    agents: QuotesAgentRow[]
    businessDaysTotal: number
    businessDaysPassed: number
    periodLabel: string
    lastDataDate: string
    mtdItems: number
    dateRangeEnd: string
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<FilterState>({ offices: [], teams: [], agents: [], meetings: [] })
  const [sortField, setSortField] = useState<SortField>("nb")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [chartData, setChartData] = useState<DailyBreakdownPoint[]>([])

  // ── Fetch Data ──
  useEffect(() => {
    async function load() {
      setLoading(true)
      const month = mode === "ytd" ? undefined : selectedMonth
      const res = await getQuotesData(mode, selectedYear, month)
      if (res.success && res.data) {
        setData(res.data)

        // Fetch daily breakdown for chart (MTD and Monthly only)
        if (mode !== "ytd") {
          const chartRes = await getDailyBreakdown(res.data.dateRangeStart, res.data.dateRangeEnd)
          if (chartRes.success && chartRes.data) {
            setChartData(chartRes.data)
          }
        } else {
          setChartData([])
        }
      }
      setLoading(false)
    }
    load()
  }, [mode, selectedYear, selectedMonth])

  // ── Filtered + Computed Rows ──
  const computedRows: ComputedRow[] = useMemo(() => {
    if (!data) return []

    const bizTotal = data.businessDaysTotal
    const bizPassed = data.businessDaysPassed
    const benchmark = bizTotal > 0 ? POLICIES_NEEDED / BENCHMARK_CR / bizTotal : 0

    return data.agents
      .filter(a => {
        if (filters.offices.length > 0) {
          // Map DB office names to filter abbreviations
          const officeMap: Record<string, string> = {
            "Montclair": "MCM", "Montebello": "MB",
            "Rancho Cucamonga": "RC", "Chino": "CH", "Claremont": "CH"
          }
          const abbr = officeMap[a.office || ""] || a.office || ""
          if (!filters.offices.includes(abbr) && !filters.offices.includes(a.office || "")) return false
        }
        if (filters.teams.length > 0) {
          const teamMap: Record<string, string> = {
            "Sales": "Sales", "Service": "CSR", "EA": "EA", "Manager": "Managers"
          }
          const mapped = teamMap[a.team || ""] || a.team || ""
          if (!filters.teams.includes(mapped) && !filters.teams.includes(a.team || "")) return false
        }
        if (filters.agents.length > 0 && !filters.agents.includes(a.name)) return false
        return true
      })
      .map(a => {
        const cr = pct(a.nb_policies, a.quote_count)
        const monthlyTarget = cr > 0 ? POLICIES_NEEDED / cr : 0
        const dailyGoal = bizTotal > 0 ? monthlyTarget / bizTotal : 0
        const dailyActual = bizPassed > 0 ? a.quote_count / bizPassed : 0

        return {
          ...a,
          close_rate: cr,
          monthly_target: monthlyTarget,
          daily_goal: dailyGoal,
          benchmark_15: benchmark,
          daily_actual: dailyActual,
        }
      })
  }, [data, filters])

  // ── Sorting ──
  const sortedRows = useMemo(() => {
    const rows = [...computedRows]
    const dir = sortDir === "asc" ? 1 : -1

    rows.sort((a, b) => {
      let va: number | string = 0, vb: number | string = 0
      switch (sortField) {
        case "name": va = a.name.toLowerCase(); vb = b.name.toLowerCase(); break
        case "nb": va = a.nb_policies; vb = b.nb_policies; break
        case "quotes": va = a.quote_count; vb = b.quote_count; break
        case "cr": va = a.close_rate; vb = b.close_rate; break
        case "monthly": va = a.monthly_target; vb = b.monthly_target; break
        case "dailyGoal": va = a.daily_goal; vb = b.daily_goal; break
        case "benchmark": va = a.benchmark_15; vb = b.benchmark_15; break
        case "dailyActual": va = a.daily_actual; vb = b.daily_actual; break
      }
      if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb) * dir
      return ((va as number) - (vb as number)) * dir
    })
    return rows
  }, [computedRows, sortField, sortDir])

  // ── Totals ──
  const totals = useMemo(() => {
    const totalNB = computedRows.reduce((s, r) => s + r.nb_policies, 0)
    const totalQuotes = computedRows.reduce((s, r) => s + r.quote_count, 0)
    const cr = pct(totalNB, totalQuotes)
    const bizTotal = data?.businessDaysTotal || 0
    const bizPassed = data?.businessDaysPassed || 0
    const monthlyTarget = cr > 0 ? POLICIES_NEEDED / cr : 0
    const dailyGoal = bizTotal > 0 ? monthlyTarget / bizTotal : 0
    const benchmark = bizTotal > 0 ? POLICIES_NEEDED / BENCHMARK_CR / bizTotal : 0
    const dailyActual = bizPassed > 0 ? totalQuotes / bizPassed : 0

    return { totalNB, totalQuotes, cr, monthlyTarget, dailyGoal, benchmark, dailyActual }
  }, [computedRows, data])

  // ── Group summaries (Team & Office) ──
  const teamSummary = useMemo(() => {
    const groups: Record<string, { nb: number; quotes: number }> = {}
    computedRows.forEach(r => {
      const key = r.team || "N/A"
      if (!groups[key]) groups[key] = { nb: 0, quotes: 0 }
      groups[key].nb += r.nb_policies
      groups[key].quotes += r.quote_count
    })
    return Object.entries(groups)
      .map(([team, v]) => ({ team, cr: pct(v.nb, v.quotes), nb: v.nb, quotes: v.quotes }))
      .sort((a, b) => b.cr - a.cr)
  }, [computedRows])

  const officeSummary = useMemo(() => {
    const groups: Record<string, { nb: number; quotes: number }> = {}
    computedRows.forEach(r => {
      const key = r.office || "N/A"
      if (!groups[key]) groups[key] = { nb: 0, quotes: 0 }
      groups[key].nb += r.nb_policies
      groups[key].quotes += r.quote_count
    })
    return Object.entries(groups)
      .map(([office, v]) => ({ office, cr: pct(v.nb, v.quotes), nb: v.nb, quotes: v.quotes }))
      .sort((a, b) => b.cr - a.cr)
  }, [computedRows])

  // ── Sort handler ──
  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDir("desc")
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-30" />
    return sortDir === "asc"
      ? <ArrowUp className="w-3 h-3 text-blue-600" />
      : <ArrowDown className="w-3 h-3 text-blue-600" />
  }

  // ── Available filter values ──
  const availableAgents = useMemo(() =>
    data?.agents.map(a => a.name).sort() || [], [data])

  // Generate month options for the monthly picker
  const monthOptions = useMemo(() => {
    const today = new Date()
    const options: { year: number; month: number; label: string }[] = []
    // Go back 12 months
    for (let i = 0; i < 12; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
      options.push({
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
      })
    }
    return options
  }, [])

  return (
    <div className="p-6 max-w-[1600px] mx-auto">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileBarChart className="w-6 h-6 text-blue-600" />
            Quotes & NB Performance
          </h1>
          {data && (
            <p className="text-sm text-slate-500 mt-1">
              {data.periodLabel} &middot; {data.businessDaysPassed} of {data.businessDaysTotal} business days
              {data.lastDataDate && (
                <span className="text-slate-400"> (data through {data.lastDataDate})</span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* ── View Mode Tabs + Period Picker ── */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex bg-slate-100 rounded-lg p-0.5 border border-slate-200">
          {(["mtd", "ytd", "monthly"] as ViewMode[]).map(m => (
            <button
              key={m}
              onClick={() => {
                setMode(m)
                if (m === "mtd") {
                  setSelectedYear(new Date().getFullYear())
                  setSelectedMonth(new Date().getMonth() + 1)
                }
                if (m === "ytd") {
                  setSelectedYear(new Date().getFullYear())
                }
              }}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                mode === m
                  ? "bg-white text-blue-700 shadow-sm border border-blue-200"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Month picker for Monthly view */}
        {mode === "monthly" && (
          <div className="relative">
            <select
              value={`${selectedYear}-${selectedMonth}`}
              onChange={e => {
                const [y, m] = e.target.value.split("-").map(Number)
                setSelectedYear(y)
                setSelectedMonth(m)
              }}
              className="appearance-none bg-white border border-slate-300 rounded-lg px-4 py-1.5 pr-8 text-sm font-medium text-slate-700 cursor-pointer hover:border-blue-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            >
              {monthOptions.map(opt => (
                <option key={`${opt.year}-${opt.month}`} value={`${opt.year}-${opt.month}`}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
        )}

        {/* YTD year picker */}
        {mode === "ytd" && (
          <div className="relative">
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="appearance-none bg-white border border-slate-300 rounded-lg px-4 py-1.5 pr-8 text-sm font-medium text-slate-700 cursor-pointer hover:border-blue-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            >
              {[2026, 2025].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
        )}
      </div>

      {/* ── Filters ── */}
      <FilterBar
        onFilterChange={setFilters}
        availableAgents={availableAgents}
      />

      {/* ── Data Freshness + MTD Items Cards ── */}
      {data && !loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Most Recent Data Date */}
          <div className={`rounded-xl border p-4 ${
            data.lastDataDate < data.dateRangeEnd
              ? "bg-amber-50 border-amber-200"
              : "bg-emerald-50 border-emerald-200"
          }`}>
            <div className="flex items-center gap-2 mb-1">
              <CalendarCheck className={`w-4 h-4 ${
                data.lastDataDate < data.dateRangeEnd ? "text-amber-600" : "text-emerald-600"
              }`} />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Most Recent Quote-Production Date
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xl font-bold ${
                data.lastDataDate < data.dateRangeEnd ? "text-amber-800" : "text-emerald-800"
              }`}>
                {new Date(data.lastDataDate + "T00:00:00").toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" })}
              </span>
              {data.lastDataDate < data.dateRangeEnd && (
                <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                  <AlertTriangle className="w-3 h-3" />
                  Stale
                </span>
              )}
            </div>
          </div>

          {/* MTD Items */}
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Package className="w-4 h-4 text-blue-600" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                MTD Items
              </span>
            </div>
            <span className="text-xl font-bold text-blue-800">
              {data.mtdItems.toLocaleString()}
            </span>
          </div>

          {/* Agency CR */}
          <div className={`rounded-xl border p-4 ${crColorClass(totals.cr)}`}>
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Agency Close Rate
              </span>
            </div>
            <span className="text-xl font-bold">
              {fmtPct(totals.cr)}
            </span>
          </div>

          {/* Business Days */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-4 h-4 text-slate-500" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Business Days
              </span>
            </div>
            <span className="text-xl font-bold text-slate-800">
              {data.businessDaysPassed} <span className="text-sm font-normal text-slate-400">/ {data.businessDaysTotal}</span>
            </span>
          </div>
        </div>
      )}

      {/* ── Summary Cards: Team & Office Close Rates ── */}
      {data && !loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Team Close Rate */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-600 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-500" />
                Close Rate by Team
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {teamSummary.map(t => (
                  <div key={t.team} className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">{t.team}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-400">
                        {t.nb} NB / {t.quotes} Q
                      </span>
                      <span className={`text-sm font-bold px-2 py-0.5 rounded-md ${crColorClass(t.cr)}`}>
                        {fmtPct(t.cr)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Office Close Rate */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-600 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-purple-500" />
                Close Rate by Office
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {officeSummary.map(o => (
                  <div key={o.office} className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">{o.office}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-400">
                        {o.nb} NB / {o.quotes} Q
                      </span>
                      <span className={`text-sm font-bold px-2 py-0.5 rounded-md ${crColorClass(o.cr)}`}>
                        {fmtPct(o.cr)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Daily Trend Chart (MTD / Monthly only) ── */}
      {data && !loading && mode !== "ytd" && chartData.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-600 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-500" />
              Daily Trend — {data.periodLabel}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[340px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="dayLabel"
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    tickLine={false}
                    axisLine={{ stroke: "#e2e8f0" }}
                    interval={0}
                    angle={-45}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis
                    yAxisId="count"
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    tickLine={false}
                    axisLine={false}
                    label={{ value: "Count", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#94a3b8" } }}
                  />
                  <YAxis
                    yAxisId="pct"
                    orientation="right"
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => `${v}%`}
                    label={{ value: "Close Rate", angle: 90, position: "insideRight", style: { fontSize: 11, fill: "#94a3b8" } }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#fff",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                      fontSize: "12px",
                    }}
                    formatter={(value: number, name: string) => {
                      if (name === "Close Rate") return [`${value.toFixed(1)}%`, name]
                      if (name === "_bizDay") return [null, null]
                      return [value, name]
                    }}
                    itemSorter={() => 0}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
                    payload={[
                      { value: "Quotes", type: "line", color: "#3b82f6" },
                      { value: "NB Policies", type: "line", color: "#10b981" },
                      { value: "Close Rate", type: "line", color: "#f59e0b" },
                    ]}
                  />

                  {/* Full-height bands for business days (Mon-Fri only) */}
                  {chartData.map((entry, index) => {
                    if (!entry.isBusinessDay) return null
                    return (
                      <ReferenceArea
                        key={`biz-${index}`}
                        yAxisId="count"
                        x1={entry.dayLabel}
                        x2={entry.dayLabel}
                        fill="#3b82f6"
                        fillOpacity={0.06}
                        strokeOpacity={0}
                      />
                    )
                  })}

                  {/* Lines */}
                  <Line
                    yAxisId="count"
                    type="monotone"
                    dataKey="quotes"
                    name="Quotes"
                    stroke="#3b82f6"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "#3b82f6" }}
                    activeDot={{ r: 5 }}
                  >
                    <LabelList dataKey="quotes" position="top" style={{ fontSize: 9, fill: "#3b82f6", fontWeight: 600 }} offset={8} />
                  </Line>
                  <Line
                    yAxisId="count"
                    type="monotone"
                    dataKey="nb"
                    name="NB Policies"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "#10b981" }}
                    activeDot={{ r: 5 }}
                  >
                    <LabelList dataKey="nb" position="bottom" style={{ fontSize: 9, fill: "#10b981", fontWeight: 600 }} offset={8} />
                  </Line>
                  <Line
                    yAxisId="pct"
                    type="monotone"
                    dataKey="closeRate"
                    name="Close Rate"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                    dot={{ r: 3, fill: "#f59e0b" }}
                    activeDot={{ r: 5 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Loading State ── */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3 text-slate-500">
            <BarChart3 className="w-5 h-5 animate-pulse" />
            <span className="text-sm">Loading quotes data...</span>
          </div>
        </div>
      )}

      {/* ── Main Data Table ── */}
      {data && !loading && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-slate-700 flex items-center gap-2 text-base">
              <BarChart3 className="w-4.5 h-4.5 text-blue-600" />
              {data.periodLabel}
              <span className="text-xs text-slate-400 font-normal ml-2">
                {sortedRows.length} agents with activity
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <Th field="name" label="Agent" onSort={handleSort} sortField={sortField} sortDir={sortDir} align="left" />
                    <Th field="nb" label="NB Policies" onSort={handleSort} sortField={sortField} sortDir={sortDir} />
                    <Th field="quotes" label="Quote Count" onSort={handleSort} sortField={sortField} sortDir={sortDir} />
                    <Th field="cr" label="Close Rate" onSort={handleSort} sortField={sortField} sortDir={sortDir} />
                    <Th field="monthly" label={`Mo. Quotes\nfor ${TARGET_AUTOS} Autos`} onSort={handleSort} sortField={sortField} sortDir={sortDir} />
                    <Th field="dailyGoal" label="Daily Quote\nGoal" onSort={handleSort} sortField={sortField} sortDir={sortDir} />
                    <Th field="benchmark" label={`Daily Quotes\n@ 15% CR`} onSort={handleSort} sortField={sortField} sortDir={sortDir} />
                    <Th field="dailyActual" label="Daily Quote\nActual" onSort={handleSort} sortField={sortField} sortDir={sortDir} />
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row, idx) => {
                    const actualVsGoal = row.daily_goal > 0 ? row.daily_actual / row.daily_goal : 0
                    const actualHighlight = actualVsGoal >= 1
                      ? "text-emerald-700 font-bold"
                      : actualVsGoal >= 0.8
                        ? "text-amber-700"
                        : "text-slate-900"

                    return (
                      <tr
                        key={row.agent_id}
                        className={`border-b border-slate-100 hover:bg-blue-50/30 transition-colors ${
                          idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"
                        }`}
                      >
                        <td className="py-2 px-3 font-medium text-slate-800 whitespace-nowrap">
                          {row.name}
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-semibold text-slate-900">
                          {row.nb_policies}
                        </td>
                        <td className="py-2 px-3 text-center font-mono text-slate-700">
                          {row.quote_count}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${crColorClass(row.close_rate)}`}>
                            {fmtPct(row.close_rate)}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center font-mono text-slate-700">
                          {row.close_rate > 0 ? Math.round(row.monthly_target) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="py-2 px-3 text-center font-mono text-slate-700">
                          {row.close_rate > 0 ? fmtNum(row.daily_goal) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="py-2 px-3 text-center font-mono text-slate-500">
                          {fmtNum(row.benchmark_15)}
                        </td>
                        <td className={`py-2 px-3 text-center font-mono ${actualHighlight}`}>
                          {fmtNum(row.daily_actual)}
                        </td>
                      </tr>
                    )
                  })}

                  {/* Totals Row */}
                  <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold">
                    <td className="py-2.5 px-3 text-slate-800">Total</td>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-900">{totals.totalNB}</td>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-900">{totals.totalQuotes}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${crColorClass(totals.cr)}`}>
                        {fmtPct(totals.cr)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-900">
                      {totals.cr > 0 ? Math.round(totals.monthlyTarget) : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-900">
                      {totals.cr > 0 ? fmtNum(totals.dailyGoal) : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-600">
                      {fmtNum(totals.benchmark)}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-900">
                      {fmtNum(totals.dailyActual)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Footer Info ── */}
      <div className="mt-4 text-xs text-slate-400 flex items-center gap-4 flex-wrap">
        <span className="flex items-center gap-1">
          <Target className="w-3 h-3" />
          Target: {TARGET_AUTOS} autos/mo &middot; {AVG_ITEMS_PER_POLICY} avg items/policy &middot; {POLICIES_NEEDED} policies needed
        </span>
        <span>
          Benchmark: 15% CR = {fmtNum(POLICIES_NEEDED / BENCHMARK_CR, 0)} quotes/mo
        </span>
      </div>
    </div>
  )
}

// ── Th Component for sortable headers ──
function Th({
  field, label, onSort, sortField, sortDir, align = "center"
}: {
  field: SortField
  label: string
  onSort: (f: SortField) => void
  sortField: SortField
  sortDir: SortDir
  align?: "left" | "center"
}) {
  const isActive = sortField === field
  return (
    <th
      onClick={() => onSort(field)}
      className={`py-2.5 px-3 text-[11px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-pre-line transition-colors ${
        align === "left" ? "text-left" : "text-center"
      } ${isActive ? "text-blue-700 bg-blue-50/50" : "text-slate-500 hover:text-slate-700 hover:bg-slate-100/50"}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30" />
        )}
      </span>
    </th>
  )
}
