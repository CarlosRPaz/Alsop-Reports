'use client'

import React, { useState, useMemo } from 'react'
import { Search, X, Sparkles, ThumbsUp, PartyPopper, Smile, Flame, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface GifItem {
  id: string
  title: string
  url: string
  category: string
  keywords: string[]
}

const POPULAR_GIFS: GifItem[] = [
  // Celebrate / Wins
  {
    id: 'cel-1',
    title: 'Celebrate Confetti',
    url: 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif',
    category: 'Celebrate',
    keywords: ['celebrate', 'party', 'win', 'woohoo', 'yay', 'congrats', 'confetti']
  },
  {
    id: 'cel-2',
    title: 'Leo Cheers',
    url: 'https://media.giphy.com/media/GCLlQnV7dXY2KGmpBR/giphy.gif',
    category: 'Celebrate',
    keywords: ['cheers', 'toast', 'gatsby', 'congrats', 'win', 'good job']
  },
  {
    id: 'cel-3',
    title: 'Minion Celebrate',
    url: 'https://media.giphy.com/media/mPOGx4hJtOWSA/giphy.gif',
    category: 'Celebrate',
    keywords: ['minion', 'happy', 'dance', 'yay', 'party']
  },
  {
    id: 'cel-4',
    title: 'Kobe High Five',
    url: 'https://media.giphy.com/media/l41lOELnZme0rZTig/giphy.gif',
    category: 'Celebrate',
    keywords: ['high five', 'team', 'kobe', 'win', 'great']
  },

  // Thumbs Up / Yes
  {
    id: 'tu-1',
    title: 'Thumbs Up Chuck Norris',
    url: 'https://media.giphy.com/media/111ebonMs90YLu/giphy.gif',
    category: 'Yes',
    keywords: ['thumbs up', 'approve', 'yes', 'ok', 'good', 'nice']
  },
  {
    id: 'tu-2',
    title: 'Nod of Approval',
    url: 'https://media.giphy.com/media/NEvPzZ8bd1V4Y/giphy.gif',
    category: 'Yes',
    keywords: ['nod', 'yes', 'approve', 'agree', 'indeed']
  },
  {
    id: 'tu-3',
    title: 'Steve Carell Yes',
    url: 'https://media.giphy.com/media/5wWf7H0qoWaNnkZBucU/giphy.gif',
    category: 'Yes',
    keywords: ['yes', 'the office', 'excited', 'sweet', 'awesome']
  },
  {
    id: 'tu-4',
    title: 'Obama Mic Drop',
    url: 'https://media.giphy.com/media/3o7qDSOvfaCO9b3MlO/giphy.gif',
    category: 'Yes',
    keywords: ['mic drop', 'boom', 'done', 'closed', 'nailed it']
  },

  // Fire / Sales
  {
    id: 'fire-1',
    title: 'Elmo Fire',
    url: 'https://media.giphy.com/media/yr7n0u3qzO9nG/giphy.gif',
    category: 'Hype',
    keywords: ['fire', 'lit', 'elmo', 'hot', 'crazy', 'hype']
  },
  {
    id: 'fire-2',
    title: 'Make it Rain Cash',
    url: 'https://media.giphy.com/media/67ThRZlYBvibtdF9JH/giphy.gif',
    category: 'Hype',
    keywords: ['money', 'cash', 'deal', 'sales', 'rain', 'rich', 'closed']
  },
  {
    id: 'fire-3',
    title: 'Mind Blown',
    url: 'https://media.giphy.com/media/xT0xeJpnrWC4XWblEk/giphy.gif',
    category: 'Hype',
    keywords: ['mind blown', 'whoa', 'galaxy', 'boom', 'insane']
  },
  {
    id: 'fire-4',
    title: 'Applause Clapping',
    url: 'https://media.giphy.com/media/ytTYwIlOfAE6Y/giphy.gif',
    category: 'Hype',
    keywords: ['applause', 'clapping', 'bravo', 'great job', 'kudos']
  },

  // Laugh / Fun
  {
    id: 'fun-1',
    title: 'Laughing Dog',
    url: 'https://media.giphy.com/media/10JhviFuU2gWD6/giphy.gif',
    category: 'Fun',
    keywords: ['laugh', 'lol', 'funny', 'haha', 'rofl', 'crying']
  },
  {
    id: 'fun-2',
    title: 'Popcorn Eating',
    url: 'https://media.giphy.com/media/gl0mkIZOW6Nwc/giphy.gif',
    category: 'Fun',
    keywords: ['popcorn', 'watching', 'drama', 'eating', 'show']
  },
  {
    id: 'fun-3',
    title: 'Dancing Carlton',
    url: 'https://media.giphy.com/media/pa37AAGzKXoek/giphy.gif',
    category: 'Fun',
    keywords: ['carlton', 'dance', 'happy', 'groove', 'fresh prince']
  },
  {
    id: 'fun-4',
    title: 'Dog Typing Fast',
    url: 'https://media.giphy.com/media/unQ3IJU2RG7DO/giphy.gif',
    category: 'Fun',
    keywords: ['typing', 'working', 'busy', 'computer', 'fast']
  },

  // Thinking / Confused
  {
    id: 'think-1',
    title: 'Math Lady Confused',
    url: 'https://media.giphy.com/media/WRQBXSCnEFJIuxktnw/giphy.gif',
    category: 'Thinking',
    keywords: ['confused', 'math', 'calculating', 'what', 'hmm']
  },
  {
    id: 'think-2',
    title: 'John Travolta Lost',
    url: 'https://media.giphy.com/media/g01ZnwAUvutuK8GIQn/giphy.gif',
    category: 'Thinking',
    keywords: ['travolta', 'lost', 'where', 'confused', 'pulp fiction']
  },
  {
    id: 'think-3',
    title: 'Waiting Skeleton',
    url: 'https://media.giphy.com/media/QPQ3xlJhqR1BXl89RG/giphy.gif',
    category: 'Thinking',
    keywords: ['waiting', 'skeleton', 'forever', 'still waiting', 'slow']
  },
  {
    id: 'think-4',
    title: 'Side Eye Dog',
    url: 'https://media.giphy.com/media/H5C8CevNMbpBqNqFjl/giphy.gif',
    category: 'Thinking',
    keywords: ['side eye', 'awkward', 'puppet', 'suspicious', 'oops']
  },
]

const CATEGORIES = [
  { label: 'All', icon: Sparkles },
  { label: 'Celebrate', icon: PartyPopper },
  { label: 'Yes', icon: ThumbsUp },
  { label: 'Hype', icon: Flame },
  { label: 'Fun', icon: Smile },
  { label: 'Thinking', icon: HelpCircle },
]

interface GifPickerProps {
  onSelect: (gifUrl: string) => void
  onClose: () => void
}

export default function GifPicker({ onSelect, onClose }: GifPickerProps) {
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')

  const filteredGifs = useMemo(() => {
    return POPULAR_GIFS.filter(g => {
      if (selectedCategory !== 'All' && g.category !== selectedCategory) return false
      if (search) {
        const q = search.toLowerCase().trim()
        return (
          g.title.toLowerCase().includes(q) ||
          g.keywords.some(k => k.includes(q))
        )
      }
      return true
    })
  }, [search, selectedCategory])

  return (
    <div
      className="absolute bottom-full right-0 mb-2 w-80 sm:w-96 rounded-xl border border-slate-200 bg-white p-3 shadow-xl z-30 animate-in fade-in zoom-in-95 duration-100"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
        <div className="flex items-center gap-1.5 font-semibold text-slate-800 text-xs uppercase tracking-wider">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-pink-100 text-pink-600 text-[10px] font-bold">
            GIF
          </span>
          <span>Choose a GIF</span>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative mt-2">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <input
          type="text"
          placeholder="Search GIFs (e.g. win, cheers, laugh)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
          className="h-8 w-full rounded-md border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs placeholder:text-slate-400 focus:border-pink-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-pink-500 transition-colors"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
            <X className="h-3 w-3 text-slate-400 hover:text-slate-600" />
          </button>
        )}
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-1 overflow-x-auto py-2 no-scrollbar">
        {CATEGORIES.map(cat => {
          const Icon = cat.icon
          return (
            <button
              key={cat.label}
              onClick={() => setSelectedCategory(cat.label)}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer",
                selectedCategory === cat.label
                  ? "bg-pink-50 text-pink-700 border border-pink-200 font-semibold"
                  : "bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700 border border-transparent"
              )}
            >
              <Icon className="h-2.5 w-2.5" />
              <span>{cat.label}</span>
            </button>
          )
        })}
      </div>

      {/* GIF Grid */}
      <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
        {filteredGifs.length === 0 ? (
          <div className="col-span-2 py-8 text-center text-xs text-slate-400">
            No GIFs found. Try searching for "win", "yes", or "fire".
          </div>
        ) : (
          filteredGifs.map(gif => (
            <button
              key={gif.id}
              onClick={() => onSelect(gif.url)}
              className="group relative flex h-24 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100 hover:border-pink-500 hover:shadow-xs transition-all cursor-pointer"
            >
              <img
                src={gif.url}
                alt={gif.title}
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1.5">
                <span className="text-[10px] font-medium text-white truncate w-full text-left">
                  {gif.title}
                </span>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Tip footer */}
      <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-400 text-center">
        💡 Tip: You can also use <kbd className="font-mono bg-slate-100 px-1 rounded">Win + .</kbd> to paste GIFs directly!
      </div>
    </div>
  )
}
