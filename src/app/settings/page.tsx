"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { createSupabaseBrowserClient } from "@/lib/supabaseBrowser"
import {
  User, Bell, Shield, KeyRound, Loader2, Check, AlertCircle, X,
  Mail, Building, Users, ShieldCheck, UserCog, Moon,
  Monitor, MessageSquare, ShieldAlert, Send
} from "lucide-react"
import { sendDesktopNotification, requestDesktopPermission } from "@/lib/chat/notifications"
import { useToast } from "@/components/ui/Toast"

interface Agent {
  id: string
  name: string
  team: string
  office: string
  role: string
  email: string
  status_message: string | null
  avatar_url: string | null
}

interface Preferences {
  desktop_enabled: boolean
  toast_enabled: boolean
  notify_on_dm: boolean
  notify_on_mentions: boolean
  notify_on_team_mentions: boolean
  notify_on_urgent: boolean
  quiet_hours_start: string | null
  quiet_hours_end: string | null
}

export default function PersonalSettingsPage() {
  const supabase = createSupabaseBrowserClient()
  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [updatingPassword, setUpdatingPassword] = useState(false)
  const { addToast } = useToast()

  // Profile fields
  const [agent, setAgent] = useState<Agent | null>(null)
  const [statusMessage, setStatusMessage] = useState("")

  // Preferences fields
  const [prefs, setPrefs] = useState<Preferences>({
    desktop_enabled: true,
    toast_enabled: true,
    notify_on_dm: true,
    notify_on_mentions: true,
    notify_on_team_mentions: true,
    notify_on_urgent: true,
    quiet_hours_start: "",
    quiet_hours_end: "",
  })

  // Password fields
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  // Display & theme preferences
  const [theme, setTheme] = useState("light")
  const [savingTheme, setSavingTheme] = useState(false)

  // Feedback states
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null)

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        // 1. Fetch agent record
        const { data: agentData, error: agentErr } = await supabase
          .from('agents')
          .select('*')
          .eq('auth_user_id', user.id)
          .single()

        if (agentErr || !agentData) {
          throw new Error("Could not find agent profile in the database")
        }

        const enrichedAgent: Agent = {
          ...agentData,
          email: user.email || "",
        }
        setAgent(enrichedAgent)
        setStatusMessage(agentData.status_message || "")

        if (agentData && agentData.system_variants) {
          const displayPrefs = (agentData.system_variants as Record<string, any>).display_prefs || {}
          setTheme(displayPrefs.theme || localStorage.getItem("dsr_theme") || "light")
        }

        // 2. Fetch preferences
        const { data: prefData } = await supabase
          .from('chat_notification_preferences')
          .select('*')
          .eq('agent_id', agentData.id)
          .single()

        if (prefData) {
          setPrefs({
            desktop_enabled: prefData.desktop_enabled ?? true,
            toast_enabled: prefData.toast_enabled ?? true,
            notify_on_dm: prefData.notify_on_dm ?? true,
            notify_on_mentions: prefData.notify_on_mentions ?? true,
            notify_on_team_mentions: prefData.notify_on_team_mentions ?? true,
            notify_on_urgent: prefData.notify_on_urgent ?? true,
            quiet_hours_start: prefData.quiet_hours_start || "",
            quiet_hours_end: prefData.quiet_hours_end || "",
          })
        }
      } catch (err: any) {
        console.error(err)
        setFeedback({ type: "error", message: "Failed to load settings data. Please refresh." })
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const handleDesktopToggle = async (checked: boolean) => {
    if (checked && typeof window !== "undefined" && "Notification" in window) {
      const permission = await Notification.requestPermission()
      if (permission !== "granted") {
        setFeedback({ type: "error", message: "Desktop notification permission was denied by your browser." })
        setPrefs(prev => ({ ...prev, desktop_enabled: false }))
        return
      }
    }
    setPrefs(prev => ({ ...prev, desktop_enabled: checked }))
  }

  const handleSaveProfile = async () => {
    if (!agent) return
    setFeedback(null)
    setSavingProfile(true)

    try {
      const { error } = await supabase
        .from('agents')
        .update({
          status_message: statusMessage.trim() || null
        })
        .eq('id', agent.id)

      if (error) throw error

      setAgent(prev => prev ? { ...prev, status_message: statusMessage.trim() || null } : null)
      setFeedback({ type: "success", message: "Status message updated successfully." })
    } catch (err: any) {
      console.error(err)
      setFeedback({ type: "error", message: err.message || "Failed to update profile." })
    } finally {
      setSavingProfile(false)
    }
  }

  const handleSavePrefs = async () => {
    if (!agent) return
    setFeedback(null)
    setSavingPrefs(true)

    try {
      const { error } = await supabase
        .from('chat_notification_preferences')
        .upsert({
          agent_id: agent.id,
          desktop_enabled: prefs.desktop_enabled,
          toast_enabled: prefs.toast_enabled,
          notify_on_dm: prefs.notify_on_dm,
          notify_on_mentions: prefs.notify_on_mentions,
          notify_on_team_mentions: prefs.notify_on_team_mentions,
          notify_on_urgent: prefs.notify_on_urgent,
          quiet_hours_start: prefs.quiet_hours_start || null,
          quiet_hours_end: prefs.quiet_hours_end || null,
          updated_at: new Date().toISOString()
        }, { onConflict: 'agent_id' })

      if (error) throw error

      setFeedback({ type: "success", message: "Chat and notification preferences saved." })
    } catch (err: any) {
      console.error(err)
      setFeedback({ type: "error", message: err.message || "Failed to save preferences." })
    } finally {
      setSavingPrefs(false)
    }
  }

  const handleToggleTheme = async (isDark: boolean) => {
    if (!agent) return
    const newTheme = isDark ? "dark" : "light"
    setTheme(newTheme)
    setSavingTheme(true)

    try {
      const { data: agentData } = await supabase
        .from('agents')
        .select('system_variants')
        .eq('id', agent.id)
        .single()

      const variants = (agentData?.system_variants as Record<string, any>) || {}
      variants.display_prefs = {
        ...(variants.display_prefs || {}),
        theme: newTheme
      }

      const { error } = await supabase
        .from('agents')
        .update({
          system_variants: variants,
          updated_at: new Date().toISOString()
        })
        .eq('id', agent.id)

      if (error) throw error

      localStorage.setItem("dsr_theme", newTheme)
      window.dispatchEvent(new Event("theme-change"))
    } catch (err: any) {
      console.error(err)
      setFeedback({ type: "error", message: err.message || "Failed to update theme on server." })
    } finally {
      setSavingTheme(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setFeedback(null)

    if (newPassword.length < 6) {
      setFeedback({ type: "error", message: "Password must be at least 6 characters long." })
      return
    }

    if (newPassword !== confirmPassword) {
      setFeedback({ type: "error", message: "Passwords do not match." })
      return
    }

    setUpdatingPassword(true)

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      })

      if (error) throw error

      setNewPassword("")
      setConfirmPassword("")
      setFeedback({ type: "success", message: "Password updated successfully." })
    } catch (err: any) {
      console.error(err)
      setFeedback({ type: "error", message: err.message || "Failed to update password." })
    } finally {
      setUpdatingPassword(false)
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[400px] gap-2 text-sm text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading your settings...
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
          <UserCog className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">My Settings</h1>
          <p className="text-sm text-slate-500">Manage your profile details, chat notifications, and password settings.</p>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div className={`flex items-start gap-2 text-sm rounded-lg px-4 py-3 border transition-all ${
          feedback.type === "success"
            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
            : "bg-red-50 text-red-700 border-red-200"
        }`}>
          {feedback.type === "success" ? <Check className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
          <span className="flex-1">{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="ml-auto p-0.5 rounded-md hover:bg-slate-100/50">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column (2/3 width on LG) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Profile Card */}
          {agent && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <User className="w-4 h-4 text-blue-600" />
                  Profile Details
                </CardTitle>
                <CardDescription>View your office credentials and edit your public status message.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                
                {/* Visual Avatar Summary */}
                <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white text-lg font-bold shadow-sm">
                    {agent.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-slate-800">{agent.name}</h3>
                    <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                      <Mail className="w-3.5 h-3.5" /> {agent.email}
                    </p>
                  </div>
                </div>

                {/* Read-Only Org details */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-3 bg-slate-50/50 border border-slate-150 rounded-lg">
                    <span className="block text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Office Location</span>
                    <span className="text-sm font-medium text-slate-700 flex items-center gap-1.5 mt-1">
                      <Building className="w-3.5 h-3.5 text-slate-400" /> {agent.office || "Unspecified"}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50/50 border border-slate-150 rounded-lg">
                    <span className="block text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Associated Team</span>
                    <span className="text-sm font-medium text-slate-700 flex items-center gap-1.5 mt-1">
                      <Users className="w-3.5 h-3.5 text-slate-400" /> {agent.team || "No team assigned"}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50/50 border border-slate-150 rounded-lg">
                    <span className="block text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Access Permissions</span>
                    <span className="text-sm font-medium text-slate-700 flex items-center gap-1.5 mt-1">
                      {agent.role === "admin" ? (
                        <>
                          <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
                          <Badge className="bg-amber-100 text-amber-700 border-amber-200">Administrator</Badge>
                        </>
                      ) : (
                        <>
                          <Shield className="w-3.5 h-3.5 text-blue-500" />
                          <Badge className="bg-blue-50 text-blue-700 border-blue-100">Standard Agent</Badge>
                        </>
                      )}
                    </span>
                  </div>
                </div>



              </CardContent>
            </Card>
          )}

          {/* Color Theme Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Moon className="w-4 h-4 text-blue-600" />
                Color Theme
              </CardTitle>
              <CardDescription>Choose your dashboard color theme.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100 hover:bg-slate-100/50 transition-colors">
                <div className="flex gap-2.5 items-start">
                  <Moon className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                  <div>
                    <span className="block text-sm font-semibold text-slate-800">Dark Mode</span>
                    <span className="block text-xs text-slate-400 mt-0.5">Toggle deep charcoal dark colors</span>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={theme === "dark"}
                    disabled={savingTheme}
                    onChange={(e) => handleToggleTheme(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Password Update Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="w-4 h-4 text-blue-600" />
                Change Password
              </CardTitle>
              <CardDescription>Update your portal password to keep your account secure.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Confirm Password</label>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showPassword}
                      onChange={(e) => setShowPassword(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                    />
                    Show passwords
                  </label>
                  
                  <Button type="submit" disabled={updatingPassword || !newPassword || !confirmPassword}>
                    {updatingPassword ? (
                      <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Updating...</>
                    ) : (
                      "Change Password"
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Right Column (1/3 width on LG) */}
        <div>
          {/* Notifications Preferences Card */}
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bell className="w-4 h-4 text-blue-600" />
                Notification Prefs
              </CardTitle>
              <CardDescription>Control how and when you receive internal chat alerts.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">

              {/* Preview Test Notification */}
              <button
                onClick={async () => {
                  const firstName = agent?.name?.split(' ')[0] || 'there'

                  // 1. Always fire the in-app toast (works immediately)
                  addToast({
                    title: `Hey ${firstName}! 👋`,
                    message: 'This is what your chat notifications will look like. Looking good!',
                    variant: 'notification',
                    duration: 6000,
                  })

                  // 2. Try desktop notification too
                  if (typeof window !== 'undefined' && 'Notification' in window) {
                    if (Notification.permission === 'default') {
                      const perm = await requestDesktopPermission()
                      if (perm === 'granted') {
                        sendDesktopNotification(
                          `Hey ${firstName}! 👋`,
                          'This is your desktop notification preview. It works!',
                        )
                      } else {
                        addToast({
                          title: 'Desktop notifications blocked',
                          message: 'Your browser blocked desktop notifications. You can enable them in browser settings.',
                          variant: 'warning',
                          duration: 6000,
                        })
                      }
                    } else if (Notification.permission === 'granted') {
                      sendDesktopNotification(
                        `Hey ${firstName}! 👋`,
                        'This is your desktop notification preview. It works!',
                      )
                    }
                  }
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg hover:bg-indigo-100 hover:border-indigo-200 transition-all cursor-pointer group"
              >
                <Send className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                Preview Test Notification
              </button>

              {/* Toggles */}
              <div className="space-y-4">
                
                {/* Desktop Toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="flex gap-2.5 items-start">
                    <Monitor className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                    <div>
                      <span className="block text-sm font-semibold text-slate-800">Desktop Notifications</span>
                      <span className="block text-xs text-slate-400 mt-0.5">Show browser banner alerts</span>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={prefs.desktop_enabled}
                      onChange={(e) => handleDesktopToggle(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {/* In-App Toast Toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="flex gap-2.5 items-start">
                    <Bell className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                    <div>
                      <span className="block text-sm font-semibold text-slate-800">In-App Toasts</span>
                      <span className="block text-xs text-slate-400 mt-0.5">Show pop-up alerts in the bottom-right</span>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={prefs.toast_enabled}
                      onChange={(e) => setPrefs(prev => ({ ...prev, toast_enabled: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {/* DM Toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="flex gap-2.5 items-start">
                    <MessageSquare className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                    <div>
                      <span className="block text-sm font-semibold text-slate-800">Direct Messages</span>
                      <span className="block text-xs text-slate-400 mt-0.5">Alert on direct 1-to-1 DMs</span>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={prefs.notify_on_dm}
                      onChange={(e) => setPrefs(prev => ({ ...prev, notify_on_dm: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {/* Mentions Toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="flex gap-2.5 items-start">
                    <span className="text-slate-500 font-semibold text-xs mt-0.5 shrink-0 w-4 select-none">@</span>
                    <div>
                      <span className="block text-sm font-semibold text-slate-800">Personal @Mentions</span>
                      <span className="block text-xs text-slate-400 mt-0.5">Alert when tagged by name</span>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={prefs.notify_on_mentions}
                      onChange={(e) => setPrefs(prev => ({ ...prev, notify_on_mentions: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {/* Team Mentions Toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="flex gap-2.5 items-start">
                    <Users className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                    <div>
                      <span className="block text-sm font-semibold text-slate-800">Team @Mentions</span>
                      <span className="block text-xs text-slate-400 mt-0.5">Alert on @Sales, @CSR tags</span>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={prefs.notify_on_team_mentions}
                      onChange={(e) => setPrefs(prev => ({ ...prev, notify_on_team_mentions: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {/* Urgent Toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="flex gap-2.5 items-start">
                    <ShieldAlert className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                    <div>
                      <span className="block text-sm font-semibold text-slate-800">Urgent Messages</span>
                      <span className="block text-xs text-slate-400 mt-0.5">Always alert on high priority</span>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={prefs.notify_on_urgent}
                      onChange={(e) => setPrefs(prev => ({ ...prev, notify_on_urgent: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

              </div>

              {/* Persistent Toasts Toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors">
                <div className="flex gap-2.5 items-start">
                  <Bell className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-slate-700">Persistent Pop-ups</p>
                    <p className="text-xs text-slate-500">Keep notification pop-ups on screen until manually dismissed</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={persistentToasts}
                    onChange={(e) => {
                      setPersistentToasts(e.target.checked)
                      if (typeof window !== "undefined") {
                        localStorage.setItem("persistent_toasts", e.target.checked ? "true" : "false")
                      }
                      addToast({ title: "Settings Saved", message: "Pop-up duration updated.", variant: "success" })
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {/* Save Preferences */}
              <div className="border-t border-slate-100 pt-6">
                <Button onClick={handleSavePrefs} disabled={savingPrefs} className="w-full">
                  {savingPrefs ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Save Preferences
                </Button>
              </div>

            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  )
}
