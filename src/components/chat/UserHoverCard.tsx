'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Building2, Users, Shield, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import UserPresenceBadge from './UserPresenceBadge'

interface UserHoverCardProps {
  agent: {
    id?: string
    name: string
    office?: string | null
    team?: string | null
    role?: string | null
    presence?: string | null
    status_message?: string | null
    avatar_url?: string | null
  }
  children: React.ReactNode
  className?: string
  side?: 'top' | 'bottom'
}

const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-indigo-500',
  'bg-teal-500',
]

function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function parseStatusMessage(msg: string | null): { emoji: string | null; text: string | null } {
  if (!msg) return { emoji: null, text: null }
  
  const emojiRegex = /^([\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]|[\u{1F100}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F300}-\u{1F5FF}])/u
  const match = msg.match(emojiRegex)
  if (match) {
    const emoji = match[1]
    const text = msg.slice(emoji.length).trim()
    return { emoji, text }
  }
  
  return { emoji: null, text: msg }
}

export default function UserHoverCard({
  agent,
  children,
  className,
  side = 'top',
}: UserHoverCardProps) {
  const [isOpen, setIsOpen] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMouseEnter = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setIsOpen(true)
    }, 180)
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setIsOpen(false)
    }, 150)
  }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const statusInfo = parseStatusMessage(agent.status_message ?? null)
  const displayName = agent.name || 'Unknown'

  return (
    <div
      ref={containerRef}
      className={cn('relative inline-flex items-center', className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}

      {isOpen && (
        <div
          className={cn(
            'absolute z-50 w-64 p-3 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200/80 dark:border-slate-700/80 text-left transition-all animate-in fade-in zoom-in-95 duration-150 select-none pointer-events-auto',
            side === 'top'
              ? 'bottom-full left-0 mb-2'
              : 'top-full left-0 mt-2'
          )}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* Zero-gap invisible hover bridge */}
          <div
            className={cn(
              'absolute left-0 right-0 h-3',
              side === 'top' ? '-bottom-3' : '-top-3'
            )}
          />

          {/* User Header */}
          <div className="flex items-center gap-2.5 pb-2.5 border-b border-slate-100 dark:border-slate-800">
            <div className="relative shrink-0 w-9 h-9">
              <div
                className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-xs',
                  getAvatarColor(displayName)
                )}
              >
                {displayName.charAt(0).toUpperCase()}
              </div>
              {agent.presence && (
                <UserPresenceBadge
                  status={agent.presence as any}
                  size="sm"
                  className="absolute -bottom-0.5 -right-0.5 ring-2 ring-white dark:ring-slate-900"
                />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                  {displayName}
                </span>
                {agent.role === 'admin' && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.2 rounded-sm bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800">
                    <Shield className="w-2.5 h-2.5" />
                    Admin
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-400 capitalize">
                {agent.presence || 'offline'}
              </div>
            </div>
          </div>

          {/* Details Section */}
          <div className="pt-2.5 space-y-1.5 text-xs">
            {/* Team */}
            <div className="flex items-center justify-between py-0.5">
              <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 text-[11px] font-medium">
                <Users className="w-3.5 h-3.5 text-blue-500" />
                Team
              </span>
              {agent.team ? (
                <span className="font-semibold text-slate-800 dark:text-slate-200 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px]">
                  {agent.team}
                </span>
              ) : (
                <span className="text-slate-400 text-[11px]">—</span>
              )}
            </div>

            {/* Office */}
            <div className="flex items-center justify-between py-0.5">
              <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 text-[11px] font-medium">
                <Building2 className="w-3.5 h-3.5 text-emerald-500" />
                Office
              </span>
              {agent.office ? (
                <span className="font-semibold text-slate-800 dark:text-slate-200 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px]">
                  {agent.office} Office
                </span>
              ) : (
                <span className="text-slate-400 text-[11px]">—</span>
              )}
            </div>

            {/* Status message */}
            {statusInfo.text && (
              <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 p-1.5 rounded-lg">
                {statusInfo.emoji ? (
                  <span className="text-xs shrink-0">{statusInfo.emoji}</span>
                ) : (
                  <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
                )}
                <span className="truncate italic">"{statusInfo.text}"</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
