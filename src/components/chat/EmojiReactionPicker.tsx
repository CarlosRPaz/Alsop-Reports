"use client"

import React, { useState, useMemo, useRef, useEffect } from "react"
import { Search, Sparkles, Smile, HandMetal, PartyPopper, Hash, X, Plus } from "lucide-react"
import { cn } from "@/lib/utils"

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '🔥', '🎉', '👏', '👀', '🙏']

interface EmojiCategory {
  id: string
  name: string
  icon: React.ReactNode
  emojis: { emoji: string; keywords: string[] }[]
}

const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'popular',
    name: 'Popular',
    icon: <Sparkles className="w-3.5 h-3.5" />,
    emojis: [
      { emoji: '👍', keywords: ['thumbs up', 'like', 'agree', 'yes', 'ok', 'good'] },
      { emoji: '👎', keywords: ['thumbs down', 'dislike', 'no'] },
      { emoji: '❤️', keywords: ['heart', 'love', 'like'] },
      { emoji: '🔥', keywords: ['fire', 'lit', 'hot', 'amazing'] },
      { emoji: '😂', keywords: ['laugh', 'joy', 'lol', 'funny', 'haha'] },
      { emoji: '🤣', keywords: ['rofl', 'rolling', 'laugh'] },
      { emoji: '🥳', keywords: ['party', 'celebrate', 'woo'] },
      { emoji: '🎉', keywords: ['tada', 'party', 'celebrate', 'congrats'] },
      { emoji: '👏', keywords: ['clap', 'applause', 'bravo'] },
      { emoji: '🙌', keywords: ['hands', 'hooray', 'celebrate'] },
      { emoji: '🙏', keywords: ['pray', 'please', 'thanks', 'thank you'] },
      { emoji: '💯', keywords: ['100', 'hundred', 'perfect', 'score'] },
      { emoji: '🚀', keywords: ['rocket', 'launch', 'fast', 'ship'] },
      { emoji: '👀', keywords: ['eyes', 'look', 'see', 'watching'] },
      { emoji: '💡', keywords: ['idea', 'lightbulb', 'smart'] },
      { emoji: '✨', keywords: ['sparkles', 'magic', 'clean', 'shiny'] },
      { emoji: '⭐', keywords: ['star', 'favorite'] },
      { emoji: '🤝', keywords: ['handshake', 'deal', 'agree'] },
      { emoji: '💪', keywords: ['muscle', 'strong', 'flex', 'work'] },
      { emoji: '😎', keywords: ['cool', 'sunglasses', 'chill'] },
      { emoji: '🎯', keywords: ['target', 'hit', 'bullseye', 'goal'] },
      { emoji: '🤩', keywords: ['star eyes', 'excited', 'wow'] },
      { emoji: '💖', keywords: ['sparkling heart', 'love'] },
      { emoji: '🏆', keywords: ['trophy', 'win', 'winner', 'first'] },
    ],
  },
  {
    id: 'smileys',
    name: 'Smileys',
    icon: <Smile className="w-3.5 h-3.5" />,
    emojis: [
      { emoji: '😀', keywords: ['grinning', 'smile', 'happy'] },
      { emoji: '😃', keywords: ['smiley', 'happy', 'joy'] },
      { emoji: '😄', keywords: ['smile', 'happy', 'laugh'] },
      { emoji: '😁', keywords: ['grin', 'smile'] },
      { emoji: '😆', keywords: ['laughing', 'satisfied'] },
      { emoji: '😅', keywords: ['sweat smile', 'relief'] },
      { emoji: '🤣', keywords: ['rofl', 'rolling laugh'] },
      { emoji: '😂', keywords: ['joy', 'tears laugh', 'lol'] },
      { emoji: '🙂', keywords: ['slight smile'] },
      { emoji: '🙃', keywords: ['upside down', 'silly'] },
      { emoji: '😉', keywords: ['wink'] },
      { emoji: '😊', keywords: ['blush', 'warm smile'] },
      { emoji: '😇', keywords: ['angel', 'halo', 'innocent'] },
      { emoji: '🥰', keywords: ['love hearts', 'adore'] },
      { emoji: '😍', keywords: ['heart eyes', 'love'] },
      { emoji: '🤩', keywords: ['star struck', 'excited'] },
      { emoji: '😘', keywords: ['blow kiss', 'love'] },
      { emoji: '😋', keywords: ['yum', 'delicious', 'tongue'] },
      { emoji: '😛', keywords: ['tongue out'] },
      { emoji: '😜', keywords: ['wink tongue'] },
      { emoji: '🤪', keywords: ['zany', 'crazy'] },
      { emoji: '🤫', keywords: ['shh', 'quiet', 'secret'] },
      { emoji: '🤔', keywords: ['thinking', 'wonder', 'hmm'] },
      { emoji: '🤨', keywords: ['raised eyebrow', 'skeptical'] },
      { emoji: '😐', keywords: ['neutral', 'meh'] },
      { emoji: '😑', keywords: ['expressionless', 'unimpressed'] },
      { emoji: '😶', keywords: ['no mouth', 'silent'] },
      { emoji: '🙄', keywords: ['roll eyes', 'eyeroll'] },
      { emoji: '😬', keywords: ['grimace', 'awkward'] },
      { emoji: '😮', keywords: ['open mouth', 'surprised', 'wow'] },
      { emoji: '😴', keywords: ['sleeping', 'zzz', 'tired'] },
      { emoji: '🤤', keywords: ['drooling'] },
      { emoji: '🤯', keywords: ['mind blown', 'exploding head'] },
      { emoji: '😎', keywords: ['cool', 'sunglasses'] },
      { emoji: '🤓', keywords: ['nerd', 'glasses', 'geek'] },
      { emoji: '🧐', keywords: ['monocle', 'curious'] },
      { emoji: '😢', keywords: ['crying', 'sad'] },
      { emoji: '😭', keywords: ['sob', 'crying hard'] },
      { emoji: '😱', keywords: ['scream', 'shocked', 'scared'] },
      { emoji: '😡', keywords: ['rage', 'angry', 'mad'] },
      { emoji: '🤠', keywords: ['cowboy', 'yeehaw'] },
      { emoji: '🤖', keywords: ['robot', 'bot', 'ai'] },
      { emoji: '💀', keywords: ['skull', 'dead', 'dying'] },
      { emoji: '💩', keywords: ['poop', 'hankey'] },
      { emoji: '🤡', keywords: ['clown', 'fool'] },
      { emoji: '👻', keywords: ['ghost', 'spooky'] },
    ],
  },
  {
    id: 'people',
    name: 'Hands & People',
    icon: <HandMetal className="w-3.5 h-3.5" />,
    emojis: [
      { emoji: '👍', keywords: ['thumbs up', 'approve'] },
      { emoji: '👎', keywords: ['thumbs down', 'disagree'] },
      { emoji: '👊', keywords: ['fist bump', 'punch'] },
      { emoji: '✊', keywords: ['raised fist', 'power'] },
      { emoji: '🤛', keywords: ['left fist bump'] },
      { emoji: '🤜', keywords: ['right fist bump'] },
      { emoji: '👏', keywords: ['clapping', 'bravo'] },
      { emoji: '🙌', keywords: ['raising hands', 'praise'] },
      { emoji: '👐', keywords: ['open hands'] },
      { emoji: '🤲', keywords: ['palms up'] },
      { emoji: '🤝', keywords: ['handshake', 'deal'] },
      { emoji: '🙏', keywords: ['folded hands', 'thanks'] },
      { emoji: '✍️', keywords: ['writing', 'taking notes'] },
      { emoji: '🤳', keywords: ['selfie'] },
      { emoji: '💪', keywords: ['muscle', 'strength'] },
      { emoji: '👈', keywords: ['point left'] },
      { emoji: '👉', keywords: ['point right'] },
      { emoji: '👆', keywords: ['point up'] },
      { emoji: '👇', keywords: ['point down'] },
      { emoji: '☝️', keywords: ['index up', 'one'] },
      { emoji: '✌️', keywords: ['peace', 'victory', 'two'] },
      { emoji: '🤞', keywords: ['fingers crossed', 'luck'] },
      { emoji: '🖖', keywords: ['vulcan', 'spock'] },
      { emoji: '🤘', keywords: ['rock on', 'metal'] },
      { emoji: '🤙', keywords: ['call me', 'shaka'] },
      { emoji: '🖐️', keywords: ['hand splayed', 'five'] },
      { emoji: '✋', keywords: ['raised hand', 'stop', 'high five'] },
      { emoji: '👌', keywords: ['ok hand', 'perfect'] },
      { emoji: '🤌', keywords: ['pinched fingers', 'italian'] },
      { emoji: '🤏', keywords: ['pinching hand', 'small'] },
      { emoji: '👋', keywords: ['wave', 'hello', 'bye'] },
      { emoji: '🫡', keywords: ['salute', 'yes sir'] },
      { emoji: '🫶', keywords: ['heart hands'] },
      { emoji: '🫂', keywords: ['hug', 'people hugging'] },
      { emoji: '🧑‍💻', keywords: ['technologist', 'coder', 'developer'] },
      { emoji: '🕵️', keywords: ['detective', 'investigate'] },
    ],
  },
  {
    id: 'celebration',
    name: 'Celebration & Fun',
    icon: <PartyPopper className="w-3.5 h-3.5" />,
    emojis: [
      { emoji: '🎉', keywords: ['party popper', 'tada'] },
      { emoji: '🎊', keywords: ['confetti ball'] },
      { emoji: '🎈', keywords: ['balloon'] },
      { emoji: '🎁', keywords: ['gift', 'present'] },
      { emoji: '🏆', keywords: ['trophy', 'winner'] },
      { emoji: '🥇', keywords: ['gold medal', 'first'] },
      { emoji: '🥈', keywords: ['silver medal', 'second'] },
      { emoji: '🥉', keywords: ['bronze medal', 'third'] },
      { emoji: '🎯', keywords: ['direct hit', 'bullseye'] },
      { emoji: '🚀', keywords: ['rocket', 'takeoff'] },
      { emoji: '💡', keywords: ['lightbulb', 'idea'] },
      { emoji: '🔔', keywords: ['bell', 'alert'] },
      { emoji: '📢', keywords: ['loudspeaker', 'announcement'] },
      { emoji: '📣', keywords: ['megaphone'] },
      { emoji: '💥', keywords: ['boom', 'collision'] },
      { emoji: '⚡', keywords: ['lightning', 'fast', 'zap'] },
      { emoji: '✨', keywords: ['sparkles'] },
      { emoji: '🌟', keywords: ['glowing star'] },
      { emoji: '⭐', keywords: ['white medium star'] },
      { emoji: '💯', keywords: ['hundred points'] },
      { emoji: '🔥', keywords: ['fire', 'flame'] },
      { emoji: '👑', keywords: ['crown', 'king', 'queen'] },
      { emoji: '💎', keywords: ['gem stone', 'diamond'] },
      { emoji: '💰', keywords: ['money bag', 'cash', 'wealth'] },
      { emoji: '💵', keywords: ['dollar', 'bill'] },
      { emoji: '🍕', keywords: ['pizza', 'food'] },
      { emoji: '🍔', keywords: ['hamburger', 'burger'] },
      { emoji: '🌮', keywords: ['taco'] },
      { emoji: '🍻', keywords: ['clinking beer mugs', 'cheers'] },
      { emoji: '🥂', keywords: ['clinking glasses', 'champagne'] },
      { emoji: '☕', keywords: ['coffee', 'tea'] },
      { emoji: '🍿', keywords: ['popcorn', 'movie'] },
      { emoji: '🎂', keywords: ['birthday cake'] },
      { emoji: '🍾', keywords: ['popping champagne'] },
    ],
  },
  {
    id: 'symbols',
    name: 'Symbols & Status',
    icon: <Hash className="w-3.5 h-3.5" />,
    emojis: [
      { emoji: '✅', keywords: ['check mark', 'done', 'approved'] },
      { emoji: '❌', keywords: ['cross mark', 'x', 'cancel', 'no'] },
      { emoji: '⚠️', keywords: ['warning', 'caution'] },
      { emoji: '❓', keywords: ['question mark'] },
      { emoji: '❗', keywords: ['exclamation mark'] },
      { emoji: '💬', keywords: ['speech balloon', 'comment'] },
      { emoji: '💭', keywords: ['thought balloon'] },
      { emoji: '🟢', keywords: ['green circle', 'online'] },
      { emoji: '🟡', keywords: ['yellow circle', 'away'] },
      { emoji: '🔴', keywords: ['red circle', 'busy'] },
      { emoji: '🔵', keywords: ['blue circle'] },
      { emoji: '🟣', keywords: ['purple circle'] },
      { emoji: '⚪', keywords: ['white circle'] },
      { emoji: '⚫', keywords: ['black circle', 'offline'] },
      { emoji: '⏳', keywords: ['hourglass', 'time', 'waiting'] },
      { emoji: '⏰', keywords: ['alarm clock', 'time'] },
      { emoji: '📌', keywords: ['pushpin', 'pinned'] },
      { emoji: '📍', keywords: ['round pushpin', 'location'] },
      { emoji: '📝', keywords: ['memo', 'notes', 'doc'] },
      { emoji: '✉️', keywords: ['envelope', 'mail', 'message'] },
      { emoji: '📞', keywords: ['telephone', 'call', 'phone'] },
      { emoji: '💻', keywords: ['laptop', 'computer'] },
      { emoji: '🛡️', keywords: ['shield', 'protect', 'security'] },
      { emoji: '🏁', keywords: ['checkered flag', 'finish'] },
      { emoji: '🛑', keywords: ['stop sign'] },
      { emoji: '🆗', keywords: ['ok button'] },
      { emoji: '🆕', keywords: ['new button'] },
      { emoji: '📈', keywords: ['chart increasing', 'growth', 'sales'] },
      { emoji: '📉', keywords: ['chart decreasing'] },
      { emoji: '📊', keywords: ['bar chart', 'reports'] },
      { emoji: '🔒', keywords: ['locked', 'secure'] },
      { emoji: '🔑', keywords: ['key'] },
    ],
  },
]

interface EmojiReactionPickerProps {
  onSelect: (emoji: string) => void
  onClose: () => void
  align?: 'left' | 'right'
}

export default function EmojiReactionPicker({
  onSelect,
  onClose,
  align = 'right',
}: EmojiReactionPickerProps) {
  const [activeTab, setActiveTab] = useState<string>('popular')
  const [searchQuery, setSearchQuery] = useState('')
  const [showExpanded, setShowExpanded] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (showExpanded && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [showExpanded])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose()
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.toLowerCase().trim()
    const matches: { emoji: string; keywords: string[] }[] = []
    const seen = new Set<string>()

    for (const cat of EMOJI_CATEGORIES) {
      for (const item of cat.emojis) {
        if (!seen.has(item.emoji)) {
          const match =
            item.emoji.includes(q) ||
            item.keywords.some((k) => k.toLowerCase().includes(q))
          if (match) {
            seen.add(item.emoji)
            matches.push(item)
          }
        }
      }
    }
    return matches
  }, [searchQuery])

  const currentCategory = useMemo(() => {
    return EMOJI_CATEGORIES.find((c) => c.id === activeTab) || EMOJI_CATEGORIES[0]
  }, [activeTab])

  return (
    <div
      ref={containerRef}
      className={cn(
        'absolute top-full mt-1.5 z-40 select-none animate-in fade-in zoom-in-95 duration-150',
        align === 'right' ? 'right-0' : 'left-0'
      )}
    >
      {!showExpanded ? (
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-full shadow-lg p-1.5 px-2">
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                onSelect(emoji)
                onClose()
              }}
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 hover:scale-125 transition-all text-base cursor-pointer"
            >
              {emoji}
            </button>
          ))}

          <div className="w-px h-4 bg-slate-200 mx-0.5" />

          <button
            onClick={() => setShowExpanded(true)}
            className="w-7 h-7 flex items-center justify-center rounded-full text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-all cursor-pointer"
            title="More reactions..."
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="w-[300px] sm:w-[320px] bg-white border border-slate-200 rounded-xl shadow-2xl p-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search emojis..."
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all text-slate-800 placeholder:text-slate-400"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {!searchQuery && (
            <div className="flex items-center gap-1 border-b border-slate-100 pb-1.5 overflow-x-auto no-scrollbar">
              {EMOJI_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveTab(cat.id)}
                  title={cat.name}
                  className={cn(
                    'flex items-center justify-center p-1.5 rounded-md text-xs font-medium transition-all cursor-pointer',
                    activeTab === cat.id
                      ? 'bg-blue-50 text-blue-600 shadow-xs'
                      : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                  )}
                >
                  {cat.icon}
                </button>
              ))}
            </div>
          )}

          <div className="h-[200px] overflow-y-auto pr-1">
            {searchQuery ? (
              searchResults.length > 0 ? (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Results ({searchResults.length})
                  </p>
                  <div className="grid grid-cols-7 gap-1">
                    {searchResults.map((item) => (
                      <button
                        key={item.emoji}
                        onClick={() => {
                          onSelect(item.emoji)
                          onClose()
                        }}
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-blue-50 hover:scale-125 transition-all text-lg cursor-pointer select-none"
                        title={item.keywords.join(', ')}
                      >
                        {item.emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                  <p>No matching emojis</p>
                  <button
                    onClick={() => setSearchQuery('')}
                    className="text-blue-600 text-[11px] hover:underline mt-1 cursor-pointer"
                  >
                    Clear search
                  </button>
                </div>
              )
            ) : (
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  {currentCategory.name}
                </p>
                <div className="grid grid-cols-7 gap-1">
                  {currentCategory.emojis.map((item) => (
                    <button
                      key={item.emoji}
                      onClick={() => {
                        onSelect(item.emoji)
                        onClose()
                      }}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-blue-50 hover:scale-125 transition-all text-lg cursor-pointer select-none"
                      title={item.keywords.join(', ')}
                    >
                      {item.emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
