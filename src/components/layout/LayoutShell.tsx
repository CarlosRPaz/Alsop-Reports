"use client"

import { usePathname } from "next/navigation"
import { Sidebar } from "@/components/layout/Sidebar"
import { ToastProvider } from "@/components/ui/Toast"
import { TabBadge } from "@/components/layout/TabBadge"

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isLoginPage = pathname === "/login"

  if (isLoginPage) {
    return (
      <div className="min-h-screen w-full">
        {children}
      </div>
    )
  }

  return (
    <ToastProvider>
      <TabBadge />
      <Sidebar />
      <div className="flex-1 overflow-x-hidden">
        {children}
      </div>
    </ToastProvider>
  )
}
