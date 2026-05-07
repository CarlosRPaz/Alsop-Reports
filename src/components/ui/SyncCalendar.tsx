"use client"

import { useState, useEffect, useMemo } from "react"
import { supabase } from "@/lib/supabaseClient"
import { ChevronLeft, ChevronRight } from "lucide-react"

interface SyncCalendarProps {
  onDateSelect?: (date: string) => void
}

export default function SyncCalendar({ onDateSelect }: SyncCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [syncedDates, setSyncedDates] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)

  // Fetch synced dates for the visible month
  useEffect(() => {
    const fetchSyncedDates = async () => {
      setLoading(true)
      const year = currentMonth.getFullYear()
      const month = currentMonth.getMonth()
      const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`
      const endDate = new Date(year, month + 1, 0) // last day of month
      const endStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`

      try {
        // Get count of agents with non-zero data per date
        const { data, error } = await supabase
          .from("daily_metrics")
          .select("report_date, calls, texts, quotes, nb_count, items, prem_premium")
          .gte("report_date", startDate)
          .lte("report_date", endStr)

        if (error) throw error

        // Count agents with actual data (not all zeros) per date
        const dateCounts = new Map<string, number>()
        if (data) {
          for (const row of data) {
            const d = row.report_date
            const hasData = (row.calls || 0) > 0 || (row.texts || 0) > 0 ||
              (row.quotes || 0) > 0 || (row.nb_count || 0) > 0 ||
              (row.items || 0) > 0 || (row.prem_premium || 0) > 0
            if (hasData) {
              dateCounts.set(d, (dateCounts.get(d) || 0) + 1)
            }
          }
        }
        setSyncedDates(dateCounts)
      } catch (e) {
        console.error("Failed to fetch synced dates:", e)
      } finally {
        setLoading(false)
      }
    }
    fetchSyncedDates()
  }, [currentMonth])

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
      agentCount: number
      isWeekend: boolean
    }> = []

    // Leading empty cells
    for (let i = 0; i < firstDay; i++) {
      days.push({ day: null, dateStr: "", isToday: false, agentCount: 0, isWeekend: false })
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
      const dayOfWeek = new Date(year, month, d).getDay()
      days.push({
        day: d,
        dateStr,
        isToday: dateStr === todayStr,
        agentCount: syncedDates.get(dateStr) || 0,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      })
    }

    return days
  }, [currentMonth, syncedDates])

  const getDateStyle = (agentCount: number, isToday: boolean, isWeekend: boolean) => {
    if (isToday) {
      if (agentCount > 0) return "ring-2 ring-emerald-400 bg-emerald-100 text-emerald-700"
      return "ring-2 ring-blue-400 bg-blue-50 text-blue-700"
    }
    if (agentCount >= 20) return "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
    if (agentCount >= 10) return "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
    if (agentCount > 0) return "bg-slate-50 text-emerald-600 hover:bg-emerald-50 ring-1 ring-inset ring-slate-100"
    if (isWeekend) return "text-slate-400 hover:bg-slate-50"
    return "text-slate-600 hover:bg-slate-50"
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
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
            onClick={() => cell.day && onDateSelect?.(cell.dateStr)}
            className={`
              relative aspect-square flex flex-col items-center justify-center rounded-md
              text-xs font-medium transition-all duration-150 
              ${cell.day ? getDateStyle(cell.agentCount, cell.isToday, cell.isWeekend) : ""}
              ${cell.day ? "cursor-pointer" : "cursor-default"}
            `}
            title={cell.day ? `${cell.dateStr}: ${cell.agentCount} agents synced` : undefined}
          >
            {cell.day && (
              <>
                <span className="leading-none">{cell.day}</span>
                {cell.agentCount > 0 && (
                  <span className="text-[8px] leading-none mt-0.5 opacity-70">{cell.agentCount}</span>
                )}
              </>
            )}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 px-4 py-2 border-t border-slate-100 text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-emerald-100" />
          Synced
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-slate-100" />
          No data
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm ring-1 ring-blue-400 bg-blue-50" />
          Today
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
