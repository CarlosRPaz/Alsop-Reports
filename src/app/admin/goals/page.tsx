"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { Plus, Edit2, Trash2, Check, X, Target, ChevronDown, ChevronRight, Phone, MessageSquare, ShieldCheck, BarChart3, ClipboardList } from "lucide-react"

// ── KPI Definitions ──
const KPI_GROUPS = [
  {
    label: "RC / Ricochet",
    icon: <Phone className="w-4 h-4" />,
    color: "sky",
    metrics: [
      { key: "calls", label: "Calls" },
      { key: "inbound", label: "Inbound" },
      { key: "outbound", label: "Outbound" },
      { key: "talk_time_seconds", label: "Talk Time", unit: "min" },
    ],
  },
  {
    label: "Hearsay",
    icon: <MessageSquare className="w-4 h-4" />,
    color: "teal",
    metrics: [
      { key: "texts", label: "Texts" },
      { key: "out_texts", label: "Out Texts" },
      { key: "opt_ins", label: "Opt-Ins" },
    ],
  },
  {
    label: "Production",
    icon: <BarChart3 className="w-4 h-4" />,
    color: "amber",
    metrics: [
      { key: "quotes", label: "Quotes" },
      { key: "nb_count", label: "New Business" },
      { key: "prem_premium", label: "Premium", unit: "$" },
      { key: "items", label: "Items" },
    ],
  },
  {
    label: "eAgent / RICO",
    icon: <ClipboardList className="w-4 h-4" />,
    color: "violet",
    metrics: [
      { key: "dismissed_todos", label: "Dismissed To-Do's" },
      { key: "past_due_todos", label: "Past Due To-Do's" },
      { key: "pivots", label: "Pivots" },
    ],
  },
]

const OFFICES = ["MCM", "MB", "RC", "CH"]
const TEAMS = ["Sales", "Service", "CSR", "EA", "Managers"]

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; headerBg: string; badge: string }> = {
  sky:    { bg: "bg-sky-50",    border: "border-sky-200",    text: "text-sky-700",    headerBg: "bg-sky-100/60",    badge: "bg-sky-100 text-sky-700 border-sky-200" },
  teal:   { bg: "bg-teal-50",   border: "border-teal-200",   text: "text-teal-700",   headerBg: "bg-teal-100/60",   badge: "bg-teal-100 text-teal-700 border-teal-200" },
  amber:  { bg: "bg-amber-50",  border: "border-amber-200",  text: "text-amber-700",  headerBg: "bg-amber-100/60",  badge: "bg-amber-100 text-amber-700 border-amber-200" },
  violet: { bg: "bg-violet-50", border: "border-violet-200", text: "text-violet-700", headerBg: "bg-violet-100/60", badge: "bg-violet-100 text-violet-700 border-violet-200" },
}

interface Goal {
  id: string
  metric_name: string
  timeframe: string
  target_value: number
  office: string | null
  team: string | null
}

export default function GoalManagement() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [timeframe, setTimeframe] = useState<"daily" | "monthly">("daily")

  // Inline editing state
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [timeHours, setTimeHours] = useState(0)
  const [timeMinutes, setTimeMinutes] = useState(0)

  // New override state
  const [addingOverride, setAddingOverride] = useState<string | null>(null) // metric_name
  const [overrideType, setOverrideType] = useState<"office" | "team">("office")
  const [overrideTarget, setOverrideTarget] = useState("")
  const [overrideValue, setOverrideValue] = useState("")

  const fetchGoals = async () => {
    setLoading(true)
    const { data } = await supabase.from("kpi_goals").select("*").eq("timeframe", timeframe).order("metric_name")
    setGoals((data as Goal[]) || [])
    setLoading(false)
  }

  useEffect(() => { fetchGoals() }, [timeframe])

  // Initialize all groups as expanded
  useEffect(() => {
    const expanded: Record<string, boolean> = {}
    KPI_GROUPS.forEach(g => { expanded[g.label] = true })
    setExpandedGroups(expanded)
  }, [])

  const getDefaultGoal = (metricKey: string) => {
    return goals.find(g => g.metric_name === metricKey && !g.office && !g.team)
  }

  const getOverrides = (metricKey: string) => {
    return goals.filter(g => g.metric_name === metricKey && (g.office || g.team))
  }

  const saveAgencyGoal = async (metricKey: string, value: number) => {
    const existing = getDefaultGoal(metricKey)
    if (existing) {
      await supabase.from("kpi_goals").update({ target_value: value }).eq("id", existing.id)
    } else {
      await supabase.from("kpi_goals").insert([{
        metric_name: metricKey,
        timeframe: timeframe,
        target_value: value,
        office: null,
        team: null,
      }])
    }
    fetchGoals()
  }

  const removeGoal = async (goalId: string) => {
    await supabase.from("kpi_goals").delete().eq("id", goalId)
    fetchGoals()
  }

  const saveOverride = async (metricKey: string) => {
    if (!overrideTarget) return
    const targetVal = metricKey === "talk_time_seconds"
      ? timeHours * 60 + timeMinutes
      : parseFloat(overrideValue)
    if (isNaN(targetVal) || targetVal <= 0) return
    const payload: any = {
      metric_name: metricKey,
      timeframe: timeframe,
      target_value: targetVal,
      office: overrideType === "office" ? overrideTarget : null,
      team: overrideType === "team" ? overrideTarget : null,
    }
    await supabase.from("kpi_goals").insert([payload])
    setAddingOverride(null)
    setOverrideTarget("")
    setOverrideValue("")
    setTimeHours(0)
    setTimeMinutes(0)
    fetchGoals()
  }

  const startEdit = (key: string, currentValue: number, isTime = false) => {
    setEditingKey(key)
    if (isTime) {
      setTimeHours(Math.floor(currentValue / 60))
      setTimeMinutes(currentValue % 60)
    } else {
      setEditValue(String(currentValue))
    }
  }

  const commitEdit = async (metricKey: string, goalId?: string) => {
    const val = metricKey === "talk_time_seconds"
      ? timeHours * 60 + timeMinutes
      : parseFloat(editValue)
    if (isNaN(val) || val < 0) { setEditingKey(null); return }
    
    if (goalId) {
      await supabase.from("kpi_goals").update({ target_value: val }).eq("id", goalId)
    } else {
      await saveAgencyGoal(metricKey, val)
    }
    setEditingKey(null)
    fetchGoals()
  }

  const toggleGroup = (label: string) => {
    setExpandedGroups(prev => ({ ...prev, [label]: !prev[label] }))
  }

  const formatGoalDisplay = (value: number, unit?: string) => {
    if (unit === "$") return `$${value.toLocaleString()}`
    if (unit === "min") {
      const h = Math.floor(value / 60)
      const m = value % 60
      if (h > 0 && m > 0) return `${h}h ${m}m`
      if (h > 0) return `${h}h`
      return `${m}m`
    }
    return value.toString()
  }

  if (loading) {
    return (
      <div className="p-8 max-w-5xl mx-auto">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-3">
          <Target className="w-7 h-7 text-amber-500" />
          Goal Settings
        </h1>
        <p className="text-slate-500 mt-1 text-sm">
          Set agency-wide goals for each KPI. Add overrides for specific offices or teams.
        </p>
      </header>

      {/* Timeframe Toggle */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTimeframe("daily")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
            timeframe === "daily"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Daily Goals
        </button>
        <button
          onClick={() => setTimeframe("monthly")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
            timeframe === "monthly"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Monthly Goals
        </button>
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
        <div>
          <strong>How it works:</strong> Agency-wide goals apply to all agents. Overrides let you set different goals for 
          specific teams or offices. Agents who meet or exceed their goal will have that cell {timeframe === "daily" 
            ? <span className="inline-block bg-emerald-100 text-emerald-700 font-semibold px-1.5 py-0.5 rounded text-xs">highlighted green</span>
            : <span className="inline-block bg-amber-100 text-amber-700 font-semibold px-1.5 py-0.5 rounded text-xs">highlighted gold</span>
          } in the Daily Report.
        </div>
      </div>

      {/* KPI Groups */}
      {KPI_GROUPS.map(group => {
        const colors = COLOR_MAP[group.color]
        const isExpanded = expandedGroups[group.label] !== false

        return (
          <Card key={group.label} className={`${colors.border} overflow-hidden`}>
            <button
              onClick={() => toggleGroup(group.label)}
              className={`w-full flex items-center justify-between px-5 py-3 ${colors.headerBg} hover:opacity-90 transition-opacity`}
            >
              <div className="flex items-center gap-2.5">
                <span className={colors.text}>{group.icon}</span>
                <span className={`text-sm font-bold ${colors.text} uppercase tracking-wider`}>{group.label}</span>
                <Badge variant="outline" className={`${colors.badge} text-[10px] ml-1`}>
                  {group.metrics.filter(m => getDefaultGoal(m.key)).length}/{group.metrics.length} set
                </Badge>
              </div>
              {isExpanded
                ? <ChevronDown className={`w-4 h-4 ${colors.text}`} />
                : <ChevronRight className={`w-4 h-4 ${colors.text}`} />
              }
            </button>

            {isExpanded && (
              <CardContent className="p-0 divide-y divide-slate-100">
                {group.metrics.map(metric => {
                  const defaultGoal = getDefaultGoal(metric.key)
                  const overrides = getOverrides(metric.key)
                  const editKey = `default-${metric.key}`
                  const isEditing = editingKey === editKey
                  const isAddingHere = addingOverride === metric.key

                  return (
                    <div key={metric.key} className="px-5 py-4">
                      {/* Metric header + default goal */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-slate-800">{metric.label}</span>
                          {metric.unit && (
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider">{metric.unit === "$" ? "Currency" : metric.unit}</span>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {/* Default goal value */}
                          {isEditing ? (
                            <div className="flex items-center gap-1.5">
                              {metric.unit === "$" && <span className="text-slate-400 text-sm">$</span>}
                              {metric.unit === "min" ? (
                                <>
                                  <input
                                    type="number" min="0" max="23" autoFocus
                                    className="w-14 bg-white border border-slate-300 rounded-md px-2 py-1 text-sm font-mono text-slate-900 text-center focus:ring-2 focus:ring-blue-400 outline-none"
                                    value={timeHours}
                                    onChange={e => setTimeHours(Math.max(0, parseInt(e.target.value) || 0))}
                                    onKeyDown={e => { if (e.key === "Enter") commitEdit(metric.key, defaultGoal?.id); if (e.key === "Escape") setEditingKey(null) }}
                                  />
                                  <span className="text-slate-400 text-xs">h</span>
                                  <input
                                    type="number" min="0" max="59"
                                    className="w-14 bg-white border border-slate-300 rounded-md px-2 py-1 text-sm font-mono text-slate-900 text-center focus:ring-2 focus:ring-blue-400 outline-none"
                                    value={timeMinutes}
                                    onChange={e => setTimeMinutes(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                                    onKeyDown={e => { if (e.key === "Enter") commitEdit(metric.key, defaultGoal?.id); if (e.key === "Escape") setEditingKey(null) }}
                                  />
                                  <span className="text-slate-400 text-xs">m</span>
                                </>
                              ) : (
                                <input
                                  type="number"
                                  autoFocus
                                  className="w-24 bg-white border border-slate-300 rounded-md px-2.5 py-1 text-sm font-mono text-slate-900 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none"
                                  value={editValue}
                                  onChange={e => setEditValue(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") commitEdit(metric.key, defaultGoal?.id)
                                    if (e.key === "Escape") setEditingKey(null)
                                  }}
                                />
                              )}
                              <button
                                onClick={() => commitEdit(metric.key, defaultGoal?.id)}
                                className="p-1 rounded hover:bg-emerald-50 text-emerald-600 transition-colors"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setEditingKey(null)}
                                className="p-1 rounded hover:bg-slate-100 text-slate-400 transition-colors"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : defaultGoal ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-mono font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                                {formatGoalDisplay(defaultGoal.target_value, metric.unit)}
                              </span>
                              <button
                                onClick={() => startEdit(editKey, defaultGoal.target_value, metric.unit === "min")}
                                className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => removeGoal(defaultGoal.id)}
                                className="p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => startEdit(editKey, 0, metric.unit === "min")}
                              className="text-xs text-slate-400 hover:text-blue-600 border border-dashed border-slate-300 hover:border-blue-400 rounded-md px-3 py-1 transition-colors"
                            >
                              + Set Goal
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Overrides */}
                      {overrides.length > 0 && (
                        <div className="mt-3 ml-4 space-y-1.5">
                          {overrides.map(ov => {
                            const ovEditKey = `override-${ov.id}`
                            const isOvEditing = editingKey === ovEditKey
                            const label = ov.office ? `${ov.office} Office` : `${ov.team} Team`

                            return (
                              <div key={ov.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 group">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-[10px] bg-white border-slate-200 text-slate-600">
                                    {label}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {isOvEditing ? (
                                    <>
                                      {metric.unit === "$" && <span className="text-slate-400 text-xs">$</span>}
                                      {metric.unit === "min" ? (
                                        <>
                                          <input type="number" min="0" max="23" autoFocus className="w-12 bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs font-mono text-center focus:ring-2 focus:ring-blue-400 outline-none" value={timeHours} onChange={e => setTimeHours(Math.max(0, parseInt(e.target.value) || 0))} onKeyDown={e => { if (e.key === "Enter") commitEdit(metric.key, ov.id); if (e.key === "Escape") setEditingKey(null) }} />
                                          <span className="text-slate-400 text-[10px]">h</span>
                                          <input type="number" min="0" max="59" className="w-12 bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs font-mono text-center focus:ring-2 focus:ring-blue-400 outline-none" value={timeMinutes} onChange={e => setTimeMinutes(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))} onKeyDown={e => { if (e.key === "Enter") commitEdit(metric.key, ov.id); if (e.key === "Escape") setEditingKey(null) }} />
                                          <span className="text-slate-400 text-[10px]">m</span>
                                        </>
                                      ) : (
                                        <input
                                          type="number"
                                          autoFocus
                                          className="w-20 bg-white border border-slate-300 rounded px-2 py-0.5 text-xs font-mono focus:ring-2 focus:ring-blue-400 outline-none"
                                          value={editValue}
                                          onChange={e => setEditValue(e.target.value)}
                                          onKeyDown={e => {
                                            if (e.key === "Enter") commitEdit(metric.key, ov.id)
                                            if (e.key === "Escape") setEditingKey(null)
                                          }}
                                        />
                                      )}
                                      <button onClick={() => commitEdit(metric.key, ov.id)} className="p-0.5 rounded hover:bg-emerald-50 text-emerald-600"><Check className="w-3 h-3" /></button>
                                      <button onClick={() => setEditingKey(null)} className="p-0.5 rounded hover:bg-slate-100 text-slate-400"><X className="w-3 h-3" /></button>
                                    </>
                                  ) : (
                                    <>
                                      <span className="text-xs font-mono font-bold text-slate-700">
                                        {formatGoalDisplay(ov.target_value, metric.unit)}
                                      </span>
                                      <button
                                        onClick={() => startEdit(ovEditKey, ov.target_value, metric.unit === "min")}
                                        className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-slate-200 text-slate-400 transition-all"
                                      >
                                        <Edit2 className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={() => removeGoal(ov.id)}
                                        className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 text-slate-300 hover:text-red-500 transition-all"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Add override form */}
                      {isAddingHere ? (
                        <div className="mt-3 ml-4 flex items-center gap-2 bg-blue-50/50 border border-blue-200 rounded-lg px-3 py-2">
                          <select
                            className="bg-white border border-slate-300 rounded-md px-2 py-1 text-xs text-slate-700 focus:ring-2 focus:ring-blue-400 outline-none"
                            value={overrideType}
                            onChange={e => { setOverrideType(e.target.value as "office" | "team"); setOverrideTarget("") }}
                          >
                            <option value="office">Office</option>
                            <option value="team">Team</option>
                          </select>
                          <select
                            className="bg-white border border-slate-300 rounded-md px-2 py-1 text-xs text-slate-700 focus:ring-2 focus:ring-blue-400 outline-none"
                            value={overrideTarget}
                            onChange={e => setOverrideTarget(e.target.value)}
                          >
                            <option value="">Select...</option>
                            {(overrideType === "office" ? OFFICES : TEAMS).map(v => (
                              <option key={v} value={v}>{v}</option>
                            ))}
                          </select>
                          {metric.unit === "$" && <span className="text-slate-400 text-xs">$</span>}
                          {metric.unit === "min" ? (
                            <>
                              <input type="number" min="0" max="23" placeholder="0" className="w-12 bg-white border border-slate-300 rounded-md px-1.5 py-1 text-xs font-mono text-center focus:ring-2 focus:ring-blue-400 outline-none" value={timeHours || ""} onChange={e => setTimeHours(Math.max(0, parseInt(e.target.value) || 0))} onKeyDown={e => { if (e.key === "Enter") saveOverride(metric.key) }} />
                              <span className="text-slate-400 text-[10px]">h</span>
                              <input type="number" min="0" max="59" placeholder="0" className="w-12 bg-white border border-slate-300 rounded-md px-1.5 py-1 text-xs font-mono text-center focus:ring-2 focus:ring-blue-400 outline-none" value={timeMinutes || ""} onChange={e => setTimeMinutes(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))} onKeyDown={e => { if (e.key === "Enter") saveOverride(metric.key) }} />
                              <span className="text-slate-400 text-[10px]">m</span>
                            </>
                          ) : (
                            <input
                              type="number"
                              placeholder="Goal"
                              className="w-20 bg-white border border-slate-300 rounded-md px-2 py-1 text-xs font-mono focus:ring-2 focus:ring-blue-400 outline-none"
                              value={overrideValue}
                              onChange={e => setOverrideValue(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") saveOverride(metric.key) }}
                            />
                          )}
                          <button onClick={() => saveOverride(metric.key)} className="p-1 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-700 transition-colors">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setAddingOverride(null)} className="p-1 rounded hover:bg-slate-100 text-slate-400 transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setAddingOverride(metric.key); setOverrideType("office"); setOverrideTarget(""); setOverrideValue("") }}
                          className="mt-2 ml-4 text-[11px] text-slate-400 hover:text-blue-600 transition-colors"
                        >
                          + Add override
                        </button>
                      )}
                    </div>
                  )
                })}
              </CardContent>
            )}
          </Card>
        )
      })}
    </div>
  )
}
