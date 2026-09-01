import { cn } from "@/lib/utils"
import Image from "next/image"

const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-indigo-500',
  'bg-violet-500',
  'bg-fuchsia-500',
  'bg-pink-500',
  'bg-rose-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-green-500',
  'bg-emerald-500',
  'bg-teal-500',
]

export function getAvatarColor(name: string): string {
  if (!name) return 'bg-slate-500'
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

interface AvatarProps {
  name: string
  url?: string | null
  className?: string
  fallbackClassName?: string
}

export function Avatar({ name, url, className, fallbackClassName }: AvatarProps) {
  if (url) {
    return (
      <Image
        src={url}
        alt={name || 'Avatar'}
        className={cn("rounded-full object-cover shadow-sm bg-white shrink-0", className)}
        width={100}
        height={100}
      />
    )
  }

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center text-white font-bold shrink-0',
        getAvatarColor(name),
        fallbackClassName || className
      )}
    >
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  )
}
