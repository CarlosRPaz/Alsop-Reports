"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Sparkles, X, MessageSquare } from "lucide-react"
import { useChat } from "@/lib/chat/chatContext"

const STORAGE_KEY = "alsop_welcome_announcement_v3"

export function WelcomeBanner() {
  const [isVisible, setIsVisible] = useState(false)
  const [mounted, setMounted] = useState(false)
  const { currentAgent } = useChat()

  useEffect(() => {
    setMounted(true)
    const isDismissed = localStorage.getItem(STORAGE_KEY)
    if (!isDismissed) {
      setIsVisible(true)
    }
  }, [])

  const handleDismiss = () => {
    setIsVisible(false)
    try {
      localStorage.setItem(STORAGE_KEY, "true")
    } catch {
      // ignore storage errors
    }
  }

  if (!mounted || !isVisible) {
    return null
  }

  // Get first name if available
  const firstName = currentAgent?.name?.trim().split(" ")[0]

  return (
    <div
      role="region"
      aria-label="Welcome announcement"
      className="relative z-0 bg-gradient-to-r from-amber-50 via-orange-50/80 to-amber-50/90 dark:from-amber-950/30 dark:via-slate-900 dark:to-amber-950/30 text-slate-800 dark:text-slate-200 shadow-xs border-b border-amber-200/80 dark:border-amber-900/40 no-print transition-all duration-300 animate-in fade-in slide-in-from-top-2"
    >
      {/* Soft warm ambient glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-200/25 via-transparent to-transparent pointer-events-none dark:from-amber-500/10" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-3.5 relative flex flex-col md:flex-row items-start md:items-center justify-between gap-3 md:gap-6">
        
        {/* Left side: Soft Pastel Icon + High-contrast Copy */}
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/70 flex items-center justify-center shrink-0 shadow-xs mt-0.5 sm:mt-0">
            <Sparkles className="w-4.5 h-4.5" />
          </div>

          <div className="text-sm">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 dark:text-slate-100 tracking-tight text-sm sm:text-base">
                {firstName ? `Welcome, ${firstName}! 👋` : "Welcome! 👋"}
              </span>
            </div>
            <p className="text-slate-600 dark:text-slate-300 text-xs sm:text-sm mt-0.5 leading-snug">
              Excited to have you here! Explore your stats, connect in team channels, and please share any feedback or ideas—we&apos;d love your thoughts!
            </p>
          </div>
        </div>

        {/* Right side: Quick Action CTA to #All channel + Dismiss button */}
        <div className="flex items-center gap-2 self-end md:self-center shrink-0 w-full sm:w-auto justify-end">
          <Link
            href="/communication?channel=All"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-xs font-semibold shadow-xs transition-colors group"
          >
            <MessageSquare className="w-3.5 h-3.5 text-amber-100 group-hover:scale-110 transition-transform" />
            <span>Say Hello in #All</span>
          </Link>

          <button
            onClick={handleDismiss}
            aria-label="Dismiss welcome announcement"
            className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-amber-100/70 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-amber-950/50 transition-colors cursor-pointer"
            title="Dismiss announcement"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  )
}

