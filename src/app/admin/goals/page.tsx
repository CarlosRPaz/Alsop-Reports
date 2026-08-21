"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import {
  Target, Check, X, Phone, MessageSquare, BarChart3, ClipboardList,
  CalendarDays, Zap, RefreshCw, Layers, ShieldCheck, ArrowRight,
  Info, Sparkles, Filter, CheckCircle2, Loader2, Trash2,
  Medal, Award, Trophy, Crown, Flame, Star, Eye, Compass
} from "lucide-react"
import { getBusinessDaysInMonth, toHolidaySet } from "@/lib/businessDays"

// ─── KPI Definitions ────────────────────────────────────────────────────────────

interface MetricDef {
  key: string
  label: string
  shortLabel: string
  unit?: "$" | "min"
  step?: number
}

interface KPIGroup {
  label: string
  shortLabel: string
  icon: React.ComponentType<{ className?: string }>
  color: "sky" | "teal" | "amber" | "violet"
  metrics: MetricDef[]
}

const KPI_GROUPS: KPIGroup[] = [
  {
    label: "Phone (RC / Ricochet)",
    shortLabel: "Phone",
    icon: Phone,
    color: "sky",
    metrics: [
      { key: "calls", label: "Total Calls", shortLabel: "Calls" },
      { key: "inbound", label: "Inbound Calls", shortLabel: "Inb" },
      { key: "outbound", label: "Outbound Calls", shortLabel: "Out" },
      { key: "talk_time_seconds", label: "Talk Time", shortLabel: "Talk", unit: "min" },
    ],
  },
  {
    label: "Messaging (Hearsay)",
    shortLabel: "Texts",
    icon: MessageSquare,
    color: "teal",
    metrics: [
      { key: "texts", label: "Total Texts", shortLabel: "Texts" },
      { key: "out_texts", label: "Outbound Texts", shortLabel: "Out Texts" },
      { key: "opt_ins", label: "Opt-Ins", shortLabel: "Opt-Ins" },
    ],
  },
  {
    label: "Production",
    shortLabel: "Production",
    icon: BarChart3,
    color: "amber",
    metrics: [
      { key: "quotes", label: "Quotes Issued", shortLabel: "Quotes" },
      { key: "nb_count", label: "New Business", shortLabel: "NB" },
      { key: "prem_premium", label: "Written Premium", shortLabel: "Prem", unit: "$" },
      { key: "items", label: "Items Sold", shortLabel: "Items" },
    ],
  },
  {
    label: "Operations (eAgent)",
    shortLabel: "Ops",
    icon: ClipboardList,
    color: "violet",
    metrics: [
      { key: "dismissed_todos", label: "Dismissed To-Do's", shortLabel: "Dismiss" },
      { key: "past_due_todos", label: "Past Due To-Do's", shortLabel: "Past Due" },
      { key: "pivots", label: "Pivots Logged", shortLabel: "Pivots" },
    ],
  },
]

const ALL_METRICS: MetricDef[] = KPI_GROUPS.flatMap(g => g.metrics)

const TEAMS = ["Sales", "CSR", "EA", "Managers"]
const OFFICES = ["MCM", "MB", "RC", "CH"]

interface GoalRecord {
  id: string
  metric_name: string
  timeframe: "daily" | "weekly" | "monthly" | "ytd"
  target_value: number
  office: string | null
  team: string | null
}

type EntityType = "baseline" | "team" | "office"

interface EntityRow {
  id: string
  type: EntityType
  name: string
  label: string
  sublabel: string
}

const ENTITY_ROWS: EntityRow[] = [
  { id: "baseline", type: "baseline", name: "Agency Baseline", label: "🌐 Agency Baseline", sublabel: "Default for all agents" },
  { id: "team-Sales", type: "team", name: "Sales", label: "👥 Sales Team", sublabel: "Team Override" },
  { id: "team-CSR", type: "team", name: "CSR", label: "👥 CSR Team", sublabel: "Team Override" },
  { id: "team-EA", type: "team", name: "EA", label: "👥 EA Team", sublabel: "Team Override" },
  { id: "team-Managers", type: "team", name: "Managers", label: "👥 Managers", sublabel: "Team Override" },
  { id: "office-MCM", type: "office", name: "MCM", label: "🏢 MCM Office", sublabel: "Office Override" },
  { id: "office-MB", type: "office", name: "MB", label: "🏢 MB Office", sublabel: "Office Override" },
  { id: "office-RC", type: "office", name: "RC", label: "🏢 RC Office", sublabel: "Office Override" },
  { id: "office-CH", type: "office", name: "CH", label: "🏢 CH Office", sublabel: "Office Override" },
]

export default function GoalManagement() {
  const [goals, setGoals] = useState<GoalRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [timeframe, setTimeframe] = useState<"daily" | "weekly" | "monthly">("daily")
  const [entityFilter, setEntityFilter] = useState<"all" | "teams" | "offices">("all")
  
  // Realtime save status
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle")
  
  // In-cell editing
  const [activeCell, setActiveCell] = useState<{ entityId: string; metricKey: string } | null>(null)
  const [inputValue, setInputValue] = useState<string>("")
  const [timeHours, setTimeHours] = useState<number>(0)
  const [timeMinutes, setTimeMinutes] = useState<number>(0)
  
  // Working days context
  const [bizDaysInMonth, setBizDaysInMonth] = useState<number>(21)
  const [currentMonthName, setCurrentMonthName] = useState<string>("")
  const [autoProrating, setAutoProrating] = useState<boolean>(false)

  // Top-level Mode Switch
  const [activeAdminTab, setActiveAdminTab] = useState<"matrix" | "medals">("matrix")

  // Medals Designer state
  const [medalsDesignOption, setMedalsDesignOption] = useState<"ribbon" | "showcase" | "strip">("ribbon")
  const [previewAgentName, setPreviewAgentName] = useState<string>("Charmaine")
  const [preview40Count, setPreview40Count] = useState<number>(3)

  // Hover preview inspector
  const [hoveredCell, setHoveredCell] = useState<{
    entity: EntityRow
    metric: MetricDef
    val: number | null
    isOverride: boolean
    baselineVal: number | null
  } | null>(null)

  // ─── Fetch Goals & Business Days ──────────────────────────────────────────────

  const fetchGoals = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from("kpi_goals")
        .select("*")
        .eq("timeframe", timeframe)
      
      if (error) throw error
      setGoals((data as GoalRecord[]) || [])
    } catch (err) {
      console.error("Error fetching goals:", err)
    } finally {
      setLoading(false)
    }
  }, [timeframe])

  const fetchBusinessDays = useCallback(async () => {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const monthName = now.toLocaleString("default", { month: "long" })
    setCurrentMonthName(monthName)

    try {
      const { data: holidays } = await supabase
        .from("holidays")
        .select("holiday_date")
        .gte("holiday_date", `${year}-01-01`)
        .lte("holiday_date", `${year}-12-31`)

      const holidaySet = toHolidaySet(holidays || [])
      const bDays = getBusinessDaysInMonth(year, month, holidaySet)
      setBizDaysInMonth(bDays || 21)
    } catch (e) {
      setBizDaysInMonth(21)
    }
  }, [])

  useEffect(() => {
    fetchGoals()
  }, [fetchGoals])

  useEffect(() => {
    fetchBusinessDays()
  }, [fetchBusinessDays])

  // ─── Goal Lookup Helpers ──────────────────────────────────────────────────────

  const goalMap = useMemo(() => {
    const map = new Map<string, GoalRecord>()
    goals.forEach(g => {
      let key = ""
      if (!g.team && !g.office) {
        key = `baseline:${g.metric_name}`
      } else if (g.team) {
        key = `team:${g.team}:${g.metric_name}`
      } else if (g.office) {
        key = `office:${g.office}:${g.metric_name}`
      }
      if (key) map.set(key, g)
    })
    return map
  }, [goals])

  const getGoalForEntity = (entity: EntityRow, metricKey: string): GoalRecord | undefined => {
    if (entity.type === "baseline") {
      return goalMap.get(`baseline:${metricKey}`)
    } else if (entity.type === "team") {
      return goalMap.get(`team:${entity.name}:${metricKey}`)
    } else if (entity.type === "office") {
      return goalMap.get(`office:${entity.name}:${metricKey}`)
    }
    return undefined
  }

  const getBaselineGoal = (metricKey: string): GoalRecord | undefined => {
    return goalMap.get(`baseline:${metricKey}`)
  }

  // ─── Save / Delete Goal Mutations ─────────────────────────────────────────────

  const saveCell = async (entity: EntityRow, metric: MetricDef, rawValue: number) => {
    setSaveStatus("saving")
    const existing = getGoalForEntity(entity, metric.key)

    try {
      if (rawValue <= 0 || isNaN(rawValue)) {
        // If override cleared or set to 0, delete override
        if (existing && entity.type !== "baseline") {
          await supabase.from("kpi_goals").delete().eq("id", existing.id)
        } else if (existing && entity.type === "baseline") {
          await supabase.from("kpi_goals").update({ target_value: 0 }).eq("id", existing.id)
        }
      } else {
        if (existing) {
          await supabase.from("kpi_goals").update({ target_value: rawValue }).eq("id", existing.id)
        } else {
          const payload: Partial<GoalRecord> = {
            metric_name: metric.key,
            timeframe: timeframe,
            target_value: rawValue,
            team: entity.type === "team" ? entity.name : null,
            office: entity.type === "office" ? entity.name : null,
          }
          await supabase.from("kpi_goals").insert([payload])
        }
      }
      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 2500)
      fetchGoals()
    } catch (err) {
      console.error("Save error:", err)
      setSaveStatus("idle")
    }
  }

  const deleteOverride = async (goalId: string) => {
    setSaveStatus("saving")
    try {
      await supabase.from("kpi_goals").delete().eq("id", goalId)
      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 2000)
      fetchGoals()
    } catch (err) {
      console.error("Delete error:", err)
      setSaveStatus("idle")
    }
  }

  // ─── Cell Interaction Logic ───────────────────────────────────────────────────

  const handleCellClick = (entity: EntityRow, metric: MetricDef) => {
    const existing = getGoalForEntity(entity, metric.key)
    const baseline = getBaselineGoal(metric.key)
    const currentVal = existing ? existing.target_value : (baseline?.target_value ?? 0)

    setActiveCell({ entityId: entity.id, metricKey: metric.key })

    if (metric.unit === "min") {
      setTimeHours(Math.floor(currentVal / 60))
      setTimeMinutes(currentVal % 60)
    } else {
      setInputValue(currentVal > 0 ? String(currentVal) : "")
    }
  }

  const handleCommit = (entity: EntityRow, metric: MetricDef) => {
    let numericVal = 0
    if (metric.unit === "min") {
      numericVal = (timeHours * 60) + timeMinutes
    } else {
      numericVal = parseFloat(inputValue)
    }

    saveCell(entity, metric, numericVal)
    setActiveCell(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent, entity: EntityRow, metric: MetricDef) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleCommit(entity, metric)
    } else if (e.key === "Escape") {
      setActiveCell(null)
    }
  }

  // ─── Smart Auto-Calculate Between Timeframes ─────────────────────────────────

  const handleAutoProrate = async (sourceTimeframe: "daily" | "weekly" | "monthly") => {
    const confirmMsg = `Auto-calculate ${timeframe.toUpperCase()} Goals from ${sourceTimeframe.toUpperCase()} Goals?`

    if (!window.confirm(confirmMsg)) return

    setAutoProrating(true)
    setSaveStatus("saving")

    try {
      const { data: sourceGoals } = await supabase
        .from("kpi_goals")
        .select("*")
        .eq("timeframe", sourceTimeframe)

      if (!sourceGoals || sourceGoals.length === 0) {
        alert(`No ${sourceTimeframe} goals found to convert from.`)
        setAutoProrating(false)
        setSaveStatus("idle")
        return
      }

      for (const sg of sourceGoals) {
        let calculated = 0
        const val = Number(sg.target_value)

        if (sourceTimeframe === "daily" && timeframe === "weekly") {
          calculated = Math.round(val * 5)
        } else if (sourceTimeframe === "daily" && timeframe === "monthly") {
          calculated = Math.round(val * bizDaysInMonth)
        } else if (sourceTimeframe === "weekly" && timeframe === "daily") {
          calculated = Math.round((val / 5) * 10) / 10
        } else if (sourceTimeframe === "weekly" && timeframe === "monthly") {
          calculated = Math.round((val / 5) * bizDaysInMonth)
        } else if (sourceTimeframe === "monthly" && timeframe === "weekly") {
          calculated = Math.round((val / bizDaysInMonth) * 5)
        } else if (sourceTimeframe === "monthly" && timeframe === "daily") {
          calculated = Math.round((val / bizDaysInMonth) * 10) / 10
        }

        // Upsert into current target timeframe
        const { data: existing } = await supabase
          .from("kpi_goals")
          .select("id")
          .eq("timeframe", timeframe)
          .eq("metric_name", sg.metric_name)
          .is("team", sg.team ? undefined : null)
          .is("office", sg.office ? undefined : null)
          .match(sg.team ? { team: sg.team } : sg.office ? { office: sg.office } : {})
          .maybeSingle()

        if (existing) {
          await supabase.from("kpi_goals").update({ target_value: calculated }).eq("id", existing.id)
        } else {
          await supabase.from("kpi_goals").insert([{
            metric_name: sg.metric_name,
            timeframe: timeframe,
            target_value: calculated,
            team: sg.team,
            office: sg.office,
          }])
        }
      }

      await fetchGoals()
      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 2500)
    } catch (err) {
      console.error("Auto-prorate error:", err)
    } finally {
      setAutoProrating(false)
    }
  }

  // ─── Formatters ───────────────────────────────────────────────────────────────

  const formatDisplay = (val: number | null | undefined, unit?: "$" | "min") => {
    if (val === null || val === undefined || val === 0) return "—"
    if (unit === "$") return `$${val.toLocaleString()}`
    if (unit === "min") {
      const h = Math.floor(val / 60)
      const m = val % 60
      if (h > 0 && m > 0) return `${h}h ${m}m`
      if (h > 0) return `${h}h`
      return `${m}m`
    }
    return val.toLocaleString()
  }

  // Filtered rows
  const visibleEntities = useMemo(() => {
    if (entityFilter === "teams") {
      return ENTITY_ROWS.filter(r => r.type === "baseline" || r.type === "team")
    }
    if (entityFilter === "offices") {
      return ENTITY_ROWS.filter(r => r.type === "baseline" || r.type === "office")
    }
    return ENTITY_ROWS
  }, [entityFilter])

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-4 min-h-screen">
      
      {/* ─── Compact Header Toolbar ────────────────────────────────────────────── */}
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-inner">
            {activeAdminTab === "matrix" ? <Target className="w-5 h-5" /> : <Medal className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black tracking-tight text-slate-900">
                {activeAdminTab === "matrix" ? "KPI Goals & Target Matrix" : "Agency Medals & Milestones"}
              </h1>
              {activeAdminTab === "medals" && (
                <Badge variant="warning" className="text-[10px] py-0 font-bold bg-amber-100 text-amber-800 border-amber-300">
                  Roadmap & Live Designer
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 font-medium">
              {activeAdminTab === "matrix" 
                ? "Configure baseline benchmarks & team/office target overrides. Highlighting applies automatically to all reports."
                : "Plan, configure, and preview gamification medals and agent portal celebration banners."}
            </p>
          </div>
        </div>

        {/* Primary View Switcher */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex p-1 bg-slate-100 rounded-lg border border-slate-200 shadow-inner">
            <button
              onClick={() => setActiveAdminTab("matrix")}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
                activeAdminTab === "matrix"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              <Target className="w-3.5 h-3.5 text-amber-500" />
              Target Matrix
            </button>
            <button
              onClick={() => setActiveAdminTab("medals")}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
                activeAdminTab === "medals"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              <Medal className="w-3.5 h-3.5 text-amber-500" />
              Medals & Milestones
            </button>
          </div>

          {activeAdminTab === "matrix" && (
            <>
              {/* Timeframe 3-Way Toggle */}
              <div className="inline-flex p-1 bg-slate-100 rounded-lg border border-slate-200 shadow-inner">
                <button
                  onClick={() => setTimeframe("daily")}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                    timeframe === "daily"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  📅 Daily
                </button>
                <button
                  onClick={() => setTimeframe("weekly")}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                    timeframe === "weekly"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  📊 Weekly
                </button>
                <button
                  onClick={() => setTimeframe("monthly")}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                    timeframe === "monthly"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  📆 Monthly
                </button>
              </div>

              {/* Entity Filter */}
              <div className="inline-flex p-1 bg-slate-100 rounded-lg border border-slate-200">
                <button
                  onClick={() => setEntityFilter("all")}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                    entityFilter === "all" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                  }`}
                >
                  All Rows
                </button>
                <button
                  onClick={() => setEntityFilter("teams")}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                    entityFilter === "teams" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                  }`}
                >
                  Teams
                </button>
                <button
                  onClick={() => setEntityFilter("offices")}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                    entityFilter === "offices" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                  }`}
                >
                  Offices
                </button>
              </div>

              {/* Auto-Prorate / Sync Buttons */}
              {timeframe === "weekly" && (
                <div className="inline-flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAutoProrate("daily")}
                    disabled={autoProrating}
                    className="h-8 text-xs font-semibold border-amber-300 text-amber-800 bg-amber-50/50 hover:bg-amber-100/80 gap-1.5"
                    title="Multiply daily targets by 5 days"
                  >
                    {autoProrating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-amber-600" />}
                    Sync from Daily (×5d)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAutoProrate("monthly")}
                    disabled={autoProrating}
                    className="h-8 text-xs font-semibold border-slate-300 text-slate-700 bg-white hover:bg-slate-50 gap-1.5"
                    title="Divide monthly targets by working weeks"
                  >
                    Prorate from Monthly
                  </Button>
                </div>
              )}

              {timeframe === "daily" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAutoProrate("weekly")}
                  disabled={autoProrating}
                  className="h-8 text-xs font-semibold border-amber-300 text-amber-800 bg-amber-50/50 hover:bg-amber-100/80 gap-1.5"
                  title="Divide weekly targets by 5 days"
                >
                  {autoProrating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-amber-600" />}
                  Prorate from Weekly (÷5d)
                </Button>
              )}

              {timeframe === "monthly" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAutoProrate("weekly")}
                  disabled={autoProrating}
                  className="h-8 text-xs font-semibold border-amber-300 text-amber-800 bg-amber-50/50 hover:bg-amber-100/80 gap-1.5"
                  title={`Multiply weekly targets by ${Math.round((bizDaysInMonth / 5) * 10) / 10} weeks`}
                >
                  {autoProrating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-amber-600" />}
                  Sync from Weekly (×{(Math.round((bizDaysInMonth / 5) * 10) / 10)}w)
                </Button>
              )}

              {/* Save status badge */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-medium border border-slate-200 bg-slate-50 text-slate-600">
                {saveStatus === "saving" && (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
                    <span>Saving...</span>
                  </>
                )}
                {saveStatus === "saved" && (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    <span className="text-emerald-700 font-bold">Saved ✓</span>
                  </>
                )}
                {saveStatus === "idle" && (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                    <span>Live Sync</span>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </header>

      {/* ─── Main Views: Medals vs Target Matrix ─────────────────────────────────── */}
      {activeAdminTab === "medals" ? (
        <div className="space-y-6">
          {/* Section 1: Architecture & Plan for 40-Club */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Card className="lg:col-span-2 border-slate-200 shadow-sm bg-white">
              <CardHeader className="pb-3 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                      <Trophy className="w-4 h-4" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-black text-slate-900">
                        Monthly 40-Club Milestone: Implementation Architecture
                      </CardTitle>
                      <p className="text-xs text-slate-500 font-medium">
                        Automatic historical data qualification & badge progression pipeline
                      </p>
                    </div>
                  </div>
                  <Badge variant="success" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold">
                    Planned Architecture
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-5 space-y-4 text-xs text-slate-700">
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 space-y-2.5">
                  <div className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>How Historical Month Checking Will Work:</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1.5 text-slate-600 leading-relaxed font-medium">
                    <li>
                      <strong className="text-slate-800">Historical Query:</strong> Query all historical records in <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 text-indigo-600 font-mono text-[11px]">daily_metrics</code> grouped by agent ID and calendar month (<code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 text-indigo-600 font-mono text-[11px]">YYYY-MM</code>).
                    </li>
                    <li>
                      <strong className="text-slate-800">40-Item Threshold:</strong> For each completed calendar month where <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 text-indigo-600 font-mono text-[11px]">SUM(nb_auto_items) &gt;= 40</code>, the agent earns a <strong>40-Club Month Token</strong>.
                    </li>
                    <li>
                      <strong className="text-slate-800">Lifetime Multiplier:</strong> Count total qualifying months to determine their lifetime badge tier and display count (e.g. <span className="font-bold text-amber-700">🏆 40-Club (x3)</span>).
                    </li>
                    <li>
                      <strong className="text-slate-800">Current Month Pacing:</strong> If current MTD items reach 40 before month-end, award the current month badge immediately with celebration confetti.
                    </li>
                  </ol>
                </div>

                {/* Multiplier Progression Tiers */}
                <div>
                  <h3 className="font-bold text-slate-900 text-xs mb-2 uppercase tracking-wider text-slate-500">
                    40-Club Progression Multiplier Tiers
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="bg-amber-50/50 border border-amber-200 rounded-lg p-3 text-center">
                      <div className="text-xl mb-1">🥉</div>
                      <div className="font-bold text-slate-900 text-xs">Bronze Member</div>
                      <div className="text-[10px] text-slate-500 font-medium">1 Month (40+ items)</div>
                    </div>
                    <div className="bg-slate-100 border border-slate-300 rounded-lg p-3 text-center">
                      <div className="text-xl mb-1">🥈</div>
                      <div className="font-bold text-slate-900 text-xs">Silver Veteran</div>
                      <div className="text-[10px] text-slate-500 font-medium">3 Months (40+ items)</div>
                    </div>
                    <div className="bg-amber-100/70 border border-amber-300 rounded-lg p-3 text-center">
                      <div className="text-xl mb-1">🥇</div>
                      <div className="font-bold text-slate-900 text-xs">Gold Master</div>
                      <div className="text-[10px] text-slate-500 font-medium">6 Months (40+ items)</div>
                    </div>
                    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-center">
                      <div className="text-xl mb-1">👑</div>
                      <div className="font-bold text-slate-900 text-xs">Platinum Legend</div>
                      <div className="text-[10px] text-slate-500 font-medium">12+ Months (40+ items)</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Section 2: Future Agency Medals Roadmap */}
            <Card className="border-slate-200 shadow-sm bg-white">
              <CardHeader className="pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                    <Award className="w-4 h-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-black text-slate-900">
                      Agency Medals Roadmap
                    </CardTitle>
                    <p className="text-xs text-slate-500 font-medium">
                      Future milestones to motivate all skillsets
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="text-base shrink-0 mt-0.5">🚀</div>
                  <div>
                    <div className="font-bold text-slate-800 text-xs">Century Dials</div>
                    <p className="text-[11px] text-slate-500 font-medium">100+ outbound dials in a single business day.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="text-base shrink-0 mt-0.5">⏱️</div>
                  <div>
                    <div className="font-bold text-slate-800 text-xs">Marathon Talker</div>
                    <p className="text-[11px] text-slate-500 font-medium">90+ minutes talk time across daily calls.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="text-base shrink-0 mt-0.5">🎯</div>
                  <div>
                    <div className="font-bold text-slate-800 text-xs">Sharpshooter</div>
                    <p className="text-[11px] text-slate-500 font-medium">20%+ monthly close rate on delivered quotes.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="text-base shrink-0 mt-0.5">🔥</div>
                  <div>
                    <div className="font-bold text-slate-800 text-xs">Consistency Streak</div>
                    <p className="text-[11px] text-slate-500 font-medium">3 consecutive days hitting daily item quota.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="text-base shrink-0 mt-0.5">💎</div>
                  <div>
                    <div className="font-bold text-slate-800 text-xs">Golden Month</div>
                    <p className="text-[11px] text-slate-500 font-medium">$50,000+ written premium in a single month.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Section 3: Interactive Agent Portal Banner Designer */}
          <Card className="border-slate-200 shadow-md bg-white overflow-hidden">
            <CardHeader className="bg-slate-50/80 border-b border-slate-200 py-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700">
                    <Eye className="w-4 h-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-black text-slate-900">
                      Live Agent Portal Banner Studio (Design Options)
                    </CardTitle>
                    <p className="text-xs text-slate-500 font-medium">
                      Select a layout option below to preview how the medals banner will look on the agent&apos;s personal portal.
                    </p>
                  </div>
                </div>

                {/* Preview Controls */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* Style Options */}
                  <div className="inline-flex p-1 bg-slate-200/80 rounded-lg border border-slate-300 text-xs font-bold">
                    <button
                      onClick={() => setMedalsDesignOption("ribbon")}
                      className={`px-3 py-1 rounded-md transition-all ${
                        medalsDesignOption === "ribbon" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Option A: Prestige Ribbon
                    </button>
                    <button
                      onClick={() => setMedalsDesignOption("showcase")}
                      className={`px-3 py-1 rounded-md transition-all ${
                        medalsDesignOption === "showcase" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Option B: Trophy Case
                    </button>
                    <button
                      onClick={() => setMedalsDesignOption("strip")}
                      className={`px-3 py-1 rounded-md transition-all ${
                        medalsDesignOption === "strip" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Option C: Header Badges
                    </button>
                  </div>

                  {/* Simulated Count Switcher */}
                  <div className="flex items-center gap-1.5 text-xs bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                    <span className="text-slate-500 font-medium">Preview Hits:</span>
                    {[1, 3, 6, 12].map((cnt) => (
                      <button
                        key={cnt}
                        onClick={() => setPreview40Count(cnt)}
                        className={`px-2 py-0.5 rounded font-mono font-bold ${
                          preview40Count === cnt ? "bg-amber-500 text-white" : "text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {cnt}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-6 bg-slate-900/5 space-y-4">
              <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500 flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-indigo-500" />
                <span>Live Simulation on {previewAgentName}&apos;s Personal Portal</span>
              </div>

              {/* MOCKUP CONTAINER */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-6 space-y-4">
                
                {/* ── OPTION A: PRESTIGE GOLD RIBBON BANNER ── */}
                {medalsDesignOption === "ribbon" && (
                  <div className="bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 text-slate-950 rounded-xl p-4 md:p-5 shadow-md border border-amber-300 relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-xl bg-white/90 shadow-sm flex items-center justify-center text-2xl shrink-0 border border-amber-200">
                        {preview40Count >= 12 ? "👑" : preview40Count >= 6 ? "🥇" : preview40Count >= 3 ? "🥈" : "🥉"}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-base text-slate-950 tracking-tight">
                            {preview40Count >= 12 ? "40-Club Platinum Legend" : preview40Count >= 6 ? "40-Club Gold Master" : preview40Count >= 3 ? "40-Club Silver Veteran" : "40-Club Member"}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-xs font-black bg-slate-950 text-amber-300 font-mono shadow-xs">
                            {preview40Count}x Hit
                          </span>
                        </div>
                        <p className="text-xs font-medium text-slate-800 mt-0.5">
                          Honoring {previewAgentName} for surpassing 40+ Auto Items in {preview40Count} separate calendar months!
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-stretch md:self-auto justify-end">
                      <div className="bg-white/80 backdrop-blur-xs px-3 py-1.5 rounded-lg border border-amber-300/60 text-right">
                        <span className="text-[10px] text-slate-600 uppercase font-bold block">Lifetime Status</span>
                        <span className="font-black text-xs text-slate-900 font-mono">Agency Elite Roster</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── OPTION B: TROPHY CASE SHOWCASE ── */}
                {medalsDesignOption === "showcase" && (
                  <div className="bg-slate-900 text-white rounded-xl p-5 border border-slate-800 shadow-md space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-amber-400" />
                        <h4 className="font-black text-sm text-slate-100">
                          {previewAgentName}&apos;s Trophy Case & Milestone Badges
                        </h4>
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {preview40Count > 0 ? "1 Badge Unlocked" : "0 Badges"}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                      {/* Unlocked 40 Club */}
                      <div className="bg-slate-800/90 rounded-xl p-3.5 border border-amber-400/40 relative overflow-hidden flex flex-col justify-between h-28">
                        <div className="flex items-center justify-between">
                          <span className="text-2xl">🏆</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30">
                            {preview40Count}x Earned
                          </span>
                        </div>
                        <div>
                          <div className="font-bold text-xs text-amber-200">40-Item Month Club</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">Surpassed 40 auto items</div>
                        </div>
                      </div>

                      {/* Locked Badges */}
                      <div className="bg-slate-800/40 rounded-xl p-3.5 border border-slate-700/60 opacity-60 flex flex-col justify-between h-28">
                        <div className="flex items-center justify-between">
                          <span className="text-2xl grayscale">🚀</span>
                          <span className="text-[10px] font-medium text-slate-400">Locked</span>
                        </div>
                        <div>
                          <div className="font-bold text-xs text-slate-300">Century Dials</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">100+ dials in one day</div>
                        </div>
                      </div>

                      <div className="bg-slate-800/40 rounded-xl p-3.5 border border-slate-700/60 opacity-60 flex flex-col justify-between h-28">
                        <div className="flex items-center justify-between">
                          <span className="text-2xl grayscale">🎯</span>
                          <span className="text-[10px] font-medium text-slate-400">Locked</span>
                        </div>
                        <div>
                          <div className="font-bold text-xs text-slate-300">Sharpshooter</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">20%+ monthly close rate</div>
                        </div>
                      </div>

                      <div className="bg-slate-800/40 rounded-xl p-3.5 border border-slate-700/60 opacity-60 flex flex-col justify-between h-28">
                        <div className="flex items-center justify-between">
                          <span className="text-2xl grayscale">💎</span>
                          <span className="text-[10px] font-medium text-slate-400">Locked</span>
                        </div>
                        <div>
                          <div className="font-bold text-xs text-slate-300">Golden Month</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">$50K+ written premium</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── OPTION C: SLEEK PROFILE BADGE STRIP ── */}
                {medalsDesignOption === "strip" && (
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center font-black text-white text-sm">
                        {previewAgentName.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-black text-sm text-slate-900">{previewAgentName}</h4>
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-black bg-amber-100 text-amber-800 border border-amber-300">
                            🏆 40-Club Milestone ({preview40Count}x)
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            ⭐ Top Tier
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                          Achieved 40+ written auto items across {preview40Count} separate months.
                        </p>
                      </div>
                    </div>

                    <div className="text-xs font-mono font-bold text-slate-600 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
                      Agency Milestone Badge Active ✓
                    </div>
                  </div>
                )}

              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        /* Target Matrix View */
        <>
          {/* ─── Compact Legend & Pacing Context Bar ───────────────────────────────── */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-50/80 border border-slate-200 rounded-lg text-xs text-slate-600">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-blue-500" /> Matrix Guide:
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded bg-emerald-100 border border-emerald-300"></span>
                <strong>Bold Badge:</strong> Custom Override
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded bg-slate-100 border border-slate-300 border-dashed"></span>
                <span className="text-slate-400 italic">(Gray Text):</span> Inherited Agency Baseline
              </span>
              <span className="hidden md:inline text-slate-400">|</span>
              <span className="hidden md:inline text-slate-500">
                Click any cell to edit • Press <kbd className="px-1 py-0.5 bg-white border border-slate-300 rounded font-mono text-[10px]">Enter</kbd> to save • Clear value to remove override
              </span>
            </div>

            <div className="text-[11px] font-mono text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
              Working Days: <strong>{bizDaysInMonth} days</strong> ({currentMonthName})
            </div>
          </div>

          {/* ─── Target Matrix Grid ────────────────────────────────────────────────── */}
          <div className="relative overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left border-collapse select-none">
              <thead>
                {/* Top Row: Group Headers */}
                <tr className="border-b border-slate-200 divide-x divide-slate-200 text-[11px] font-bold tracking-wider uppercase">
                  <th className="p-2.5 bg-slate-100 text-slate-700 min-w-[200px] sticky left-0 z-20 shadow-[1px_0_0_0_#e2e8f0]">
                    Scope / Entity
                  </th>
                  {KPI_GROUPS.map(group => {
                    const colSpan = group.metrics.length
                    const groupColor = {
                      sky: "bg-sky-50 text-sky-800 border-sky-200",
                      teal: "bg-teal-50 text-teal-800 border-teal-200",
                      amber: "bg-amber-50 text-amber-800 border-amber-200",
                      violet: "bg-violet-50 text-violet-800 border-violet-200",
                    }[group.color]

                    return (
                      <th
                        key={group.label}
                        colSpan={colSpan}
                        className={`p-2 text-center ${groupColor} border-b-2`}
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <group.icon className="w-3.5 h-3.5" />
                          <span>{group.label}</span>
                        </div>
                      </th>
                    )
                  })}
                </tr>

                {/* Sub-Row: Individual Metric Columns */}
                <tr className="border-b border-slate-200 divide-x divide-slate-200 bg-slate-50 text-[10px] font-bold uppercase text-slate-600">
                  <th className="p-2 sticky left-0 z-20 bg-slate-50 shadow-[1px_0_0_0_#e2e8f0]">
                    Entity & Overrides
                  </th>
                  {ALL_METRICS.map(metric => (
                    <th key={metric.key} className="p-2 text-center min-w-[95px]">
                      <div className="truncate" title={metric.label}>
                        {metric.shortLabel}
                        {metric.unit && (
                          <span className="ml-1 text-[9px] text-slate-400 font-mono font-normal">
                            ({metric.unit === "$" ? "$" : "min"})
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 text-xs">
            {loading ? (
              <tr>
                <td colSpan={ALL_METRICS.length + 1} className="py-16 text-center text-slate-400">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-amber-500 mb-2" />
                  Loading KPI Target Matrix...
                </td>
              </tr>
            ) : (
              visibleEntities.map(entity => {
                const isBaseline = entity.type === "baseline"
                const rowBg = isBaseline
                  ? "bg-slate-50/90 font-semibold"
                  : entity.type === "team"
                  ? "bg-white hover:bg-slate-50/50"
                  : "bg-white hover:bg-slate-50/50"

                return (
                  <tr
                    key={entity.id}
                    className={`divide-x divide-slate-200 transition-colors ${rowBg} ${
                      isBaseline ? "border-b-2 border-slate-300 shadow-sm" : ""
                    }`}
                  >
                    {/* Sticky Left Entity Header */}
                    <td
                      className={`p-2.5 sticky left-0 z-10 shadow-[1px_0_0_0_#e2e8f0] ${
                        isBaseline ? "bg-slate-100 text-slate-900" : "bg-white text-slate-800"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="truncate">
                          <span className={`font-bold ${isBaseline ? "text-slate-900" : "text-slate-800"}`}>
                            {entity.label}
                          </span>
                          <div className="text-[10px] text-slate-400 font-normal">
                            {entity.sublabel}
                          </div>
                        </div>
                        {isBaseline && (
                          <Badge variant="outline" className="text-[9px] bg-slate-900 text-white font-mono uppercase px-1 py-0 border-none">
                            Base
                          </Badge>
                        )}
                      </div>
                    </td>

                    {/* Metric Cells */}
                    {ALL_METRICS.map(metric => {
                      const goal = getGoalForEntity(entity, metric.key)
                      const baseline = getBaselineGoal(metric.key)
                      const isEditing = activeCell?.entityId === entity.id && activeCell?.metricKey === metric.key
                      const hasOverride = !isBaseline && !!goal && goal.target_value > 0
                      const displayVal = hasOverride
                        ? goal.target_value
                        : isBaseline
                        ? (goal?.target_value ?? 0)
                        : (baseline?.target_value ?? 0)

                      return (
                        <td
                          key={metric.key}
                          onClick={() => !isEditing && handleCellClick(entity, metric)}
                          onMouseEnter={() => {
                            setHoveredCell({
                              entity,
                              metric,
                              val: goal?.target_value ?? null,
                              isOverride: hasOverride,
                              baselineVal: baseline?.target_value ?? null,
                            })
                          }}
                          className={`p-1 text-center cursor-pointer transition-all ${
                            isEditing
                              ? "bg-blue-50 ring-2 ring-blue-500 ring-inset z-10"
                              : hasOverride
                              ? "bg-emerald-50/40 hover:bg-emerald-100/60"
                              : isBaseline
                              ? "hover:bg-slate-200/60"
                              : "hover:bg-blue-50/50"
                          }`}
                        >
                          {isEditing ? (
                            /* In-cell Input Mode */
                            <div className="flex items-center justify-center gap-1 p-0.5">
                              {metric.unit === "min" ? (
                                <div className="flex items-center gap-0.5">
                                  <input
                                    type="number"
                                    min="0"
                                    max="23"
                                    autoFocus
                                    className="w-10 bg-white border border-blue-400 rounded px-1 py-0.5 text-xs font-mono font-bold text-center outline-none"
                                    value={timeHours}
                                    onChange={e => setTimeHours(Math.max(0, parseInt(e.target.value) || 0))}
                                    onKeyDown={e => handleKeyDown(e, entity, metric)}
                                  />
                                  <span className="text-[10px] text-slate-400">h</span>
                                  <input
                                    type="number"
                                    min="0"
                                    max="59"
                                    className="w-10 bg-white border border-blue-400 rounded px-1 py-0.5 text-xs font-mono font-bold text-center outline-none"
                                    value={timeMinutes}
                                    onChange={e => setTimeMinutes(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                                    onKeyDown={e => handleKeyDown(e, entity, metric)}
                                  />
                                  <span className="text-[10px] text-slate-400">m</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-0.5 w-full">
                                  {metric.unit === "$" && <span className="text-slate-400 text-xs">$</span>}
                                  <input
                                    type="number"
                                    step={metric.step || 1}
                                    autoFocus
                                    className="w-full bg-white border border-blue-400 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-center outline-none"
                                    value={inputValue}
                                    onChange={e => setInputValue(e.target.value)}
                                    onKeyDown={e => handleKeyDown(e, entity, metric)}
                                    onBlur={() => handleCommit(entity, metric)}
                                  />
                                </div>
                              )}
                            </div>
                          ) : (
                            /* Display Mode */
                            <div className="relative group/cell flex items-center justify-center min-h-[28px] px-1">
                              {hasOverride ? (
                                <span className="inline-flex items-center gap-1 font-mono font-bold text-emerald-700 bg-emerald-100/90 border border-emerald-300 rounded px-1.5 py-0.5 shadow-sm text-xs">
                                  {formatDisplay(goal.target_value, metric.unit)}
                                </span>
                              ) : isBaseline ? (
                                <span
                                  className={`font-mono font-bold px-1.5 py-0.5 rounded text-xs ${
                                    displayVal > 0
                                      ? "text-slate-900 bg-white border border-slate-300 shadow-sm"
                                      : "text-slate-300"
                                  }`}
                                >
                                  {formatDisplay(displayVal, metric.unit)}
                                </span>
                              ) : (
                                <span className="font-mono text-slate-400 italic text-xs flex items-center gap-0.5 opacity-60 group-hover/cell:opacity-100">
                                  {displayVal > 0 ? formatDisplay(displayVal, metric.unit) : "—"}
                                </span>
                              )}

                              {/* Quick Revert / Trash button for overrides on hover */}
                              {hasOverride && goal && (
                                <button
                                  onClick={e => {
                                    e.stopPropagation()
                                    deleteOverride(goal.id)
                                  }}
                                  className="absolute right-0.5 top-0.5 opacity-0 group-hover/cell:opacity-100 p-0.5 text-slate-400 hover:text-red-600 bg-white rounded shadow-sm border border-slate-200 transition-all"
                                  title="Revert to Agency Baseline"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ─── Compact Cell Inspector / Context Preview Drawer (Light Theme) ────── */}
      {hoveredCell && (
        <div className="bg-white text-slate-800 rounded-xl p-3.5 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs border border-slate-200 animate-in fade-in duration-150">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-600 font-bold">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-slate-900 flex items-center gap-2">
                <span>{hoveredCell.entity.label}</span>
                <span className="text-slate-400">➔</span>
                <span className="text-blue-700 font-semibold">{hoveredCell.metric.label}</span>
                <Badge variant="outline" className="text-[10px] font-mono uppercase bg-slate-50 text-slate-600 border-slate-200 py-0 px-1">
                  {timeframe}
                </Badge>
              </div>
              <div className="text-slate-500 text-[11px] mt-0.5">
                {hoveredCell.isOverride ? (
                  <span className="text-emerald-700 font-medium">
                    Custom override set: <strong className="text-emerald-800">{formatDisplay(hoveredCell.val, hoveredCell.metric.unit)}</strong> (Agency baseline: {formatDisplay(hoveredCell.baselineVal, hoveredCell.metric.unit)})
                  </span>
                ) : hoveredCell.entity.type === "baseline" ? (
                  <span className="text-slate-700 font-medium">
                    Agency Baseline Benchmark: <strong>{formatDisplay(hoveredCell.baselineVal, hoveredCell.metric.unit)}</strong>
                  </span>
                ) : (
                  <span className="text-slate-500">
                    Inheriting Agency Baseline: <strong className="text-slate-700">{formatDisplay(hoveredCell.baselineVal, hoveredCell.metric.unit)}</strong>. Click cell to set a custom override.
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 text-[11px] font-mono text-slate-700 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
            {timeframe === "daily" && (
              <>
                <div>
                  Wkly: <strong className="text-blue-700 font-bold">{hoveredCell.val ? formatDisplay(hoveredCell.val * 5, hoveredCell.metric.unit) : "—"}</strong>
                </div>
                <div className="text-slate-300">|</div>
                <div>
                  Mthly: <strong className="text-amber-800 font-bold">{hoveredCell.val ? formatDisplay(Math.round(hoveredCell.val * bizDaysInMonth), hoveredCell.metric.unit) : "—"}</strong>
                </div>
              </>
            )}
            {timeframe === "weekly" && (
              <>
                <div>
                  Daily: <strong className="text-blue-700 font-bold">{hoveredCell.val ? formatDisplay(Math.round((hoveredCell.val / 5) * 10) / 10, hoveredCell.metric.unit) : "—"}</strong>
                </div>
                <div className="text-slate-300">|</div>
                <div>
                  Mthly: <strong className="text-amber-800 font-bold">{hoveredCell.val ? formatDisplay(Math.round((hoveredCell.val / 5) * bizDaysInMonth), hoveredCell.metric.unit) : "—"}</strong>
                </div>
              </>
            )}
            {timeframe === "monthly" && (
              <>
                <div>
                  Daily: <strong className="text-blue-700 font-bold">{hoveredCell.val ? formatDisplay(Math.round((hoveredCell.val / bizDaysInMonth) * 10) / 10, hoveredCell.metric.unit) : "—"}</strong>
                </div>
                <div className="text-slate-300">|</div>
                <div>
                  Wkly: <strong className="text-blue-700 font-bold">{hoveredCell.val ? formatDisplay(Math.round((hoveredCell.val / bizDaysInMonth) * 5), hoveredCell.metric.unit) : "—"}</strong>
                </div>
              </>
            )}
            <div className="text-slate-300">|</div>
            <div>
              Trigger: <span className="text-emerald-700 font-bold bg-emerald-50 px-1 py-0.5 rounded border border-emerald-200">≥ Target = Green</span>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  )
}
