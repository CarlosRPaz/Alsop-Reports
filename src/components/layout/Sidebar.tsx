"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { createSupabaseBrowserClient } from "@/lib/supabaseBrowser"
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
  Smile
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
          : "bg-slate-200/80 text-slate-600 group-hover:bg-slate-300 group-hover:text-slate-800"
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
}

const navItems: NavItem[] = [
  { name: 'Overview', href: '/', icon: BarChart3 },
  { name: 'Daily Standup', href: '/reports/daily', letter: 'D' },
  { name: 'Weekly Report', href: '/reports/weekly', letter: 'W' },
  { name: 'MTD Performance', href: '/reports/mtd', letter: 'M' },
  { name: 'Quotes & NB', href: '/reports/quotes', icon: Percent },
  { name: 'Agent Portal', href: '/reports/agent', icon: UserCircle },
  { name: 'Communication', href: '/communication', icon: MessageSquare },
  { name: 'My Settings', href: '/settings', icon: Settings },
  { name: 'Admin Panel', href: '/admin', icon: Shield },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [isExpanded, setIsExpanded] = useState(true)
  const [signingOut, setSigningOut] = useState(false)

  const [currentAgent, setCurrentAgent] = useState<any>(null)
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false)
  const [modalPresence, setModalPresence] = useState<'online' | 'away' | 'busy' | 'offline'>('online')
  const [modalStatusMsg, setModalStatusMsg] = useState('')
  const [savingStatus, setSavingStatus] = useState(false)
  const [modalEmoji, setModalEmoji] = useState('💬')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [recentStatuses, setRecentStatuses] = useState<{ emoji: string; text: string }[]>([])

  useEffect(() => {
    const loadAgent = async () => {
      const supabase = createSupabaseBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      
      const { data } = await supabase
        .from('agents')
        .select('id, name, presence, status_message, role')
        .eq('auth_user_id', user.id)
        .single()
      
      if (data) {
        setCurrentAgent(data)
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
    <aside 
      className={cn(
        "bg-white border-r border-slate-200 h-screen sticky top-0 hidden md:flex flex-col z-10 transition-all duration-300 shrink-0",
        isExpanded ? "w-64" : "w-16"
      )}
    >
      {/* Expand/Collapse Toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        title={isExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
        className="absolute -right-3.5 top-8 z-50 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
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
          if (item.href === '/admin' && currentAgent?.role !== 'admin') {
            return false
          }
          return true
        }).map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.name}
              href={item.href}
              title={!isExpanded ? item.name : undefined}
              className={cn(
                "flex items-center rounded-lg text-sm font-medium transition-all group overflow-hidden",
                !isExpanded ? "justify-center p-2" : "gap-3 px-3 py-2",
                isActive 
                  ? "bg-blue-50 text-blue-700" 
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              {item.letter ? (
                <LetterIcon letter={item.letter} isActive={isActive} compact={!isExpanded} />
              ) : item.icon ? (
                <item.icon className={cn(
                  "shrink-0 transition-colors", 
                  !isExpanded ? "w-5 h-5" : "w-4 h-4",
                  isActive ? "text-blue-600" : "text-slate-500 group-hover:text-slate-700"
                )} />
              ) : null}
              {isExpanded && <span className="whitespace-nowrap">{item.name}</span>}
            </Link>
          )
        })}
      </nav>

      {/* User Profile Summary Component */}
      {currentAgent && (
        <div className="p-2 border-t border-slate-200">
          <button
            onClick={openStatusModal}
            title={!isExpanded ? `${currentAgent.name} (${currentAgent.presence})${currentAgent.status_message ? ` - ${currentAgent.status_message}` : ''}` : undefined}
            className={cn(
              "flex items-center rounded-lg text-slate-700 hover:bg-slate-50 transition-all text-left w-full",
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
                <p className="text-sm font-semibold text-slate-800 truncate leading-tight">
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

      <div className="p-2 border-t border-slate-200">
        <button 
          onClick={handleSignOut}
          disabled={signingOut}
          title={!isExpanded ? "Sign Out" : undefined}
          className={cn(
            "flex items-center rounded-lg text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition-all",
            !isExpanded ? "justify-center p-2" : "gap-3 px-3 py-2 w-full"
          )}
        >
          <LogOut className={cn("shrink-0", !isExpanded ? "w-5 h-5" : "w-4 h-4")} />
          {isExpanded && <span className="whitespace-nowrap">{signingOut ? "Signing out..." : "Sign Out"}</span>}
        </button>
      </div>

      {/* Status Modal */}
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
          <div className="relative w-full max-w-sm bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden mx-4 p-5 text-slate-800 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-base font-bold text-slate-900">Set status message</h3>
              <button
                onClick={() => {
                  setIsStatusModalOpen(false)
                  setShowEmojiPicker(false)
                }}
                className="text-slate-400 hover:text-slate-600 rounded-md p-1 hover:bg-slate-50 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            {/* Status input group with emoji picker */}
            <div className="relative flex items-center gap-2 border border-slate-200 rounded-lg p-1 bg-slate-50 focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-400 transition-all">
              {/* Emoji Button */}
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-slate-200 text-lg transition-colors bg-white border border-slate-150 shadow-sm shrink-0"
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
                className="flex-1 px-1 py-1 text-sm bg-transparent border-0 outline-none focus:ring-0 text-slate-800 placeholder:text-slate-400"
                autoFocus
              />

              {/* Clear button */}
              {modalStatusMsg && (
                <button
                  onClick={() => setModalStatusMsg('')}
                  className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 shrink-0 transition-colors mr-1"
                >
                  <X className="w-3 h-3" />
                </button>
              )}

              {/* Emoji Picker Popover */}
              {showEmojiPicker && (
                <div className="absolute top-full left-0 mt-2 bg-white border border-slate-200 rounded-lg shadow-lg p-2.5 grid grid-cols-6 gap-1.5 z-[110] min-w-[210px] ring-1 ring-black/5 animate-in fade-in slide-in-from-top-1 duration-150">
                  {['💻', '🚗', '💬', '🛌', '📅', '🍏', '🏠', '📞', '☕', '🧠', '✈️', '🎉', '💼', '💪', '🚨', '🧐', '💡', '🔥'].map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => {
                        setModalEmoji(emoji)
                        setShowEmojiPicker(false)
                      }}
                      className={cn(
                        'w-8 h-8 flex items-center justify-center rounded hover:bg-slate-100 transition-colors text-lg',
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
                      className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-slate-700 text-sm text-left transition-colors group"
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
                    className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-slate-700 text-sm text-left transition-colors group"
                  >
                    <span className="text-base leading-none shrink-0 group-hover:scale-110 transition-transform">{item.emoji}</span>
                    <span className="truncate">{item.text}</span>
                  </button>
                ))}
              </div>
            </div>

            <hr className="border-slate-100" />

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
                        ? "border-blue-600 bg-blue-50/50 text-blue-700 font-semibold shadow-sm"
                        : "border-slate-200 hover:bg-slate-50 text-slate-700"
                    )}
                  >
                    <span className="text-xs">{opt.emoji}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-end pt-2 border-t border-slate-100 mt-1">
              <button
                onClick={() => {
                  setIsStatusModalOpen(false)
                  setShowEmojiPicker(false)
                }}
                className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
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
    </aside>
  )
}
