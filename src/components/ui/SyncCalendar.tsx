"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { supabase } from "@/lib/supabaseClient"
import { ChevronLeft, ChevronRight } from "lucide-react"

const SOURCE_META = [
  { key: 'calls', label: 'Calls', color: 'bg-sky-400', emptyColor: 'bg-slate-200' },
  { key: 'texts', label: 'Texts', color: 'bg-purple-400', emptyColor: 'bg-slate-200' },
  { key: 'quotes', label: 'Quotes', color: 'bg-amber-400', emptyColor: 'bg-slate-200' },
  { key: 'items', label: 'Items', color: 'bg-violet-400', emptyColor: 'bg-slate-200' },
  { key: 'premium', label: 'Premium', color: 'bg-emerald-400', emptyColor: 'bg-slate-200' },
  { key: 'eagent', label: 'eAgent', color: 'bg-rose-400', emptyColor: 'bg-slate-200' },
  { key: 'leads', label: 'Leads', color: 'bg-orange-400', emptyColor: 'bg-slate-200' },
] as const

type SourceKey = typeof SOURCE_META[number]['key']

interface SourcePresence {
  present: boolean
  agentCount: number
}

type DaySources = Record<SourceKey, SourcePresence>

interface SyncCalendarProps {
  selectedDate?: string
  refreshTrigger?: number
  onDateSelect?: (date: string) => void
  onGapClick?: (date: string, missingSources: string[]) => void
}

export default function SyncCalendar({ selectedDate, refreshTrigger, onDateSelect, onGapClick }: SyncCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [daySourceMap, setDaySourceMap] = useState<Map<string, DaySources>>(new Map())
  const [loading, setLoading] = useState(true)

  // Fetch per-source data for the visible month
  useEffect(() => {
    const fetchSourceData = async () => {
      setLoading(true)
      const year = currentMonth.getFullYear()
      const month = currentMonth.getMonth()
      const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`
      const endDate = new Date(year, month + 1, 0) // last day of month
      const endStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`

      try {
        // Fetch daily_metrics — include eAgent fields so we can detect presence
        const { data: metrics, error: metricsErr } = await supabase
          .from("daily_metrics")
          .select("report_date, calls, inbound, outbound, texts, out_texts, quotes, items, nb_count, prem_premium, prem_points, dismissed_todos, past_due_todos, pivots")
          .gte("report_date", startDate)
          .lte("report_date", endStr)

        if (metricsErr) throw metricsErr

        // Fetch daily_reports_meta for eagent_submitted
        const { data: metaData, error: metaErr } = await supabase
          .from("daily_reports_meta")
          .select("report_date, eagent_submitted")
          .gte("report_date", startDate)
          .lte("report_date", endStr)

        if (metaErr) throw metaErr

        // Fetch leads_snapshot for leads presence
        const { data: leadsData, error: leadsErr } = await supabase
          .from("leads_snapshot")
          .select("report_date")
          .gte("report_date", startDate)
          .lte("report_date", endStr)

        if (leadsErr) throw leadsErr

        // Build per-date source presence map
        const result = new Map<string, DaySources>()

        const emptyDay = (): DaySources => ({
          calls: { present: false, agentCount: 0 },
          texts: { present: false, agentCount: 0 },
          quotes: { present: false, agentCount: 0 },
          items: { present: false, agentCount: 0 },
          premium: { present: false, agentCount: 0 },
          eagent: { present: false, agentCount: 0 },
          leads: { present: false, agentCount: 0 },
        })

        // Track which dates have daily_metrics rows at all (i.e. data was synced)
        const datesWithRows = new Set<string>()

        // Process daily_metrics rows
        if (metrics) {
          for (const row of metrics) {
            const d = row.report_date
            datesWithRows.add(d)
            if (!result.has(d)) result.set(d, emptyDay())
            const entry = result.get(d)!

            // Calls & Texts: require non-zero values — agents should ALWAYS
            // have call/text activity on a business day. All-zero means the
            // source data (RingCentral / HiSales) wasn't pulled.
            const hasCalls = (row.calls || 0) > 0 || (row.inbound || 0) > 0 || (row.outbound || 0) > 0
            if (hasCalls) {
              entry.calls.present = true
              entry.calls.agentCount++
            }

            const hasTexts = (row.texts || 0) > 0 || (row.out_texts || 0) > 0
            if (hasTexts) {
              entry.texts.present = true
              entry.texts.agentCount++
            }

            // Quotes, Items, Premium: zero is perfectly normal (not every day
            // has new business or quotes). If daily_metrics rows exist for the
            // date, the data WAS synced — mark as present. We still count
            // agents with actual values for the tooltip.
            if ((row.quotes || 0) > 0) {
              entry.quotes.agentCount++
            }

            if ((row.items || 0) > 0 || (row.nb_count || 0) > 0) {
              entry.items.agentCount++
            }

            if ((row.prem_premium || 0) > 0 || (row.prem_points || 0) > 0) {
              entry.premium.agentCount++
            }

            // eAgent: check for non-zero dismissed/past_due/pivots values
            const hasEagent = (row.dismissed_todos || 0) > 0 || (row.past_due_todos || 0) > 0 || (row.pivots || 0) > 0
            if (hasEagent) {
              entry.eagent.present = true
              entry.eagent.agentCount++
            }
          }
        }

        // Mark Quotes/Items/Premium as "present" for any date that has
        // daily_metrics rows — the data was synced, values are just zero.
        for (const d of datesWithRows) {
          const entry = result.get(d)!
          entry.quotes.present = true
          entry.items.present = true
          entry.premium.present = true
        }

        // Process daily_reports_meta for eAgent (eagent_submitted flag)
        if (metaData) {
          for (const row of metaData) {
            const d = row.report_date
            if (!result.has(d)) result.set(d, emptyDay())
            const entry = result.get(d)!
            if (row.eagent_submitted) {
              entry.eagent.present = true
            }
          }
        }

        // Process leads_snapshot — mark as present if rows exist for the date
        if (leadsData) {
          const leadsCountMap = new Map<string, number>()
          for (const row of leadsData) {
            leadsCountMap.set(row.report_date, (leadsCountMap.get(row.report_date) || 0) + 1)
          }
          for (const [d, count] of leadsCountMap) {
            if (!result.has(d)) result.set(d, emptyDay())
            const entry = result.get(d)!
            entry.leads.present = true
            entry.leads.agentCount = count
          }
        }

        setDaySourceMap(result)
      } catch (e) {
        console.error("Failed to fetch synced dates:", e)
      } finally {
        setLoading(false)
      }
    }
    fetchSourceData()
  }, [currentMonth, refreshTrigger])

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
  }
  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
  }

  const monthName = currentMonth.toLocaleString("default", { month: "long", year: "numeric" })

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const firstDay = new Date(year, month, 1).getDay() // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const today = new Date()
    const todayStr = today.toISOString().split("T")[0]

    const days: Array<{
      day: number | null
      dateStr: string
      isToday: boolean
      isWeekend: boolean
      isSelected: boolean
      isFuture: boolean
      sources: DaySources | null
    }> = []

    // Leading empty cells
    for (let i = 0; i < firstDay; i++) {
      days.push({ day: null, dateStr: "", isToday: false, isWeekend: false, isSelected: false, isFuture: false, sources: null })
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
      const dayOfWeek = new Date(year, month, d).getDay()
      days.push({
        day: d,
        dateStr,
        isToday: dateStr === todayStr,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        isSelected: dateStr === selectedDate,
        isFuture: dateStr > todayStr,
        sources: daySourceMap.get(dateStr) || null,
      })
    }

    return days
  }, [currentMonth, daySourceMap, selectedDate])

  // Count business days with gaps
  const gapCount = useMemo(() => {
    let count = 0
    for (const cell of calendarDays) {
      if (!cell.day || cell.isWeekend) continue
      const sources = cell.sources
      if (!sources) {
        // No data at all → gap
        count++
        continue
      }
      const missing = SOURCE_META.filter(s => !sources[s.key].present)
      if (missing.length > 0) count++
    }
    return count
  }, [calendarDays])

  const getDateStyle = useCallback((sources: DaySources | null, isToday: boolean, isWeekend: boolean, isSelected: boolean, isFuture: boolean) => {
    const presentCount = sources ? SOURCE_META.filter(s => sources[s.key].present).length : 0
    const allPresent = presentCount === SOURCE_META.length
    const partial = presentCount > 0 && !allPresent
    const noData = presentCount === 0

    let base = "border "
    
    // Future days should not have any status coloring
    if (isFuture) {
      base += "bg-white text-slate-600 border-slate-100 hover:bg-slate-50"
    } else {
      // Core status colors (now including weekends)
      if (allPresent) {
        base += "bg-emerald-50 text-emerald-800 border-emerald-200/60 hover:bg-emerald-100"
      } else if (partial) {
        base += "bg-amber-50/70 text-amber-800 border-amber-200/60 hover:bg-amber-100"
      } else if (noData) {
        base += "bg-rose-50/70 text-rose-800 border-rose-200/60 hover:bg-rose-100"
      } else {
        base += "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
      }
    }

    // Today (current day) - styled soft blue as requested
    if (isToday) {
      base = "border bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100"
    }

    // Selected day - bold outline ring styling
    if (isSelected) {
      base += " ring-2 ring-indigo-500 font-semibold scale-[1.02] shadow-sm z-10"
    }

    return base
  }, [])

  const getTooltip = useCallback((dateStr: string, sources: DaySources | null) => {
    if (!sources) return `${dateStr}: No data`
    return SOURCE_META.map(s => {
      const info = sources[s.key]
      if (info.present) {
        return `✅ ${s.label} (${info.agentCount}${s.key === 'eagent' ? '' : ' agents'})`
      }
      return `❌ ${s.label}`
    }).join(" | ")
  }, [])

  const getMissingSources = useCallback((sources: DaySources | null): string[] => {
    if (!sources) return SOURCE_META.map(s => s.label)
    return SOURCE_META.filter(s => !sources[s.key].present).map(s => s.label)
  }, [])

  const handleDayClick = useCallback((cell: typeof calendarDays[0]) => {
    if (!cell.day) return
    onDateSelect?.(cell.dateStr)
    const missing = getMissingSources(cell.sources)
    if (missing.length > 0) {
      onGapClick?.(cell.dateStr, missing)
    }
  }, [onDateSelect, onGapClick, getMissingSources])

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden max-w-md relative">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <button
          onClick={prevMonth}
          className="p-1.5 rounded-md hover:bg-slate-50 text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h3 className="text-sm font-semibold text-slate-900">{monthName}</h3>
        <button
          onClick={nextMonth}
          className="p-1.5 rounded-md hover:bg-slate-50 text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-slate-100">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-slate-500 py-1.5">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px p-1">
        {calendarDays.map((cell, i) => (
          <button
            key={i}
            disabled={!cell.day}
            onClick={() => handleDayClick(cell)}
            className={`
              relative flex flex-col items-center justify-center rounded-md
              py-1.5 px-0.5 min-h-[48px]
              text-xs font-medium transition-all duration-150
              ${cell.day ? getDateStyle(cell.sources, cell.isToday, cell.isWeekend, cell.isSelected, cell.isFuture) : ""}
              ${cell.day ? "cursor-pointer hover:bg-slate-50/80" : "cursor-default"}
            `}
            title={cell.day ? getTooltip(cell.dateStr, cell.sources) : undefined}
          >
            {cell.day && (
              <>
                <span className="leading-none text-[11px]">{cell.day}</span>
                {/* Source dots */}
                <div className="flex items-center gap-[2px] mt-1">
                  {SOURCE_META.map((src) => {
                    const isPresent = cell.sources?.[src.key]?.present ?? false
                    return (
                      <span
                        key={src.key}
                        className={`w-[5px] h-[5px] rounded-full transition-colors duration-200 ${
                          isPresent ? src.color : src.emptyColor
                        }`}
                      />
                    )
                  })}
                </div>
              </>
            )}
          </button>
        ))}
      </div>

      {/* Gap summary */}
      <div className="px-4 py-2 border-t border-slate-100 text-center">
        <span className={`text-xs font-medium ${gapCount > 0 ? "text-amber-600" : "text-emerald-600"}`}>
          {gapCount > 0
            ? `${gapCount} business day${gapCount !== 1 ? "s" : ""} with gaps this month`
            : "All business days fully covered ✓"
          }
        </span>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-4 py-2.5 border-t border-slate-100 text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded border border-emerald-200 bg-emerald-50" />
          Synced
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded border border-amber-200 bg-amber-50/70" />
          Partial
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded border border-rose-200 bg-rose-50/70" />
          Missing
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded border border-blue-200 bg-blue-50" />
          Today
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded border border-slate-300 ring-1 ring-indigo-500 bg-white" />
          Selected
        </span>
      </div>

      {loading && (
        <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] flex items-center justify-center">
          <div className="animate-spin h-5 w-5 border-2 border-emerald-200 border-t-emerald-500 rounded-full" />
        </div>
      )}
    </div>
  )
}
