"use client"

import { useEffect, useState, useMemo } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Card, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { CalendarDays, Plus, Trash2, ChevronLeft, ChevronRight, Info } from "lucide-react"
import { getBusinessDaysInMonth, toHolidaySet } from "@/lib/businessDays"

interface Holiday {
  id: string
  holiday_date: string
  name: string
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
]

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export default function HolidayCalendar() {
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())

  // Add holiday form
  const [addDate, setAddDate] = useState("")
  const [addName, setAddName] = useState("")
  const [adding, setAdding] = useState(false)

  const fetchHolidays = async () => {
    setLoading(true)
    const { data } = await supabase
      .from("holidays")
      .select("*")
      .gte("holiday_date", `${year}-01-01`)
      .lte("holiday_date", `${year}-12-31`)
      .order("holiday_date")
    setHolidays((data as Holiday[]) || [])
    setLoading(false)
  }

  useEffect(() => { fetchHolidays() }, [year])

  const holidaySet = useMemo(() => toHolidaySet(holidays), [holidays])
  const holidayMap = useMemo(() => {
    const map: Record<string, Holiday> = {}
    holidays.forEach(h => { map[h.holiday_date] = h })
    return map
  }, [holidays])

  // Year-level stats
  const yearStats = useMemo(() => {
    let totalBizDays = 0
    const monthlyBizDays: number[] = []
    for (let m = 1; m <= 12; m++) {
      const bd = getBusinessDaysInMonth(year, m, holidaySet)
      monthlyBizDays.push(bd)
      totalBizDays += bd
    }
    return { totalBizDays, monthlyBizDays }
  }, [year, holidaySet])

  const handleAdd = async () => {
    if (!addDate || !addName.trim()) return
    setAdding(true)
    const { error } = await supabase.from("holidays").insert([{
      holiday_date: addDate,
      name: addName.trim()
    }])
    if (!error) {
      setAddDate("")
      setAddName("")
      await fetchHolidays()
    }
    setAdding(false)
  }

  const handleDelete = async (id: string) => {
    await supabase.from("holidays").delete().eq("id", id)
    fetchHolidays()
  }

  // Generate calendar grid for a single month
  function MonthGrid({ month }: { month: number }) {
    const firstDay = new Date(year, month - 1, 1).getDay()
    const daysInMonth = new Date(year, month, 0).getDate()
    const today = new Date()
    const todayStr = today.toISOString().split("T")[0]

    const cells: React.ReactNode[] = []
    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
      cells.push(<div key={`empty-${i}`} className="w-8 h-8" />)
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day)
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      const isWeekend = date.getDay() === 0 || date.getDay() === 6
      const isHoliday = holidayMap[dateStr]
      const isToday = dateStr === todayStr

      let cellClass = "w-8 h-8 rounded-md text-xs font-medium flex items-center justify-center relative transition-colors "
      if (isHoliday) {
        cellClass += "bg-red-100 text-red-700 font-bold ring-1 ring-red-300"
      } else if (isWeekend) {
        cellClass += "bg-slate-100 text-slate-400"
      } else {
        cellClass += "bg-white text-slate-700 hover:bg-blue-50"
      }

      if (isToday) {
        cellClass += " ring-2 ring-blue-500"
      }

      cells.push(
        <div key={day} className={cellClass} title={isHoliday ? isHoliday.name : undefined}>
          {day}
          {isHoliday && (
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500" />
          )}
        </div>
      )
    }

    const bizDays = yearStats.monthlyBizDays[month - 1]

    return (
      <div className="bg-white border border-slate-200 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-slate-800">{MONTH_NAMES[month - 1]}</h3>
          <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
            {bizDays} biz days
          </Badge>
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {DAY_LABELS.map(d => (
            <div key={d} className="w-8 h-5 text-[9px] font-semibold text-slate-400 flex items-center justify-center uppercase">
              {d}
            </div>
          ))}
          {cells}
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-3">
            <CalendarDays className="w-7 h-7 text-red-500" />
            Holiday Calendar
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Manage observed holidays to exclude from business day calculations.
          </p>
        </div>

        {/* Year Selector */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setYear(y => y - 1)}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-lg font-bold text-slate-900 min-w-[60px] text-center">{year}</span>
          <button
            onClick={() => setYear(y => y + 1)}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Holiday Announcement Banner */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex items-center justify-start shadow-sm">
        <h2 className="text-lg font-medium text-slate-700 flex items-center gap-2">
          <span className="text-xl">✨</span> 
          Happy Holidays & Warm Wishes
        </h2>
      </div>

      {/* Year Summary */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
        <div>
          <strong>{year} Summary:</strong> {yearStats.totalBizDays} total business days
          <span className="text-blue-600 ml-1">({holidays.length} holidays observed)</span>.
          Business days exclude weekends (Sat/Sun) and all holidays listed below.
        </div>
      </div>

      {/* Add Holiday Form */}
      <Card className="border-dashed border-slate-300">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Date</label>
              <input
                type="date"
                value={addDate}
                onChange={e => setAddDate(e.target.value)}
                className="bg-white border border-slate-300 rounded-md px-3 py-1.5 text-sm text-slate-700 focus:ring-2 focus:ring-blue-400 outline-none"
              />
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Holiday Name</label>
              <input
                type="text"
                value={addName}
                onChange={e => setAddName(e.target.value)}
                placeholder="e.g., Memorial Day"
                onKeyDown={e => e.key === "Enter" && handleAdd()}
                className="bg-white border border-slate-300 rounded-md px-3 py-1.5 text-sm text-slate-700 focus:ring-2 focus:ring-blue-400 outline-none"
              />
            </div>
            <Button
              onClick={handleAdd}
              disabled={adding || !addDate || !addName.trim()}
              className="bg-red-600 hover:bg-red-500 text-white flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Add Holiday
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Calendar Grid — 12 Months */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-red-500"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 12 }, (_, i) => (
            <MonthGrid key={i} month={i + 1} />
          ))}
        </div>
      )}

      {/* Holiday List */}
      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
            <h3 className="text-sm font-bold text-slate-800">
              {year} Observed Holidays
              <Badge variant="outline" className="ml-2 text-[10px]">{holidays.length}</Badge>
            </h3>
          </div>
          {holidays.length === 0 ? (
            <p className="text-sm text-slate-400 px-4 py-6 text-center">
              No holidays set for {year}. Add one above.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {holidays.map(h => {
                const dateObj = new Date(h.holiday_date + "T00:00:00")
                const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dateObj.getDay()]
                const monthName = MONTH_NAMES[dateObj.getMonth()]
                return (
                  <div key={h.id} className="flex items-center justify-between px-4 py-2.5 group hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                      <div>
                        <span className="text-sm font-medium text-slate-800">{h.name}</span>
                        <span className="text-xs text-slate-400 ml-2">
                          {dayName}, {monthName} {dateObj.getDate()}, {year}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(h.id)}
                      className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 text-slate-300 hover:text-red-500 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
