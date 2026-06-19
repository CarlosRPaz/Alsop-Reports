"use client"

import { useState, useEffect, useCallback } from "react"
import { saveEAgentData } from "@/app/reports/daily/actions"
import { Button } from "@/components/ui/Button"
import { AlertCircle, X, Save, RotateCcw } from "lucide-react"

interface EAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  dateStr: string;
  agents: any[]; // List of active agents for the date
  onSuccess: () => void;
}

// ── Compact Stepper Component ──
function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const set = (v: number) => onChange(Math.max(0, v))

  return (
    <div className="flex items-center gap-[2px]">
      {/* -5 */}
      <button
        onClick={() => set(value - 5)}
        className="w-7 h-7 rounded-l-md bg-rose-50 hover:bg-rose-100 text-rose-600 text-[10px] font-bold transition-colors border border-rose-200 active:scale-95"
        tabIndex={-1}
      >-5</button>
      {/* -1 */}
      <button
        onClick={() => set(value - 1)}
        className="w-6 h-7 bg-white hover:bg-rose-50 text-rose-500 text-xs font-bold transition-colors border-y border-rose-200 active:scale-95"
        tabIndex={-1}
      >−</button>
      {/* Value display / editable */}
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => set(parseInt(e.target.value) || 0)}
        className="w-10 h-7 bg-white border-y border-x border-slate-200 text-center text-sm font-mono text-slate-900 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      {/* +1 */}
      <button
        onClick={() => set(value + 1)}
        className="w-6 h-7 bg-white hover:bg-emerald-50 text-emerald-500 text-xs font-bold transition-colors border-y border-emerald-200 active:scale-95"
        tabIndex={-1}
      >+</button>
      {/* +5 */}
      <button
        onClick={() => set(value + 5)}
        className="w-7 h-7 rounded-r-md bg-emerald-50 hover:bg-emerald-100 text-emerald-600 text-[10px] font-bold transition-colors border border-emerald-200 active:scale-95"
        tabIndex={-1}
      >+5</button>
    </div>
  )
}

export function EAgentModal({ isOpen, onClose, dateStr, agents, onSuccess }: EAgentModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Form state: agent_id -> { dismissed, pastDue, pivots }
  const [formData, setFormData] = useState<Record<string, { dismissed: number, pastDue: number, pivots: number }>>({})

  // Sorted agents alphabetically
  const sortedAgents = [...agents].sort((a, b) => 
    (a.agents?.name || "").localeCompare(b.agents?.name || "")
  )

  // Initialize form data when opened
  useEffect(() => {
    if (isOpen) {
      const initial: Record<string, { dismissed: number, pastDue: number, pivots: number }> = {}
      agents.forEach(a => {
        initial[a.agent_id] = {
          dismissed: a.dismissed_todos || 0,
          pastDue: a.past_due_todos || 0,
          pivots: a.pivots || 0
        }
      })
      setFormData(initial)
      setError(null)
    }
  }, [isOpen, agents])

  const updateField = useCallback((agentId: string, field: "dismissed" | "pastDue" | "pivots", value: number) => {
    setFormData(prev => ({
      ...prev,
      [agentId]: {
        ...prev[agentId],
        [field]: value
      }
    }))
  }, [])

  const resetAll = useCallback(() => {
    const reset: Record<string, { dismissed: number, pastDue: number, pivots: number }> = {}
    agents.forEach(a => {
      reset[a.agent_id] = { dismissed: 0, pastDue: 0, pivots: 0 }
    })
    setFormData(reset)
  }, [agents])

  if (!isOpen) return null

  const handleSave = async () => {
    setLoading(true)
    setError(null)

    const updates = Object.keys(formData).map(agentId => ({
      agent_id: agentId,
      dismissed: formData[agentId].dismissed,
      pastDue: formData[agentId].pastDue,
      pivots: formData[agentId].pivots
    }))

    const result = await saveEAgentData(dateStr, updates)
    
    setLoading(false)
    if (result.success) {
      onSuccess()
      onClose()
    } else {
      setError(result.error || "Failed to save data.")
    }
  }

  // Summary stats
  const totalDismissed = Object.values(formData).reduce((s, v) => s + v.dismissed, 0)
  const totalPastDue = Object.values(formData).reduce((s, v) => s + v.pastDue, 0)
  const totalPivots = Object.values(formData).reduce((s, v) => s + v.pivots, 0)
  const agentsWithData = Object.values(formData).filter(v => v.dismissed > 0 || v.pastDue > 0 || v.pivots > 0).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <div>
            <h2 className="text-base font-bold text-slate-900">eAgent Entry</h2>
            <p className="text-xs text-slate-500">{dateStr} • Use steppers or type directly</p>
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
        <div className="flex items-center gap-4 px-4 py-2 bg-slate-50 border-b border-slate-200 text-[11px]">
          <span className="text-slate-600">
            <span className="text-slate-900 font-semibold">{agentsWithData}</span> agents entered
          </span>
          <span className="text-slate-600">
            Dismissed: <span className="text-violet-600 font-semibold">{totalDismissed}</span>
          </span>
          <span className="text-slate-600">
            Past Due: <span className="text-orange-600 font-semibold">{totalPastDue}</span>
          </span>
          <span className="text-slate-600">
            Pivots: <span className="text-cyan-600 font-semibold">{totalPivots}</span>
          </span>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mt-3 p-2 bg-red-50 border border-red-200 rounded text-red-600 text-xs flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5" /> {error}
          </div>
        )}

        {/* Body — compact table */}
        <div className="flex-grow overflow-y-auto px-2 py-1">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="border-b border-slate-200">
                <th className="py-1.5 px-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Agent</th>
                <th className="py-1.5 px-1 text-[10px] uppercase tracking-wider text-violet-600 font-semibold text-center">Dismissed</th>
                <th className="py-1.5 px-1 text-[10px] uppercase tracking-wider text-orange-600 font-semibold text-center">Past Due</th>
                <th className="py-1.5 px-1 text-[10px] uppercase tracking-wider text-cyan-600 font-semibold text-center">Pivots</th>
              </tr>
            </thead>
            <tbody>
              {sortedAgents.map((agent, index) => {
                const d = formData[agent.agent_id]
                if (!d) return null
                const hasData = d.dismissed > 0 || d.pastDue > 0 || d.pivots > 0
                const rowBg = index % 2 !== 0 ? "bg-slate-100" : "bg-white"
                return (
                  <tr 
                    key={agent.agent_id} 
                    className={`border-b border-slate-150 transition-colors ${rowBg} hover:bg-indigo-50/80`}
                  >
                    <td className="py-2 px-3">
                      <span className={`text-sm font-semibold ${hasData ? "text-slate-900" : "text-slate-500"}`}>{agent.agents?.name}</span>
                    </td>
                    <td className="py-2 px-1">
                      <div className="flex justify-center">
                        <Stepper 
                          value={d.dismissed}
                          onChange={(v) => updateField(agent.agent_id, "dismissed", v)}
                        />
                      </div>
                    </td>
                    <td className="py-2 px-1">
                      <div className="flex justify-center">
                        <Stepper 
                          value={d.pastDue}
                          onChange={(v) => updateField(agent.agent_id, "pastDue", v)}
                        />
                      </div>
                    </td>
                    <td className="py-2 px-1">
                      <div className="flex justify-center">
                        <Stepper 
                          value={d.pivots}
                          onChange={(v) => updateField(agent.agent_id, "pivots", v)}
                        />
                      </div>
                    </td>
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
              <><Save className="w-3.5 h-3.5" /> Save eAgent Data</>
            )}
          </Button>
        </div>

      </div>
    </div>
  )
}
