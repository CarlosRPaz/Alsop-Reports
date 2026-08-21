"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import {
  Plus, Edit2, Check, X, UserMinus,
  Eye, EyeOff, Search, ChevronDown, ChevronRight,
  Users, Save, Loader2, UserPlus
} from "lucide-react"

// ─── Types ──────────────────────────────────────────────────────────────────────

interface SystemVariants {
  full_name?: string
  rc_name?: string
  rico_name?: string
  hs_name?: string
  nb_name?: string
  quotes_name?: string
  az_name?: string
}

interface Agent {
  id: string
  name: string
  team: string | null
  office: string | null
  active: boolean
  system_variants: SystemVariants | null
  role: string | null
  presence: string | null
  meeting_time: string | null
  report_visible: boolean
  created_at: string
  updated_at: string
}

type StatusFilter = "all" | "active" | "on_leave" | "archived"

// ─── Constants ──────────────────────────────────────────────────────────────────

const MEETING_TIMES = ["8:50 AM", "9:00 AM", "9:10 AM", "9:20 AM", "9:30 AM", "9:40 AM", "9:50 AM"]
const OFFICES = ["MCM", "MB", "RC", "CH"]
const TEAMS = ["Sales", "CSR", "EA"]

const VARIANT_FIELDS: { key: keyof SystemVariants; label: string }[] = [
  { key: "full_name",   label: "Full Name" },
  { key: "rc_name",     label: "RingCentral" },
  { key: "rico_name",   label: "Ricochet" },
  { key: "hs_name",     label: "Hearsay" },
  { key: "nb_name",     label: "NB/Allstate" },
  { key: "quotes_name", label: "Quotes" },
  { key: "az_name",     label: "AgencyZoom" },
]

const EMPTY_NEW_AGENT = {
  name: "",
  office: "",
  team: "",
  meeting_time: "",
  system_variants: {} as SystemVariants,
}

// ─── Component ──────────────────────────────────────────────────────────────────

export default function AgentManagement() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)

  // UI state
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<Agent>>({})

  // Variant editor state
  const [variantDraft, setVariantDraft] = useState<SystemVariants>({})
  const [savingVariants, setSavingVariants] = useState(false)

  // New Agent state
  const [showNewAgent, setShowNewAgent] = useState(false)
  const [newAgent, setNewAgent] = useState(EMPTY_NEW_AGENT)
  const [savingNew, setSavingNew] = useState(false)

  // Saving visibility toggle
  const [togglingVisibility, setTogglingVisibility] = useState<string | null>(null)

  // ── Data Fetching ───────────────────────────────────────────────────────────

  const fetchAgents = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from("agents").select("*").order("name")
    // Default report_visible to true if column doesn't exist yet
    const agents = ((data as Agent[]) || []).map(a => ({
      ...a,
      report_visible: a.report_visible ?? true,
    }))
    setAgents(agents)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

  // ── Filtering ───────────────────────────────────────────────────────────────

  const filteredAgents = useMemo(() => {
    let result = agents

    // Status filter
    if (statusFilter === "active") {
      result = result.filter((a) => a.active && a.report_visible)
    } else if (statusFilter === "on_leave") {
      result = result.filter((a) => a.active && !a.report_visible)
    } else if (statusFilter === "archived") {
      result = result.filter((a) => !a.active)
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((a) => a.name.toLowerCase().includes(q))
    }

    return result
  }, [agents, statusFilter, searchQuery])

  // ── Counts for filter tabs ──────────────────────────────────────────────────

  const counts = useMemo(() => ({
    all:      agents.length,
    active:   agents.filter((a) => a.active && a.report_visible).length,
    on_leave: agents.filter((a) => a.active && !a.report_visible).length,
    archived: agents.filter((a) => !a.active).length,
  }), [agents])

  // ── Variant helpers ─────────────────────────────────────────────────────────

  const variantCount = (agent: Agent): number => {
    if (!agent.system_variants) return 0
    return Object.values(agent.system_variants).filter((v) => v && String(v).trim() !== "").length
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  const toggleExpand = (agent: Agent) => {
    if (expandedId === agent.id) {
      setExpandedId(null)
    } else {
      setExpandedId(agent.id)
      setVariantDraft(agent.system_variants || {})
    }
  }

  const startEdit = (agent: Agent) => {
    setEditingId(agent.id)
    setEditForm({
      name: agent.name,
      team: agent.team,
      office: agent.office,
      active: agent.active,
      meeting_time: agent.meeting_time,
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm({})
  }

  const saveEdit = async () => {
    if (!editingId) return
    try {
      await supabase
        .from("agents")
        .update({
          name: editForm.name,
          team: editForm.team,
          office: editForm.office,
          active: editForm.active,
          meeting_time: editForm.meeting_time || null,
        })
        .eq("id", editingId)

      // Optimistic update
      setAgents((prev) =>
        prev.map((a) => (a.id === editingId ? { ...a, ...editForm } : a))
      )
      setEditingId(null)
      setEditForm({})
    } catch (e) {
      console.error(e)
    }
  }

  const toggleArchive = async (id: string, currentActive: boolean) => {
    try {
      const newActive = !currentActive
      await supabase.from("agents").update({ active: newActive }).eq("id", id)
      setAgents((prev) =>
        prev.map((a) => (a.id === id ? { ...a, active: newActive } : a))
      )
    } catch (e) {
      console.error(e)
    }
  }

  const toggleVisibility = async (agent: Agent) => {
    setTogglingVisibility(agent.id)
    const newVisible = !agent.report_visible
    try {
      await supabase.from("agents").update({ report_visible: newVisible }).eq("id", agent.id)
      setAgents((prev) =>
        prev.map((a) => (a.id === agent.id ? { ...a, report_visible: newVisible } : a))
      )
    } catch (e) {
      console.error(e)
    } finally {
      setTogglingVisibility(null)
    }
  }

  const saveVariants = async (agentId: string) => {
    setSavingVariants(true)
    try {
      await supabase
        .from("agents")
        .update({ system_variants: variantDraft })
        .eq("id", agentId)
      setAgents((prev) =>
        prev.map((a) => (a.id === agentId ? { ...a, system_variants: variantDraft } : a))
      )
    } catch (e) {
      console.error(e)
    } finally {
      setSavingVariants(false)
    }
  }

  const createAgent = async () => {
    if (!newAgent.name.trim()) return
    setSavingNew(true)
    try {
      const payload: Record<string, unknown> = {
        name: newAgent.name.trim(),
        office: newAgent.office || null,
        team: newAgent.team || null,
        meeting_time: newAgent.meeting_time || null,
        active: true,
        report_visible: true,
        system_variants: Object.keys(newAgent.system_variants).length > 0
          ? newAgent.system_variants
          : null,
      }
      const { data, error } = await supabase.from("agents").insert(payload).select().single()
      if (error) throw error
      if (data) {
        setAgents((prev) => [...prev, data as Agent].sort((a, b) => a.name.localeCompare(b.name)))
      }
      setNewAgent(EMPTY_NEW_AGENT)
      setShowNewAgent(false)
    } catch (e) {
      console.error(e)
    } finally {
      setSavingNew(false)
    }
  }

  // ── Row styling helpers ─────────────────────────────────────────────────────

  const getRowClasses = (agent: Agent): string => {
    if (!agent.active) return "bg-slate-50/60 text-slate-400 dark:bg-slate-800/40 dark:text-slate-500"
    if (!agent.report_visible) return "bg-white text-slate-500 dark:bg-slate-900 dark:text-slate-400"
    return "bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100"
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-4 sm:space-y-6">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100">Agent Management</h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">
            Manage names, offices, teams, system name variants, and report visibility.
          </p>
        </div>
        <Button
          className="bg-blue-600 hover:bg-blue-500 text-white shrink-0"
          onClick={() => setShowNewAgent(true)}
        >
          <Plus className="w-4 h-4 mr-2" /> New Agent
        </Button>
      </header>

      {/* ── New Agent Form (inline card) ─────────────────────────────────── */}
      {showNewAgent && (
        <Card className="border-blue-200 shadow-md">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-blue-700">
              <UserPlus className="w-5 h-5" />
              Create New Agent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  placeholder="Agent name"
                  value={newAgent.name}
                  onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })}
                />
              </div>
              {/* Office */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">
                  Office
                </label>
                <select
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  value={newAgent.office}
                  onChange={(e) => setNewAgent({ ...newAgent, office: e.target.value })}
                >
                  <option value="">Select office</option>
                  {OFFICES.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
              {/* Team */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">
                  Team
                </label>
                <select
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  value={newAgent.team}
                  onChange={(e) => setNewAgent({ ...newAgent, team: e.target.value })}
                >
                  <option value="">Select team</option>
                  {TEAMS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              {/* Meeting Time */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">
                  Meeting Time
                </label>
                <select
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  value={newAgent.meeting_time}
                  onChange={(e) => setNewAgent({ ...newAgent, meeting_time: e.target.value })}
                >
                  <option value="">Select time</option>
                  {MEETING_TIMES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Optional variant fields in new agent form */}
            <details className="mb-4 group">
              <summary className="text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-700 transition-colors select-none">
                System Name Variants (optional)
              </summary>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mt-3 pt-3 border-t border-slate-100">
                {VARIANT_FIELDS.map((vf) => (
                  <div key={vf.key}>
                    <label className="block text-xs text-slate-500 mb-1">{vf.label}</label>
                    <input
                      type="text"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:ring-2 focus:ring-blue-400 outline-none transition"
                      placeholder={vf.label}
                      value={newAgent.system_variants[vf.key] || ""}
                      onChange={(e) =>
                        setNewAgent({
                          ...newAgent,
                          system_variants: { ...newAgent.system_variants, [vf.key]: e.target.value },
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            </details>

            <div className="flex items-center gap-3">
              <Button
                onClick={createAgent}
                disabled={!newAgent.name.trim() || savingNew}
                className="bg-blue-600 hover:bg-blue-500 text-white"
              >
                {savingNew ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                Create Agent
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowNewAgent(false)
                  setNewAgent(EMPTY_NEW_AGENT)
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Search & Filters ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search agents..."
            className="w-full bg-white border border-slate-200 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
          {([
            { key: "all",      label: "All" },
            { key: "active",   label: "Active" },
            { key: "on_leave", label: "On Leave" },
            { key: "archived", label: "Archived" },
          ] as { key: StatusFilter; label: string }[]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                statusFilter === tab.key
                  ? "bg-white text-slate-900 dark:bg-slate-700 dark:text-slate-100 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
              }`}
            >
              {tab.label}
              <span className="ml-1.5 text-[10px] text-slate-400">{counts[tab.key]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Agent Table ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-slate-400" />
              Agency Roster
            </CardTitle>
            <span className="text-xs text-slate-400">
              {filteredAgents.length} agent{filteredAgents.length !== 1 && "s"}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center p-12">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 dark:border-blue-400" />
            </div>
          ) : filteredAgents.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No agents found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="py-2.5 px-3 text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 w-8" />
                    <th className="py-2.5 px-3 text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">Name</th>
                    <th className="py-2.5 px-3 text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">Office</th>
                    <th className="py-2.5 px-3 text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">Team</th>
                    <th className="py-2.5 px-3 text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">Meeting</th>
                    <th className="py-2.5 px-3 text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 text-center">Variants</th>
                    <th className="py-2.5 px-3 text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 text-center">Visible</th>
                    <th className="py-2.5 px-3 text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">Status</th>
                    <th className="py-2.5 px-3 text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {filteredAgents.map((agent) => {
                    const isEditing = editingId === agent.id
                    const isExpanded = expandedId === agent.id
                    const vCount = variantCount(agent)

                    return (
                      <AgentRow
                        key={agent.id}
                        agent={agent}
                        isEditing={isEditing}
                        isExpanded={isExpanded}
                        vCount={vCount}
                        editForm={editForm}
                        variantDraft={variantDraft}
                        savingVariants={savingVariants}
                        togglingVisibility={togglingVisibility}
                        rowClasses={getRowClasses(agent)}
                        onToggleExpand={() => toggleExpand(agent)}
                        onStartEdit={() => startEdit(agent)}
                        onCancelEdit={cancelEdit}
                        onSaveEdit={saveEdit}
                        onToggleArchive={() => toggleArchive(agent.id, agent.active)}
                        onToggleVisibility={() => toggleVisibility(agent)}
                        onEditFormChange={setEditForm}
                        onVariantDraftChange={setVariantDraft}
                        onSaveVariants={() => saveVariants(agent.id)}
                      />
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Agent Row Sub-Component ──────────────────────────────────────────────────

interface AgentRowProps {
  agent: Agent
  isEditing: boolean
  isExpanded: boolean
  vCount: number
  editForm: Partial<Agent>
  variantDraft: SystemVariants
  savingVariants: boolean
  togglingVisibility: string | null
  rowClasses: string
  onToggleExpand: () => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  onToggleArchive: () => void
  onToggleVisibility: () => void
  onEditFormChange: (form: Partial<Agent>) => void
  onVariantDraftChange: (draft: SystemVariants) => void
  onSaveVariants: () => void
}

function AgentRow({
  agent, isEditing, isExpanded, vCount, editForm,
  variantDraft, savingVariants, togglingVisibility, rowClasses,
  onToggleExpand, onStartEdit, onCancelEdit, onSaveEdit,
  onToggleArchive, onToggleVisibility,
  onEditFormChange, onVariantDraftChange, onSaveVariants,
}: AgentRowProps) {
  const inputClasses = "w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm text-slate-900 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
  const selectClasses = inputClasses

  return (
    <>
      {/* ── Main Row ──────────────────────────────────────────────────────── */}
      <tr
        className={`${rowClasses} hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer group`}
        onClick={(e) => {
          // Don't toggle expand when clicking buttons or inputs
          const target = e.target as HTMLElement
          if (target.closest("button") || target.closest("input") || target.closest("select")) return
          onToggleExpand()
        }}
      >
        {/* Expand chevron */}
        <td className="py-2.5 px-3">
          <div className={`transition-transform duration-200 ${isExpanded ? "rotate-0" : ""}`}>
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-400 transition-colors" />
            )}
          </div>
        </td>

        {/* Name */}
        <td className="py-2.5 px-3">
          {isEditing ? (
            <input
              type="text"
              className={inputClasses}
              value={editForm.name || ""}
              onChange={(e) => onEditFormChange({ ...editForm, name: e.target.value })}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className={`font-semibold ${agent.active ? "" : "line-through decoration-slate-300"}`}>
              {agent.name}
            </span>
          )}
        </td>

        {/* Office */}
        <td className="py-2.5 px-3">
          {isEditing ? (
            <select
              className={selectClasses}
              value={editForm.office || ""}
              onChange={(e) => onEditFormChange({ ...editForm, office: e.target.value })}
              onClick={(e) => e.stopPropagation()}
            >
              <option value="">None</option>
              {OFFICES.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          ) : (
            <span className="text-sm">{agent.office || <span className="text-slate-300">—</span>}</span>
          )}
        </td>

        {/* Team */}
        <td className="py-2.5 px-3">
          {isEditing ? (
            <select
              className={selectClasses}
              value={editForm.team || ""}
              onChange={(e) => onEditFormChange({ ...editForm, team: e.target.value })}
              onClick={(e) => e.stopPropagation()}
            >
              <option value="">None</option>
              {TEAMS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          ) : agent.team ? (
            <Badge
              variant={agent.active ? "outline" : "default"}
              className={!agent.active ? "bg-slate-100 text-slate-400 border-none dark:bg-slate-700 dark:text-slate-500" : ""}
            >
              {agent.team}
            </Badge>
          ) : (
            <span className="text-slate-300">—</span>
          )}
        </td>

        {/* Meeting Time */}
        <td className="py-2.5 px-3">
          {isEditing ? (
            <select
              className={selectClasses}
              value={editForm.meeting_time || ""}
              onChange={(e) => onEditFormChange({ ...editForm, meeting_time: e.target.value })}
              onClick={(e) => e.stopPropagation()}
            >
              <option value="">None</option>
              {MEETING_TIMES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          ) : (
            <span className="font-mono text-sm">
              {agent.meeting_time || <span className="text-slate-300">—</span>}
            </span>
          )}
        </td>

        {/* Variants count badge */}
        <td className="py-2.5 px-3 text-center">
          <Badge
            variant={vCount > 0 ? "outline" : "default"}
            className={
              vCount > 0
                ? "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800"
                : "bg-slate-50 text-slate-400"
            }
          >
            {vCount}
          </Badge>
        </td>

        {/* Visible toggle */}
        <td className="py-2.5 px-3 text-center">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleVisibility()
            }}
            disabled={togglingVisibility === agent.id}
            className={`inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all ${
              agent.report_visible
                ? "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                : "text-slate-300 hover:bg-slate-100 hover:text-slate-500 dark:hover:bg-slate-800"
            }`}
            title={agent.report_visible ? "Visible in reports" : "Hidden from reports"}
          >
            {togglingVisibility === agent.id ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : agent.report_visible ? (
              <Eye className="w-4 h-4" />
            ) : (
              <EyeOff className="w-4 h-4" />
            )}
          </button>
        </td>

        {/* Status badge */}
        <td className="py-2.5 px-3">
          {agent.active ? (
            !agent.report_visible ? (
              <Badge variant="warning">On Leave</Badge>
            ) : (
              <Badge variant="success">Active</Badge>
            )
          ) : (
            <Badge variant="default" className="bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:border-slate-600">
              Archived
            </Badge>
          )}
        </td>

        {/* Actions */}
        <td className="py-2.5 px-3 text-right">
          {isEditing ? (
            <div className="flex items-center justify-end gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onSaveEdit() }}
                className="text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
              >
                <Check className="w-3.5 h-3.5 mr-1" /> Save
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onCancelEdit() }}
                className="text-slate-500 hover:text-slate-900"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onStartEdit() }}
                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                title="Edit agent"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onToggleArchive() }}
                className={
                  agent.active
                    ? "text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                    : "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                }
                title={agent.active ? "Archive agent" : "Restore agent"}
              >
                {agent.active ? <UserMinus className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              </Button>
            </div>
          )}
        </td>
      </tr>

      {/* ── Expanded Variant Editor ────────────────────────────────────────── */}
      {isExpanded && (
        <tr>
          <td colSpan={9} className="bg-slate-50/80 border-b border-slate-200 dark:bg-slate-800/60 dark:border-slate-700">
            <div className="px-6 py-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    System Name Variants
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Names used across different systems for {agent.name}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={onSaveVariants}
                  disabled={savingVariants}
                  className="bg-blue-600 hover:bg-blue-500 text-white"
                >
                  {savingVariants ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Save Variants
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-3">
                {VARIANT_FIELDS.map((vf) => (
                  <div key={vf.key} className="flex flex-col">
                    <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                      {vf.label}
                    </label>
                    <input
                      type="text"
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 shadow-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition placeholder:text-slate-300 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
                      placeholder={`Enter ${vf.label.toLowerCase()} name`}
                      value={variantDraft[vf.key] || ""}
                      onChange={(e) =>
                        onVariantDraftChange({ ...variantDraft, [vf.key]: e.target.value })
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
