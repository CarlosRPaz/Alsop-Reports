'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { cn } from '@/lib/utils'
import UserPresenceBadge from './UserPresenceBadge'
import type { Agent } from './types'

interface MentionAutocompleteProps {
  query: string
  members: Agent[]
  position: { top: number; left: number }
  onSelect: (mention: string) => void
  onClose: () => void
  hasPermission: (key: string) => boolean
}

interface MentionOption {
  type: 'agent' | 'team' | 'everyone'
  label: string
  insertValue: string
  agent?: Agent
  team?: string
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

const TEAM_GROUPS = ['Sales', 'CSR', 'EA', 'Managers']
const OFFICE_GROUPS = ['CH', 'MB', 'MCM', 'RC']

export default function MentionAutocomplete({
  query,
  members,
  position,
  onSelect,
  onClose,
  hasPermission,
}: MentionAutocompleteProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const options = useMemo<MentionOption[]>(() => {
    const q = query.toLowerCase()
    const result: MentionOption[] = []

    // Team groups
    if (hasPermission('send_team_mention')) {
      TEAM_GROUPS.forEach((team) => {
        if (team.toLowerCase().includes(q)) {
          result.push({
            type: 'team',
            label: `@${team}`,
            insertValue: `@${team}`,
            team,
          })
        }
      })
    }

    // Office groups
    if (hasPermission('send_team_mention')) {
      OFFICE_GROUPS.forEach((office) => {
        if (office.toLowerCase().includes(q)) {
          result.push({
            type: 'team',
            label: `@${office}`,
            insertValue: `@${office}`,
            team: office,
          })
        }
      })
    }

    // @Everyone
    if (hasPermission('send_everyone_mention') && 'everyone'.includes(q)) {
      result.push({
        type: 'everyone',
        label: '@Everyone',
        insertValue: '@Everyone',
      })
    }

    // Individual agents
    members
      .filter((a) => a.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((agent) => {
        result.push({
          type: 'agent',
          label: agent.name,
          insertValue: `@${agent.name}`,
          agent,
        })
      })

    return result
  }, [query, members, hasPermission])

  // Reset selection on options change
  useEffect(() => {
    setActiveIndex(0)
  }, [options.length])

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((prev) => (prev + 1) % options.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((prev) => (prev - 1 + options.length) % options.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (options[activeIndex]) {
          onSelect(options[activeIndex].insertValue)
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [options, activeIndex, onSelect, onClose])

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (options.length === 0) return null

  return (
    <div
      className="fixed z-50 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden min-w-[240px] max-w-[300px]"
      style={{
        bottom: `calc(100vh - ${position.top}px)`,
        left: position.left,
      }}
    >
      <div className="px-3 py-2 border-b border-slate-100">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          Mention someone
        </p>
      </div>
      <div ref={listRef} className="max-h-[240px] overflow-y-auto py-1">
        {options.map((opt, idx) => (
          <button
            key={opt.insertValue}
            onClick={() => onSelect(opt.insertValue)}
            onMouseEnter={() => setActiveIndex(idx)}
            className={cn(
              'w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors text-left',
              idx === activeIndex ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
            )}
          >
            {opt.type === 'agent' && opt.agent ? (
              <>
                <div className="relative shrink-0">
                  <div
                    className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold',
                      getAvatarColor(opt.agent.name)
                    )}
                  >
                    {opt.agent.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5">
                    <UserPresenceBadge status={opt.agent.presence} size="sm" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{opt.agent.name}</p>
                </div>
                <span className="text-[11px] text-slate-400 shrink-0">{opt.agent.team}</span>
              </>
            ) : opt.type === 'team' ? (
              <>
                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                  <span className="text-[11px] font-bold text-blue-600">#</span>
                </div>
                <span className="font-medium">{opt.label}</span>
                <span className="text-[11px] text-slate-400 ml-auto">Team</span>
              </>
            ) : (
              <>
                <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <span className="text-xs">📢</span>
                </div>
                <span className="font-medium">{opt.label}</span>
                <span className="text-[11px] text-slate-400 ml-auto">All</span>
              </>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
