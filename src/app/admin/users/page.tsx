"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import {
  UserPlus, Shield, ShieldCheck, Search, Mail, KeyRound,
  Check, X, AlertCircle, Eye, EyeOff, ChevronDown,
  Loader2, UserX, RefreshCw, ArrowLeft, Layout
} from "lucide-react"
import Link from "next/link"
import {
  getUnlinkedAgents,
  getLinkedAgents,
  inviteExistingAgent,
  inviteNewUser,
  resetUserPassword,
  revokeAccess,
  updateUserRole,
  getPagePermissions,
  updatePagePermission,
  type UnlinkedAgent,
  type PagePermission,
} from "./actions"

export default function UserManagementPage() {
  // Data
  const [unlinkedAgents, setUnlinkedAgents] = useState<UnlinkedAgent[]>([])
  const [linkedAgents, setLinkedAgents] = useState<UnlinkedAgent[]>([])
  const [loading, setLoading] = useState(true)

  const DEFAULT_PASSWORD = "AlsopAdmin2026!"

  // Invite form
  const [mode, setMode] = useState<"existing" | "new">("existing")
  const [selectedAgentId, setSelectedAgentId] = useState("")
  const [newName, setNewName] = useState("")
  const [email, setEmail] = useState("")
  const [tempPassword, setTempPassword] = useState(DEFAULT_PASSWORD)
  const [showPassword, setShowPassword] = useState(true)
  const [inviting, setInviting] = useState(false)

  // Reset password
  const [resetAgentId, setResetAgentId] = useState<string | null>(null)
  const [resetPassword, setResetPassword] = useState(DEFAULT_PASSWORD)
  const [resetting, setResetting] = useState(false)

  // Feedback
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null)

  // Search
  const [searchLinked, setSearchLinked] = useState("")

  // Page access permissions
  const [pagePerms, setPagePerms] = useState<PagePermission[]>([])
  const [permSaving, setPermSaving] = useState<string | null>(null)

  const resetToDefaultPassword = () => {
    setTempPassword(DEFAULT_PASSWORD)
  }

  const fetchData = async () => {
    setLoading(true)
    const [unlinked, linked, perms] = await Promise.all([
      getUnlinkedAgents(),
      getLinkedAgents(),
      getPagePermissions(),
    ])
    setUnlinkedAgents(unlinked)
    setLinkedAgents(linked)
    setPagePerms(perms)
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const handleInvite = async () => {
    setFeedback(null)
    setInviting(true)

    let result
    if (mode === "existing") {
      result = await inviteExistingAgent(selectedAgentId, email, tempPassword)
    } else {
      result = await inviteNewUser(newName, email, tempPassword)
    }

    setFeedback({ type: result.success ? "success" : "error", message: result.message })

    if (result.success) {
      setSelectedAgentId("")
      setNewName("")
      setEmail("")
      setTempPassword(DEFAULT_PASSWORD)
      await fetchData()
    }
    setInviting(false)
  }

  const handleResetPassword = async () => {
    if (!resetAgentId || !resetPassword) return
    setResetting(true)
    const result = await resetUserPassword(resetAgentId, resetPassword)
    setFeedback({ type: result.success ? "success" : "error", message: result.message })
    if (result.success) {
      setResetAgentId(null)
      setResetPassword(DEFAULT_PASSWORD)
    }
    setResetting(false)
  }

  const handleRevoke = async (agentId: string, agentName: string) => {
    if (!confirm(`Remove login access for ${agentName}? They won't be able to sign in anymore.`)) return
    const result = await revokeAccess(agentId)
    setFeedback({ type: result.success ? "success" : "error", message: result.message })
    if (result.success) await fetchData()
  }

  const handleToggleRole = async (agentId: string, currentRole: string | null, name: string) => {
    const newRole = currentRole === "admin" ? "agent" : "admin"
    if (!confirm(`Are you sure you want to change ${name}'s role to ${newRole}?`)) return
    setLoading(true)
    const result = await updateUserRole(agentId, newRole)
    setFeedback({ type: result.success ? "success" : "error", message: result.message })
    if (result.success) await fetchData()
    setLoading(false)
  }

  const filteredLinked = linkedAgents.filter(a =>
    a.name.toLowerCase().includes(searchLinked.toLowerCase()) ||
    (a.email || "").toLowerCase().includes(searchLinked.toLowerCase())
  )

  const selectedAgent = unlinkedAgents.find(a => a.id === selectedAgentId)

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin" className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-slate-500" />
        </Link>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">User Access Management</h1>
          <p className="text-xs sm:text-sm text-slate-500">Invite agents to the dashboard and manage their login credentials.</p>
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={`flex items-start gap-2 text-sm rounded-lg px-4 py-3 border ${
          feedback.type === "success"
            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
            : "bg-red-50 text-red-700 border-red-200"
        }`}>
          {feedback.type === "success" ? <Check className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
          <span>{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Invite Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="w-4 h-4 text-blue-600" />
            Invite User
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Mode toggle */}
          <div className="flex gap-2 mb-5">
            <button
              onClick={() => setMode("existing")}
              className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-all ${
                mode === "existing"
                  ? "bg-blue-50 text-blue-700 ring-1 ring-blue-600/10"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              Link Existing Agent
            </button>
            <button
              onClick={() => setMode("new")}
              className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-all ${
                mode === "new"
                  ? "bg-blue-50 text-blue-700 ring-1 ring-blue-600/10"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              New Person
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Left: Agent selection or name */}
            {mode === "existing" ? (
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1.5">
                  Select Agent
                </label>
                <div className="relative">
                  <select
                    value={selectedAgentId}
                    onChange={(e) => setSelectedAgentId(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 appearance-none cursor-pointer"
                  >
                    <option value="">Choose an agent...</option>
                    {unlinkedAgents.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name} — {a.team || "No team"} · {a.office || "No office"}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
                {selectedAgent && (
                  <p className="mt-2 text-xs text-slate-500">
                    {selectedAgent.name} will be linked to this email for login.
                  </p>
                )}
                {unlinkedAgents.length === 0 && !loading && (
                  <p className="mt-2 text-xs text-amber-600">
                    All agents already have login credentials linked.
                  </p>
                )}
              </div>
            ) : (
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. John Smith"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                />
              </div>
            )}

            {/* Right: Email and Temp Password */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="agent@allstate.com"
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs sm:text-sm font-medium text-slate-700">
                    Temporary Password
                  </label>
                  {tempPassword !== DEFAULT_PASSWORD && (
                    <button
                      type="button"
                      onClick={resetToDefaultPassword}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Reset to Default
                    </button>
                  )}
                </div>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={tempPassword}
                    onChange={(e) => setTempPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    className="w-full pl-9 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button
              onClick={handleInvite}
              disabled={inviting || !email || !tempPassword || (mode === "existing" && !selectedAgentId) || (mode === "new" && !newName)}
              className="bg-blue-600 hover:bg-blue-500 text-white w-full sm:w-auto"
            >
              {inviting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating Account...</>
              ) : (
                <><UserPlus className="w-4 h-4 mr-2" /> Send Invitation</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Active Users */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Active Users ({linkedAgents.length})
            </CardTitle>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchLinked}
                onChange={(e) => setSearchLinked(e.target.value)}
                placeholder="Search users..."
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-sm text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading users...
            </div>
          ) : filteredLinked.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">
              {searchLinked ? "No users match your search." : "No users have been invited yet."}
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredLinked.map(agent => (
                <div key={agent.id} className="flex flex-col sm:flex-row sm:items-center justify-between py-3 gap-2 group">
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                      {agent.name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800">{agent.name}</span>
                        {agent.role === "admin" && (
                          <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 border-amber-200">
                            Admin
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        {agent.email} · {agent.team || "No team"} · {agent.office || "No office"}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity self-end sm:self-center">
                    {resetAgentId === agent.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={resetPassword}
                          onChange={(e) => setResetPassword(e.target.value)}
                          placeholder="New password"
                          className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-md w-32 focus:outline-none focus:ring-1 focus:ring-blue-300"
                          autoFocus
                        />
                        <button
                          onClick={handleResetPassword}
                          disabled={resetting || !resetPassword}
                          className="p-1 rounded text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                          title="Confirm reset"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => { setResetAgentId(null); setResetPassword(DEFAULT_PASSWORD) }}
                          className="p-1 rounded text-slate-400 hover:bg-slate-100"
                          title="Cancel"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => handleToggleRole(agent.id, agent.role, agent.name)}
                          className={`px-2 py-1 text-xs rounded-md transition-colors ${
                            agent.role === "admin"
                              ? "text-amber-600 hover:bg-amber-50"
                              : "text-slate-500 hover:bg-slate-100"
                          }`}
                          title={agent.role === "admin" ? "Demote to Agent" : "Promote to Admin"}
                        >
                          <Shield className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setResetAgentId(agent.id)}
                          className="px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 rounded-md transition-colors"
                          title="Reset password"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleRevoke(agent.id, agent.name)}
                          className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded-md transition-colors"
                          title="Revoke access"
                        >
                          <UserX className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending (unlinked) Agents */}
      {unlinkedAgents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="w-4 h-4 text-slate-400" />
              Agents Without Login ({unlinkedAgents.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500 mb-3">
              These agents are in the system but don&apos;t have login credentials yet. Use &ldquo;Invite User&rdquo; above to give them access.
            </p>
            <div className="flex flex-wrap gap-2">
              {unlinkedAgents.map(a => (
                <span
                  key={a.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-full text-xs text-slate-600"
                >
                  {a.name}
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-400">{a.team || "—"}</span>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Page Access by Team */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Layout className="w-4 h-4 text-indigo-600" />
            Page Access by Team
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-slate-500 mb-4">
            Control which teams can see each page. Admins and Managers always have full access regardless of these settings.
          </p>

          {pagePerms.length === 0 ? (
            <div className="flex items-center justify-center py-8 gap-2 text-sm text-slate-400">
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Loading permissions...</>
              ) : (
                <p className="text-center">
                  <AlertCircle className="w-4 h-4 inline mr-1.5 text-amber-500" />
                  Page permissions table not found. Run the migration in{" "}
                  <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">supabase/migrations/00015_page_permissions.sql</code>
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 pr-4 font-medium text-slate-600 text-xs uppercase tracking-wider">Page</th>
                    {["Sales", "CSR", "EA"].map(team => (
                      <th key={team} className="text-center py-2 px-3 font-medium text-slate-600 text-xs uppercase tracking-wider">
                        {team}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagePerms.map(perm => (
                    <tr key={perm.page_key} className="group hover:bg-slate-50/50 transition-colors">
                      <td className="py-2.5 pr-4 text-sm font-medium text-slate-700">
                        {perm.page_label}
                      </td>
                      {["Sales", "CSR", "EA"].map(team => {
                        const isAllowed = perm.allowed_teams.includes(team)
                        const isSaving = permSaving === `${perm.page_key}-${team}`
                        return (
                          <td key={team} className="text-center py-2.5 px-3">
                            <button
                              disabled={isSaving}
                              onClick={async () => {
                                const key = `${perm.page_key}-${team}`
                                setPermSaving(key)
                                const newTeams = isAllowed
                                  ? perm.allowed_teams.filter(t => t !== team)
                                  : [...perm.allowed_teams, team]
                                const result = await updatePagePermission(perm.page_key, newTeams)
                                if (result.success) {
                                  setPagePerms(prev =>
                                    prev.map(p =>
                                      p.page_key === perm.page_key
                                        ? { ...p, allowed_teams: newTeams }
                                        : p
                                    )
                                  )
                                } else {
                                  setFeedback({ type: "error", message: result.message })
                                }
                                setPermSaving(null)
                              }}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:ring-offset-1 ${
                                isSaving ? "opacity-50 cursor-wait" : "cursor-pointer"
                              } ${
                                isAllowed ? "bg-blue-600" : "bg-slate-200"
                              }`}
                              title={isAllowed ? `Revoke ${team} access to ${perm.page_label}` : `Grant ${team} access to ${perm.page_label}`}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                                  isAllowed ? "translate-x-6" : "translate-x-1"
                                }`}
                              />
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
