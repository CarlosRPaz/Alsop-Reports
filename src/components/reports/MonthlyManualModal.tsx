"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/Button"
import { AlertCircle, X, CheckCircle2, ChevronRight, Calendar } from "lucide-react"
import { supabase } from "@/lib/supabaseClient"
import { WeeklyManualModal } from "./WeeklyManualModal"

interface MonthlyManualModalProps {
  isOpen: boolean
  onClose: () => void
  year: number
  month: number
  metrics: any[]       // MTD metrics (for passing to WeeklyManualModal)
  onSuccess: () => void
}

interface WeekInfo {
  weekStart: string    // e.g. "2026-06-02"
  weekEnd: string      // e.g. "2026-06-06"
  label: string        // e.g. "Jun 2 – Jun 6"
  submitted: boolean
  isFuture: boolean
}

function getMondays(year: number, month: number): string[] {
  const mondays: string[] = []
  const daysInMonth = new Date(year, month, 0).getDate()
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d)
    if (date.getDay() === 1) {
      mondays.push(date.toISOString().split("T")[0])
    }
  }
  return mondays
}

function formatWeekLabel(weekStart: string, weekEnd: string): string {
  const start = new Date(weekStart + "T12:00:00")
  const end = new Date(weekEnd + "T12:00:00")
  const shortMonth = (d: Date) => d.toLocaleDateString("en-US", { month: "short" })
  return `${shortMonth(start)} ${start.getDate()} – ${shortMonth(end)} ${end.getDate()}`
}

function getFriday(mondayStr: string): string {
  const d = new Date(mondayStr + "T12:00:00")
  d.setDate(d.getDate() + 4)
  return d.toISOString().split("T")[0]
}

export function MonthlyManualModal({ isOpen, onClose, year, month, metrics, onSuccess }: MonthlyManualModalProps) {
  const [weeks, setWeeks] = useState<WeekInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null)
  const [weeklyMetrics, setWeeklyMetrics] = useState<any[]>([])
  const [weeklyAutoSums, setWeeklyAutoSums] = useState<Record<string, any>>({})
  const [weeklyManualSubmitted, setWeeklyManualSubmitted] = useState(false)
  const [weeklyEagentComplete, setWeeklyEagentComplete] = useState(false)

  const monthName = new Date(year, month - 1).toLocaleDateString("en-US", { month: "long" })

  // Load week submission status
  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    setSelectedWeek(null)

    async function loadWeeks() {
      const mondays = getMondays(year, month)
      const todayStr = new Date().toISOString().split("T")[0]

      // Fetch submission status for these weeks
      const { data: meta } = await supabase
        .from("weekly_reports_meta")
        .select("week_start, manual_submitted")
        .in("week_start", mondays)

      const metaMap: Record<string, boolean> = {}
      if (meta) {
        for (const m of meta) {
          metaMap[m.week_start] = m.manual_submitted || false
        }
      }

      const weekInfos: WeekInfo[] = mondays.map(monday => {
        const friday = getFriday(monday)
        return {
          weekStart: monday,
          weekEnd: friday,
          label: formatWeekLabel(monday, friday),
          submitted: metaMap[monday] || false,
          isFuture: monday > todayStr,
        }
      })

      setWeeks(weekInfos)
      setLoading(false)
    }

    loadWeeks()
  }, [isOpen, year, month])

  // When a week is selected, load its data for the WeeklyManualModal
  const openWeek = useCallback(async (weekStart: string) => {
    const friday = getFriday(weekStart)
    
    // Fetch weekly data for this specific week
    const { data: weeklyData } = await supabase
      .from("daily_metrics")
      .select("*, agents!inner(id, name, team, office, meeting_time, active, report_visible)")
      .gte("report_date", weekStart)
      .lte("report_date", friday)
      .eq("agents.active", true)
      .eq("agents.report_visible", true)

    // Fetch weekly manual data
    const { data: manualData } = await supabase
      .from("weekly_manual_metrics")
      .select("*")
      .eq("week_start", weekStart)

    // Fetch meta
    const { data: meta } = await supabase
      .from("weekly_reports_meta")
      .select("manual_submitted")
      .eq("week_start", weekStart)
      .single()

    // Build per-agent aggregations (sum for the week)
    // Pre-populate with ALL active/visible agents so new agents show up
    const { data: allActiveAgents } = await supabase
      .from("agents")
      .select("id, name, team, office, meeting_time, active, report_visible")
      .eq("active", true)
      .eq("report_visible", true)

    const agentMap: Record<string, any> = {}
    for (const agent of (allActiveAgents || [])) {
      agentMap[agent.id] = {
        agent_id: agent.id,
        agents: agent,
        pivot: 0,
        dismissed_todos: 0,
        unique_leads: 0,
        rico_hot_pipeline: 0,
        saved: 0,
        past_due_todos: 0,
        rico_past_due_tasks: 0,
        w_dismissed_todos: 0,
        w_past_due_todos: 0,
      }
    }

    for (const row of (weeklyData || [])) {
      const aid = row.agent_id
      if (!agentMap[aid]) continue
      agentMap[aid].pivot += row.pivots || 0
      agentMap[aid].dismissed_todos += row.dismissed_todos || 0
    }

    // Merge manual data if it exists
    if (manualData) {
      for (const wm of manualData) {
        if (agentMap[wm.agent_id]) {
          agentMap[wm.agent_id].unique_leads = wm.unique_leads || 0
          agentMap[wm.agent_id].rico_hot_pipeline = wm.rico_hot_pipeline || 0
          agentMap[wm.agent_id].pivot = wm.pivot || 0
          agentMap[wm.agent_id].saved = wm.saved || 0
          agentMap[wm.agent_id].w_dismissed_todos = wm.dismissed_todos || 0
          agentMap[wm.agent_id].w_past_due_todos = wm.past_due_todos || 0
          agentMap[wm.agent_id].rico_past_due_tasks = wm.rico_past_due_tasks || 0
        }
      }
    }

    // Build auto-sums for pre-population
    const autoSums: Record<string, any> = {}
    for (const [aid, data] of Object.entries(agentMap)) {
      autoSums[aid] = {
        pivot: (data as any).pivot || 0,
        dismissed_todos: (data as any).dismissed_todos || 0,
      }
    }

    setWeeklyMetrics(Object.values(agentMap))
    setWeeklyAutoSums(autoSums)
    setWeeklyManualSubmitted(meta?.manual_submitted || false)
    setWeeklyEagentComplete(true) // Not critical for this context
    setSelectedWeek(weekStart)
  }, [])

  const handleWeeklySuccess = useCallback(async () => {
    // Reload week statuses
    const mondays = getMondays(year, month)
    const { data: meta } = await supabase
      .from("weekly_reports_meta")
      .select("week_start, manual_submitted")
      .in("week_start", mondays)

    const metaMap: Record<string, boolean> = {}
    if (meta) {
      for (const m of meta) {
        metaMap[m.week_start] = m.manual_submitted || false
      }
    }

    setWeeks(prev => prev.map(w => ({
      ...w,
      submitted: metaMap[w.weekStart] || false,
    })))

    setSelectedWeek(null)
    onSuccess()
  }, [year, month, onSuccess])

  if (!isOpen) return null

  // Summary stats
  const totalWeeks = weeks.filter(w => !w.isFuture).length
  const submittedWeeks = weeks.filter(w => w.submitted).length
  const allDone = totalWeeks > 0 && submittedWeeks === totalWeeks

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
          
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
            <div>
              <h2 className="text-base font-bold text-slate-900">Monthly Manual Entry</h2>
              <p className="text-xs text-slate-500">{monthName} {year} • Enter data per week</p>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-900 transition-colors p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Summary bar */}
          <div className="flex items-center gap-4 px-5 py-2.5 bg-slate-50 border-b border-slate-200 text-[11px]">
            <span className="text-slate-600">
              <span className="text-slate-900 font-semibold">{submittedWeeks}</span> / {totalWeeks} weeks submitted
            </span>
            {allDone && (
              <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                <CheckCircle2 className="w-3 h-3" /> All complete
              </span>
            )}
          </div>

          {/* Body */}
          <div className="flex-grow overflow-y-auto px-4 py-3 space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin h-5 w-5 border-2 border-slate-300 border-t-blue-500 rounded-full" />
                <span className="ml-3 text-sm text-slate-500">Loading weeks...</span>
              </div>
            ) : (
              weeks.map(week => (
                <button
                  key={week.weekStart}
                  onClick={() => !week.isFuture && openWeek(week.weekStart)}
                  disabled={week.isFuture}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-all text-left ${
                    week.isFuture
                      ? "bg-slate-50 border-slate-100 text-slate-400 cursor-not-allowed"
                      : week.submitted
                        ? "bg-emerald-50 border-emerald-200 hover:bg-emerald-100 cursor-pointer"
                        : "bg-amber-50 border-amber-200 hover:bg-amber-100 cursor-pointer animate-pulse"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Calendar className={`w-4 h-4 ${
                      week.isFuture ? "text-slate-300" : week.submitted ? "text-emerald-500" : "text-amber-500"
                    }`} />
                    <div>
                      <p className={`text-sm font-semibold ${
                        week.isFuture ? "text-slate-400" : "text-slate-900"
                      }`}>{week.label}</p>
                      <p className="text-[10px] text-slate-500">
                        Week of {week.weekStart}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {week.isFuture ? (
                      <span className="text-[10px] text-slate-400 font-medium">Future</span>
                    ) : week.submitted ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-amber-600 font-semibold">
                        <AlertCircle className="w-3.5 h-3.5" /> Enter
                      </span>
                    )}
                    {!week.isFuture && <ChevronRight className="w-4 h-4 text-slate-400" />}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 rounded-b-xl">
            <Button variant="outline" onClick={onClose} className="w-full text-slate-600 border-slate-300 hover:bg-slate-200 text-xs">
              Close
            </Button>
          </div>

        </div>
      </div>

      {/* Weekly Modal (opens on top when a week is clicked) */}
      {selectedWeek && (
        <WeeklyManualModal
          isOpen={true}
          onClose={() => setSelectedWeek(null)}
          weekStartStr={selectedWeek}
          weekLabel={formatWeekLabel(selectedWeek, getFriday(selectedWeek))}
          agents={weeklyMetrics}
          onSuccess={handleWeeklySuccess}
          autoSums={weeklyAutoSums}
          manualSubmitted={weeklyManualSubmitted}
          eagentComplete={weeklyEagentComplete}
        />
      )}
    </>
  )
}
