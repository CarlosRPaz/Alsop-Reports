'use client'

import { cn } from '@/lib/utils'

interface UserPresenceBadgeProps {
  status: 'online' | 'away' | 'busy' | 'offline'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const STATUS_COLORS: Record<UserPresenceBadgeProps['status'], string> = {
  online: 'bg-emerald-500',
  away: 'bg-amber-500',
  busy: 'bg-red-500',
  offline: 'bg-slate-300',
}

const SIZE_CLASSES: Record<NonNullable<UserPresenceBadgeProps['size']>, string> = {
  sm: 'w-2 h-2 ring-[1.5px]',
  md: 'w-2.5 h-2.5 ring-[1.5px]',
  lg: 'w-3 h-3 ring-2',
}

export default function UserPresenceBadge({
  status,
  size = 'md',
  className,
}: UserPresenceBadgeProps) {
  return (
    <span
      className={cn(
        'inline-block rounded-full ring-white shrink-0',
        STATUS_COLORS[status],
        SIZE_CLASSES[size],
        className
      )}
      title={status.charAt(0).toUpperCase() + status.slice(1)}
    />
  )
}
