"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/Button"
import { AlertCircle, X, Save, RotateCcw, CalendarDays } from "lucide-react"
import { supabase } from "@/lib/supabaseClient"

interface LeadsModalProps {
  isOpen: boolean;
  onClose: () => void;
  dateStr: string;
  onSuccess: () => void;
}

// ── Compact Stepper Component (same as EAgentModal) ──
function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const set = (v: number) => onChange(Math.max(0, v))

  return (
    <div className="flex items-center gap-[2px]">
      <button
        onClick={() => set(value - 5)}
        className="w-7 h-7 rounded-l-md bg-rose-50 hover:bg-rose-100 text-rose-600 text-[10px] font-bold transition-colors border border-rose-200 active:scale-95"
        tabIndex={-1}
      >-5</button>
      <button
        onClick={() => set(value - 1)}
        className="w-6 h-7 bg-white hover:bg-rose-50 text-rose-500 text-xs font-bold transition-colors border-y border-rose-200 active:scale-95"
        tabIndex={-1}
      >−</button>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => set(parseInt(e.target.value) || 0)}
        className="w-10 h-7 bg-white border-y border-x border-slate-200 text-center text-sm font-mono text-slate-900 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        onClick={() => set(value + 1)}
        className="w-6 h-7 bg-white hover:bg-emerald-50 text-emerald-500 text-xs font-bold transition-colors border-y border-emerald-200 active:scale-95"
        tabIndex={-1}
      >+</button>
      <button
        onClick={() => set(value + 5)}
        className="w-7 h-7 rounded-r-md bg-emerald-50 hover:bg-emerald-100 text-emerald-600 text-[10px] font-bold transition-colors border border-emerald-200 active:scale-95"
        tabIndex={-1}
      >+5</button>
    </div>
  )
}

interface LeadEntry {
  contact: number
  quoted: number
  hot: number
  xsale: number
}

export function LeadsModal({ isOpen, onClose, dateStr, onSuccess }: LeadsModalProps) {
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([])
  const [selectedDate, setSelectedDate] = useState(dateStr)
  
  // Form state: agent_id -> { contact, quoted, hot, xsale }
  const [formData, setFormData] = useState<Record<string, LeadEntry>>({})

  // Reset selectedDate when the modal opens with a new dateStr
  useEffect(() => {
    if (isOpen) setSelectedDate(dateStr)
  }, [isOpen, dateStr])

  // Load agents and existing leads data when opened or date changes
  useEffect(() => {
    if (!isOpen) return
    setInitialLoading(true)
    setError(null)

    async function loadData() {
      try {
        // 1. Load active, report-visible agents (excluding CSR agents)
        const { data: agentsData, error: agentsErr } = await supabase
          .from("agents")
          .select("id, name, team, report_visible")
          .eq("active", true)
          .eq("report_visible", true)
          .order("name")

        if (agentsErr) throw agentsErr

        const agentList = (agentsData || [])
          .filter(a => a.team?.trim().toUpperCase() !== "CSR")
          .map(a => ({ id: a.id, name: a.name }))
        setAgents(agentList)

        // 2. Load existing leads_snapshot for this date
        const { data: existingLeads } = await supabase
          .from("leads_snapshot")
          .select("agent_id, contact, quoted, hot, xsale")
          .eq("report_date", selectedDate)

        // Build form state
        const initial: Record<string, LeadEntry> = {}
        for (const a of agentList) {
          const existing = existingLeads?.find(l => l.agent_id === a.id)
          initial[a.id] = {
            contact: existing?.contact || 0,
            quoted: existing?.quoted || 0,
            hot: existing?.hot || 0,
            xsale: existing?.xsale || 0,
          }
        }
        setFormData(initial)
      } catch (err: any) {
        setError(err.message || "Failed to load data")
      } finally {
        setInitialLoading(false)
      }
    }

    loadData()
  }, [isOpen, selectedDate])

  const updateField = useCallback((agentId: string, field: keyof LeadEntry, value: number) => {
    setFormData(prev => ({
      ...prev,
      [agentId]: {
        ...prev[agentId],
        [field]: value
      }
    }))
  }, [])

  const resetAll = useCallback(() => {
    setFormData(prev => {
      const reset: Record<string, LeadEntry> = {}
      for (const id of Object.keys(prev)) {
        reset[id] = { contact: 0, quoted: 0, hot: 0, xsale: 0 }
      }
      return reset
    })
  }, [])

  if (!isOpen) return null

  const handleSave = async () => {
    setLoading(true)
    setError(null)

    try {
      // Build upsert payloads for leads_snapshot
      const rows = Object.entries(formData).map(([agentId, data]) => ({
        agent_id: agentId,
        report_date: selectedDate,
        contact: data.contact,
        quoted: data.quoted,
        hot: data.hot,
        xsale: data.xsale,
      }))

      // Upsert to leads_snapshot (conflict on agent_id + report_date)
      const { error: upsertErr } = await supabase
        .from("leads_snapshot")
        .upsert(rows, { onConflict: "agent_id,report_date" })

      if (upsertErr) throw upsertErr

      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || "Failed to save leads data")
    } finally {
      setLoading(false)
    }
  }

  // Summary stats
  const totalContact = Object.values(formData).reduce((s, v) => s + v.contact, 0)
  const totalQuoted = Object.values(formData).reduce((s, v) => s + v.quoted, 0)
  const totalHot = Object.values(formData).reduce((s, v) => s + v.hot, 0)
  const totalXsale = Object.values(formData).reduce((s, v) => s + v.xsale, 0)
  const agentsWithData = Object.values(formData).filter(v => 
    v.contact > 0 || v.quoted > 0 || v.hot > 0 || v.xsale > 0
  ).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <div>
            <h2 className="text-base font-bold text-slate-900">Lead Pipeline Entry</h2>
            <p className="text-xs text-slate-500">Enter DeerDama lead counts per agent</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-100 rounded-md px-2 py-1">
              <CalendarDays className="w-3.5 h-3.5 text-slate-500" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-900 outline-none cursor-pointer w-[110px]"
              />
            </div>
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
        <div className="flex items-center gap-4 px-4 py-2 bg-slate-50 border-b border-slate-200 text-[11px] flex-wrap">
          <span className="text-slate-600">
            <span className="text-slate-900 font-semibold">{agentsWithData}</span> agents entered
          </span>
          <span className="text-slate-600">
            Contacted: <span className="text-blue-600 font-semibold">{totalContact}</span>
          </span>
          <span className="text-slate-600">
            Quoted: <span className="text-violet-600 font-semibold">{totalQuoted}</span>
          </span>
          <span className="text-slate-600">
            Hot: <span className="text-orange-600 font-semibold">{totalHot}</span>
          </span>
          <span className="text-slate-600">
            XDate: <span className="text-cyan-600 font-semibold">{totalXsale}</span>
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
          {initialLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin h-5 w-5 border-2 border-slate-300 border-t-blue-500 rounded-full" />
              <span className="ml-3 text-sm text-slate-500">Loading agents...</span>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-slate-200">
                  <th className="py-1.5 px-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Agent</th>
                  <th className="py-1.5 px-1 text-[10px] uppercase tracking-wider text-blue-600 font-semibold text-center">Contacted</th>
                  <th className="py-1.5 px-1 text-[10px] uppercase tracking-wider text-violet-600 font-semibold text-center">Quoted</th>
                  <th className="py-1.5 px-1 text-[10px] uppercase tracking-wider text-orange-600 font-semibold text-center">Hot</th>
                  <th className="py-1.5 px-1 text-[10px] uppercase tracking-wider text-cyan-600 font-semibold text-center">XDate</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent, index) => {
                  const d = formData[agent.id]
                  if (!d) return null
                  const hasData = d.contact > 0 || d.quoted > 0 || d.hot > 0 || d.xsale > 0
                  const rowBg = index % 2 !== 0 ? "bg-slate-100" : "bg-white"
                  return (
                    <tr 
                      key={agent.id} 
                      className={`border-b border-slate-200 transition-colors ${rowBg} hover:bg-slate-200`}
                    >
                      <td className="py-1 px-2">
                        <span className={`text-xs font-medium ${hasData ? "text-slate-900" : "text-slate-500"}`}>{agent.name}</span>
                      </td>
                      <td className="py-1 px-1">
                        <div className="flex justify-center">
                          <Stepper 
                            value={d.contact}
                            onChange={(v) => updateField(agent.id, "contact", v)}
                          />
                        </div>
                      </td>
                      <td className="py-1 px-1">
                        <div className="flex justify-center">
                          <Stepper 
                            value={d.quoted}
                            onChange={(v) => updateField(agent.id, "quoted", v)}
                          />
                        </div>
                      </td>
                      <td className="py-1 px-1">
                        <div className="flex justify-center">
                          <Stepper 
                            value={d.hot}
                            onChange={(v) => updateField(agent.id, "hot", v)}
                          />
                        </div>
                      </td>
                      <td className="py-1 px-1">
                        <div className="flex justify-center">
                          <Stepper 
                            value={d.xsale}
                            onChange={(v) => updateField(agent.id, "xsale", v)}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-200 flex justify-end gap-3 bg-slate-50 rounded-b-xl">
          <Button variant="outline" onClick={onClose} disabled={loading} className="text-slate-600 border-slate-300 hover:bg-slate-200 text-xs px-3 py-1.5">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading || initialLoading} className="bg-orange-600 hover:bg-orange-500 text-white flex items-center gap-2 text-xs px-4 py-1.5">
            {loading ? (
              <span className="flex items-center gap-2">
                <div className="animate-spin h-3.5 w-3.5 border-2 border-white/20 border-t-white rounded-full" />
                Saving...
              </span>
            ) : (
              <><Save className="w-3.5 h-3.5" /> Save Lead Data</>
            )}
          </Button>
        </div>

      </div>
    </div>
  )
}
