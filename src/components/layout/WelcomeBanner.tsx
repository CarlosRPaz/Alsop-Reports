"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Sparkles, X, MessageSquare } from "lucide-react"
import { useChat } from "@/lib/chat/chatContext"

const STORAGE_KEY = "alsop_welcome_announcement_v1"

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
      className="relative z-20 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 dark:from-amber-700 dark:via-orange-700 dark:to-amber-800 text-white shadow-sm border-b border-amber-400/30 no-print transition-all duration-300 animate-in fade-in slide-in-from-top-2"
    >
      {/* Warm ambient background glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/20 via-transparent to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-3.5 relative flex flex-col md:flex-row items-start md:items-center justify-between gap-3 md:gap-6">
        
        {/* Left side: Warm Icon + Copy */}
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center shrink-0 shadow-inner mt-0.5 sm:mt-0">
            <Sparkles className="w-5 h-5 text-amber-100 animate-pulse" />
          </div>

          <div className="text-sm">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white tracking-tight text-base sm:text-sm">
                {firstName ? `Welcome, ${firstName}! 👋` : "Welcome! 👋"}
              </span>
            </div>
            <p className="text-amber-50/95 text-xs sm:text-sm mt-0.5 leading-snug">
              Excited to have you here! Explore your stats, connect in team channels, and please share any feedback or ideas—we&apos;d love your thoughts!
            </p>
          </div>
        </div>

        {/* Right side: Quick Action CTA to #All channel + Dismiss button */}
        <div className="flex items-center gap-2 self-end md:self-center shrink-0 w-full sm:w-auto justify-end">
          <Link
            href="/communication?channel=All"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 active:bg-white/40 text-white text-xs font-semibold backdrop-blur-md border border-white/30 transition-all shadow-sm group"
          >
            <MessageSquare className="w-3.5 h-3.5 text-amber-100 group-hover:scale-110 transition-transform" />
            <span>Say Hello in #All</span>
          </Link>

          <button
            onClick={handleDismiss}
            aria-label="Dismiss welcome announcement"
            className="inline-flex items-center justify-center p-1.5 rounded-lg text-amber-100 hover:text-white hover:bg-white/20 active:bg-white/30 transition-colors cursor-pointer"
            title="Dismiss announcement"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  )
}

