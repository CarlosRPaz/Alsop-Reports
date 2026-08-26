"use client"

import { PageGuard } from "@/components/layout/PageGuard";
import { useState, useEffect, useMemo } from "react"
import { getQuotesData, getDailyBreakdown, getDuplicateQuotes, getYTDBreakdown, ViewMode, QuotesAgentRow, QuotesDataResult, DuplicateGroup, YTDAgentRawPoint, DailyBreakdownData } from "./actions"
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, LabelList, ReferenceArea, ReferenceLine
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { FilterBar, FilterState } from "@/components/ui/FilterBar"
import {
  FileBarChart, TrendingUp, Target, Calendar, ChevronDown,
  ArrowUpDown, ArrowUp, ArrowDown, Users, Building2, BarChart3,
  CalendarCheck, Package, AlertTriangle, Copy, X, Eye, Check,
  XCircle, Search, Info
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
  if (cr >= 0.15) return "text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/30"
  return "text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/30"
}

function cardCrColorClass(cr: number): string {
  if (cr >= 0.15) return "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/30 dark:border-emerald-800"
  return "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/30 dark:border-amber-800"
}

type SortField = "name" | "nb" | "items" | "quotes" | "cr" | "monthly" | "dailyGoal" | "benchmark" | "dailyActual"
type SortDir = "asc" | "desc"

// ── Computed row type ──
interface ComputedRow extends QuotesAgentRow {
  close_rate: number
  monthly_target: number
  daily_goal: number
  benchmark_15: number
  daily_actual: number
}

// ── Custom Tooltip for Recharts ──
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const quotes = payload.find((p: any) => p.dataKey === "quotes")?.value
    const nb = payload.find((p: any) => p.dataKey === "nb")?.value
    const items = payload.find((p: any) => p.dataKey === "items")?.value
    const cumulativeItems = payload.find((p: any) => p.dataKey === "cumulativeItems")?.value
    const cr = payload.find((p: any) => p.dataKey === "closeRate")?.value

    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 shadow-lg text-xs min-w-[170px] z-50">
        <div className="font-bold text-slate-700 dark:text-slate-300 mb-2 border-b border-slate-100 dark:border-slate-700 pb-1">
          {label}
        </div>
        <div className="space-y-1.5 font-medium">
          {quotes !== undefined && (
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-slate-500">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                Quotes:
              </span>
              <span className="text-slate-800 dark:text-slate-200 font-semibold">{quotes.toLocaleString()}</span>
            </div>
          )}
          {nb !== undefined && (
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-slate-500">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                NB Policies:
              </span>
              <span className="text-slate-800 dark:text-slate-200 font-semibold">{nb.toLocaleString()}</span>
            </div>
          )}
          {items !== undefined && (
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-slate-500">
                <span className="w-2 h-2 rounded-full bg-violet-500" />
                Auto Items:
              </span>
              <span className="text-slate-800 dark:text-slate-200 font-semibold">{items.toLocaleString()}</span>
            </div>
          )}
          {cumulativeItems !== undefined && (
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-slate-500">
                <span className="w-2 h-2 rounded-full bg-pink-500" />
                Cum. Items:
              </span>
              <span className="text-slate-800 dark:text-slate-200 font-semibold">{cumulativeItems.toLocaleString()}</span>
            </div>
          )}
          {cr !== undefined && (
            <div className="flex items-center justify-between gap-4 pt-1.5 mt-1 border-t border-slate-100 dark:border-slate-700 font-semibold">
              <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                Close Rate:
              </span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] ${cr >= 15 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'}`}>
                {Number(cr).toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      </div>
    )
  }
  return null
}

export default function QuotesPage() {
  // ── State ──
  const [mode, setMode] = useState<ViewMode>("monthly")
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [data, setData] = useState<QuotesDataResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<FilterState>({ offices: [], teams: [], agents: [], meetings: [] })
  const [sortField, setSortField] = useState<SortField>("nb")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [rawDailyData, setRawDailyData] = useState<DailyBreakdownData | null>(null)
  const [showDupes, setShowDupes] = useState(false)
  const [dupeGroups, setDupeGroups] = useState<DuplicateGroup[]>([])
  const [dupeTotal, setDupeTotal] = useState(0)
  const [dupeLoading, setDupeLoading] = useState(false)
  const [dupeSearch, setDupeSearch] = useState("")
  const [rawYtdData, setRawYtdData] = useState<YTDAgentRawPoint[]>([])
  const [ytdGroupBy, setYtdGroupBy] = useState<"weekly" | "monthly">("monthly")
  const [highlightedLines, setHighlightedLines] = useState<Set<string>>(new Set())
  const [isMounted, setIsMounted] = useState(false)
  const [showKpiDefs, setShowKpiDefs] = useState(false)

  // ── Lookup map + Memoized dynamic charts ──
  const agentMetadataMap = useMemo(() => {
    const map = new Map<string, { name: string; team: string | null; office: string | null; report_visible: boolean; active: boolean }>()
    if (data?.allAgents) {
      data.allAgents.forEach(a => {
        map.set(a.id, { name: a.name, team: a.team, office: a.office, report_visible: a.report_visible ?? true, active: a.active ?? true })
      })
    }
    return map
  }, [data])

  const isAgentMatchingFilters = useMemo(() => {
    return (agentId: string) => {
      const meta = agentMetadataMap.get(agentId)
      if (!meta) return false

      if (filters.offices.length > 0) {
        const officeMap: Record<string, string> = {
          "Montclair": "MCM", "Montebello": "MB",
          "Rancho Cucamonga": "RC", "Chino": "CH", "Claremont": "CH"
        }
        const abbr = officeMap[meta.office || ""] || meta.office || ""
        if (!filters.offices.includes(abbr) && !filters.offices.includes(meta.office || "")) return false
      }
      if (filters.teams.length > 0) {
        const teamMap: Record<string, string> = {
          "Sales": "Sales", "Service": "CSR", "EA": "EA", "Manager": "Managers"
        }
        const mapped = teamMap[meta.team || ""] || meta.team || ""
        if (!filters.teams.includes(mapped) && !filters.teams.includes(meta.team || "")) return false
      }
      if (filters.agents.length > 0 && !filters.agents.includes(meta.name)) return false

      return true
    }
  }, [filters, agentMetadataMap])

  const chartData = useMemo(() => {
    if (!rawDailyData) return []

    // Filter raw daily metrics
    const filteredMetrics = rawDailyData.metrics.filter(m => isAgentMatchingFilters(m.agent_id))

    // Aggregate by date
    const byDate: Record<string, { quotes: number; nb: number; items: number }> = {}
    filteredMetrics.forEach(m => {
      if (!byDate[m.date]) byDate[m.date] = { quotes: 0, nb: 0, items: 0 }
      byDate[m.date].quotes += m.quotes
      byDate[m.date].nb += m.nb
      byDate[m.date].items += m.items
    })

    // Map date metadata to final breakdown points with cumulative running total
    let cumulativeItems = 0
    return rawDailyData.dates.map(d => {
      const vals = byDate[d.date] || { quotes: 0, nb: 0, items: 0 }
      cumulativeItems += vals.items
      return {
        date: d.date,
        dayLabel: d.dayLabel,
        quotes: vals.quotes,
        nb: vals.nb,
        items: vals.items,
        cumulativeItems,
        closeRate: vals.quotes > 0 ? Math.round((vals.nb / vals.quotes) * 10000) / 100 : 0,
        isBusinessDay: d.isBusinessDay,
        dayOfWeek: d.dayOfWeek,
      }
    })
  }, [rawDailyData, isAgentMatchingFilters])

  const ytdChartData = useMemo(() => {
    if (!rawYtdData || rawYtdData.length === 0) return []

    // Filter raw YTD metrics
    const filteredMetrics = rawYtdData.filter(m => isAgentMatchingFilters(m.agent_id))

    // Group and aggregate by sortKey/label
    const byBucket: Record<string, { label: string; quotes: number; nb: number; items: number }> = {}
    filteredMetrics.forEach(m => {
      if (!byBucket[m.sortKey]) {
        byBucket[m.sortKey] = { label: m.label, quotes: 0, nb: 0, items: 0 }
      }
      byBucket[m.sortKey].quotes += m.quotes
      byBucket[m.sortKey].nb += m.nb
      byBucket[m.sortKey].items += m.items
    })

    // Convert back to sorted list
    return Object.entries(byBucket)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([sortKey, vals]) => ({
        label: vals.label,
        sortKey,
        quotes: vals.quotes,
        nb: vals.nb,
        items: vals.items,
        closeRate: vals.quotes > 0 ? Math.round((vals.nb / vals.quotes) * 10000) / 100 : 0,
      }))
  }, [rawYtdData, isAgentMatchingFilters])

  // ── Helper to resolve agent from sub producer string ──
  const resolveAgentFromSubProducer = useMemo(() => {
    return (subProducer: string) => {
      let cleanName = subProducer.trim()
      if (cleanName.includes("-")) {
        const parts = cleanName.split("-")
        cleanName = parts.slice(1).join("-").trim() || parts[0].trim()
      }
      const lowerName = cleanName.toLowerCase()
      if (data?.allAgents) {
        let match = data.allAgents.find(a => a.name.toLowerCase() === lowerName)
        if (match) return match
        match = data.allAgents.find(a => a.name.toLowerCase().includes(lowerName) || lowerName.includes(a.name.toLowerCase()))
        if (match) return match
      }
      return null
    }
  }, [data])

  const isGroupMatchingFilters = useMemo(() => {
    return (subProducer: string) => {
      const agent = resolveAgentFromSubProducer(subProducer)
      if (!agent) {
        return filters.offices.length === 0 && filters.teams.length === 0 && filters.agents.length === 0
      }

      if (filters.offices.length > 0) {
        const officeMap: Record<string, string> = {
          "Montclair": "MCM", "Montebello": "MB",
          "Rancho Cucamonga": "RC", "Chino": "CH", "Claremont": "CH"
        }
        const abbr = officeMap[agent.office || ""] || agent.office || ""
        if (!filters.offices.includes(abbr) && !filters.offices.includes(agent.office || "")) return false
      }
      if (filters.teams.length > 0) {
        const teamMap: Record<string, string> = {
          "Sales": "Sales", "Service": "CSR", "EA": "EA", "Manager": "Managers"
        }
        const mapped = teamMap[agent.team || ""] || agent.team || ""
        if (!filters.teams.includes(mapped) && !filters.teams.includes(agent.team || "")) return false
      }
      if (filters.agents.length > 0 && !filters.agents.includes(agent.name)) return false

      return true
    }
  }, [filters, resolveAgentFromSubProducer])

  const filteredDupeGroups = useMemo(() => {
    return dupeGroups.filter(group => {
      if (!isGroupMatchingFilters(group.kept.sub_producer)) return false
      if (!dupeSearch) return true
      const s = dupeSearch.toLowerCase()
      return (
        group.kept.first_name.toLowerCase().includes(s) ||
        group.kept.last_name.toLowerCase().includes(s) ||
        group.kept.address.toLowerCase().includes(s) ||
        group.kept.sub_producer.toLowerCase().includes(s)
      )
    })
  }, [dupeGroups, dupeSearch, isGroupMatchingFilters])

  const filteredDupeTotal = useMemo(() => {
    return filteredDupeGroups.reduce((sum, g) => sum + g.removed.length, 0)
  }, [filteredDupeGroups])

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Toggle a line in the highlight set (multi-select)
  const toggleLine = (dataKey: string) => {
    setHighlightedLines(prev => {
      const next = new Set(prev)
      if (next.has(dataKey)) {
        next.delete(dataKey)
      } else {
        next.add(dataKey)
      }
      return next
    })
  }

  // Get opacity for a line based on highlight state
  const lineOpacity = (dataKey: string) => {
    if (highlightedLines.size === 0) return 1 // nothing selected = all visible
    return highlightedLines.has(dataKey) ? 1 : 0.1
  }
  const lineWidth = (dataKey: string) => {
    if (highlightedLines.size === 0) return 2.5
    return highlightedLines.has(dataKey) ? 3 : 1.5
  }

  // ── Derived: is the selected month the current month? ──
  const isCurrentMonth = selectedYear === new Date().getFullYear() && selectedMonth === new Date().getMonth() + 1

  // ── Fetch Data ──
  useEffect(() => {
    async function load() {
      setLoading(true)
      const month = mode === "ytd" ? undefined : selectedMonth
      const res = await getQuotesData(mode, selectedYear, month)
      if (res.success && res.data) {
        // Auto-fallback: if current month has no data, show previous month
        if (mode === "monthly" && isCurrentMonth && res.data.agents.length === 0) {
          const prevDate = new Date(selectedYear, selectedMonth - 2, 1)
          const fallbackRes = await getQuotesData("monthly", prevDate.getFullYear(), prevDate.getMonth() + 1)
          if (fallbackRes.success && fallbackRes.data && fallbackRes.data.agents.length > 0) {
            setSelectedYear(prevDate.getFullYear())
            setSelectedMonth(prevDate.getMonth() + 1)
            setLoading(false)
            return // the state change will re-trigger this effect
          }
        }

        setData(res.data)

        // Fetch daily breakdown for chart (Monthly only)
        if (mode !== "ytd") {
          const yesterday = new Date()
          yesterday.setDate(yesterday.getDate() - 1)
          const yesterdayStr = yesterday.toISOString().split("T")[0]
          const chartEnd = res.data.dateRangeEnd <= yesterdayStr ? res.data.dateRangeEnd : yesterdayStr
          const chartRes = await getDailyBreakdown(res.data.dateRangeStart, chartEnd)
          if (chartRes.success && chartRes.data) {
            setRawDailyData(chartRes.data)
          }
          setRawYtdData([])
        } else {
          setRawDailyData(null)
          // Fetch YTD aggregated data
          const ytdRes = await getYTDBreakdown(selectedYear, ytdGroupBy)
          if (ytdRes.success && ytdRes.data) {
            setRawYtdData(ytdRes.data)
          }
        }
      }
      setLoading(false)
    }
    load()
  }, [mode, selectedYear, selectedMonth, ytdGroupBy])

  // ── Filtered + Computed Rows ──
  const computedRows: ComputedRow[] = useMemo(() => {
    if (!data) return []

    const bizTotal = data.businessDaysTotal
    const bizPassed = data.businessDaysPassed
    const benchmark = bizTotal > 0 ? POLICIES_NEEDED / BENCHMARK_CR / bizTotal : 0

    return data.agents
      .filter(a => {
        // Exclude Managers and Support from individual breakdown table
        if (a.team === "Managers" || a.team === "Support") return false
        // Exclude on-leave and archived agents
        if (a.report_visible === false || a.active === false) return false

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
    const rows = computedRows.filter(r => r.report_visible && r.active && r.team !== "Managers" && r.team !== "Support")
    const dir = sortDir === "asc" ? 1 : -1

    rows.sort((a, b) => {
      let va: number | string = 0, vb: number | string = 0
      switch (sortField) {
        case "name": va = a.name.toLowerCase(); vb = b.name.toLowerCase(); break
        case "nb": va = a.nb_policies; vb = b.nb_policies; break
        case "items": va = a.items; vb = b.items; break
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

  // ── Agency (Unfiltered) Totals — includes hidden agents ──
  const agencyTotals = useMemo(() => {
    if (!data) return { totalNB: 0, totalQuotes: 0, totalItems: 0, cr: 0 }
    // Use server-provided totals that include ALL agents (even non-visible ones)
    const totalNB = data.agencyTotals?.totalNB ?? data.agents.reduce((s, r) => s + r.nb_policies, 0)
    const totalQuotes = data.agencyTotals?.totalQuotes ?? data.agents.reduce((s, r) => s + r.quote_count, 0)
    const totalItems = data.agencyTotals?.totalItems ?? data.mtdItems
    const cr = pct(totalNB, totalQuotes)
    return { totalNB, totalQuotes, totalItems, cr }
  }, [data])

  // ── Totals (filtered view or agency-wide when no filters) ──
  const totals = useMemo(() => {
    const noFilters = filters.offices.length === 0 && filters.teams.length === 0 && filters.agents.length === 0
    
    // When no filters, use agency-wide totals (includes hidden agents)
    const totalNB = noFilters ? agencyTotals.totalNB : computedRows.reduce((s, r) => s + r.nb_policies, 0)
    const totalQuotes = noFilters ? agencyTotals.totalQuotes : computedRows.reduce((s, r) => s + r.quote_count, 0)
    const totalItems = noFilters ? agencyTotals.totalItems : computedRows.reduce((s, r) => s + r.items, 0)
    const cr = pct(totalNB, totalQuotes)
    const bizTotal = data?.businessDaysTotal || 0
    const bizPassed = data?.businessDaysPassed || 0
    const monthlyTarget = cr > 0 ? POLICIES_NEEDED / cr : 0
    const dailyGoal = bizTotal > 0 ? monthlyTarget / bizTotal : 0
    const benchmark = bizTotal > 0 ? POLICIES_NEEDED / BENCHMARK_CR / bizTotal : 0
    const dailyActual = bizPassed > 0 ? totalQuotes / bizPassed : 0

    return { totalNB, totalQuotes, totalItems, cr, monthlyTarget, dailyGoal, benchmark, dailyActual }
  }, [computedRows, data, agencyTotals, filters])

  const filteredItemsCount = useMemo(() => {
    const noFilters = filters.offices.length === 0 && filters.teams.length === 0 && filters.agents.length === 0
    if (noFilters) return data?.mtdItems || 0
    return totals.totalItems
  }, [totals.totalItems, filters, data])

  // ── Group summaries (Team & Office) ──
  const { teamSummary, otherTeamStats } = useMemo(() => {
    const teamMap: Record<string, string> = {
      "Sales": "Sales", "Service": "CSR", "EA": "EA", "Manager": "Managers"
    }
    const groups: Record<string, { nb: number; quotes: number; items: number }> = {
      "Sales": { nb: 0, quotes: 0, items: 0 },
      "CSR": { nb: 0, quotes: 0, items: 0 },
      "EA": { nb: 0, quotes: 0, items: 0 }
    }
    let otherNB = 0
    let otherQuotes = 0
    let otherItems = 0

    if (data?.agents) {
      data.agents.forEach(a => {
        // Apply office and agent filters, but ignore team filter
        if (filters.offices.length > 0) {
          const officeMap: Record<string, string> = {
            "Montclair": "MCM", "Montebello": "MB",
            "Rancho Cucamonga": "RC", "Chino": "CH", "Claremont": "CH"
          }
          const abbr = officeMap[a.office || ""] || a.office || ""
          if (!filters.offices.includes(abbr) && !filters.offices.includes(a.office || "")) return
        }
        if (filters.agents.length > 0 && !filters.agents.includes(a.name)) return

        const mappedTeam = teamMap[a.team || ""] || a.team || "N/A"
        if (mappedTeam === "N/A" || mappedTeam === "Managers" || mappedTeam === "Support" || mappedTeam === "System") {
          otherNB += a.nb_policies
          otherQuotes += a.quote_count
          otherItems += a.items
          return
        }

        if (!groups[mappedTeam]) {
          groups[mappedTeam] = { nb: 0, quotes: 0, items: 0 }
        }
        groups[mappedTeam].nb += a.nb_policies
        groups[mappedTeam].quotes += a.quote_count
        groups[mappedTeam].items += a.items
      })
    }

    const summaryList = Object.entries(groups)
      .map(([team, v]) => ({ team, cr: pct(v.nb, v.quotes), nb: v.nb, quotes: v.quotes, items: v.items }))
      .sort((a, b) => b.cr - a.cr)

    return {
      teamSummary: summaryList,
      otherTeamStats: { nb: otherNB, quotes: otherQuotes, items: otherItems }
    }
  }, [data, filters.offices, filters.agents])

  const { officeSummary, otherOfficeStats } = useMemo(() => {
    const officeMap: Record<string, string> = {
      "Montclair": "MCM", "Montebello": "MB",
      "Rancho Cucamonga": "RC", "Chino": "CH", "Claremont": "CH"
    }
    const groups: Record<string, { nb: number; quotes: number; items: number }> = {
      "MCM": { nb: 0, quotes: 0, items: 0 },
      "MB": { nb: 0, quotes: 0, items: 0 },
      "RC": { nb: 0, quotes: 0, items: 0 },
      "CH": { nb: 0, quotes: 0, items: 0 }
    }
    let otherNB = 0
    let otherQuotes = 0
    let otherItems = 0

    if (data?.agents) {
      data.agents.forEach(a => {
        // Apply team and agent filters, but ignore office filter
        if (filters.teams.length > 0) {
          const teamMap: Record<string, string> = {
            "Sales": "Sales", "Service": "CSR", "EA": "EA", "Manager": "Managers"
          }
          const mapped = teamMap[a.team || ""] || a.team || ""
          if (!filters.teams.includes(mapped) && !filters.teams.includes(a.team || "")) return
        }
        if (filters.agents.length > 0 && !filters.agents.includes(a.name)) return

        const mappedOffice = officeMap[a.office || ""] || a.office || "N/A"
        if (mappedOffice === "N/A" || mappedOffice === "System") {
          otherNB += a.nb_policies
          otherQuotes += a.quote_count
          otherItems += a.items
          return
        }

        if (!groups[mappedOffice]) {
          groups[mappedOffice] = { nb: 0, quotes: 0, items: 0 }
        }
        groups[mappedOffice].nb += a.nb_policies
        groups[mappedOffice].quotes += a.quote_count
        groups[mappedOffice].items += a.items
      })
    }

    const summaryList = Object.entries(groups)
      .map(([office, v]) => ({ office, cr: pct(v.nb, v.quotes), nb: v.nb, quotes: v.quotes, items: v.items }))
      .sort((a, b) => b.cr - a.cr)

    return {
      officeSummary: summaryList,
      otherOfficeStats: { nb: otherNB, quotes: otherQuotes, items: otherItems }
    }
  }, [data, filters.teams, filters.agents])

  const teamTotal = useMemo(() => {
    const nb = teamSummary.reduce((sum, t) => sum + t.nb, 0) + otherTeamStats.nb
    const quotes = teamSummary.reduce((sum, t) => sum + t.quotes, 0) + otherTeamStats.quotes
    const items = teamSummary.reduce((sum, t) => sum + t.items, 0) + otherTeamStats.items
    const cr = quotes > 0 ? nb / quotes : 0
    return { nb, quotes, items, cr }
  }, [teamSummary, otherTeamStats])

  const officeTotal = useMemo(() => {
    const nb = officeSummary.reduce((sum, o) => sum + o.nb, 0) + otherOfficeStats.nb
    const quotes = officeSummary.reduce((sum, o) => sum + o.quotes, 0) + otherOfficeStats.quotes
    const items = officeSummary.reduce((sum, o) => sum + o.items, 0) + otherOfficeStats.items
    const cr = quotes > 0 ? nb / quotes : 0
    return { nb, quotes, items, cr }
  }, [officeSummary, otherOfficeStats])

  // ── Monthly CR Breakdown by Team & Office (for YTD view) ──
  const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

  const monthlyCrBreakdown = useMemo(() => {
    if (!rawYtdData || rawYtdData.length === 0 || !agentMetadataMap) {
      return { teams: [] as { name: string; ytdCr: number; months: { label: string; cr: number; nb: number; quotes: number }[] }[],
               offices: [] as { name: string; ytdCr: number; months: { label: string; cr: number; nb: number; quotes: number }[] }[],
               monthLabels: [] as string[] }
    }

    // Only use monthly-grouped data
    // Each rawYtdData point has agent_id, label ("Jan","Feb",...), sortKey ("2026-01",...), quotes, nb, items
    type Bucket = { nb: number; quotes: number }
    const teamByMonth: Record<string, Record<string, Bucket>> = {}
    const officeByMonth: Record<string, Record<string, Bucket>> = {}
    const teamYtd: Record<string, Bucket> = {}
    const officeYtd: Record<string, Bucket> = {}
    const allMonthKeys = new Set<string>()

    for (const point of rawYtdData) {
      const meta = agentMetadataMap.get(point.agent_id)
      if (!meta) continue
      const team = meta.team || "N/A"
      const office = meta.office || "N/A"
      if (team === "N/A" && office === "N/A") continue

      // Determine month label from sortKey (e.g., "2026-01" → "Jan")
      const monthIdx = parseInt(point.sortKey.split("-")[1]) - 1
      const monthLabel = MONTH_SHORT[monthIdx]
      if (!monthLabel) continue
      allMonthKeys.add(point.sortKey)

      // Team
      if (team !== "N/A" && team !== "System" && team !== "Managers" && team !== "Support") {
        if (!teamByMonth[team]) teamByMonth[team] = {}
        if (!teamByMonth[team][monthLabel]) teamByMonth[team][monthLabel] = { nb: 0, quotes: 0 }
        teamByMonth[team][monthLabel].nb += point.nb
        teamByMonth[team][monthLabel].quotes += point.quotes
        if (!teamYtd[team]) teamYtd[team] = { nb: 0, quotes: 0 }
        teamYtd[team].nb += point.nb
        teamYtd[team].quotes += point.quotes
      }

      // Office
      if (office !== "N/A" && office !== "System") {
        if (!officeByMonth[office]) officeByMonth[office] = {}
        if (!officeByMonth[office][monthLabel]) officeByMonth[office][monthLabel] = { nb: 0, quotes: 0 }
        officeByMonth[office][monthLabel].nb += point.nb
        officeByMonth[office][monthLabel].quotes += point.quotes
        if (!officeYtd[office]) officeYtd[office] = { nb: 0, quotes: 0 }
        officeYtd[office].nb += point.nb
        officeYtd[office].quotes += point.quotes
      }
    }

    // Build ordered month labels from sortKeys
    const sortedMonthKeys = [...allMonthKeys].sort()
    const monthLabels = sortedMonthKeys.map(k => MONTH_SHORT[parseInt(k.split("-")[1]) - 1])

    const buildRows = (
      byMonth: Record<string, Record<string, Bucket>>,
      ytdTotals: Record<string, Bucket>
    ) => {
      return Object.keys(byMonth)
        .sort()
        .map(name => {
          const ytd = ytdTotals[name] || { nb: 0, quotes: 0 }
          const ytdCr = pct(ytd.nb, ytd.quotes)
          const months = monthLabels.map(ml => {
            const b = byMonth[name]?.[ml] || { nb: 0, quotes: 0 }
            return { label: ml, cr: pct(b.nb, b.quotes), nb: b.nb, quotes: b.quotes }
          })
          return { name, ytdCr, months }
        })
    }

    return {
      teams: buildRows(teamByMonth, teamYtd),
      offices: buildRows(officeByMonth, officeYtd),
      monthLabels,
    }
  }, [rawYtdData, agentMetadataMap])

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

  const availableAgents = useMemo(() =>
    data?.agents.filter(a => a.report_visible && a.active && a.team !== "Managers" && a.team !== "Support").map(a => a.name).sort() || [], [data])

  const isStale = useMemo(() => {
    if (!data) return false
    const start = new Date(data.lastDataDate + "T00:00:00")
    const end = new Date(data.dateRangeEnd + "T00:00:00")
    let bizDaysBetween = 0
    const cursor = new Date(start)
    const holidaySet = new Set((data.holidays || []).map((h: any) => h.holiday_date))
    while (cursor <= end) {
      const dateStr = cursor.toISOString().split("T")[0]
      const day = cursor.getDay()
      const isWeekend = day === 0 || day === 6
      if (!isWeekend && !holidaySet.has(dateStr)) {
        bizDaysBetween++
      }
      cursor.setDate(cursor.getDate() + 1)
    }
    return bizDaysBetween >= 3
  }, [data])

  const bizDaysInYear = useMemo(() => {
    if (!data) return 0
    const start = new Date(`${selectedYear}-01-01T00:00:00`)
    const end = new Date(`${selectedYear}-12-31T00:00:00`)
    const holidaySet = new Set((data.holidays || []).map((h: any) => h.holiday_date))
    let count = 0
    const cursor = new Date(start)
    while (cursor <= end) {
      const dateStr = cursor.toISOString().split("T")[0]
      const day = cursor.getDay()
      if (day !== 0 && day !== 6 && !holidaySet.has(dateStr)) {
        count++
      }
      cursor.setDate(cursor.getDate() + 1)
    }
    return count
  }, [data, selectedYear])

  const getFiltersLabel = () => {
    const parts: string[] = []
    if (filters.offices.length > 0) parts.push(`Offices: ${filters.offices.join(", ")}`)
    if (filters.teams.length > 0) parts.push(`Teams: ${filters.teams.join(", ")}`)
    if (filters.agents.length > 0) parts.push(`Agents: ${filters.agents.length} selected`)
    return parts.join(" · ")
  }

  return (
    <PageGuard pageKey="quotes">
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
        <button
          onClick={async () => {
            setShowDupes(true)
            setDupeLoading(true)
            const dupeMonth = mode === "ytd" ? 0 : selectedMonth
            const res = await getDuplicateQuotes(selectedYear, dupeMonth)
            if (res.success && res.data) {
              setDupeGroups(res.data)
              setDupeTotal(res.totalRemoved || 0)
            }
            setDupeLoading(false)
          }}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 transition-all shadow-sm"
        >
          <Copy className="w-4 h-4" />
          View Dupes {data && `(${data.rawQuotesTotal - data.agencyTotals.totalQuotes} flagged)`}
        </button>
      </div>

      {/* ── Period Selector (YTD vs Monthly) ── */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-inner">
          <button
            onClick={() => setMode("monthly")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              mode === "monthly"
                ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-md border border-slate-200 dark:border-slate-600"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            Monthly View
          </button>
          <button
            onClick={() => setMode("ytd")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              mode === "ytd"
                ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-md border border-slate-200 dark:border-slate-600"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            YTD View
          </button>
        </div>

        {/* Monthly month/year pickers */}
        {mode === "monthly" && (
          <div className="flex gap-2">
            <div className="relative">
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(Number(e.target.value))}
                className="appearance-none bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg px-4 py-1.5 pr-8 text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer hover:border-blue-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>{MONTH_NAMES[m - 1]}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </div>

            <div className="relative">
              <select
                value={selectedYear}
                onChange={e => setSelectedYear(Number(e.target.value))}
                className="appearance-none bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg px-4 py-1.5 pr-8 text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer hover:border-blue-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              >
                {Array.from({ length: new Date().getFullYear() - 2025 + 2 }, (_, i) => new Date().getFullYear() + 1 - i).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </div>

            {/* Previous Month Navigation Button */}
            <button
              onClick={() => {
                let m = selectedMonth - 1
                let y = selectedYear
                if (m === 0) {
                  m = 12
                  y -= 1
                }
                setSelectedMonth(m)
                setSelectedYear(y)
              }}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
            >
              ← View Previous Month
            </button>
            <button
              onClick={() => setMode("ytd")}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
            >
              View YTD
            </button>
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
              {Array.from({ length: new Date().getFullYear() - 2025 + 2 }, (_, i) => new Date().getFullYear() + 1 - i).map(y => (
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

      {/* ── Data Freshness + Items Cards ── */}
      {data && !loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Most Recent Data Date */}
          <div className={`rounded-xl border p-4 ${
            isStale
              ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
              : "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800"
          }`}>
            <div className="flex items-center gap-2 mb-1">
              <CalendarCheck className={`w-4 h-4 ${
                isStale ? "text-amber-600" : "text-emerald-600"
              }`} />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Data Through
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xl font-bold ${
                isStale ? "text-amber-800" : "text-emerald-800"
              }`}>
                {new Date(data.lastDataDate + "T00:00:00").toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" })}
              </span>
              {isStale && (
                <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                  <AlertTriangle className="w-3 h-3" />
                  Stale
                </span>
              )}
            </div>
            <div className="mt-1.5 text-xs text-slate-500">
              {mode === "ytd" ? (
                <span>
                  {data.businessDaysPassed} business days elapsed YTD{" "}
                  <span className="text-slate-400">
                    ({bizDaysInYear - data.businessDaysPassed} remaining in {selectedYear})
                  </span>
                </span>
              ) : (
                <span>{data.businessDaysPassed} of {data.businessDaysTotal} business days elapsed</span>
              )}
            </div>
          </div>

          {/* Items (Agency + Filtered) */}
          <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Package className="w-4 h-4 text-blue-600" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {mode === "ytd" ? "YTD Auto Items" : "MTD Auto Items"}
              </span>
            </div>
            <span className="text-xl font-bold text-blue-800 dark:text-blue-300">
              {filteredItemsCount.toLocaleString()}
            </span>
            {(filters.offices.length > 0 || filters.teams.length > 0 || filters.agents.length > 0) && (
              <div className="mt-1 text-xs text-blue-500">
                Agency total: {data.mtdItems.toLocaleString()}
              </div>
            )}
          </div>

          {/* Close Rate (Agency + Filtered) */}
          <div className={`rounded-xl border p-4 ${cardCrColorClass(totals.cr)}`}>
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {mode === "ytd" ? "YTD Auto Close Rate" : "MTD Auto Close Rate"}
              </span>
            </div>
            <span className="text-xl font-bold">
              {fmtPct(totals.cr)}
            </span>
            {filters.offices.length > 0 || filters.teams.length > 0 || filters.agents.length > 0 ? (
              <div className="mt-1 text-xs text-slate-500 flex flex-col gap-0.5">
                <span className="font-semibold text-blue-600 truncate">{getFiltersLabel()}</span>
                <span>Agency actual: {fmtPct(agencyTotals.cr)}</span>
              </div>
            ) : (
              <div className="mt-1 text-xs text-slate-400">
                Agency actual
              </div>
            )}
          </div>

          {/* NB / Quotes Summary */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-4 h-4 text-slate-500" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                NB / Quotes
              </span>
            </div>
            <div className="flex gap-4 items-center mb-1">
              <div>
                <span className="text-xl font-bold text-emerald-700 block leading-tight">{totals.totalNB}</span>
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">NB Policies</span>
              </div>
              <div className="border-r border-slate-200 h-6 my-auto" />
              <div>
                <span className="text-xl font-bold text-blue-700 block leading-tight">{totals.totalQuotes}</span>
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Deduped Quotes</span>
              </div>
            </div>
            {data?.rawQuotesTotal ? (
              <div className="text-xs text-slate-500 mt-2 border-t border-slate-100 pt-1.5 font-medium">
                {data.rawQuotesTotal.toLocaleString()} Standard Auto Quotes Total
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ── YTD Trend Chart (YTD only) ── */}
      {data && !loading && mode === "ytd" && ytdChartData.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-slate-600 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-500" />
                YTD Trend — {selectedYear}
              </CardTitle>
              <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700">
                {(["weekly", "monthly"] as const).map(g => (
                  <button
                    key={g}
                    onClick={() => setYtdGroupBy(g)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                      ytdGroupBy === g
                        ? "bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-sm border border-blue-200 dark:border-blue-800"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                    }`}
                  >
                    {g === "weekly" ? "Weekly (Thu–Wed)" : "Monthly"}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[380px] w-full relative">
              {isMounted ? (
                <div className="absolute inset-0">
                  <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={ytdChartData} margin={{ top: 25, right: 20, left: 0, bottom: ytdGroupBy === "weekly" ? 60 : 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: ytdGroupBy === "weekly" ? 9 : 11, fill: "#64748b" }}
                      tickLine={false}
                      axisLine={{ stroke: "#e2e8f0" }}
                      interval={0}
                      angle={ytdGroupBy === "weekly" ? -45 : 0}
                      textAnchor={ytdGroupBy === "weekly" ? "end" : "middle"}
                      height={ytdGroupBy === "weekly" ? 65 : 30}
                    />
                    <YAxis
                      yAxisId="count"
                      tick={{ fontSize: 11, fill: "#3b82f6", fontWeight: 600 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      yAxisId="pct"
                      orientation="right"
                      tick={{ fontSize: 11, fill: "#d97706", fontWeight: 600 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) => `${v}%`}
                      label={{ value: "Close Rate", angle: 90, position: "insideRight", style: { fontSize: 11, fill: "#d97706", fontWeight: 600 } }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: "12px", paddingTop: "8px", cursor: "pointer" }}
                      onClick={(e: any) => toggleLine(e.dataKey)}
                      formatter={(value: any, entry: any) => {
                        const active = highlightedLines.size === 0 || highlightedLines.has(entry.dataKey)
                        return <span style={{ color: active ? entry.color : "#cbd5e1", fontWeight: active ? 600 : 400 }}>{value}</span>
                      }}
                    />

                    {/* 15% benchmark reference line on close rate axis */}
                    <ReferenceLine
                      yAxisId="pct"
                      y={15}
                      stroke="#d97706"
                      strokeDasharray="8 4"
                      strokeWidth={1.5}
                      strokeOpacity={0.6}
                      label={{ value: "15% CR Target", position: "right", fill: "#d97706", fontSize: 10, fontWeight: 600 }}
                    />

                    <Line
                      yAxisId="count"
                      type="monotone"
                      dataKey="quotes"
                      name="Quotes"
                      stroke="#3b82f6"
                      strokeWidth={lineWidth("quotes")}
                      strokeOpacity={lineOpacity("quotes")}
                      dot={{ r: 3, fill: "#3b82f6", fillOpacity: lineOpacity("quotes") }}
                      activeDot={{ r: 5 }}
                    >
                      {lineOpacity("quotes") > 0.5 && <LabelList dataKey="quotes" position="top" style={{ fontSize: 11, fill: "#3b82f6", fontWeight: 700 }} offset={10} />}
                    </Line>
                    <Line
                      yAxisId="count"
                      type="monotone"
                      dataKey="nb"
                      name="NB Policies"
                      stroke="#ef4444"
                      strokeWidth={lineWidth("nb")}
                      strokeOpacity={lineOpacity("nb")}
                      dot={{ r: 3, fill: "#ef4444", fillOpacity: lineOpacity("nb") }}
                      activeDot={{ r: 5 }}
                    >
                      {lineOpacity("nb") > 0.5 && <LabelList dataKey="nb" position="bottom" style={{ fontSize: 11, fill: "#ef4444", fontWeight: 700 }} offset={8} />}
                    </Line>
                    <Line
                      yAxisId="count"
                      type="monotone"
                      dataKey="items"
                      name="Items"
                      stroke="#22c55e"
                      strokeWidth={lineWidth("items")}
                      strokeOpacity={lineOpacity("items")}
                      dot={{ r: 3, fill: "#22c55e", fillOpacity: lineOpacity("items") }}
                      activeDot={{ r: 5 }}
                    >
                      {lineOpacity("items") > 0.5 && <LabelList dataKey="items" position="top" style={{ fontSize: 11, fill: "#22c55e", fontWeight: 700 }} offset={10} />}
                    </Line>
                    <Line
                      yAxisId="pct"
                      type="monotone"
                      dataKey="closeRate"
                      name="Close Rate"
                      stroke="#f59e0b"
                      strokeWidth={highlightedLines.size === 0 ? 2 : (highlightedLines.has("closeRate") ? 2.5 : 1)}
                      strokeOpacity={lineOpacity("closeRate")}
                      strokeDasharray="5 3"
                      dot={{ r: 3, fill: "#f59e0b", fillOpacity: lineOpacity("closeRate") }}
                      activeDot={{ r: 5 }}
                    >
                      {lineOpacity("closeRate") > 0.5 && (
                        <LabelList
                          dataKey="closeRate"
                          position="top"
                          style={{ fontSize: 11, fill: "#f59e0b", fontWeight: 700 }}
                          offset={10}
                          formatter={(v: any) => {
                            const val = Number(v);
                            return val > 50 ? `${val.toFixed(1)}%` : "";
                          }}
                        />
                      )}
                    </Line>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
                <div className="w-full h-full min-h-[300px] flex items-center justify-center text-slate-400">
                  Loading chart...
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Monthly CR Breakdown Tables (YTD only) ── */}
      {data && !loading && mode === "ytd" && monthlyCrBreakdown.monthLabels.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
          {/* Team Monthly CR */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-600 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-500" />
                Close Rate by Team — Monthly Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-1.5 px-2 font-semibold text-slate-600 sticky left-0 bg-white">Team</th>
                    <th className="text-center py-1.5 px-2 font-semibold text-slate-600">YTD CR</th>
                    {monthlyCrBreakdown.monthLabels.map(ml => (
                      <th key={ml} className="text-center py-1.5 px-2 font-semibold text-slate-500">{ml} CR</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monthlyCrBreakdown.teams.map(row => (
                    <tr key={row.name} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-1.5 px-2 font-medium text-slate-700 sticky left-0 bg-white">{row.name}</td>
                      <td className="py-1.5 px-2 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${crColorClass(row.ytdCr)}`}>
                          {fmtPct(row.ytdCr)}
                        </span>
                      </td>
                      {row.months.map(m => (
                        <td key={m.label} className="py-1.5 px-2 text-center">
                          {m.quotes > 0 ? (
                            <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${crColorClass(m.cr)}`}
                                  title={`${m.nb} NB / ${m.quotes} Q`}>
                              {fmtPct(m.cr)}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Office Monthly CR */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-600 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-purple-500" />
                Close Rate by Office — Monthly Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-1.5 px-2 font-semibold text-slate-600 sticky left-0 bg-white">Office</th>
                    <th className="text-center py-1.5 px-2 font-semibold text-slate-600">YTD CR</th>
                    {monthlyCrBreakdown.monthLabels.map(ml => (
                      <th key={ml} className="text-center py-1.5 px-2 font-semibold text-slate-500">{ml} CR</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monthlyCrBreakdown.offices.map(row => (
                    <tr key={row.name} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-1.5 px-2 font-medium text-slate-700 sticky left-0 bg-white">{row.name}</td>
                      <td className="py-1.5 px-2 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${crColorClass(row.ytdCr)}`}>
                          {fmtPct(row.ytdCr)}
                        </span>
                      </td>
                      {row.months.map(m => (
                        <td key={m.label} className="py-1.5 px-2 text-center">
                          {m.quotes > 0 ? (
                            <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${crColorClass(m.cr)}`}
                                  title={`${m.nb} NB / ${m.quotes} Q`}>
                              {fmtPct(m.cr)}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
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
            <div className="h-[340px] w-full relative">
              {isMounted ? (
                <div className="absolute inset-0">
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
                       tick={{ fontSize: 11, fill: "#3b82f6", fontWeight: 600 }}
                       tickLine={false}
                       axisLine={false}
                       label={{ value: "Count", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#3b82f6", fontWeight: 600 } }}
                     />
                     <YAxis
                       yAxisId="pct"
                       orientation="right"
                       tick={{ fontSize: 11, fill: "#d97706", fontWeight: 600 }}
                       tickLine={false}
                       axisLine={false}
                       tickFormatter={(v: number) => `${v}%`}
                       label={{ value: "Close Rate", angle: 90, position: "insideRight", style: { fontSize: 11, fill: "#d97706", fontWeight: 600 } }}
                     />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: "12px", paddingTop: "8px", cursor: "pointer" }}
                      onClick={(e: any) => toggleLine(e.dataKey)}
                      formatter={(value: any, entry: any) => {
                        const active = highlightedLines.size === 0 || highlightedLines.has(entry.dataKey)
                        return <span style={{ color: active ? entry.color : "#cbd5e1", fontWeight: active ? 600 : 400 }}>{value}</span>
                      }}
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
                      strokeWidth={lineWidth("quotes")}
                      strokeOpacity={lineOpacity("quotes")}
                      dot={{ r: 3, fill: "#3b82f6", fillOpacity: lineOpacity("quotes") }}
                      activeDot={{ r: 5 }}
                    >
                      {lineOpacity("quotes") > 0.5 && <LabelList dataKey="quotes" position="top" style={{ fontSize: 11, fill: "#3b82f6", fontWeight: 700 }} offset={8} />}
                    </Line>
                    <Line
                      yAxisId="count"
                      type="monotone"
                      dataKey="nb"
                      name="NB Policies"
                      stroke="#10b981"
                      strokeWidth={lineWidth("nb")}
                      strokeOpacity={lineOpacity("nb")}
                      dot={{ r: 3, fill: "#10b981", fillOpacity: lineOpacity("nb") }}
                      activeDot={{ r: 5 }}
                    >
                      {lineOpacity("nb") > 0.5 && <LabelList dataKey="nb" position="bottom" style={{ fontSize: 11, fill: "#10b981", fontWeight: 700 }} offset={8} />}
                    </Line>
                    <Line
                      yAxisId="count"
                      type="monotone"
                      dataKey="items"
                      name="Items"
                      stroke="#8b5cf6"
                      strokeWidth={lineWidth("items")}
                      strokeOpacity={lineOpacity("items")}
                      dot={{ r: 3, fill: "#8b5cf6", fillOpacity: lineOpacity("items") }}
                      activeDot={{ r: 5 }}
                    >
                      {lineOpacity("items") > 0.5 && <LabelList dataKey="items" position="top" style={{ fontSize: 11, fill: "#8b5cf6", fontWeight: 700 }} offset={8} />}
                    </Line>
                    <Line
                      yAxisId="pct"
                      type="monotone"
                      dataKey="closeRate"
                      name="Close Rate"
                      stroke="#f59e0b"
                      strokeWidth={highlightedLines.size === 0 ? 2 : (highlightedLines.has("closeRate") ? 2.5 : 1)}
                      strokeOpacity={lineOpacity("closeRate")}
                      strokeDasharray="5 3"
                      dot={{ r: 3, fill: "#f59e0b", fillOpacity: lineOpacity("closeRate") }}
                      activeDot={{ r: 5 }}
                    >
                      {lineOpacity("closeRate") > 0.5 && (
                        <LabelList
                          dataKey="closeRate"
                          position="top"
                          style={{ fontSize: 11, fill: "#f59e0b", fontWeight: 700 }}
                          offset={8}
                          formatter={(v: any) => {
                            const val = Number(v);
                            return val > 50 ? `${val.toFixed(1)}%` : "";
                          }}
                        />
                      )}
                    </Line>

                    {/* 15% benchmark reference line on close rate axis */}
                    <ReferenceLine
                       yAxisId="pct"
                       y={15}
                       stroke="#d97706"
                       strokeDasharray="8 4"
                       strokeWidth={1.5}
                       strokeOpacity={0.6}
                       label={{ value: "15% CR Target", position: "right", fill: "#d97706", fontSize: 10, fontWeight: 600 }}
                     />

                    {/* Cumulative Items running total */}
                    <Line
                      yAxisId="count"
                      type="monotone"
                      dataKey="cumulativeItems"
                      name="Cumulative Items"
                      stroke="#ec4899"
                      strokeWidth={highlightedLines.size === 0 ? 2 : (highlightedLines.has("cumulativeItems") ? 2.5 : 1)}
                      strokeOpacity={lineOpacity("cumulativeItems")}
                      strokeDasharray="3 2"
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
                <div className="w-full h-full min-h-[300px] flex items-center justify-center text-slate-400">
                  Loading chart...
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Loading Skeleton ── */}
      {loading && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Skeleton KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4" style={{ animationDelay: `${i * 80}ms` }}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-4 h-4 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                  <div className="h-3 w-24 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                </div>
                <div className="h-7 w-16 rounded bg-slate-200 dark:bg-slate-700 animate-pulse mt-1" />
                <div className="h-2.5 w-32 rounded bg-slate-100 dark:bg-slate-800 animate-pulse mt-2" />
              </div>
            ))}
          </div>

          {/* Skeleton Chart */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="w-4.5 h-4.5 rounded bg-slate-200 animate-pulse" />
                <div className="h-4 w-48 rounded bg-slate-200 animate-pulse" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-[280px] flex items-end gap-1 px-8 pb-6 pt-4">
                {Array.from({ length: 20 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t bg-gradient-to-t from-slate-200 dark:from-slate-700 to-slate-100 dark:to-slate-800 animate-pulse"
                    style={{
                      height: `${30 + Math.sin(i * 0.7) * 25 + (i * 17 % 30)}%`,
                      animationDelay: `${i * 50}ms`,
                    }}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Skeleton Table */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="w-4.5 h-4.5 rounded bg-slate-200 animate-pulse" />
                <div className="h-4 w-36 rounded bg-slate-200 animate-pulse" />
                <div className="h-3 w-28 rounded bg-slate-100 animate-pulse ml-2" />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                      {["Agent", "Items", "NB Policies", "Quote Count", "Close Rate", "Mo. Quotes", "Daily Goal", "Daily Actual", "@ 15% CR"].map((h) => (
                        <th key={h} className="py-2 px-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 15 }).map((_, idx) => (
                      <tr
                        key={idx}
                        className={`border-b border-slate-100 dark:border-slate-700 ${idx % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-slate-200/40 dark:bg-slate-800/40"}`}
                        style={{ animationDelay: `${idx * 30}ms` }}
                      >
                        <td className="py-1.5 px-2">
                          <div className="h-3.5 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" style={{ width: `${50 + (idx * 13 % 40)}%` }} />
                        </td>
                        {Array.from({ length: 8 }).map((_, ci) => (
                          <td key={ci} className="py-1.5 px-2">
                            <div className="h-3.5 w-8 mx-auto rounded bg-slate-200/70 dark:bg-slate-700/70 animate-pulse" style={{ animationDelay: `${(idx * 8 + ci) * 15}ms` }} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Empty State ── */}
      {data && !loading && sortedRows.length === 0 && (
        <Card>
          <CardContent className="py-16">
            <div className="flex flex-col items-center justify-center text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-amber-500" />
              </div>
              <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">No Data Available</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">
                No quotes or NB data found for <span className="font-medium text-slate-700 dark:text-slate-300">{data.periodLabel}</span>.
                Try selecting a previous month from the dropdown, or run a data sync from the admin page.
              </p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => {
                    const prev = new Date(selectedYear, selectedMonth - 2, 1)
                    setSelectedYear(prev.getFullYear())
                    setSelectedMonth(prev.getMonth() + 1)
                  }}
                  className="px-4 py-2 text-sm font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-all"
                >
                  ← View Previous Month
                </button>
                <button
                  onClick={() => setMode("ytd")}
                  className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
                >
                  View YTD
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Main Data Section (Grid) ── */}
      {data && !loading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Main Data Table (Left Column, spans 2/3 width) */}
          <div className="lg:col-span-2 space-y-4">
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
                  <table className="text-sm">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                        <Th field="name" label="Agent" onSort={handleSort} sortField={sortField} sortDir={sortDir} align="left" />
                        <Th field="items" label="Items" onSort={handleSort} sortField={sortField} sortDir={sortDir} />
                        <Th field="nb" label={["NB", "Policies"]} onSort={handleSort} sortField={sortField} sortDir={sortDir} />
                        <Th field="quotes" label={["Quote", "Count"]} onSort={handleSort} sortField={sortField} sortDir={sortDir} />
                        <Th field="cr" label={["Close", "Rate"]} onSort={handleSort} sortField={sortField} sortDir={sortDir} />
                        <Th field="monthly" label={["Mo. Quotes", `for ${TARGET_AUTOS} Autos`]} onSort={handleSort} sortField={sortField} sortDir={sortDir} />
                        <Th field="dailyGoal" label={["Daily Quote", "Goal"]} onSort={handleSort} sortField={sortField} sortDir={sortDir} />
                        <Th field="dailyActual" label={["Daily Quote", "Actual"]} onSort={handleSort} sortField={sortField} sortDir={sortDir} />
                        <Th field="benchmark" label={["Daily Quotes", "@ 15% CR"]} onSort={handleSort} sortField={sortField} sortDir={sortDir} />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRows.map((row, idx) => {
                        const actualVsGoal = row.daily_goal > 0 ? row.daily_actual / row.daily_goal : 0

                        return (
                          <tr
                            key={row.agent_id}
                            className={`border-b border-slate-100 dark:border-slate-700 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 transition-colors ${
                              idx % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-slate-200 dark:bg-slate-800"
                            }`}
                          >
                            <td className="py-1 px-2 font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                              {row.name}
                            </td>
                            <td className="py-1 px-2 text-center font-mono text-purple-700 font-bold">
                              {row.items}
                            </td>
                            <td className="py-1 px-2 text-center font-mono font-bold text-slate-900">
                              {row.nb_policies}
                            </td>
                            <td className="py-1 px-2 text-center font-mono text-slate-700 dark:text-slate-300 font-bold">
                              {row.quote_count}
                            </td>
                            <td className="py-1 px-2 text-center">
                              <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${crColorClass(row.close_rate)}`}>
                                {fmtPct(row.close_rate)}
                              </span>
                            </td>
                            <td className="py-1 px-2 text-center font-mono text-slate-700 font-bold">
                              {row.close_rate > 0 ? Math.round(row.monthly_target) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="py-1 px-2 text-center font-mono text-slate-700 font-bold">
                              {row.close_rate > 0 ? fmtNum(row.daily_goal) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="py-1 px-2 text-center">
                              {actualVsGoal >= 0.8 ? (
                                <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                                  actualVsGoal >= 1 ? "text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/30" : "text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/30"
                                }`}>
                                  {fmtNum(row.daily_actual)}
                                </span>
                              ) : (
                                <span className="font-mono text-slate-900 dark:text-slate-100 font-bold">
                                  {fmtNum(row.daily_actual)}
                                </span>
                              )}
                            </td>
                            <td className="py-1 px-2 text-center font-mono text-slate-500 font-bold">
                              {fmtNum(row.benchmark_15)}
                            </td>
                          </tr>
                        )
                      })}

                      {/* Totals Row */}
                      <tr className="bg-slate-100 dark:bg-slate-800 border-t-2 border-slate-300 dark:border-slate-600 font-bold">
                        <td className="py-1.5 px-2 text-slate-800 dark:text-slate-200">Total</td>
                        <td className="py-1.5 px-2 text-center font-mono text-purple-800">{totals.totalItems}</td>
                        <td className="py-1.5 px-2 text-center font-mono text-slate-900">{totals.totalNB}</td>
                        <td className="py-1.5 px-2 text-center font-mono text-slate-900">{totals.totalQuotes}</td>
                        <td className="py-1.5 px-2 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${crColorClass(totals.cr)}`}>
                            {fmtPct(totals.cr)}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-center font-mono text-slate-900">
                          {totals.cr > 0 ? Math.round(totals.monthlyTarget) : "—"}
                        </td>
                        <td className="py-1.5 px-2 text-center font-mono text-slate-900">
                          {totals.cr > 0 ? fmtNum(totals.dailyGoal) : "—"}
                        </td>
                        <td className="py-1.5 px-2 text-center font-mono text-slate-900">
                          {fmtNum(totals.dailyActual)}
                        </td>
                        <td className="py-1.5 px-2 text-center font-mono text-slate-600">
                          {fmtNum(totals.benchmark)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Footer Info */}
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

          {/* Right Column (Summaries Stacked) */}
          <div className="space-y-6">
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
                          {t.nb} NB / {t.quotes} Q / {t.items} items
                        </span>
                        <span className={`text-sm font-bold px-2 py-0.5 rounded-md ${crColorClass(t.cr)}`}>
                          {fmtPct(t.cr)}
                        </span>
                      </div>
                    </div>
                  ))}
                  {/* Other / Unassigned */}
                  {(otherTeamStats.nb > 0 || otherTeamStats.quotes > 0 || otherTeamStats.items > 0) && (
                    <div className="flex items-center justify-between text-[11px] text-slate-400 italic px-1 pt-1 border-t border-slate-100/50">
                      <span>Other / Unassigned</span>
                      <span>
                        {otherTeamStats.nb} NB / {otherTeamStats.quotes} Q / {otherTeamStats.items} item{otherTeamStats.items !== 1 ? "s" : ""}
                      </span>
                    </div>
                  )}
                  {/* Totals */}
                  <div className="flex items-center justify-between pt-2 mt-1 border-t border-slate-200">
                    <span className="text-sm font-bold text-slate-800">Total</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-slate-500">
                        {teamTotal.nb} NB / {teamTotal.quotes} Q / {teamTotal.items} items
                      </span>
                      <span className={`text-sm font-bold px-2 py-0.5 rounded-md ${crColorClass(teamTotal.cr)}`}>
                        {fmtPct(teamTotal.cr)}
                      </span>
                    </div>
                  </div>
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
                          {o.nb} NB / {o.quotes} Q / {o.items} items
                        </span>
                        <span className={`text-sm font-bold px-2 py-0.5 rounded-md ${crColorClass(o.cr)}`}>
                          {fmtPct(o.cr)}
                        </span>
                      </div>
                    </div>
                  ))}
                  {/* Other / Unassigned */}
                  {(otherOfficeStats.nb > 0 || otherOfficeStats.quotes > 0 || otherOfficeStats.items > 0) && (
                    <div className="flex items-center justify-between text-[11px] text-slate-400 italic px-1 pt-1 border-t border-slate-100/50">
                      <span>Other / Unassigned</span>
                      <span>
                        {otherOfficeStats.nb} NB / {otherOfficeStats.quotes} Q / {otherOfficeStats.items} item{otherOfficeStats.items !== 1 ? "s" : ""}
                      </span>
                    </div>
                  )}
                  {/* Totals */}
                  <div className="flex items-center justify-between pt-2 mt-1 border-t border-slate-200">
                    <span className="text-sm font-bold text-slate-800">Total</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-slate-500">
                        {officeTotal.nb} NB / {officeTotal.quotes} Q / {officeTotal.items} items
                      </span>
                      <span className={`text-sm font-bold px-2 py-0.5 rounded-md ${crColorClass(officeTotal.cr)}`}>
                        {fmtPct(officeTotal.cr)}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ── Duplicates Modal ── */}
      {showDupes && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 pb-8">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => { setShowDupes(false); setDupeSearch("") }}
          />
          {/* Modal */}
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden border border-slate-200">
            {/* Header */}
            <div className="flex-shrink-0 px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-amber-50 to-orange-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-100 rounded-lg">
                    <Copy className="w-5 h-5 text-amber-700" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Duplicate Quotes Review</h2>
                    <p className="text-sm text-slate-500">
                      {filteredDupeTotal} duplicates removed &middot; {filteredDupeGroups.length} groups
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { setShowDupes(false); setDupeSearch("") }}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Definition */}
              <div className="mt-3 p-4 bg-white/90 rounded-xl border border-amber-200/80 text-xs text-slate-600 space-y-2">
                <div>
                  <p className="font-semibold text-amber-800 text-sm mb-1">Rolling Deduplication Rules:</p>
                  <p>To prevent double-counting prospects, the pipeline filters quotes according to the following logic:</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  <div className="p-2.5 bg-amber-50/50 rounded-lg border border-amber-100">
                    <span className="font-bold text-amber-800 block mb-1">1. Deduplication Key</span>
                    Quotes are grouped by a unique key combining:
                    <div className="flex flex-wrap gap-1 mt-1">
                      {["Sub Producer", "First Name", "Last Name", "Street Address"].map(f => (
                        <span key={f} className="px-1.5 py-0.5 bg-amber-100/80 text-amber-900 rounded text-[10px] font-medium">{f}</span>
                      ))}
                    </div>
                  </div>
                  <div className="p-2.5 bg-amber-50/50 rounded-lg border border-amber-100">
                    <span className="font-bold text-amber-800 block mb-1">2. Rolling 30-Day Window</span>
                    Sorted chronologically. The **first** quote is kept. Any subsequent quote for that prospect within **30 days** of the last kept quote is flagged as a duplicate. Quotes outside the 30-day window reset the timer.
                  </div>
                </div>
              </div>

              {/* Search */}
              {filteredDupeGroups.length > 0 && (
                <div className="mt-3 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by name, address, or agent..."
                    value={dupeSearch}
                    onChange={e => setDupeSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
                  />
                </div>
              )}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {dupeLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="flex items-center gap-3 text-slate-500">
                    <Copy className="w-5 h-5 animate-pulse" />
                    <span className="text-sm">Loading duplicates...</span>
                  </div>
                </div>
              ) : filteredDupeGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <Check className="w-10 h-10 mb-3 text-emerald-400" />
                  <p className="text-sm font-medium">No duplicates found matching filters</p>
                  <p className="text-xs mt-1">All quotes matching filters are unique</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredDupeGroups.map((group, idx) => (
                    <div key={group.dedup_key} className="border border-slate-200 rounded-xl overflow-hidden">
                      {/* Group header */}
                      <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-400">#{idx + 1}</span>
                          <span className="text-sm font-semibold text-slate-700">
                            {group.kept.first_name} {group.kept.last_name}
                          </span>
                          <span className="text-xs text-slate-400">&middot;</span>
                          <span className="text-xs text-slate-500 truncate max-w-[200px]">{group.kept.address}</span>
                        </div>
                        <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                          {group.removed.length} duplicate{group.removed.length > 1 ? "s" : ""}
                        </span>
                      </div>

                      {/* Kept quote */}
                      <div className="px-4 py-2.5 bg-emerald-50/50 border-b border-emerald-100 flex items-center gap-2">
                        <div className="flex-shrink-0 w-5 flex items-center justify-center">
                          <Check className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div className="flex-1 grid grid-cols-5 gap-2 text-xs">
                          <div>
                            <span className="text-slate-400 block text-[10px]">Agent</span>
                            <span className="font-medium text-slate-700">{group.kept.sub_producer}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px]">Customer</span>
                            <span className="font-medium text-slate-700">{group.kept.first_name} {group.kept.last_name}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px]">Address</span>
                            <span className="font-medium text-slate-700 truncate block">{group.kept.address}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px]">Date</span>
                            <span className="font-medium text-emerald-700">{group.kept.quote_date}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px]">Quote #</span>
                            <span className="font-medium text-slate-700 text-[11px] font-mono">{group.kept.quote_control_number || "—"}</span>
                          </div>
                        </div>
                      </div>

                      {/* Removed quotes */}
                      {group.removed.map((dup) => (
                        <div key={dup.id} className="px-4 py-2.5 border-b border-slate-100 last:border-b-0 flex items-center gap-2 bg-red-50/30">
                          <div className="flex-shrink-0 w-5 flex items-center justify-center">
                            <XCircle className="w-4 h-4 text-red-400" />
                          </div>
                          <div className="flex-1 grid grid-cols-5 gap-2 text-xs">
                            <div>
                              <span className="text-slate-400 block text-[10px]">Agent</span>
                              <span className={`font-medium ${dup.sub_producer === group.kept.sub_producer ? "text-amber-600" : "text-slate-700"}`}>
                                {dup.sub_producer}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[10px]">Customer</span>
                              <span className="font-medium text-amber-600">
                                {dup.first_name} {dup.last_name}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[10px]">Address</span>
                              <span className="font-medium text-amber-600 truncate block">
                                {dup.address}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[10px]">Date</span>
                              <span className="font-medium text-red-600">{dup.quote_date}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[10px]">Quote #</span>
                              <span className="font-medium text-slate-700 text-[11px] font-mono">{dup.quote_control_number || "—"}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600" /> Kept (counted)
                </span>
                <span className="flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5 text-red-400" /> Removed (not counted)
                </span>
                <span className="flex items-center gap-1">
                  <span className="text-amber-500">Amber text</span> = matching field
                </span>
              </div>
              <button
                onClick={() => { setShowDupes(false); setDupeSearch("") }}
                className="px-4 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── KPI Definitions ── */}
      {data && (
        <div className="mt-8 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <button
            onClick={() => setShowKpiDefs(!showKpiDefs)}
            className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-semibold text-slate-700">KPI Definitions & Data Sources</span>
            </div>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showKpiDefs ? 'rotate-180' : ''}`} />
          </button>
          {showKpiDefs && (
            <div className="px-5 pb-5 border-t border-slate-100">
              <p className="text-xs text-slate-500 mt-3 mb-4">All metrics on this page are sourced from <span className="font-medium text-slate-700">daily_metrics</span> in Supabase, scoped to Standard Auto only.</p>
              <div className="space-y-3">
                {/* Quote Count */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-slate-800">Quote Count</span>
                    <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[9px] font-mono">quotes_deduped</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    The deduplicated Standard Auto quote count per agent per day. Duplicate quotes (same Sub Producer + First Name + Last Name + Street Address within a rolling 30-day window) are excluded. This is the primary quote metric used across all cards, the table, and charts.
                  </p>
                </div>

                {/* NB Policies */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-slate-800">NB Policies</span>
                    <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[9px] font-mono">nb_auto_count</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    The count of new Standard Auto policies written per agent per day. This does <strong>not</strong> include non-auto lines of business (those are in the separate <code className="text-[10px] bg-slate-200 px-1 rounded">nb_count</code> column).
                  </p>
                </div>

                {/* Items */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-slate-800">Items</span>
                    <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[9px] font-mono">nb_auto_items</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    The total Standard Auto NB item count per agent per day. A single policy can have multiple items (e.g., multi-vehicle). Avg items per policy ≈ {AVG_ITEMS_PER_POLICY}.
                  </p>
                </div>

                {/* Close Rate */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-slate-800">Close Rate</span>
                    <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[9px] font-mono">nb_auto_count ÷ quotes_deduped</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    NB Policies divided by Quote Count. The <strong>Agency</strong> card uses all agents (including non-visible). The <strong>Filtered</strong> card respects active Office/Team/Agent filters. Green ≥ 15%, red &lt; 15%.
                  </p>
                </div>

                {/* Monthly Quotes for 40 Autos */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-slate-800">Mo. Quotes for {TARGET_AUTOS} Autos</span>
                    <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[9px] font-mono">({TARGET_AUTOS} ÷ {AVG_ITEMS_PER_POLICY}) ÷ close_rate</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    How many quotes the agent needs this month to hit {TARGET_AUTOS} auto items, based on their current close rate. Formula: {POLICIES_NEEDED} policies needed ÷ agent's close rate.
                  </p>
                </div>

                {/* Daily Quote Goal */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-slate-800">Daily Quote Goal</span>
                    <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[9px] font-mono">monthly_target ÷ business_days_in_month</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    The agent's monthly target divided by total business days in the month (excluding weekends and holidays). This is the daily pace needed to hit {TARGET_AUTOS} autos.
                  </p>
                </div>

                {/* Benchmark */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-slate-800">Daily Quotes @ {(BENCHMARK_CR * 100).toFixed(0)}% CR</span>
                    <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[9px] font-mono">{POLICIES_NEEDED} ÷ {BENCHMARK_CR} ÷ biz_days</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    A universal benchmark: quotes per day needed to hit {TARGET_AUTOS} autos assuming a {(BENCHMARK_CR * 100).toFixed(0)}% close rate. Same for all agents.
                  </p>
                </div>

                {/* Business Days */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-slate-800">Business Days</span>
                    <span className="px-1.5 py-0.5 bg-sky-100 text-sky-700 rounded text-[9px] font-mono">holidays table + weekday math</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Elapsed / Total business days. Weekends and holidays (from the holidays table) are excluded. "Elapsed" tracks up to the most recent date with quote or NB data, not necessarily today.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
    </PageGuard>
  )
}

// ── Th Component for sortable headers ──
function Th({
  field, label, onSort, sortField, sortDir, align = "center"
}: {
  field: SortField
  label: string | string[]
  onSort: (f: SortField) => void
  sortField: SortField
  sortDir: SortDir
  align?: "left" | "center"
}) {
  const isActive = sortField === field
  return (
    <th
      onClick={() => onSort(field)}
      className={`py-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider cursor-pointer select-none transition-colors ${
        align === "left" ? "text-left" : "text-center"
      } ${isActive ? "text-blue-700 bg-blue-50/50" : "text-slate-500 hover:text-slate-700 hover:bg-slate-100/50"}`}
    >
      <span className={`inline-flex items-center gap-1 ${align === "left" ? "justify-start" : "justify-center"}`}>
        <span className={`flex flex-col leading-tight ${align === "left" ? "text-left" : "text-center"}`}>
          {Array.isArray(label) ? (
            label.map((line, idx) => <span key={idx}>{line}</span>)
          ) : (
            <span>{label}</span>
          )}
        </span>
        {isActive ? (
          sortDir === "asc" ? <ArrowUp className="w-3 h-3 shrink-0" /> : <ArrowDown className="w-3 h-3 shrink-0" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30 shrink-0" />
        )}
      </span>
    </th>
  )
}
