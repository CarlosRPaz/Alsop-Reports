"use client"

import { usePathname } from "next/navigation"
import { Sidebar } from "@/components/layout/Sidebar"

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
    <>
      <Sidebar />
      <div className="flex-1 overflow-x-hidden">
        {children}
      </div>
    </>
  )
}
