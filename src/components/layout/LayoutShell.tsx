"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { Sidebar } from "@/components/layout/Sidebar"
import { ToastProvider } from "@/components/ui/Toast"
import { TabBadge } from "@/components/layout/TabBadge"
import { Breadcrumbs } from "@/components/layout/Breadcrumbs"
import { ErrorBoundary } from "@/components/layout/ErrorBoundary"
import { ChatProvider } from "@/lib/chat/chatContext"

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isLoginPage = pathname === "/login"

  useEffect(() => {
    const applyTheme = () => {
      const isDark = localStorage.getItem("dsr_theme") === "dark"
      if (isDark) {
        document.documentElement.classList.add("dark")
      } else {
        document.documentElement.classList.remove("dark")
      }
    }
    
    applyTheme()
    window.addEventListener("theme-change", applyTheme)
    return () => window.removeEventListener("theme-change", applyTheme)
  }, [])

  if (isLoginPage) {
    return (
      <div className="min-h-screen w-full">
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </div>
    )
  }

  return (
    <ChatProvider>
      <ToastProvider>
        <TabBadge />
        <Sidebar />
        <div className="flex-1 overflow-x-hidden flex flex-col min-h-screen">
          <Breadcrumbs />
          <div className="flex-1">
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </div>
        </div>
      </ToastProvider>
    </ChatProvider>
  )
}
