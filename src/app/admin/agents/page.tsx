"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { supabase } from "@/lib/supabaseClient"
import { syncAgentChannels } from "@/app/admin/users/actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import {
  Plus, Edit2, Check, X,
  Search, ChevronDown, ChevronRight,
  Users, Save, Loader2, UserPlus,
  Shield, ShieldCheck, Info,
  BookOpen, Sparkles
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
  speaks_spanish: boolean
  created_at: string
  updated_at: string
}

interface ChatPermission {
  id: string
  permission_key: string
  description: string | null
  allowed_roles: string[]
  allowed_teams: string[]
  updated_at?: string
}

type AgentStatus = "active" | "on_leave" | "archived"
type StatusFilter = "all" | "active" | "on_leave" | "archived"

// ─── Constants ──────────────────────────────────────────────────────────────────

const MEETING_TIMES = ["8:50 AM", "9:00 AM", "9:10 AM", "9:20 AM", "9:30 AM", "9:40 AM", "9:50 AM"]
const OFFICES = ["MCM", "MB", "RC", "CH"]
const TEAMS = ["Sales", "CSR", "EA", "Managers", "Support"]
const ALL_PERMISSION_TEAMS = ["Sales", "CSR", "EA", "Managers", "Support"]

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
  status: "active" as AgentStatus,
  system_variants: {} as SystemVariants,
}

function getAgentStatus(agent: Pick<Agent, "active" | "report_visible">): AgentStatus {
  if (!agent.active) return "archived"
  if (!agent.report_visible) return "on_leave"
  return "active"
}

// ─── Component ──────────────────────────────────────────────────────────────────

export default function AgentManagement() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [permissions, setPermissions] = useState<ChatPermission[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingPermissions, setLoadingPermissions] = useState(false)
  const [savingPermKey, setSavingPermKey] = useState<string | null>(null)

  // UI state
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [teamFilter, setTeamFilter] = useState<string>("all")
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

  // ── Data Fetching ───────────────────────────────────────────────────────────

  const fetchAgents = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from("agents").select("*").order("name")
    const agentsList = ((data as Agent[]) || []).map(a => ({
      ...a,
      report_visible: a.report_visible ?? true,
    }))
    setAgents(agentsList)
    setLoading(false)
  }, [])

  const fetchPermissions = useCallback(async () => {
    setLoadingPermissions(true)
    try {
      const { data } = await supabase
        .from("chat_permissions")
        .select("*")
        .order("permission_key", { ascending: true })
      if (data) setPermissions(data as ChatPermission[])
    } catch (err) {
      console.error("Failed to load permissions:", err)
    } finally {
      setLoadingPermissions(false)
    }
  }, [])

  useEffect(() => {
    fetchAgents()
    fetchPermissions()
  }, [fetchAgents, fetchPermissions])

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

    // Team filter
    if (teamFilter !== "all") {
      result = result.filter((a) => a.team === teamFilter)
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((a) => a.name.toLowerCase().includes(q))
    }

    return result
  }, [agents, statusFilter, teamFilter, searchQuery])

  // ── Counts for filter tabs ──────────────────────────────────────────────────

  const counts = useMemo(() => ({
    all:      agents.length,
    active:   agents.filter((a) => a.active && a.report_visible).length,
    on_leave: agents.filter((a) => a.active && !a.report_visible).length,
    archived: agents.filter((a) => !a.active).length,
  }), [agents])

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
      report_visible: agent.report_visible,
      meeting_time: agent.meeting_time,
      speaks_spanish: agent.speaks_spanish,
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
          report_visible: editForm.report_visible,
          meeting_time: editForm.meeting_time || null,
          speaks_spanish: editForm.speaks_spanish ?? false,
        })
        .eq("id", editingId)

      // Sync channel memberships for new team/office
      syncAgentChannels(editingId).catch(console.error)

      // Optimistic update
      setAgents((prev) =>
        prev.map((a) => (a.id === editingId ? { ...a, ...editForm } : a))
      )
      setEditingId(null)
      setEditForm({})
    } catch (e) {
      console.error("Failed to save agent edit:", e)
    }
  }

  const handleStatusChange = async (agentId: string, newStatus: AgentStatus) => {
    let newActive = true
    let newReportVisible = true
    if (newStatus === "on_leave") {
      newActive = true
      newReportVisible = false
    } else if (newStatus === "archived") {
      newActive = false
      newReportVisible = false
    }

    try {
      await supabase
        .from("agents")
        .update({ active: newActive, report_visible: newReportVisible })
        .eq("id", agentId)

      setAgents((prev) =>
        prev.map((a) =>
          a.id === agentId
            ? { ...a, active: newActive, report_visible: newReportVisible }
            : a
        )
      )
    } catch (e) {
      console.error("Failed to update status:", e)
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
      console.error("Failed to save variants:", e)
    } finally {
      setSavingVariants(false)
    }
  }

  const createAgent = async () => {
    if (!newAgent.name.trim()) return
    setSavingNew(true)
    try {
      const active = newAgent.status !== "archived"
      const reportVisible = newAgent.status === "active"

      const payload: Record<string, unknown> = {
        name: newAgent.name.trim(),
        office: newAgent.office || null,
        team: newAgent.team || null,
        meeting_time: newAgent.meeting_time || null,
        active,
        report_visible: reportVisible,
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
      console.error("Failed to create agent:", e)
    } finally {
      setSavingNew(false)
    }
  }

  // ── Permission Toggles ──────────────────────────────────────────────────────

  const togglePermissionRole = async (perm: ChatPermission, role: "admin" | "agent") => {
    setSavingPermKey(perm.permission_key)
    const current = perm.allowed_roles || []
    const updated = current.includes(role)
      ? current.filter((r) => r !== role)
      : [...current, role]

    try {
      await supabase
        .from("chat_permissions")
        .update({ allowed_roles: updated, updated_at: new Date().toISOString() })
        .eq("id", perm.id)

      setPermissions((prev) =>
        prev.map((p) => (p.id === perm.id ? { ...p, allowed_roles: updated } : p))
      )
    } catch (err) {
      console.error("Failed to update role permission:", err)
    } finally {
      setSavingPermKey(null)
    }
  }

  const togglePermissionTeam = async (perm: ChatPermission, team: string) => {
    setSavingPermKey(perm.permission_key)
    const current = perm.allowed_teams || []
    const updated = current.includes(team)
      ? current.filter((t) => t !== team)
      : [...current, team]

    try {
      await supabase
        .from("chat_permissions")
        .update({ allowed_teams: updated, updated_at: new Date().toISOString() })
        .eq("id", perm.id)

      setPermissions((prev) =>
        prev.map((p) => (p.id === perm.id ? { ...p, allowed_teams: updated } : p))
      )
    } catch (err) {
      console.error("Failed to update team permission:", err)
    } finally {
      setSavingPermKey(null)
    }
  }

  // ── Row styling helpers ─────────────────────────────────────────────────────

  const getRowClasses = (agent: Agent): string => {
    if (!agent.active) return "bg-slate-50/60 text-slate-400 dark:bg-slate-800/40 dark:text-slate-500"
    if (!agent.report_visible) return "bg-white text-slate-500 dark:bg-slate-900 dark:text-slate-400"
    return "bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100"
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100">
              Agent & Permissions Management
            </h1>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
              Admin Control
            </Badge>
          </div>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">
            Manage agent statuses, team assignments, system name variants, and chat permissions.
          </p>
        </div>
        <Button
          className="bg-blue-600 hover:bg-blue-500 text-white shrink-0 shadow-xs"
          onClick={() => setShowNewAgent(true)}
        >
          <Plus className="w-4 h-4 mr-2" /> New Agent
        </Button>
      </header>

      {/* ── New Agent Form (inline card) ─────────────────────────────────── */}
      {showNewAgent && (
        <Card className="border-blue-200 shadow-md">
          <CardHeader className="pb-4 border-b border-slate-100 dark:border-slate-800">
            <CardTitle className="flex items-center gap-2 text-blue-700">
              <UserPlus className="w-5 h-5" />
              Create New Agent
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 shadow-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
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
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 shadow-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
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
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 shadow-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  value={newAgent.team}
                  onChange={(e) => setNewAgent({ ...newAgent, team: e.target.value })}
                >
                  <option value="">Select team</option>
                  {TEAMS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              {/* Status */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">
                  Status
                </label>
                <select
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 shadow-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  value={newAgent.status}
                  onChange={(e) => setNewAgent({ ...newAgent, status: e.target.value as AgentStatus })}
                >
                  <option value="active">Active</option>
                  <option value="on_leave">On Leave</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              {/* Meeting Time */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">
                  Meeting Time
                </label>
                <select
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 shadow-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
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

            {/* Optional variant fields */}
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
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-900 shadow-xs focus:ring-2 focus:ring-blue-400 outline-none transition"
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

      {/* ── Search & Filter Controls ─────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        {/* Search & Team Filter */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search agents..."
              className="w-full bg-white border border-slate-200 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 shadow-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 shadow-xs outline-none cursor-pointer"
          >
            <option value="all">All Teams</option>
            {TEAMS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 w-full md:w-auto overflow-x-auto">
          {([
            { key: "all",      label: "All" },
            { key: "active",   label: "Active" },
            { key: "on_leave", label: "On Leave" },
            { key: "archived", label: "Archived" },
          ] as { key: StatusFilter; label: string }[]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
                statusFilter === tab.key
                  ? "bg-white text-slate-900 dark:bg-slate-700 dark:text-slate-100 shadow-xs"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
              }`}
            >
              {tab.label}
              <span className="ml-1.5 text-[10px] text-slate-400 font-mono">({counts[tab.key]})</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Agent Table Card ─────────────────────────────────────────────── */}
      <Card className="shadow-xs">
        <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base font-bold text-slate-800 dark:text-slate-100">
              <Users className="w-5 h-5 text-blue-600" />
              Agency Agent Roster
            </CardTitle>
            <span className="text-xs text-slate-400">
              Showing {filteredAgents.length} of {agents.length} agent{agents.length !== 1 && "s"}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center p-12">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 dark:border-blue-400" />
            </div>
          ) : filteredAgents.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No agents match current filters</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                    <th className="py-3 px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 w-8" />
                    <th className="py-3 px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">Name</th>
                    <th className="py-3 px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">Office</th>
                    <th className="py-3 px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">Team</th>
                    <th className="py-3 px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">Meeting</th>
                    <th className="py-3 px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 text-center">🇲🇽</th>
                    <th className="py-3 px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 text-center">Variants</th>
                    <th className="py-3 px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">Status</th>
                    <th className="py-3 px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {filteredAgents.map((agent) => {
                    const isEditing = editingId === agent.id
                    const isExpanded = expandedId === agent.id
                    const currentStatus = getAgentStatus(agent)
                    const vCount = agent.system_variants
                      ? Object.values(agent.system_variants).filter((v) => v && String(v).trim() !== "").length
                      : 0

                    return (
                      <AgentRow
                        key={agent.id}
                        agent={agent}
                        currentStatus={currentStatus}
                        isEditing={isEditing}
                        isExpanded={isExpanded}
                        vCount={vCount}
                        editForm={editForm}
                        variantDraft={variantDraft}
                        savingVariants={savingVariants}
                        rowClasses={getRowClasses(agent)}
                        onToggleExpand={() => toggleExpand(agent)}
                        onStartEdit={() => startEdit(agent)}
                        onCancelEdit={cancelEdit}
                        onSaveEdit={saveEdit}
                        onStatusChange={(status) => handleStatusChange(agent.id, status)}
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

      {/* ── Permissions Management Section ──────────────────────────────── */}
      <Card className="shadow-xs border-indigo-100 dark:border-slate-800">
        <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800 bg-indigo-50/40 dark:bg-slate-800/40">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-bold text-indigo-950 dark:text-indigo-200">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                Communication & Feature Permissions
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure which roles and teams have access to sensitive actions in Communication Hub.
              </p>
            </div>
            <Badge variant="outline" className="bg-white dark:bg-slate-900 text-indigo-700 border-indigo-200 text-xs w-fit">
              Live Realtime Access
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loadingPermissions ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                    <th className="py-3 px-4 text-[11px] uppercase tracking-wider font-bold text-slate-500">Permission Action</th>
                    <th className="py-3 px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 text-center">Admin</th>
                    <th className="py-3 px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 text-center">Agent</th>
                    <th className="py-3 px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 text-center">Sales</th>
                    <th className="py-3 px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 text-center">CSR</th>
                    <th className="py-3 px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 text-center">EA</th>
                    <th className="py-3 px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 text-center">Managers</th>
                    <th className="py-3 px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 text-center">Support</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700 text-sm">
                  {permissions.map((perm) => {
                    const isSaving = savingPermKey === perm.permission_key
                    const hasAdmin = perm.allowed_roles?.includes("admin")
                    const hasAgent = perm.allowed_roles?.includes("agent")

                    return (
                      <tr key={perm.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">
                            {perm.description || perm.permission_key}
                          </div>
                          <div className="font-mono text-[10px] text-slate-400">
                            {perm.permission_key}
                          </div>
                        </td>

                        {/* Admin Role Toggle */}
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={hasAdmin}
                            disabled={isSaving}
                            onChange={() => togglePermissionRole(perm, "admin")}
                            className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                          />
                        </td>

                        {/* Agent Role Toggle */}
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={hasAgent}
                            disabled={isSaving}
                            onChange={() => togglePermissionRole(perm, "agent")}
                            className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                          />
                        </td>

                        {/* Teams Toggles */}
                        {ALL_PERMISSION_TEAMS.map((teamName) => {
                          const hasTeam = perm.allowed_teams?.includes(teamName)
                          return (
                            <td key={teamName} className="py-3 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={hasTeam}
                                disabled={isSaving}
                                onChange={() => togglePermissionTeam(perm, teamName)}
                                className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                              />
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── System Rules & Team Reference Matrix ─────────────────────────── */}
      <Card className="shadow-xs border-slate-200 dark:border-slate-800 bg-slate-900 text-slate-100">
        <CardHeader className="pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-amber-400" />
            <CardTitle className="text-base font-bold text-white">
              System Rules & Roles Reference Matrix
            </CardTitle>
          </div>
          <p className="text-xs text-slate-400">
            Authoritative reference guide for Team boundaries, Status lifecycles, and Data reporting rules.
          </p>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 space-y-6">
          {/* Status Rules */}
          <div>
            <h3 className="text-sm font-bold text-amber-300 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> Agent Status Rules & Data Retention
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="bg-slate-800/80 p-3.5 rounded-xl border border-emerald-500/30">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  <span className="font-bold text-emerald-300 text-sm">Active</span>
                </div>
                <p className="text-slate-300 mb-2 leading-relaxed">
                  Currently active working employee.
                </p>
                <ul className="space-y-1 text-slate-400">
                  <li>• Visible in all Daily Standup & MTD report tables.</li>
                  <li>• Counts in Agency-wide totals (Calls, Quotes, Items, Premium).</li>
                  <li>• Full Communication Hub presence & channel participation.</li>
                </ul>
              </div>

              <div className="bg-slate-800/80 p-3.5 rounded-xl border border-amber-500/30">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <span className="font-bold text-amber-300 text-sm">On Leave</span>
                </div>
                <p className="text-slate-300 mb-2 leading-relaxed">
                  Temporarily on leave (maternity, medical, sabbatical).
                </p>
                <ul className="space-y-1 text-slate-400">
                  <li>• <strong>Hidden</strong> from individual Daily, MTD, and Quotes tables.</li>
                  <li>• <strong>ALL historical data counts in Agency Totals</strong>.</li>
                  <li>• Hidden from chat member pickers and mention dropdowns.</li>
                </ul>
              </div>

              <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-600/50">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                  <span className="font-bold text-slate-300 text-sm">Archived</span>
                </div>
                <p className="text-slate-300 mb-2 leading-relaxed">
                  Former employee who has left the agency.
                </p>
                <ul className="space-y-1 text-slate-400">
                  <li>• <strong>Hidden across the entire site</strong> (tables, portal, pickers).</li>
                  <li>• <strong>ALL historical metrics stay counted in Agency Totals</strong>.</li>
                  <li>• Preserves past scorecard accuracy and YTD agency numbers.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Team Scope Matrix */}
          <div className="border-t border-slate-800 pt-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3">
              <h3 className="text-sm font-bold text-blue-300 uppercase tracking-wider flex items-center gap-2">
                <Shield className="w-4 h-4" /> Team Scopes & Department Boundaries
              </h3>
              <span className="text-[11px] text-amber-300 font-medium">
                ⚡ Teams are the only factor that controls report visibility
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2 pr-3 font-semibold">Team</th>
                    <th className="py-2 px-3 font-semibold">Report Tables</th>
                    <th className="py-2 px-3 font-semibold">Agency Totals</th>
                    <th className="py-2 px-3 font-semibold">Rebel Rewards</th>
                    <th className="py-2 px-3 font-semibold">Chat Channel Access</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  <tr>
                    <td className="py-2.5 pr-3 font-bold text-white">Sales</td>
                    <td className="py-2.5 px-3 text-emerald-400">Visible</td>
                    <td className="py-2.5 px-3 text-emerald-400">Included</td>
                    <td className="py-2.5 px-3 text-emerald-400">Participating</td>
                    <td className="py-2.5 px-3 text-slate-400">#Sales, #All, Office Channel</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-3 font-bold text-white">CSR</td>
                    <td className="py-2.5 px-3 text-emerald-400">Visible</td>
                    <td className="py-2.5 px-3 text-emerald-400">Included</td>
                    <td className="py-2.5 px-3 text-emerald-400">Participating</td>
                    <td className="py-2.5 px-3 text-slate-400">#CSR, #All, Office Channel</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-3 font-bold text-white">EA</td>
                    <td className="py-2.5 px-3 text-emerald-400">Visible</td>
                    <td className="py-2.5 px-3 text-emerald-400">Included</td>
                    <td className="py-2.5 px-3 text-emerald-400">Participating</td>
                    <td className="py-2.5 px-3 text-slate-400">#EA, #All, Office Channel</td>
                  </tr>
                  <tr className="bg-blue-950/30">
                    <td className="py-2.5 pr-3 font-bold text-blue-300">Managers</td>
                    <td className="py-2.5 px-3 text-amber-400">Hidden from table</td>
                    <td className="py-2.5 px-3 text-emerald-400">Included</td>
                    <td className="py-2.5 px-3 text-emerald-400"><strong>Participating (Ranked)</strong></td>
                    <td className="py-2.5 px-3 text-blue-300"><strong>All Channels (#Sales, #CSR, #EA, #Managers, all Offices)</strong></td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-3 font-bold text-white">Support</td>
                    <td className="py-2.5 px-3 text-slate-500">Hidden</td>
                    <td className="py-2.5 px-3 text-rose-400"><strong>Excluded</strong></td>
                    <td className="py-2.5 px-3 text-slate-500">Excluded</td>
                    <td className="py-2.5 px-3 text-slate-400">All Channels except #Managers (Managers Only)</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Note on Admin Role */}
            <div className="mt-4 p-3 bg-slate-800/60 rounded-lg border border-slate-700/60 text-[11px] text-slate-300 space-y-1">
              <div className="font-bold text-indigo-300 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" /> Note on Admin Role vs. Teams:
              </div>
              <p className="text-slate-400 leading-relaxed">
                The <strong>Admin role</strong> grants permissions to manage agents, edit settings, and moderate chats. <strong>Role does not affect report visibility</strong> — visibility is determined strictly by Team and Status. Furthermore, the <strong>#Managers channel is strictly exclusive to the Managers team</strong> (users outside the Managers team, regardless of Admin role or Support team, do not have access).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Agent Row Sub-Component ──────────────────────────────────────────────────

interface AgentRowProps {
  agent: Agent
  currentStatus: AgentStatus
  isEditing: boolean
  isExpanded: boolean
  vCount: number
  editForm: Partial<Agent>
  variantDraft: SystemVariants
  savingVariants: boolean
  rowClasses: string
  onToggleExpand: () => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  onStatusChange: (status: AgentStatus) => void
  onEditFormChange: (form: Partial<Agent>) => void
  onVariantDraftChange: (draft: SystemVariants) => void
  onSaveVariants: () => void
}

function AgentRow({
  agent, currentStatus, isEditing, isExpanded, vCount, editForm,
  variantDraft, savingVariants, rowClasses,
  onToggleExpand, onStartEdit, onCancelEdit, onSaveEdit,
  onStatusChange, onEditFormChange, onVariantDraftChange, onSaveVariants,
}: AgentRowProps) {
  const inputClasses = "w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm text-slate-900 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 shadow-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
  const selectClasses = inputClasses

  return (
    <>
      {/* ── Main Row ──────────────────────────────────────────────────────── */}
      <tr
        className={`${rowClasses} hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer group`}
        onClick={(e) => {
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
            <span className={`font-semibold ${agent.active ? "" : "line-through decoration-slate-300 text-slate-400"}`}>
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
              className={
                agent.team === "Managers"
                  ? "bg-blue-50 text-blue-700 border-blue-200 font-semibold"
                  : !agent.active
                  ? "bg-slate-100 text-slate-400 border-none"
                  : ""
              }
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

        {/* Spanish */}
        <td className="py-2.5 px-3 text-center">
          {isEditing ? (
            <label className="flex items-center justify-center cursor-pointer" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={editForm.speaks_spanish ?? false}
                onChange={(e) => onEditFormChange({ ...editForm, speaks_spanish: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
            </label>
          ) : (
            agent.speaks_spanish ? <span title="Speaks Spanish">🇲🇽</span> : <span className="text-slate-300">—</span>
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

        {/* 3-State Status Selector */}
        <td className="py-2.5 px-3">
          <select
            value={currentStatus}
            onChange={(e) => onStatusChange(e.target.value as AgentStatus)}
            onClick={(e) => e.stopPropagation()}
            className={`text-xs font-semibold rounded-md px-2 py-1 border transition-all cursor-pointer outline-none ${
              currentStatus === "active"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                : currentStatus === "on_leave"
                ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"
            }`}
          >
            <option value="active">Active</option>
            <option value="on_leave">On Leave</option>
            <option value="archived">Archived</option>
          </select>
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
            </div>
          )}
        </td>
      </tr>

      {/* ── Expanded Variant Editor ────────────────────────────────────────── */}
      {isExpanded && (
        <tr>
          <td colSpan={8} className="bg-slate-50/80 border-b border-slate-200 dark:bg-slate-800/60 dark:border-slate-700">
            <div className="px-6 py-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    System Name Variants
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Names used across different external sync sources for {agent.name}
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
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 shadow-xs focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition placeholder:text-slate-300 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
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
