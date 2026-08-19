"use client"

import { PageGuard } from "@/components/layout/PageGuard"
import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { getHeatmapData, HeatmapAgentRow, HeatmapPayload } from "./actions"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card"
import { FilterBar, FilterState } from "@/components/ui/FilterBar"
import { TableSkeleton } from "@/components/ui/Skeleton"
import { Badge } from "@/components/ui/Badge"
import {
  BarChart3, Flame, Calendar, Phone, Clock, FileText, Package, DollarSign, Percent,
  TrendingUp, TrendingDown, Users, Activity, Sparkles, ArrowUpDown, ChevronRight, Zap, Target, Award, AlertCircle
} from "lucide-react"

function formatMinutes(seconds: number) {
  if (!seconds) return "0:00"
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}:${m.toString().padStart(2, '0')}`
}

function formatLocalDate(d: Date) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

type ViewMode = "matrix" | "rhythm" | "quadrant"
type RhythmMetric = "items" | "quotes" | "outbound" | "talkTime"

export default function AgentHeatmapPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("matrix")
  const [rhythmMetric, setRhythmMetric] = useState<RhythmMetric>("items")

  const [datePreset, setDatePreset] = useState("this_month")
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  const [loading, setLoading] = useState(true)
  const [heatmapData, setHeatmapData] = useState<HeatmapPayload | null>(null)
  const [filters, setFilters] = useState<FilterState>({ offices: [], teams: ["Sales"], agents: [], meetings: [] })

  // Sorting
  const [sortField, setSortField] = useState<keyof HeatmapAgentRow>("items")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  // Date Presets Engine
  useEffect(() => {
    const today = new Date()
    let start = new Date()
    let end = new Date()

    if (datePreset === "today") {
      start = today
      end = today
    } else if (datePreset === "yesterday") {
      const yesterday = new Date(today)
      yesterday.setDate(today.getDate() - 1)
      start = yesterday
      end = yesterday
    } else if (datePreset === "this_week") {
      const day = today.getDay()
      const diff = day === 0 ? -6 : 1 - day
      start.setDate(today.getDate() + diff)
    } else if (datePreset === "last_week") {
      const day = today.getDay()
      const diff = day === 0 ? -6 : 1 - day
      start.setDate(today.getDate() + diff - 7)
      end = new Date(start)
      end.setDate(start.getDate() + 6)
    } else if (datePreset === "this_month") {
      start = new Date(today.getFullYear(), today.getMonth(), 1)
    } else if (datePreset === "last_month") {
      start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      end = new Date(today.getFullYear(), today.getMonth(), 0)
    } else if (datePreset === "last_30_days") {
      start.setDate(today.getDate() - 30)
    }

    const startStr = formatLocalDate(start)
    const endStr = formatLocalDate(end)

    setStartDate(startStr)
    setEndDate(endStr)
    setCustomStart(startStr)
    setCustomEnd(endStr)
  }, [datePreset])

  // Fetch data
  const loadData = async () => {
    if (!startDate || !endDate) return
    setLoading(true)
    const res = await getHeatmapData(startDate, endDate)
    if (res.success && res.data) {
      setHeatmapData(res.data)
    } else {
      setHeatmapData(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [startDate, endDate])

  const handleApplyCustomDates = () => {
    if (customStart && customEnd) {
      setStartDate(customStart)
      setEndDate(customEnd)
    }
  }

  // Filter & Sort Rows
  const filteredRows = useMemo(() => {
    if (!heatmapData) return []
    const rows = heatmapData.rows.filter(r => {
      if (filters.offices.length > 0 && r.office && !filters.offices.includes(r.office)) return false
      if (filters.teams.length > 0 && r.team && !filters.teams.includes(r.team)) return false
      return true
    })

    return rows.sort((a, b) => {
      let aVal = a[sortField] as any
      let bVal = b[sortField] as any
      if (typeof aVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      return sortDir === "asc" ? (aVal || 0) - (bVal || 0) : (bVal || 0) - (aVal || 0)
    })
  }, [heatmapData, filters, sortField, sortDir])

  const handleSort = (field: keyof HeatmapAgentRow) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDir("desc")
    }
  }

  // Color gradient logic relative to Team Average (% deviation)
  const getDeviationStyle = (dev: number, hasActivity: boolean) => {
    if (!hasActivity || dev === 0) {
      return "bg-slate-50/70 text-slate-700 dark:bg-slate-900/30"
    }
    if (dev >= 30) {
      return "bg-emerald-500/20 text-emerald-950 font-black dark:bg-emerald-900/40 dark:text-emerald-200"
    }
    if (dev >= 10) {
      return "bg-emerald-500/10 text-emerald-900 font-bold dark:bg-emerald-950/30 dark:text-emerald-300"
    }
    if (dev >= -10) {
      return "bg-white text-slate-800 font-medium dark:bg-slate-900"
    }
    if (dev >= -30) {
      return "bg-amber-500/15 text-amber-950 font-bold dark:bg-amber-950/30 dark:text-amber-300"
    }
    return "bg-rose-500/15 text-rose-950 font-black dark:bg-rose-950/40 dark:text-rose-200"
  }

  // Weekday rhythm heat intensity
  const getRhythmBg = (val: number, max: number) => {
    if (!val || val === 0 || max === 0) return "bg-slate-50/60 text-slate-400"
    const ratio = val / max
    if (ratio >= 0.8) return "bg-emerald-500/25 text-emerald-950 font-black border border-emerald-500/30"
    if (ratio >= 0.5) return "bg-emerald-500/12 text-emerald-900 font-bold"
    if (ratio >= 0.25) return "bg-blue-500/10 text-blue-900 font-semibold"
    return "bg-slate-100/80 text-slate-600 font-normal"
  }

  return (
    <PageGuard pageKey="heatmap">
      <div className="p-3 md:p-5 space-y-4 max-w-[1650px] mx-auto min-h-screen">
        
        {/* ── Top Bar ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm">
              <Flame className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-tight text-slate-900">Agent Performance Heatmap</h1>
                <Badge variant="outline" className="text-[10px] py-0 font-mono">Relative Intensity</Badge>
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                Relative benchmarks & peer deviation intelligence (color-scaled against team averages)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Switcher */}
            <div className="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200 text-xs font-bold shadow-inner">
              <button
                onClick={() => setViewMode("matrix")}
                className={`px-3 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                  viewMode === "matrix" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5 text-blue-600" />
                <span>Peer Deviation Matrix</span>
              </button>
              <button
                onClick={() => setViewMode("rhythm")}
                className={`px-3 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                  viewMode === "rhythm" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                <span>Mon–Fri Rhythm</span>
              </button>
              <button
                onClick={() => setViewMode("quadrant")}
                className={`px-3 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                  viewMode === "quadrant" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-amber-600" />
                <span>Effort vs Results</span>
              </button>
            </div>

            {/* Date Preset Selector */}
            <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-lg border border-slate-200">
              <select
                value={datePreset}
                onChange={(e) => setDatePreset(e.target.value)}
                className="px-2 py-1 bg-transparent font-bold text-xs outline-none text-slate-800 cursor-pointer"
              >
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="this_week">This Week</option>
                <option value="last_week">Last Week</option>
                <option value="this_month">This Month (MTD)</option>
                <option value="last_month">Last Month</option>
                <option value="last_30_days">Last 30 Days</option>
                <option value="custom">Custom Range</option>
              </select>

              {datePreset === "custom" && (
                <div className="flex items-center gap-1 pl-1 border-l border-slate-200">
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[11px] text-slate-800"
                  />
                  <span className="text-slate-400 text-xs">—</span>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[11px] text-slate-800"
                  />
                  <button
                    onClick={handleApplyCustomDates}
                    className="px-2 py-0.5 text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                  >
                    Go
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Filters ────────────────────────────────────────────────────────── */}
        <FilterBar 
          onFilterChange={setFilters} 
          initialFilters={filters}
          enforceTeamSelection={true}
        />

        {/* ── Legend Ribbon ──────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200 px-3.5 py-1.5 rounded-lg shadow-sm text-[11px] font-medium text-slate-600">
          <div className="flex items-center gap-3">
            <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">Scale vs Team Avg:</span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-emerald-500/25 border border-emerald-500/40" />
              <strong>≥ +30%</strong> (High Pacesetter)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-emerald-500/10 border border-emerald-500/20" />
              <strong>+10% to +29%</strong> (Above Avg)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-white border border-slate-300" />
              <strong>Near Avg (±9%)</strong>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-amber-500/15 border border-amber-500/30" />
              <strong>-10% to -29%</strong> (Below Avg)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-rose-500/15 border border-rose-500/30" />
              <strong>≤ -30%</strong> (Coaching Target)
            </span>
          </div>

          <div className="text-[10px] text-slate-400 font-mono">
            Showing {filteredRows.length} active agents • {startDate} to {endDate}
          </div>
        </div>

        {/* ── VIEW 1: PEER DEVIATION MATRIX ─────────────────────────────────── */}
        {viewMode === "matrix" && (
          <Card className="overflow-hidden border border-slate-200 shadow-sm bg-white">
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6">
                  <TableSkeleton rows={10} cols={9} />
                </div>
              ) : filteredRows.length === 0 ? (
                <div className="p-12 text-center text-sm text-slate-400 italic">
                  No performance records found for the selected dates and team.
                </div>
              ) : (
                <div className="overflow-x-auto dsr-scrollbar">
                  <table className="w-full text-left border-collapse min-w-[1100px]">
                    <thead>
                      {/* Super Header Row */}
                      <tr className="bg-slate-100/80 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider select-none">
                        <th className="py-1 px-3 sticky left-0 z-30 bg-slate-100 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] w-[180px]">
                          Agent
                        </th>
                        <th className="py-1 px-2 border-r border-slate-200 text-center" colSpan={2}>Meta</th>
                        <th className="py-1 px-2 border-r border-slate-200 text-center bg-amber-50 text-amber-900" colSpan={4}>Production & Closing</th>
                        <th className="py-1 px-2 text-center bg-blue-50 text-blue-900" colSpan={4}>Activity & Effort</th>
                      </tr>

                      {/* Column Header Row */}
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider select-none">
                        <th 
                          onClick={() => handleSort("name")}
                          className="py-2.5 px-3 sticky left-0 z-30 bg-slate-50 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)] cursor-pointer hover:bg-slate-100"
                        >
                          <span className="flex items-center gap-1">Name <ArrowUpDown className="w-3 h-3 text-slate-400" /></span>
                        </th>
                        <th onClick={() => handleSort("office")} className="py-2 px-2 text-center cursor-pointer hover:bg-slate-100">Office</th>
                        <th onClick={() => handleSort("team")} className="py-2 px-2 text-center border-r border-slate-200 cursor-pointer hover:bg-slate-100">Team</th>
                        
                        {/* Production */}
                        <th onClick={() => handleSort("items")} className="py-2 px-2 text-center cursor-pointer hover:bg-amber-100/50">
                          <span className="flex items-center justify-center gap-1 text-amber-900">🚗 Items <ArrowUpDown className="w-3 h-3 opacity-60" /></span>
                        </th>
                        <th onClick={() => handleSort("premium")} className="py-2 px-2 text-center cursor-pointer hover:bg-amber-100/50">
                          <span className="flex items-center justify-center gap-1 text-amber-900">💰 Written Prem <ArrowUpDown className="w-3 h-3 opacity-60" /></span>
                        </th>
                        <th onClick={() => handleSort("quotes")} className="py-2 px-2 text-center cursor-pointer hover:bg-amber-100/50">
                          <span className="flex items-center justify-center gap-1 text-amber-900">📋 Quotes <ArrowUpDown className="w-3 h-3 opacity-60" /></span>
                        </th>
                        <th onClick={() => handleSort("closeRate")} className="py-2 px-2 text-center border-r border-slate-200 cursor-pointer hover:bg-amber-100/50">
                          <span className="flex items-center justify-center gap-1 text-amber-900">🎯 Close Rate <ArrowUpDown className="w-3 h-3 opacity-60" /></span>
                        </th>

                        {/* Activity */}
                        <th onClick={() => handleSort("outbound")} className="py-2 px-2 text-center cursor-pointer hover:bg-blue-100/50">
                          <span className="flex items-center justify-center gap-1 text-blue-900">📞 Outbound <ArrowUpDown className="w-3 h-3 opacity-60" /></span>
                        </th>
                        <th onClick={() => handleSort("talkTime")} className="py-2 px-2 text-center cursor-pointer hover:bg-blue-100/50">
                          <span className="flex items-center justify-center gap-1 text-blue-900">⏱️ Talk Time <ArrowUpDown className="w-3 h-3 opacity-60" /></span>
                        </th>
                        <th onClick={() => handleSort("calls")} className="py-2 px-2 text-center cursor-pointer hover:bg-blue-100/50">
                          <span className="flex items-center justify-center gap-1 text-blue-900">📱 Total Calls <ArrowUpDown className="w-3 h-3 opacity-60" /></span>
                        </th>
                        <th onClick={() => handleSort("texts")} className="py-2 px-2 text-center cursor-pointer hover:bg-blue-100/50">
                          <span className="flex items-center justify-center gap-1 text-blue-900">💬 Texts <ArrowUpDown className="w-3 h-3 opacity-60" /></span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {filteredRows.map((r) => {
                        const hasActivity = r.items > 0 || r.quotes > 0 || r.outbound > 0
                        return (
                          <tr key={r.id} className="group hover:bg-slate-50/80 transition-colors">
                            {/* Frozen Agent Name */}
                            <td className="py-1.5 px-3 sticky left-0 z-20 bg-white group-hover:bg-slate-50 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)] font-bold text-slate-900 whitespace-nowrap">
                              <Link 
                                href={`/reports/agent/${r.id}`}
                                className="text-blue-600 hover:underline flex items-center justify-between gap-1 group-hover:text-blue-700"
                              >
                                <span>{r.name}</span>
                                <ChevronRight className="w-3 h-3 text-slate-300 group-hover:text-blue-500" />
                              </Link>
                            </td>

                            <td className="py-1.5 px-2 text-center font-mono text-[11px] text-slate-500">{r.office || "—"}</td>
                            <td className="py-1.5 px-2 text-center font-mono text-[11px] text-slate-500 border-r border-slate-200">{r.team || "—"}</td>

                            {/* Items */}
                            <td className={`py-1.5 px-2 text-center font-mono ${getDeviationStyle(r.deviations.items, hasActivity)}`}>
                              <div className="font-bold text-[13px]">{r.items.toLocaleString()}</div>
                              <div className="text-[9px] opacity-75">{r.deviations.items > 0 ? `+${r.deviations.items}%` : `${r.deviations.items}%`}</div>
                            </td>

                            {/* Premium */}
                            <td className={`py-1.5 px-2 text-center font-mono ${getDeviationStyle(r.deviations.premium, hasActivity)}`}>
                              <div className="font-bold text-[13px]">${Math.round(r.premium).toLocaleString()}</div>
                              <div className="text-[9px] opacity-75">{r.deviations.premium > 0 ? `+${r.deviations.premium}%` : `${r.deviations.premium}%`}</div>
                            </td>

                            {/* Quotes */}
                            <td className={`py-1.5 px-2 text-center font-mono ${getDeviationStyle(r.deviations.quotes, hasActivity)}`}>
                              <div className="font-bold text-[13px]">{r.quotes.toLocaleString()}</div>
                              <div className="text-[9px] opacity-75">{r.deviations.quotes > 0 ? `+${r.deviations.quotes}%` : `${r.deviations.quotes}%`}</div>
                            </td>

                            {/* Close Rate */}
                            <td className={`py-1.5 px-2 text-center font-mono border-r border-slate-200 ${getDeviationStyle(r.deviations.closeRate, hasActivity)}`}>
                              <div className="font-bold text-[13px]">{(r.closeRate * 100).toFixed(1)}%</div>
                              <div className="text-[9px] opacity-75">{r.deviations.closeRate > 0 ? `+${r.deviations.closeRate}%` : `${r.deviations.closeRate}%`}</div>
                            </td>

                            {/* Outbound */}
                            <td className={`py-1.5 px-2 text-center font-mono ${getDeviationStyle(r.deviations.outbound, hasActivity)}`}>
                              <div className="font-bold text-[13px]">{r.outbound.toLocaleString()}</div>
                              <div className="text-[9px] opacity-75">{r.deviations.outbound > 0 ? `+${r.deviations.outbound}%` : `${r.deviations.outbound}%`}</div>
                            </td>

                            {/* Talk Time */}
                            <td className={`py-1.5 px-2 text-center font-mono ${getDeviationStyle(r.deviations.talkTime, hasActivity)}`}>
                              <div className="font-bold text-[13px]">{formatMinutes(r.talkTime)}</div>
                              <div className="text-[9px] opacity-75">{r.deviations.talkTime > 0 ? `+${r.deviations.talkTime}%` : `${r.deviations.talkTime}%`}</div>
                            </td>

                            {/* Total Calls */}
                            <td className={`py-1.5 px-2 text-center font-mono ${getDeviationStyle(r.deviations.calls, hasActivity)}`}>
                              <div className="font-bold text-[13px]">{r.calls.toLocaleString()}</div>
                              <div className="text-[9px] opacity-75">{r.deviations.calls > 0 ? `+${r.deviations.calls}%` : `${r.deviations.calls}%`}</div>
                            </td>

                            {/* Texts */}
                            <td className={`py-1.5 px-2 text-center font-mono ${getDeviationStyle(r.deviations.texts, hasActivity)}`}>
                              <div className="font-bold text-[13px]">{r.texts.toLocaleString()}</div>
                              <div className="text-[9px] opacity-75">{r.deviations.texts > 0 ? `+${r.deviations.texts}%` : `${r.deviations.texts}%`}</div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── VIEW 2: MON–FRI WEEKLY RHYTHM ─────────────────────────────────── */}
        {viewMode === "rhythm" && (
          <Card className="overflow-hidden border border-slate-200 shadow-sm bg-white">
            <div className="px-4 py-2.5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Weekday Rhythm & Consistency (Average Daily Volume by Day of Week)
                </span>
              </div>

              {/* Rhythm Metric Selector */}
              <div className="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200 text-xs font-bold">
                {(["items", "quotes", "outbound", "talkTime"] as const).map(mKey => {
                  const labels = {
                    items: "🚗 Items",
                    quotes: "📋 Quotes",
                    outbound: "📞 Outbound Dials",
                    talkTime: "⏱️ Talk Time",
                  }
                  return (
                    <button
                      key={mKey}
                      onClick={() => setRhythmMetric(mKey)}
                      className={`px-2.5 py-0.5 rounded-md transition-all ${
                        rhythmMetric === mKey ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
                      }`}
                    >
                      {labels[mKey]}
                    </button>
                  )
                })}
              </div>
            </div>

            <CardContent className="p-0">
              {filteredRows.length === 0 ? (
                <div className="p-12 text-center text-sm text-slate-400 italic">
                  No records available.
                </div>
              ) : (
                <div className="overflow-x-auto dsr-scrollbar">
                  <table className="w-full text-left border-collapse min-w-[900px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider select-none">
                        <th className="py-2.5 px-3 sticky left-0 z-30 bg-slate-50 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)] w-[180px]">Agent</th>
                        <th className="py-2 px-2 text-center">Office</th>
                        <th className="py-2 px-2 text-center border-r border-slate-200">Team</th>
                        <th className="py-2 px-3 text-center">Monday</th>
                        <th className="py-2 px-3 text-center">Tuesday</th>
                        <th className="py-2 px-3 text-center">Wednesday</th>
                        <th className="py-2 px-3 text-center">Thursday</th>
                        <th className="py-2 px-3 text-center border-r border-slate-200">Friday</th>
                        <th className="py-2 px-3 text-center bg-slate-100 text-slate-800">Total in Period</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs font-mono">
                      {(() => {
                        // Find max daily value for relative color shading
                        let maxVal = 1
                        filteredRows.forEach(r => {
                          const days = [r.weekdayRhythm.mon, r.weekdayRhythm.tue, r.weekdayRhythm.wed, r.weekdayRhythm.thu, r.weekdayRhythm.fri]
                          days.forEach(d => {
                            const val = rhythmMetric === "talkTime" ? d.talkTime / 60 : (d as any)[rhythmMetric] || 0
                            if (val > maxVal) maxVal = val
                          })
                        })

                        return filteredRows.map(r => {
                          const renderDay = (dObj: typeof r.weekdayRhythm.mon) => {
                            const rawVal = (dObj as any)[rhythmMetric] || 0
                            const displayVal = rhythmMetric === "talkTime" ? formatMinutes(rawVal) : rawVal.toFixed(1)
                            const compVal = rhythmMetric === "talkTime" ? rawVal / 60 : rawVal
                            return (
                              <td className={`py-2 px-3 text-center ${getRhythmBg(compVal, maxVal)}`}>
                                <div className="text-[13px]">{displayVal}</div>
                                <div className="text-[9px] opacity-60 font-sans">{dObj.count}d sampled</div>
                              </td>
                            )
                          }

                          const totalVal = rhythmMetric === "talkTime" 
                            ? formatMinutes(r.talkTime) 
                            : rhythmMetric === "items" ? r.items 
                            : rhythmMetric === "quotes" ? r.quotes 
                            : r.outbound

                          return (
                            <tr key={r.id} className="group hover:bg-slate-50/80 transition-colors">
                              <td className="py-2 px-3 sticky left-0 z-20 bg-white group-hover:bg-slate-50 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)] font-bold text-slate-900 font-sans whitespace-nowrap">
                                <Link href={`/reports/agent/${r.id}`} className="text-blue-600 hover:underline">
                                  {r.name}
                                </Link>
                              </td>
                              <td className="py-2 px-2 text-center text-slate-500 font-sans">{r.office || "—"}</td>
                              <td className="py-2 px-2 text-center text-slate-500 font-sans border-r border-slate-200">{r.team || "—"}</td>
                              
                              {renderDay(r.weekdayRhythm.mon)}
                              {renderDay(r.weekdayRhythm.tue)}
                              {renderDay(r.weekdayRhythm.wed)}
                              {renderDay(r.weekdayRhythm.thu)}
                              {renderDay(r.weekdayRhythm.fri)}

                              <td className="py-2 px-3 text-center font-bold bg-slate-50 text-slate-900 border-l border-slate-200">
                                {totalVal}
                              </td>
                            </tr>
                          )
                        })
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── VIEW 3: EFFORT VS RESULTS QUADRANT ─────────────────────────────── */}
        {viewMode === "quadrant" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Top Right: Pacesetters */}
            <Card className="border-2 border-emerald-300 bg-emerald-50/30 shadow-sm">
              <CardHeader className="py-3 px-4 border-b border-emerald-100 bg-emerald-50/80 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-xs font-black text-emerald-950 uppercase tracking-wider flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-emerald-600" /> 🌟 Pacesetters (High Activity • High Output)
                  </CardTitle>
                  <p className="text-[11px] text-emerald-800 mt-0.5">Top agency performers exceeding activity and closing benchmarks</p>
                </div>
                <Badge variant="success" className="text-xs">
                  {filteredRows.filter(r => r.quadrant === "pacesetter").length} Agents
                </Badge>
              </CardHeader>
              <CardContent className="p-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {filteredRows.filter(r => r.quadrant === "pacesetter").map(r => (
                    <Link
                      key={r.id}
                      href={`/reports/agent/${r.id}`}
                      className="p-2.5 rounded-lg bg-white border border-emerald-200 hover:border-emerald-400 hover:shadow-sm transition-all block"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-900">{r.name}</span>
                        <span className="text-[10px] font-mono font-bold text-emerald-700">{r.items} Items</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono mt-1 pt-1 border-t border-slate-100">
                        <span>{r.outbound} Dials</span>
                        <span>{formatMinutes(r.talkTime)} Talk</span>
                        <span>{(r.closeRate * 100).toFixed(1)}% Close</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Top Left: Untapped Capacity */}
            <Card className="border-2 border-blue-300 bg-blue-50/30 shadow-sm">
              <CardHeader className="py-3 px-4 border-b border-blue-100 bg-blue-50/80 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-xs font-black text-blue-950 uppercase tracking-wider flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-blue-600" /> ⚡ High Conversion Upside (Lower Dials • High Output)
                  </CardTitle>
                  <p className="text-[11px] text-blue-800 mt-0.5">Natural closers with massive production upside if daily dials increase</p>
                </div>
                <Badge variant="default" className="text-xs bg-blue-600">
                  {filteredRows.filter(r => r.quadrant === "capacity").length} Agents
                </Badge>
              </CardHeader>
              <CardContent className="p-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {filteredRows.filter(r => r.quadrant === "capacity").map(r => (
                    <Link
                      key={r.id}
                      href={`/reports/agent/${r.id}`}
                      className="p-2.5 rounded-lg bg-white border border-blue-200 hover:border-blue-400 hover:shadow-sm transition-all block"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-900">{r.name}</span>
                        <span className="text-[10px] font-mono font-bold text-blue-700">{r.items} Items</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono mt-1 pt-1 border-t border-slate-100">
                        <span>{r.outbound} Dials</span>
                        <span>{formatMinutes(r.talkTime)} Talk</span>
                        <span>{(r.closeRate * 100).toFixed(1)}% Close</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Bottom Right: Coaching Focus */}
            <Card className="border-2 border-amber-300 bg-amber-50/30 shadow-sm">
              <CardHeader className="py-3 px-4 border-b border-amber-100 bg-amber-50/80 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-xs font-black text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
                    <Target className="w-4 h-4 text-amber-600" /> 🎯 Script & Closing Coaching (High Dials • Lower Output)
                  </CardTitle>
                  <p className="text-[11px] text-amber-800 mt-0.5">High work ethic and dial count; coaching on objections & close rate needed</p>
                </div>
                <Badge variant="warning" className="text-xs">
                  {filteredRows.filter(r => r.quadrant === "coaching").length} Agents
                </Badge>
              </CardHeader>
              <CardContent className="p-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {filteredRows.filter(r => r.quadrant === "coaching").map(r => (
                    <Link
                      key={r.id}
                      href={`/reports/agent/${r.id}`}
                      className="p-2.5 rounded-lg bg-white border border-amber-200 hover:border-amber-400 hover:shadow-sm transition-all block"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-900">{r.name}</span>
                        <span className="text-[10px] font-mono font-bold text-amber-700">{r.items} Items</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono mt-1 pt-1 border-t border-slate-100">
                        <span>{r.outbound} Dials</span>
                        <span>{formatMinutes(r.talkTime)} Talk</span>
                        <span>{(r.closeRate * 100).toFixed(1)}% Close</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Bottom Left: Underperforming */}
            <Card className="border-2 border-rose-300 bg-rose-50/30 shadow-sm">
              <CardHeader className="py-3 px-4 border-b border-rose-100 bg-rose-50/80 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-xs font-black text-rose-950 uppercase tracking-wider flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-rose-600" /> ⚠️ Intervention & Activity Reset (Low Dials • Low Output)
                  </CardTitle>
                  <p className="text-[11px] text-rose-800 mt-0.5">Trailing team baseline across both activity volume and sales results</p>
                </div>
                <Badge variant="danger" className="text-xs">
                  {filteredRows.filter(r => r.quadrant === "at_risk").length} Agents
                </Badge>
              </CardHeader>
              <CardContent className="p-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {filteredRows.filter(r => r.quadrant === "at_risk").map(r => (
                    <Link
                      key={r.id}
                      href={`/reports/agent/${r.id}`}
                      className="p-2.5 rounded-lg bg-white border border-rose-200 hover:border-rose-400 hover:shadow-sm transition-all block"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-900">{r.name}</span>
                        <span className="text-[10px] font-mono font-bold text-rose-700">{r.items} Items</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono mt-1 pt-1 border-t border-slate-100">
                        <span>{r.outbound} Dials</span>
                        <span>{formatMinutes(r.talkTime)} Talk</span>
                        <span>{(r.closeRate * 100).toFixed(1)}% Close</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>

          </div>
        )}

      </div>
    </PageGuard>
  )
}

