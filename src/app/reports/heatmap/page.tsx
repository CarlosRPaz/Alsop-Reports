"use client"

import { PageGuard } from "@/components/layout/PageGuard"
import { useState, useEffect, useMemo } from "react"
import { getHeatmapData } from "./actions"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card"
import { FilterBar, FilterState } from "@/components/ui/FilterBar"
import { TableSkeleton } from "@/components/ui/Skeleton"
import { BarChart3, TrendingUp, Flame, Calendar, Phone, Clock, FileText, Package, DollarSign, Percent } from "lucide-react"

// Helper to format talk time
function formatTime(seconds: number) {
  if (!seconds) return "0:00"
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// Helper to format date in local YYYY-MM-DD
function formatLocalDate(d: Date) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function AgentHeatmapPage() {
  const [datePreset, setDatePreset] = useState("this_month")
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  const [loading, setLoading] = useState(true)
  const [rawRows, setRawRows] = useState<any[]>([])
  const [filters, setFilters] = useState<FilterState>({ offices: [], teams: ["Sales"], agents: [], meetings: [] })

  // Define date ranges based on preset
  useEffect(() => {
    const today = new Date()
    let start = new Date()
    let end = new Date()

    if (datePreset === "yesterday") {
      const yesterday = new Date(today)
      yesterday.setDate(today.getDate() - 1)
      start = yesterday
      end = yesterday
    } else if (datePreset === "last_7_days") {
      start.setDate(today.getDate() - 7)
    } else if (datePreset === "this_month") {
      start = new Date(today.getFullYear(), today.getMonth(), 1)
    } else if (datePreset === "last_month") {
      start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      end = new Date(today.getFullYear(), today.getMonth(), 0)
    } else if (datePreset === "this_year") {
      start = new Date(today.getFullYear(), 0, 1)
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
      setRawRows(res.data)
    } else {
      setRawRows([])
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

  // Filter rows
  const filteredRows = useMemo(() => {
    return rawRows.filter(r => {
      if (filters.offices.length > 0 && !filters.offices.includes(r.office)) return false
      if (filters.teams.length > 0 && !filters.teams.includes(r.team)) return false
      return true
    })
  }, [rawRows, filters])

  // Calculate averages for color coding
  const averages = useMemo(() => {
    if (filteredRows.length === 0) {
      return { outbound: 0, talkTime: 0, quotes: 0, items: 0, premium: 0, closeRate: 0 }
    }
    let totalOutbound = 0, totalTalk = 0, totalQuotes = 0, totalItems = 0, totalPrem = 0, totalCR = 0
    let crCount = 0

    filteredRows.forEach(r => {
      totalOutbound += r.outbound || 0
      totalTalk += r.talkTime || 0
      totalQuotes += r.quotes || 0
      totalItems += r.items || 0
      totalPrem += r.premium || 0
      if (r.quotes > 0) {
        totalCR += r.closeRate || 0
        crCount++
      }
    })

    const count = filteredRows.length
    return {
      outbound: totalOutbound / count,
      talkTime: totalTalk / count,
      quotes: totalQuotes / count,
      items: totalItems / count,
      premium: totalPrem / count,
      closeRate: crCount > 0 ? totalCR / crCount : 0
    }
  }, [filteredRows])

  // Helper for background styling
  const getCellBgClass = (val: number, avg: number) => {
    if (!val || val === 0) return "bg-slate-50/50 text-slate-400 font-normal dark:bg-slate-900/10"
    if (avg === 0) return "bg-white text-slate-700 dark:bg-slate-800 dark:text-slate-350"

    const ratio = val / avg
    if (ratio >= 1.3) {
      return "bg-heatmap-excellent font-bold"
    }
    if (ratio >= 1.0) {
      return "bg-heatmap-above font-semibold"
    }
    if (ratio >= 0.7) {
      return "bg-heatmap-below font-semibold"
    }
    return "bg-heatmap-critical font-bold"
  }

  return (
    <PageGuard pageKey="heatmap">
      <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
              <Flame className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Agent Performance Heatmap</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">At-a-glance hotspots ranking active agents against team averages.</p>
            </div>
          </div>

          {/* Date Selector */}
          <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-slate-900 p-2 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs outline-none text-slate-700 dark:text-slate-300"
            >
              <option value="yesterday">Yesterday</option>
              <option value="last_7_days">Last 7 Days</option>
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="this_year">This Year</option>
              <option value="custom">Custom Range</option>
            </select>

            {datePreset === "custom" && (
              <div className="flex items-center gap-2 pl-2 border-l border-slate-100 dark:border-slate-800">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="px-2 py-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-xs text-slate-700 dark:text-slate-300"
                />
                <span className="text-xs text-slate-400">—</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="px-2 py-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-xs text-slate-700 dark:text-slate-300"
                />
                <button
                  onClick={handleApplyCustomDates}
                  className="px-2.5 py-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded transition-colors"
                >
                  Apply
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Filters */}
        <FilterBar 
          onFilterChange={setFilters} 
          initialFilters={filters}
          enforceTeamSelection={true}
        />

        {/* Legend */}
        <div className="flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3 rounded-xl shadow-sm text-xs font-semibold text-slate-500">
          <span>Heatmap Scale:</span>
          <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-heatmap-excellent border border-emerald-500/20" /> Excellent (≥ 130% Avg)</span>
          <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-heatmap-above border border-emerald-400/20" /> Above Avg (100-130%)</span>
          <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-heatmap-below border border-rose-400/20" /> Below Avg (70-100%)</span>
          <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-heatmap-critical border border-rose-500/20" /> Critical (&lt; 70% Avg)</span>
        </div>

        {/* Heatmap Grid Card */}
        <Card className="overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900">
          <CardHeader className="pb-2 border-b border-slate-100 dark:border-slate-800">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-500" /> Active Performance Hotspots
            </CardTitle>
            <CardDescription>Grid rows display agent metrics compared directly to current filtered team averages.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6">
                <TableSkeleton rows={10} cols={9} />
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400 italic">
                No performance data found for the selected filter and dates.
              </div>
            ) : (
              <div className="overflow-x-auto dsr-scrollbar">
                <table className="w-full text-left border-collapse min-w-[900px]">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-950/50 border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider select-none">
                      <th className="py-3.5 px-4 font-bold text-slate-500 w-[180px]">Agent</th>
                      <th className="py-3.5 px-4 font-bold text-slate-500 w-[100px]">Office</th>
                      <th className="py-3.5 px-4 font-bold text-slate-500 w-[90px]">Team</th>
                      <th className="py-3.5 px-4 text-center font-bold text-slate-500 w-[120px]"><span className="flex items-center justify-center gap-1"><Phone className="w-3.5 h-3.5" /> Outbound Calls</span></th>
                      <th className="py-3.5 px-4 text-center font-bold text-slate-500 w-[110px]"><span className="flex items-center justify-center gap-1"><Clock className="w-3.5 h-3.5" /> Talk Time</span></th>
                      <th className="py-3.5 px-4 text-center font-bold text-slate-500 w-[100px]"><span className="flex items-center justify-center gap-1"><FileText className="w-3.5 h-3.5" /> Quotes</span></th>
                      <th className="py-3.5 px-4 text-center font-bold text-slate-500 w-[90px]"><span className="flex items-center justify-center gap-1"><Package className="w-3.5 h-3.5" /> Items</span></th>
                      <th className="py-3.5 px-4 text-center font-bold text-slate-500 w-[130px]"><span className="flex items-center justify-center gap-1"><DollarSign className="w-3.5 h-3.5" /> Written Prem</span></th>
                      <th className="py-3.5 px-4 text-center font-bold text-slate-500 w-[100px]"><span className="flex items-center justify-center gap-1"><Percent className="w-3.5 h-3.5" /> Close Rate</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm font-medium">
                    {/* Averages Row */}
                    <tr className="bg-slate-50/70 dark:bg-slate-900/50 text-slate-700 dark:text-slate-350 border-b border-slate-200 dark:border-slate-800 font-bold select-none text-[11px] uppercase tracking-wider">
                      <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-200">🔥 Current Average</td>
                      <td className="py-3 px-4">—</td>
                      <td className="py-3 px-4">—</td>
                      <td className="py-3 px-4 text-center font-mono">{Math.round(averages.outbound).toLocaleString()}</td>
                      <td className="py-3 px-4 text-center font-mono">{formatTime(averages.talkTime)}</td>
                      <td className="py-3 px-4 text-center font-mono">{Math.round(averages.quotes).toLocaleString()}</td>
                      <td className="py-3 px-4 text-center font-mono">{Math.round(averages.items).toLocaleString()}</td>
                      <td className="py-3 px-4 text-center font-mono">${Math.round(averages.premium).toLocaleString()}</td>
                      <td className="py-3 px-4 text-center font-mono">{(averages.closeRate * 100).toFixed(1)}%</td>
                    </tr>

                    {/* Agent Rows */}
                    {filteredRows.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20 text-slate-700 dark:text-slate-300">
                        <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">{r.name}</td>
                        <td className="py-3 px-4 text-slate-500 text-xs">{r.office}</td>
                        <td className="py-3 px-4 text-slate-500 text-xs">{r.team}</td>
                        <td className={`py-3 px-4 text-center font-mono ${getCellBgClass(r.outbound, averages.outbound)}`}>
                          {r.outbound.toLocaleString()}
                        </td>
                        <td className={`py-3 px-4 text-center font-mono ${getCellBgClass(r.talkTime, averages.talkTime)}`}>
                          {formatTime(r.talkTime)}
                        </td>
                        <td className={`py-3 px-4 text-center font-mono ${getCellBgClass(r.quotes, averages.quotes)}`}>
                          {r.quotes.toLocaleString()}
                        </td>
                        <td className={`py-3 px-4 text-center font-mono ${getCellBgClass(r.items, averages.items)}`}>
                          {r.items.toLocaleString()}
                        </td>
                        <td className={`py-3 px-4 text-center font-mono ${getCellBgClass(r.premium, averages.premium)}`}>
                          ${Math.round(r.premium).toLocaleString()}
                        </td>
                        <td className={`py-3 px-4 text-center font-mono ${getCellBgClass(r.closeRate, averages.closeRate)}`}>
                          {(r.closeRate * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageGuard>
  )
}
