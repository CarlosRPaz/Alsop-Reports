"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import {
  UserPlus, Shield, ShieldCheck, Search, Mail, KeyRound,
  Check, X, AlertCircle, Eye, EyeOff, ChevronDown,
  Loader2, UserX, RefreshCw, ArrowLeft
} from "lucide-react"
import Link from "next/link"
import {
  getUnlinkedAgents,
  getLinkedAgents,
  inviteExistingAgent,
  inviteNewUser,
  resetUserPassword,
  revokeAccess,
  type UnlinkedAgent,
} from "./actions"

export default function UserManagementPage() {
  // Data
  const [unlinkedAgents, setUnlinkedAgents] = useState<UnlinkedAgent[]>([])
  const [linkedAgents, setLinkedAgents] = useState<UnlinkedAgent[]>([])
  const [loading, setLoading] = useState(true)

  // Invite form
  const [mode, setMode] = useState<"existing" | "new">("existing")
  const [selectedAgentId, setSelectedAgentId] = useState("")
  const [newName, setNewName] = useState("")
  const [email, setEmail] = useState("")
  const [tempPassword, setTempPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [inviting, setInviting] = useState(false)

  // Reset password
  const [resetAgentId, setResetAgentId] = useState<string | null>(null)
  const [resetPassword, setResetPassword] = useState("")
  const [resetting, setResetting] = useState(false)

  // Feedback
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null)

  // Search
  const [searchLinked, setSearchLinked] = useState("")

  const fetchData = async () => {
    setLoading(true)
    const [unlinked, linked] = await Promise.all([getUnlinkedAgents(), getLinkedAgents()])
    setUnlinkedAgents(unlinked)
    setLinkedAgents(linked)
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
      setTempPassword("")
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
      setResetPassword("")
    }
    setResetting(false)
  }

  const handleRevoke = async (agentId: string, agentName: string) => {
    if (!confirm(`Remove login access for ${agentName}? They won't be able to sign in anymore.`)) return
    const result = await revokeAccess(agentId)
    setFeedback({ type: result.success ? "success" : "error", message: result.message })
    if (result.success) await fetchData()
  }

  const filteredLinked = linkedAgents.filter(a =>
    a.name.toLowerCase().includes(searchLinked.toLowerCase()) ||
    (a.email || "").toLowerCase().includes(searchLinked.toLowerCase())
  )

  const selectedAgent = unlinkedAgents.find(a => a.id === selectedAgentId)

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin" className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-slate-500" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">User Access Management</h1>
          <p className="text-sm text-slate-500">Invite agents to the dashboard and manage their login credentials.</p>
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
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                mode === "existing"
                  ? "bg-blue-50 text-blue-700 ring-1 ring-blue-600/10"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              Link Existing Agent
            </button>
            <button
              onClick={() => setMode("new")}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                mode === "new"
                  ? "bg-blue-50 text-blue-700 ring-1 ring-blue-600/10"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              New Person
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left: Agent selection or name */}
            {mode === "existing" ? (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
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
                    All agents already have login accounts.
                  </p>
                )}
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Jane Smith"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                />
                <p className="mt-2 text-xs text-slate-500">
                  This creates a new agent record. Use &ldquo;Link Existing Agent&rdquo; for people already in the system.
                </p>
              </div>
            )}

            {/* Right: Email */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@allstate.com"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Temporary Password
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={tempPassword}
                  onChange={(e) => setTempPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full pl-9 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-slate-400">
                Share this with the person so they can log in.
              </p>
            </div>

            {/* Submit */}
            <div className="flex items-end">
              <Button
                onClick={handleInvite}
                disabled={
                  inviting ||
                  !email ||
                  !tempPassword ||
                  (mode === "existing" && !selectedAgentId) ||
                  (mode === "new" && !newName)
                }
                className="w-full"
              >
                {inviting ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Inviting...</>
                ) : (
                  <><UserPlus className="w-4 h-4 mr-2" /> Send Invite</>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active Users */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between w-full">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Active Users ({linkedAgents.length})
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  value={searchLinked}
                  onChange={(e) => setSearchLinked(e.target.value)}
                  placeholder="Search..."
                  className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 w-48"
                />
              </div>
              <button onClick={fetchData} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors" title="Refresh">
                <RefreshCw className={`w-4 h-4 text-slate-400 ${loading ? "animate-spin" : ""}`} />
              </button>
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
                <div key={agent.id} className="flex items-center justify-between py-3 group">
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
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                          onClick={() => { setResetAgentId(null); setResetPassword("") }}
                          className="p-1 rounded text-slate-400 hover:bg-slate-100"
                          title="Cancel"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
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
    </div>
  )
}
