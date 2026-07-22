"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { supabase } from "@/lib/supabaseClient"
import { ChevronLeft, ChevronRight } from "lucide-react"

/** Paginated Supabase fetch — loops .range() pages of 1000 to defeat the server-side max-rows cap. */
async function fetchAllRows(
  buildQuery: (from: number, to: number) => any
): Promise<any[]> {
  const PAGE_SIZE = 1000
  let allData: any[] = []
  let from = 0
  while (true) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    allData = allData.concat(data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return allData
}

const SOURCE_META = [
  { key: 'calls', label: 'Calls', color: 'bg-sky-400', emptyColor: 'bg-slate-200 dark:bg-slate-700' },
  { key: 'texts', label: 'Texts', color: 'bg-purple-400', emptyColor: 'bg-slate-200 dark:bg-slate-700' },
  { key: 'quotes', label: 'Quotes', color: 'bg-amber-400', emptyColor: 'bg-slate-200 dark:bg-slate-700' },
  { key: 'items', label: 'Items', color: 'bg-violet-400', emptyColor: 'bg-slate-200 dark:bg-slate-700' },
  { key: 'premium', label: 'Premium', color: 'bg-emerald-400', emptyColor: 'bg-slate-200 dark:bg-slate-700' },
  { key: 'eagent', label: 'eAgent', color: 'bg-rose-400', emptyColor: 'bg-slate-200 dark:bg-slate-700' },
  { key: 'leads', label: 'Leads', color: 'bg-orange-400', emptyColor: 'bg-slate-200 dark:bg-slate-700' },
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
  const [sourceFilter, setSourceFilter] = useState<SourceKey | null>(null)

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
        // Fetch daily_metrics — paginated to avoid Supabase's 1000-row server limit
        const metrics = await fetchAllRows((from, to) =>
          supabase
            .from("daily_metrics")
            .select("report_date, calls, inbound, outbound, texts, out_texts, quotes, items, nb_count, prem_premium, prem_points, dismissed_todos, past_due_todos, pivots")
            .gte("report_date", startDate)
            .lte("report_date", endStr)
            .range(from, to)
        )

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

        // Fetch upload_history_files for file type tracking
        const { data: uploadedFiles, error: filesErr } = await supabase
          .from("upload_history_files")
          .select("target_date, file_type")
          .gte("target_date", startDate)
          .lte("target_date", endStr)

        if (filesErr) throw filesErr

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

        // Build day uploads map: date -> Set of file types
        const dayUploads = new Map<string, Set<string>>()
        if (uploadedFiles) {
          for (const f of uploadedFiles) {
            if (!f.target_date) continue
            if (!dayUploads.has(f.target_date)) {
              dayUploads.set(f.target_date, new Set())
            }
            dayUploads.get(f.target_date)!.add(f.file_type)
          }
        }

        // Process daily_metrics rows
        if (metrics) {
          for (const row of metrics) {
            const d = row.report_date
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

        // Mark Quotes/Items/Premium/Calls/Texts as "present" if they have data (agentCount > 0)
        // OR if the respective file type was uploaded.
        for (const [d, entry] of result.entries()) {
          const uploadsForDay = dayUploads.get(d) || new Set<string>()
          
          entry.calls.present = entry.calls.present || uploadsForDay.has("rc") || uploadsForDay.has("rico_ch") || uploadsForDay.has("rico_ap")
          entry.texts.present = entry.texts.present || uploadsForDay.has("hs")
          entry.quotes.present = entry.quotes.agentCount > 0 || uploadsForDay.has("quotes")
          entry.items.present = entry.items.agentCount > 0 || uploadsForDay.has("nb")
          entry.premium.present = entry.premium.agentCount > 0 || uploadsForDay.has("premium")
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

  // The sources to evaluate based on current filter
  const activeSources = useMemo(() => {
    if (sourceFilter === null) return SOURCE_META
    return SOURCE_META.filter(s => s.key === sourceFilter)
  }, [sourceFilter])

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

  // Calculate MTD completion stats for each source
  const sourceMtdStats = useMemo(() => {
    const stats: Record<string, { present: number; total: number; perfect: boolean }> = {}
    for (const src of SOURCE_META) {
      let present = 0
      let total = 0
      for (const cell of calendarDays) {
        if (!cell.day || cell.isFuture || cell.isToday) continue
        total++
        if (cell.sources?.[src.key]?.present) present++
      }
      stats[src.key] = { present, total, perfect: total > 0 && present === total }
    }
    return stats
  }, [calendarDays])

  // Count business days with gaps (respects active filter)
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
      const missing = activeSources.filter(s => !sources[s.key].present)
      if (missing.length > 0) count++
    }
    return count
  }, [calendarDays, activeSources])

  // Date styling that respects the active filter
  const getDateStyle = useCallback((sources: DaySources | null, isToday: boolean, _isWeekend: boolean, isSelected: boolean, isFuture: boolean) => {
    const presentCount = sources ? activeSources.filter(s => sources[s.key].present).length : 0
    const allPresent = presentCount === activeSources.length
    const partial = presentCount > 0 && !allPresent
    const noData = presentCount === 0

    let base = "border "
    
    // Future days should not have any status coloring
    if (isFuture) {
      base += "bg-white dark:bg-slate-900/60 text-slate-400 dark:text-slate-600 border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/40"
    } else {
      // Core status colors
      if (allPresent) {
        base += "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-800/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
      } else if (partial) {
        base += "bg-amber-50/70 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200/60 dark:border-amber-800/60 hover:bg-amber-100 dark:hover:bg-amber-900/50"
      } else if (noData) {
        base += "bg-rose-50/70 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border-rose-200/60 dark:border-rose-800/60 hover:bg-rose-100 dark:hover:bg-rose-900/50"
      } else {
        base += "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
      }
    }

    // Today (current day) - styled soft blue
    if (isToday) {
      base = "border bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/60"
    }

    // Selected day - bold outline ring styling
    if (isSelected) {
      base += " ring-2 ring-indigo-500 font-semibold scale-[1.02] shadow-sm z-10"
    }

    return base
  }, [activeSources])

  const getTooltip = useCallback((dateStr: string, sources: DaySources | null) => {
    if (!sources) return `${dateStr}: No data`
    const relevantSources = sourceFilter !== null ? activeSources : SOURCE_META
    return relevantSources.map(s => {
      const info = sources[s.key]
      if (info.present) {
        return `✅ ${s.label} (${info.agentCount}${s.key === 'eagent' ? '' : ' agents'})`
      }
      return `❌ ${s.label}`
    }).join(" | ")
  }, [sourceFilter, activeSources])

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

  // Get the active filter's meta for single-dot display
  const activeFilterMeta = useMemo(() => {
    if (sourceFilter === null) return null
    return SOURCE_META.find(s => s.key === sourceFilter) ?? null
  }, [sourceFilter])

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden relative">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <button
          onClick={prevMonth}
          className="p-1.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{monthName}</h3>
        <button
          onClick={nextMonth}
          className="p-1.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Source filter pills */}
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-slate-100 dark:border-slate-800">
        <button
          onClick={() => setSourceFilter(null)}
          className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all duration-150 ${
            sourceFilter === null
              ? "bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 shadow-sm"
              : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200"
          }`}
        >
          All
        </button>
        {SOURCE_META.map((src) => {
          const stats = sourceMtdStats[src.key]
          const isSelected = sourceFilter === src.key
          const isPerfect = stats?.perfect ?? false

          // Build className based on state
          let pillClass = 'px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all duration-200 flex items-center gap-1 '
          if (isSelected) {
            pillClass += 'text-white shadow-sm'
            if (isPerfect) pillClass += ' ring-2 ring-emerald-400/60 ring-offset-1'
          } else if (isPerfect) {
            pillClass += 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/80 hover:bg-emerald-100/80 dark:hover:bg-emerald-900/80'
          } else {
            pillClass += 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
          }

          // Tooltip
          const tooltipText = isPerfect
            ? `Perfect MTD Streak! ${stats.present}/${stats.total} business days uploaded`
            : `${stats?.present ?? 0} of ${stats?.total ?? 0} business days uploaded (${(stats?.total ?? 0) - (stats?.present ?? 0)} gaps)`

          return (
            <button
              key={src.key}
              onClick={() => setSourceFilter(isSelected ? null : src.key)}
              className={pillClass}
              title={tooltipText}
              style={isSelected ? {
                backgroundColor:
                  src.key === 'calls' ? '#38bdf8' :
                  src.key === 'texts' ? '#c084fc' :
                  src.key === 'quotes' ? '#fbbf24' :
                  src.key === 'items' ? '#8b5cf6' :
                  src.key === 'premium' ? '#34d399' :
                  src.key === 'eagent' ? '#fb7185' : '#fb923c'
              } : undefined}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : src.color}`} />
              {src.label}
              <span className="opacity-75 font-mono text-[9px] ml-0.5">({stats?.present ?? 0}/{stats?.total ?? 0})</span>
            </button>
          )
        })}
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-slate-500 dark:text-slate-400 py-1.5">
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
              ${cell.day ? "cursor-pointer" : "cursor-default"}
            `}
            title={cell.day ? getTooltip(cell.dateStr, cell.sources) : undefined}
          >
            {cell.day && (
              <>
                <span className="leading-none text-[11px]">{cell.day}</span>
                {/* Source dots — show all when no filter, or single when filtered */}
                <div className="flex items-center gap-[2px] mt-1">
                  {sourceFilter === null ? (
                    SOURCE_META.map((src) => {
                      const isPresent = cell.sources?.[src.key]?.present ?? false
                      return (
                        <span
                          key={src.key}
                          className={`w-[5px] h-[5px] rounded-full transition-colors duration-200 ${
                            isPresent ? src.color : src.emptyColor
                          }`}
                        />
                      )
                    })
                  ) : activeFilterMeta && (
                    <span
                      className={`w-[6px] h-[6px] rounded-full transition-colors duration-200 ${
                        cell.sources?.[sourceFilter]?.present
                          ? activeFilterMeta.color
                          : activeFilterMeta.emptyColor
                      }`}
                    />
                  )}
                </div>
              </>
            )}
          </button>
        ))}
      </div>

      {/* Gap summary */}
      <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 text-center">
        <span className={`text-xs font-medium ${gapCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
          {gapCount > 0
            ? `${gapCount} business day${gapCount !== 1 ? "s" : ""} with ${sourceFilter !== null ? (activeFilterMeta?.label ?? '') + ' ' : ''}gaps this month`
            : `All business days ${sourceFilter !== null ? (activeFilterMeta?.label ?? '') + ' ' : ''}fully covered ✓`
          }
        </span>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-500 dark:text-slate-400">
        {sourceFilter === null ? (
          <>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60" />
              Synced
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/60" />
              Partial
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded border border-rose-200 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/60" />
              Missing
            </span>
          </>
        ) : (
          <>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60" />
              {activeFilterMeta?.label} Uploaded
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded border border-rose-200 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/60" />
              {activeFilterMeta?.label} Missing
            </span>
          </>
        )}
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/60" />
          Today
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded border border-slate-300 dark:border-slate-700 ring-1 ring-indigo-500 bg-white dark:bg-slate-900" />
          Selected
        </span>
      </div>

      {loading && (
        <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center">
          <div className="animate-spin h-5 w-5 border-2 border-emerald-200 dark:border-emerald-800 border-t-emerald-500 rounded-full" />
        </div>
      )}
    </div>
  )
}
