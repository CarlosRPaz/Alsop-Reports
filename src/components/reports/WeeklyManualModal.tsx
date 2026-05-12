"use client"

import { useState, useEffect, useCallback } from "react"
import { saveWeeklyManualData } from "@/app/reports/weekly/actions"
import { Button } from "@/components/ui/Button"
import { AlertCircle, X, Save, RotateCcw } from "lucide-react"

interface WeeklyManualModalProps {
  isOpen: boolean;
  onClose: () => void;
  weekStartStr: string;
  weekLabel: string;
  agents: any[];
  onSuccess: () => void;
}

// ── Compact Stepper Component ──
function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const set = (v: number) => onChange(Math.max(0, v))

  return (
    <div className="flex items-center gap-[2px]">
      <button
        onClick={() => set(value - 5)}
        className="w-6 h-6 rounded-l-md bg-rose-50 hover:bg-rose-100 text-rose-600 text-[9px] font-bold transition-colors border border-rose-200 active:scale-95"
        tabIndex={-1}
      >-5</button>
      <button
        onClick={() => set(value - 1)}
        className="w-5 h-6 bg-white hover:bg-rose-50 text-rose-500 text-[10px] font-bold transition-colors border-y border-rose-200 active:scale-95"
        tabIndex={-1}
      >−</button>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => set(parseInt(e.target.value) || 0)}
        className="w-9 h-6 bg-white border-y border-x border-slate-200 text-center text-xs font-mono text-slate-900 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        onClick={() => set(value + 1)}
        className="w-5 h-6 bg-white hover:bg-emerald-50 text-emerald-500 text-[10px] font-bold transition-colors border-y border-emerald-200 active:scale-95"
        tabIndex={-1}
      >+</button>
      <button
        onClick={() => set(value + 5)}
        className="w-6 h-6 rounded-r-md bg-emerald-50 hover:bg-emerald-100 text-emerald-600 text-[9px] font-bold transition-colors border border-emerald-200 active:scale-95"
        tabIndex={-1}
      >+5</button>
    </div>
  )
}

interface ManualRow {
  unique_leads: number
  rico_hot_pipeline: number
  pivot: number
  saved: number
  dismissed_todos: number
  past_due_todos: number
  rico_past_due_tasks: number
}

const EMPTY_ROW: ManualRow = {
  unique_leads: 0,
  rico_hot_pipeline: 0,
  pivot: 0,
  saved: 0,
  dismissed_todos: 0,
  past_due_todos: 0,
  rico_past_due_tasks: 0,
}

const FIELD_CONFIG = [
  { key: "unique_leads" as const, label: "Unique Leads", short: "Leads", color: "text-blue-600" },
  { key: "rico_hot_pipeline" as const, label: "Rico Hot", short: "Hot", color: "text-orange-600" },
  { key: "pivot" as const, label: "#PIVOT", short: "Pivot", color: "text-cyan-600" },
  { key: "saved" as const, label: "#SAVED", short: "Saved", color: "text-emerald-600" },
  { key: "dismissed_todos" as const, label: "Dismissed", short: "Dism", color: "text-violet-600" },
  { key: "past_due_todos" as const, label: "Past Due", short: "PD", color: "text-rose-600" },
  { key: "rico_past_due_tasks" as const, label: "Rico PD", short: "RPD", color: "text-amber-600" },
]

export function WeeklyManualModal({ isOpen, onClose, weekStartStr, weekLabel, agents, onSuccess }: WeeklyManualModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState<Record<string, ManualRow>>({})

  const sortedAgents = [...agents].sort((a, b) =>
    (a.agents?.name || "").localeCompare(b.agents?.name || "")
  )

  // Initialize form data when opened
  useEffect(() => {
    if (isOpen) {
      const initial: Record<string, ManualRow> = {}
      agents.forEach(a => {
        initial[a.agent_id] = {
          unique_leads: a.unique_leads || 0,
          rico_hot_pipeline: a.rico_hot_pipeline || 0,
          pivot: a.pivot || 0,
          saved: a.saved || 0,
          dismissed_todos: a.w_dismissed_todos || 0,
          past_due_todos: a.w_past_due_todos || 0,
          rico_past_due_tasks: a.rico_past_due_tasks || 0,
        }
      })
      setFormData(initial)
      setError(null)
    }
  }, [isOpen, agents])

  const updateField = useCallback((agentId: string, field: keyof ManualRow, value: number) => {
    setFormData(prev => ({
      ...prev,
      [agentId]: {
        ...prev[agentId],
        [field]: value
      }
    }))
  }, [])

  const resetAll = useCallback(() => {
    const reset: Record<string, ManualRow> = {}
    agents.forEach(a => {
      reset[a.agent_id] = { ...EMPTY_ROW }
    })
    setFormData(reset)
  }, [agents])

  if (!isOpen) return null

  const handleSave = async () => {
    setLoading(true)
    setError(null)

    const updates = Object.entries(formData).map(([agentId, data]) => ({
      agent_id: agentId,
      ...data,
    }))

    const result = await saveWeeklyManualData(weekStartStr, updates)

    setLoading(false)
    if (result.success) {
      onSuccess()
      onClose()
    } else {
      setError(result.error || "Failed to save data.")
    }
  }

  // Summary stats
  const totals = FIELD_CONFIG.map(f => ({
    ...f,
    total: Object.values(formData).reduce((s, v) => s + (v[f.key] || 0), 0)
  }))
  const agentsWithData = Object.values(formData).filter(v =>
    Object.values(v).some(n => n > 0)
  ).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <div>
            <h2 className="text-base font-bold text-slate-900">Weekly Manual Entry</h2>
            <p className="text-xs text-slate-500">{weekLabel} • Use steppers or type directly</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={resetAll}
              title="Reset all to 0"
              className="text-slate-500 hover:text-amber-400 transition-colors p-1"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-900 transition-colors p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Summary bar */}
        <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 border-b border-slate-200 text-[10px] flex-wrap">
          <span className="text-slate-600">
            <span className="text-slate-900 font-semibold">{agentsWithData}</span> agents entered
          </span>
          {totals.map(t => (
            <span key={t.key} className="text-slate-600">
              {t.short}: <span className={`${t.color} font-semibold`}>{t.total}</span>
            </span>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mt-3 p-2 bg-red-50 border border-red-200 rounded text-red-600 text-xs flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5" /> {error}
          </div>
        )}

        {/* Body — compact table */}
        <div className="flex-grow overflow-y-auto overflow-x-auto px-2 py-1">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="border-b border-slate-200">
                <th className="py-1.5 px-2 text-[9px] uppercase tracking-wider text-slate-500 font-semibold whitespace-nowrap">Agent</th>
                {FIELD_CONFIG.map(f => (
                  <th key={f.key} className={`py-1.5 px-1 text-[9px] uppercase tracking-wider ${f.color} font-semibold text-center whitespace-nowrap`}>
                    {f.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedAgents.map((agent, index) => {
                const d = formData[agent.agent_id]
                if (!d) return null
                const hasData = Object.values(d).some(n => n > 0)
                const rowBg = index % 2 !== 0 ? "bg-slate-100" : "bg-white"
                return (
                  <tr
                    key={agent.agent_id}
                    className={`border-b border-slate-200 transition-colors ${rowBg} hover:bg-slate-200`}
                  >
                    <td className="py-1 px-2">
                      <span className="text-xs font-medium text-slate-700 whitespace-nowrap">{agent.agents?.name}</span>
                    </td>
                    {FIELD_CONFIG.map(f => (
                      <td key={f.key} className="py-1 px-1">
                        <div className="flex justify-center">
                          <Stepper
                            value={d[f.key]}
                            onChange={(v) => updateField(agent.agent_id, f.key, v)}
                          />
                        </div>
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-200 flex justify-end gap-3 bg-slate-50 rounded-b-xl">
          <Button variant="outline" onClick={onClose} disabled={loading} className="text-slate-600 border-slate-300 hover:bg-slate-200 text-xs px-3 py-1.5">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading} className="bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-2 text-xs px-4 py-1.5">
            {loading ? (
              <span className="flex items-center gap-2">
                <div className="animate-spin h-3.5 w-3.5 border-2 border-white/20 border-t-white rounded-full" />
                Saving...
              </span>
            ) : (
              <><Save className="w-3.5 h-3.5" /> Save Weekly Data</>
            )}
          </Button>
        </div>

      </div>
    </div>
  )
}
