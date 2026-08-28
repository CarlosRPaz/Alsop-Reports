'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Search,
  X,
  Sparkles,
  PartyPopper,
  ThumbsUp,
  Flame,
  Smile,
  HelpCircle,
  TrendingUp,
  DollarSign,
  Coffee,
  Loader2
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface GifItem {
  id: string
  title: string
  url: string
  previewUrl: string
  width?: number
  height?: number
}

const CATEGORY_CHIPS = [
  { label: 'Trending', query: '', icon: TrendingUp },
  { label: 'Celebrate', query: 'celebrate win party', icon: PartyPopper },
  { label: 'Thumbs Up', query: 'thumbs up yes agree', icon: ThumbsUp },
  { label: 'Sales / Deals', query: 'money deal closed sales', icon: DollarSign },
  { label: 'Hype', query: 'hype mind blown fire', icon: Flame },
  { label: 'Laugh', query: 'laughing lol funny', icon: Smile },
  { label: 'Work', query: 'coffee typing busy work', icon: Coffee },
  { label: 'Thinking', query: 'confused thinking what', icon: HelpCircle },
]

interface GifPickerProps {
  onSelect: (gifUrl: string) => void
  onClose: () => void
}

export default function GifPicker({ onSelect, onClose }: GifPickerProps) {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('Trending')
  const [gifs, setGifs] = useState<GifItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const fetchGifs = useCallback(async (query: string) => {
    setIsLoading(true)
    try {
      const url = query.trim()
        ? `/api/chat/gifs?q=${encodeURIComponent(query.trim())}&limit=30`
        : `/api/chat/gifs?limit=30`

      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setGifs(data.gifs || [])
      } else {
        setGifs([])
      }
    } catch (err) {
      console.error('Failed to load GIFs:', err)
      setGifs([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Initial load: trending GIFs
  useEffect(() => {
    fetchGifs('')
  }, [fetchGifs])

  // Debounced search
  const handleSearchChange = (val: string) => {
    setSearch(val)
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)

    if (val.trim()) {
      setActiveCategory('')
      debounceTimerRef.current = setTimeout(() => {
        fetchGifs(val)
      }, 350)
    } else {
      setActiveCategory('Trending')
      debounceTimerRef.current = setTimeout(() => {
        fetchGifs('')
      }, 200)
    }
  }

  const handleCategoryClick = (categoryLabel: string, query: string) => {
    setActiveCategory(categoryLabel)
    setSearch('')
    fetchGifs(query)
  }

  return (
    <div
      className="absolute bottom-full right-0 mb-2 w-80 sm:w-96 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl z-40 animate-in fade-in zoom-in-95 duration-100"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
        <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs uppercase tracking-wider">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-pink-500 text-white text-[10px] font-extrabold shadow-xs">
            GIF
          </span>
          <span>Search GIFs</span>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Search Input */}
      <div className="relative mt-2">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Search thousands of GIFs..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          autoFocus
          className="h-8.5 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs placeholder:text-slate-400 focus:border-pink-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-pink-500 transition-colors"
        />
        {search && (
          <button
            onClick={() => handleSearchChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-1 overflow-x-auto py-2 no-scrollbar">
        {CATEGORY_CHIPS.map((cat) => {
          const Icon = cat.icon
          const isActive = activeCategory === cat.label
          return (
            <button
              key={cat.label}
              onClick={() => handleCategoryClick(cat.label, cat.query)}
              className={cn(
                'flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap transition-all cursor-pointer',
                isActive
                  ? 'bg-pink-100 text-pink-700 shadow-xs ring-1 ring-pink-200'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              )}
            >
              <Icon className="h-3 w-3" />
              <span>{cat.label}</span>
            </button>
          )
        })}
      </div>

      {/* GIF Masonry Grid */}
      <div className="relative max-h-64 min-h-[160px] overflow-y-auto pr-1">
        {isLoading ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin text-pink-500" />
            <span className="text-xs">Finding GIFs...</span>
          </div>
        ) : gifs.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-1 text-center text-slate-400 px-4">
            <p className="text-xs font-semibold text-slate-600">No GIFs found</p>
            <p className="text-[11px]">Try searching for something else like "win", "high five", or "cheers"</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {gifs.map((gif) => (
              <button
                key={gif.id}
                onClick={() => onSelect(gif.url)}
                className="group relative flex h-28 w-full overflow-hidden rounded-lg border border-slate-100 bg-slate-100 hover:border-pink-500 hover:shadow-md transition-all cursor-pointer"
              >
                <img
                  src={gif.previewUrl || gif.url}
                  alt={gif.title}
                  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1.5">
                  <span className="text-[10px] font-semibold text-white truncate w-full text-left">
                    {gif.title || 'Send GIF'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
        <span>Click any GIF to insert instantly</span>
        <span className="font-semibold tracking-wider text-slate-300">POWERED BY GIPHY</span>
      </div>
    </div>
  )
}
