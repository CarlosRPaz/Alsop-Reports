"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { createSupabaseBrowserClient } from "@/lib/supabaseBrowser"
import { useChat } from "@/lib/chat/chatContext"
import { 
  BarChart3,
  MessageSquare, 
  Settings,
  ChevronLeft,
  ChevronRight,
  Percent,
  UserCircle,
  LogOut,
  Shield,
  Loader2,
  X,
  History,
  Smile,
  Menu,
  Flame
} from "lucide-react"

/* ── Letter icon for D / W / M reports ─────────────────────────────── */
function LetterIcon({ letter, isActive, compact }: { letter: string; isActive: boolean; compact: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md font-bold shrink-0 transition-all duration-200",
        compact ? "w-5 h-5 text-[11px]" : "w-4 h-4 text-[10px]",
        isActive
          ? "bg-blue-600 text-white shadow-sm"
          : "bg-slate-200/80 text-slate-600 group-hover:bg-slate-300 group-hover:text-slate-800 dark:bg-slate-700 dark:text-slate-400 dark:group-hover:bg-slate-600 dark:group-hover:text-slate-200"
      )}
    >
      {letter}
    </span>
  )
}

/* ── Helper to parse emoji and text from status message ────────────────── */
function parseStatusMessage(msg: string): { emoji: string; text: string } {
  if (!msg) return { emoji: '💬', text: '' }
  
  // Emojis regex matching any emoji at the start of the string
  const emojiRegex = /^([\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]|[\u{1F100}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F300}-\u{1F5FF}])/u
  const match = msg.match(emojiRegex)
  if (match) {
    const emoji = match[1]
    const text = msg.slice(emoji.length).trim()
    return { emoji, text }
  }
  
  return { emoji: '💬', text: msg }
}

/* ── Nav item type with support for both icon components and letters ─ */
type NavItem = {
  name: string
  href: string
  icon?: React.ComponentType<{ className?: string }>
  letter?: string
  pageKey?: string // maps to page_permissions.page_key for access control
}

const navItems: NavItem[] = [
  { name: 'Overview', href: '/', icon: BarChart3, pageKey: 'overview' },
  { name: 'Daily Standup', href: '/reports/daily', letter: 'D', pageKey: 'daily' },
  { name: 'Weekly Report', href: '/reports/weekly', letter: 'W', pageKey: 'weekly' },
  { name: 'MTD Performance', href: '/reports/mtd', letter: 'M', pageKey: 'mtd' },
  { name: 'Quotes & NB', href: '/reports/quotes', icon: Percent, pageKey: 'quotes' },
  { name: 'Agent Heatmap', href: '/reports/heatmap', icon: Flame, pageKey: 'heatmap' },
  { name: 'Agent Portal', href: '/reports/agent', icon: UserCircle, pageKey: 'agent_portal' },
  { name: 'Communication', href: '/communication', icon: MessageSquare },
  { name: 'My Settings', href: '/settings', icon: Settings },
  { name: 'Admin Panel', href: '/admin', icon: Shield },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [isExpanded, setIsExpanded] = useState(true)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const { unreadCounts } = useChat()
  const totalUnread = Object.values(unreadCounts || {}).reduce((sum, count) => sum + (count || 0), 0)

  const [currentAgent, setCurrentAgent] = useState<any>(null)
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false)
  const [modalPresence, setModalPresence] = useState<'online' | 'away' | 'busy' | 'offline'>('online')
  const [modalStatusMsg, setModalStatusMsg] = useState('')
  const [savingStatus, setSavingStatus] = useState(false)
  const [modalEmoji, setModalEmoji] = useState('💬')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [recentStatuses, setRecentStatuses] = useState<{ emoji: string; text: string }[]>([])
  const [pagePerms, setPagePerms] = useState<Record<string, string[]>>({})

  const isManagerOrAdmin = currentAgent?.role === 'admin' || currentAgent?.team === 'Managers'

  // Dynamically tailor nav items (e.g. 'My Portal' for regular agents vs 'Agent Portal' for managers)
  const dynamicNavItems: NavItem[] = useMemo(() => {
    return navItems.map((item: NavItem): NavItem => {
      if (item.pageKey === 'agent_portal') {
        if (!isManagerOrAdmin && currentAgent?.id) {
          return {
            ...item,
            name: 'My Portal',
            href: `/reports/agent/${currentAgent.id}`,
          }
        }
      }
      return item
    })
  }, [currentAgent, isManagerOrAdmin])

  useEffect(() => {
    const loadAgent = async () => {
      const supabase = createSupabaseBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      
      const { data } = await supabase
        .from('agents')
        .select('id, name, presence, status_message, role, team')
        .eq('auth_user_id', user.id)
        .single()
      
      if (data) {
        setCurrentAgent(data)
      }

      // Load page permissions
      const { data: perms } = await supabase
        .from('page_permissions')
        .select('page_key, allowed_teams')
      if (perms) {
        const map: Record<string, string[]> = {}
        for (const p of perms) map[p.page_key] = p.allowed_teams
        setPagePerms(map)
      }
    }
    
    loadAgent()
    
    const handleUpdate = () => {
      loadAgent()
    }
    window.addEventListener('agent-updated', handleUpdate)
    return () => {
      window.removeEventListener('agent-updated', handleUpdate)
    }
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('recent_statuses')
      if (stored) {
        try {
          setRecentStatuses(JSON.parse(stored))
        } catch (e) {
          console.error(e)
        }
      }
    }
  }, [])

  const openStatusModal = () => {
    if (!currentAgent) return
    setModalPresence(currentAgent.presence || 'online')
    const parsed = parseStatusMessage(currentAgent.status_message || '')
    setModalEmoji(parsed.emoji)
    setModalStatusMsg(parsed.text)
    setIsStatusModalOpen(true)
  }

  const handleSaveStatus = async () => {
    if (!currentAgent) return
    setSavingStatus(true)
    
    // Construct status message with emoji
    const finalStatusMsg = modalStatusMsg.trim() 
      ? `${modalEmoji} ${modalStatusMsg.trim()}`
      : null

    try {
      const supabase = createSupabaseBrowserClient()
      const { error } = await supabase
        .from('agents')
        .update({
          presence: modalPresence,
          status_message: finalStatusMsg,
          last_seen_at: new Date().toISOString()
        })
        .eq('id', currentAgent.id)
      
      if (error) throw error
      
      setCurrentAgent((prev: any) => prev ? {
        ...prev,
        presence: modalPresence,
        status_message: finalStatusMsg
      } : null)
      
      // Save to recent statuses in localStorage
      if (modalStatusMsg.trim()) {
        const newStatus = { emoji: modalEmoji, text: modalStatusMsg.trim() }
        const updatedRecents = [
          newStatus,
          ...recentStatuses.filter(s => s.text.toLowerCase() !== newStatus.text.toLowerCase())
        ].slice(0, 4)
        setRecentStatuses(updatedRecents)
        localStorage.setItem('recent_statuses', JSON.stringify(updatedRecents))
      }

      window.dispatchEvent(new Event('agent-updated'))
      setIsStatusModalOpen(false)
      setShowEmojiPicker(false)
    } catch (err) {
      console.error('Failed to save status:', err)
      alert('Failed to save status. Please try again.')
    } finally {
      setSavingStatus(false)
    }
  }

  const handleSignOut = async () => {
    setSigningOut(true)
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <>
      {/* Mobile Header Top Bar */}
      <header className="md:hidden flex items-center justify-between p-4 bg-slate-900 text-white w-full sticky top-0 z-30 shadow-md shrink-0 no-print">
        <div>
          <h2 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
            Alsop Reports
          </h2>
          <p className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold">Command Center</p>
        </div>
        <button
          onClick={() => setIsMobileOpen(true)}
          className="p-2 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          title="Open Menu"
        >
          <Menu className="w-6 h-6" />
        </button>
      </header>

      {/* Mobile Drawer Overlay */}
      {isMobileOpen && (
        <div 
          className="md:hidden fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm transition-opacity no-print"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Mobile Drawer Navigation */}
      <aside 
        className={cn(
          "md:hidden fixed inset-y-0 left-0 z-50 w-72 bg-white dark:bg-slate-900 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out transform no-print",
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="p-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-700">
          <div>
            <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600">
              Alsop Reports
            </h2>
            <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider font-semibold">Command Center</p>
          </div>
          <button
            onClick={() => setIsMobileOpen(false)}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 dark:hover:text-slate-300 dark:hover:bg-slate-800 transition-colors"
            title="Close Menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 space-y-1 mt-4 overflow-y-auto">
          {navItems.filter(item => {
            // Admin Panel is rendered separately below the nav
            if (item.href === '/admin') return false
            // Agent Portal is only shown in the reports list for Managers and Admins
            if (item.pageKey === 'agent_portal' && !isManagerOrAdmin) return false
            // Heatmap is strictly Admin-only
            if (item.pageKey === 'heatmap') {
              return currentAgent?.role === 'admin'
            }
            // Admins and Managers bypass page-level restrictions
            if (currentAgent?.role === 'admin' || currentAgent?.team === 'Managers') {
              return true
            }
            // Items without a pageKey (Settings) are always visible
            if (!item.pageKey) return true
            // If page permissions haven't loaded yet, show everything
            if (Object.keys(pagePerms).length === 0) return true
            // Check if the agent's team is allowed
            const allowed = pagePerms[item.pageKey]
            if (!allowed) return true // page not in permissions table = visible
            return allowed.includes(currentAgent?.team || '')
          }).map((item) => {
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setIsMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group",
                  isActive 
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" 
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                )}
              >
                {item.letter ? (
                  <LetterIcon letter={item.letter} isActive={isActive} compact={false} />
                ) : item.icon ? (
                  <item.icon className={cn(
                    "shrink-0 transition-colors w-4 h-4", 
                    isActive ? "text-blue-600" : "text-slate-500 group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-300"
                  )} />
                ) : null}
                <span className="flex-1">{item.name}</span>
                {item.name === 'Communication' && totalUnread > 0 && (
                  <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
                    {totalUnread}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Mobile Pinned Bottom Link: Admin Panel for Admins, My Portal for Agents */}
        {currentAgent?.role === 'admin' ? (() => {
          const isActive = pathname === '/admin' || pathname.startsWith('/admin')
          return (
            <div className="px-3 mb-1">
              <Link
                href="/admin"
                onClick={() => setIsMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group",
                  isActive
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                )}
              >
                <Shield className={cn(
                  "shrink-0 transition-colors w-4 h-4",
                  isActive ? "text-blue-600" : "text-slate-500 group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-300"
                )} />
                <span>Admin Panel</span>
              </Link>
            </div>
          )
        })() : currentAgent?.id ? (() => {
          const portalHref = `/reports/agent/${currentAgent.id}`
          const isActive = pathname === portalHref || pathname.startsWith(portalHref)
          return (
            <div className="px-3 mb-1">
              <Link
                href={portalHref}
                onClick={() => setIsMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group",
                  isActive
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                )}
              >
                <UserCircle className={cn(
                  "shrink-0 transition-colors w-4 h-4",
                  isActive ? "text-blue-600" : "text-slate-500 group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-300"
                )} />
                <span className="font-semibold">My Portal</span>
              </Link>
            </div>
          )
        })() : null}

        {/* Mobile User Profile Summary */}
        {currentAgent && (
          <div className="p-3 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={() => {
                setIsMobileOpen(false)
                openStatusModal()
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800 transition-all text-left w-full"
            >
              <div className="relative shrink-0">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold bg-blue-600 shadow-sm">
                  {currentAgent.name.charAt(0).toUpperCase()}
                </div>
                <div
                  className={cn(
                    "absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white shrink-0 shadow-sm",
                    currentAgent.presence === 'online' && "bg-emerald-500",
                    currentAgent.presence === 'away' && "bg-amber-500",
                    currentAgent.presence === 'busy' && "bg-rose-500",
                    currentAgent.presence === 'offline' && "bg-slate-400"
                  )}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate leading-tight">
                  {currentAgent.name}
                </p>
                <p className="text-[11px] text-slate-400 truncate mt-0.5">
                  {currentAgent.status_message ? currentAgent.status_message : `Set status message...`}
                </p>
              </div>
            </button>
          </div>
        )}

        <div className="p-3 border-t border-slate-200 dark:border-slate-700">
          <button 
            onClick={() => {
              setIsMobileOpen(false)
              handleSignOut()
            }}
            disabled={signingOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/30 transition-all w-full text-left"
          >
            <LogOut className="shrink-0 w-4 h-4" />
            <span>{signingOut ? "Signing out..." : "Sign Out"}</span>
          </button>
        </div>
      </aside>

      {/* Desktop Sidebar (Rendered unchanged, but hidden on mobile) */}
      <aside 
        className={cn(
          "bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 h-screen sticky top-0 hidden md:flex flex-col z-10 transition-all duration-300 shrink-0",
          isExpanded ? "w-64" : "w-16"
        )}
      >
        {/* Expand/Collapse Toggle */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          title={isExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
          className="absolute -right-3.5 top-8 z-50 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 shadow-sm transition-all hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
        >
          {isExpanded ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        <div className={cn("p-4 flex items-center", !isExpanded ? "justify-center" : "justify-between")}>
          {isExpanded ? (
            <div>
              <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600 whitespace-nowrap">
                Alsop Reports
              </h2>
              <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider font-semibold whitespace-nowrap">Command Center</p>
            </div>
          ) : (
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center font-bold text-white shrink-0">
              A
            </div>
          )}
        </div>

        <nav className="flex-1 px-2 space-y-1 mt-4">
          {navItems.filter(item => {
            // Admin Panel is rendered separately below the nav
            if (item.href === '/admin') return false
            // Agent Portal is only shown in the reports list for Managers and Admins
            if (item.pageKey === 'agent_portal' && !isManagerOrAdmin) return false
            // Heatmap is strictly Admin-only
            if (item.pageKey === 'heatmap') {
              return currentAgent?.role === 'admin'
            }
            // Admins and Managers bypass page-level restrictions
            if (currentAgent?.role === 'admin' || currentAgent?.team === 'Managers') {
              return true
            }
            // Items without a pageKey (Settings) are always visible
            if (!item.pageKey) return true
            // If page permissions haven't loaded yet, show everything
            if (Object.keys(pagePerms).length === 0) return true
            // Check if the agent's team is allowed
            const allowed = pagePerms[item.pageKey]
            if (!allowed) return true // page not in permissions table = visible
            return allowed.includes(currentAgent?.team || '')
          }).map((item) => {
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.name}
                href={item.href}
                title={!isExpanded ? item.name : undefined}
                className={cn(
                  "flex items-center rounded-lg text-sm font-medium transition-all group overflow-hidden relative",
                  !isExpanded ? "justify-center p-2" : "gap-3 px-3 py-2",
                  isActive 
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" 
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                )}
              >
                {item.letter ? (
                  <LetterIcon letter={item.letter} isActive={isActive} compact={!isExpanded} />
                ) : item.icon ? (
                  <item.icon className={cn(
                    "shrink-0 transition-colors", 
                    !isExpanded ? "w-5 h-5" : "w-4 h-4",
                    isActive ? "text-blue-600" : "text-slate-500 group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-300"
                  )} />
                ) : null}
                {isExpanded && <span className="whitespace-nowrap flex-1">{item.name}</span>}
                {isExpanded && item.name === 'Communication' && totalUnread > 0 && (
                  <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
                    {totalUnread}
                  </span>
                )}
                {!isExpanded && item.name === 'Communication' && totalUnread > 0 && (
                  <div className="absolute top-1 right-1 w-2 h-2 bg-blue-600 rounded-full border border-white shrink-0 shadow-sm" />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Pinned Bottom Link: Admin Panel for Admins, My Portal for Agents */}
        {currentAgent?.role === 'admin' ? (() => {
          const isActive = pathname === '/admin' || pathname.startsWith('/admin')
          return (
            <div className="px-2 mb-1">
              <Link
                href="/admin"
                title={!isExpanded ? 'Admin Panel' : undefined}
                className={cn(
                  "flex items-center rounded-lg text-sm font-medium transition-all group overflow-hidden",
                  !isExpanded ? "justify-center p-2" : "gap-3 px-3 py-2",
                  isActive
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                )}
              >
                <Shield className={cn(
                  "shrink-0 transition-colors",
                  !isExpanded ? "w-5 h-5" : "w-4 h-4",
                  isActive ? "text-blue-600" : "text-slate-500 group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-300"
                )} />
                {isExpanded && <span className="whitespace-nowrap font-medium">Admin Panel</span>}
              </Link>
            </div>
          )
        })() : currentAgent?.id ? (() => {
          const portalHref = `/reports/agent/${currentAgent.id}`
          const isActive = pathname === portalHref || pathname.startsWith(portalHref)
          return (
            <div className="px-2 mb-1">
              <Link
                href={portalHref}
                title={!isExpanded ? 'My Portal' : undefined}
                className={cn(
                  "flex items-center rounded-lg text-sm font-medium transition-all group overflow-hidden",
                  !isExpanded ? "justify-center p-2" : "gap-3 px-3 py-2",
                  isActive
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                )}
              >
                <UserCircle className={cn(
                  "shrink-0 transition-colors",
                  !isExpanded ? "w-5 h-5" : "w-4 h-4",
                  isActive ? "text-blue-600" : "text-slate-500 group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-300"
                )} />
                {isExpanded && <span className="whitespace-nowrap font-semibold">My Portal</span>}
              </Link>
            </div>
          )
        })() : null}

        {/* User Profile Summary Component */}
        {currentAgent && (
          <div className="p-2 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={openStatusModal}
              title={!isExpanded ? `${currentAgent.name} (${currentAgent.presence})${currentAgent.status_message ? ` - ${currentAgent.status_message}` : ''}` : undefined}
              className={cn(
                "flex items-center rounded-lg text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800 transition-all text-left w-full",
                !isExpanded ? "justify-center p-2" : "gap-3 px-3 py-2"
              )}
            >
              {/* Avatar with Presence dot */}
              <div className="relative shrink-0">
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold bg-blue-600 shadow-sm"
                  )}
                >
                  {currentAgent.name.charAt(0).toUpperCase()}
                </div>
                <div
                  className={cn(
                    "absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white shrink-0 shadow-sm",
                    currentAgent.presence === 'online' && "bg-emerald-500",
                    currentAgent.presence === 'away' && "bg-amber-500",
                    currentAgent.presence === 'busy' && "bg-rose-500",
                    currentAgent.presence === 'offline' && "bg-slate-400"
                  )}
                />
              </div>

              {/* Details */}
              {isExpanded && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate leading-tight">
                    {currentAgent.name}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                    {currentAgent.status_message ? currentAgent.status_message : `Set status message...`}
                  </p>
                </div>
              )}
            </button>
          </div>
        )}

        <div className="p-2 border-t border-slate-200 dark:border-slate-700">
          <button 
            onClick={handleSignOut}
            disabled={signingOut}
            title={!isExpanded ? "Sign Out" : undefined}
            className={cn(
              "flex items-center rounded-lg text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/30 transition-all",
              !isExpanded ? "justify-center p-2" : "gap-3 px-3 py-2 w-full"
            )}
          >
            <LogOut className={cn("shrink-0", !isExpanded ? "w-5 h-5" : "w-4 h-4")} />
            {isExpanded && <span className="whitespace-nowrap">{signingOut ? "Signing out..." : "Sign Out"}</span>}
          </button>
        </div>
      </aside>

      {/* Shared Status Modal */}
      {isStatusModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          {/* Overlay */}
          <div 
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" 
            onClick={() => {
              setIsStatusModalOpen(false)
              setShowEmojiPicker(false)
            }}
          />
          
          {/* Modal Card */}
          <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden mx-4 p-5 text-slate-800 dark:text-slate-200 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Set status message</h3>
              <button
                onClick={() => {
                  setIsStatusModalOpen(false)
                  setShowEmojiPicker(false)
                }}
                className="text-slate-400 hover:text-slate-600 rounded-md p-1 hover:bg-slate-50 dark:hover:text-slate-300 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            {/* Status input group with emoji picker */}
            <div className="relative flex items-center gap-2 border border-slate-200 dark:border-slate-700 rounded-lg p-1 bg-slate-50 dark:bg-slate-800 focus-within:ring-2 focus-within:ring-blue-100 dark:focus-within:ring-blue-900 focus-within:border-blue-400 dark:focus-within:border-blue-600 transition-all">
              {/* Emoji Button */}
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-lg transition-colors bg-white dark:bg-slate-800 border border-slate-150 dark:border-slate-600 shadow-sm shrink-0"
                title="Select emoji"
              >
                {modalEmoji}
              </button>

              {/* Text Input */}
              <input
                type="text"
                placeholder="What is your status?"
                value={modalStatusMsg}
                onChange={(e) => setModalStatusMsg(e.target.value)}
                maxLength={100}
                className="flex-1 px-1 py-1 text-sm bg-transparent border-0 outline-none focus:ring-0 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                autoFocus
              />

              {/* Clear button */}
              {modalStatusMsg && (
                <button
                  onClick={() => setModalStatusMsg('')}
                  className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 shrink-0 transition-colors mr-1"
                >
                  <X className="w-3 h-3" />
                </button>
              )}

              {/* Emoji Picker Popover */}
              {showEmojiPicker && (
                <div className="absolute top-full left-0 mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-2.5 grid grid-cols-6 gap-1.5 z-[110] min-w-[210px] ring-1 ring-black/5 animate-in fade-in slide-in-from-top-1 duration-150">
                  {['💻', '🚗', '💬', '🛌', '📅', '🍏', '🏠', '📞', '☕', '🧠', '✈️', '🎉', '💼', '💪', '🚨', '🧐', '💡', '🔥'].map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => {
                        setModalEmoji(emoji)
                        setShowEmojiPicker(false)
                      }}
                      className={cn(
                        'w-8 h-8 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-lg',
                        modalEmoji === emoji && 'bg-blue-50 ring-1 ring-blue-200'
                      )}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Recents list if available */}
            {recentStatuses.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                  <History className="w-3 h-3" /> Recent statuses
                </div>
                <div className="space-y-1 max-h-[120px] overflow-y-auto pr-1">
                  {recentStatuses.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setModalEmoji(item.emoji)
                        setModalStatusMsg(item.text)
                      }}
                      className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm text-left transition-colors group"
                    >
                      <span className="text-base leading-none shrink-0 group-hover:scale-110 transition-transform">{item.emoji}</span>
                      <span className="truncate">{item.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Presets list */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Or choose a preset</label>
              <div className="space-y-1">
                {[
                  { emoji: '💻', text: 'Away from desk' },
                  { emoji: '🚗', text: 'On the road' },
                  { emoji: '💬', text: 'DSR' },
                  { emoji: '🛌', text: 'Out of office' },
                  { emoji: '📅', text: 'In a meeting' },
                  { emoji: '🍏', text: 'Lunch' }
                ].map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setModalEmoji(item.emoji)
                      setModalStatusMsg(item.text)
                    }}
                    className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm text-left transition-colors group"
                  >
                    <span className="text-base leading-none shrink-0 group-hover:scale-110 transition-transform">{item.emoji}</span>
                    <span className="truncate">{item.text}</span>
                  </button>
                ))}
              </div>
            </div>

            <hr className="border-slate-100 dark:border-slate-700" />

            {/* Presence selector */}
            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Activity Status</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'online', label: 'Online', emoji: '🟢' },
                  { value: 'away', label: 'Away', emoji: '🟡' },
                  { value: 'busy', label: 'Busy', emoji: '🔴' },
                  { value: 'offline', label: 'Offline', emoji: '⚫' }
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setModalPresence(opt.value as any)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border text-left transition-all",
                      modalPresence === opt.value
                        ? "border-blue-600 bg-blue-50/50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold shadow-sm"
                        : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                    )}
                  >
                    <span className="text-xs">{opt.emoji}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-end pt-2 border-t border-slate-100 dark:border-slate-700 mt-1">
              <button
                onClick={() => {
                  setIsStatusModalOpen(false)
                  setShowEmojiPicker(false)
                }}
                className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveStatus}
                disabled={savingStatus}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1.5"
              >
                {savingStatus && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {savingStatus ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
