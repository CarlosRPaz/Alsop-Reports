"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight, Home } from "lucide-react"

const routeMap: Record<string, string> = {
  "reports": "Reports",
  "daily": "Daily Standup",
  "weekly": "Weekly Report",
  "mtd": "MTD Performance",
  "quotes": "Quotes & NB",
  "agent": "Agent Portal",
  "communication": "Communication Hub",
  "admin": "Admin Panel",
  "settings": "Settings"
}

export function Breadcrumbs() {
  const pathname = usePathname()
  
  if (pathname === "/login" || pathname === "/") {
    return null
  }

  const segments = pathname.split("/").filter(Boolean)
  
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 px-8 pt-4 pb-0 text-xs text-slate-500 font-medium no-print">
      <Link 
        href="/" 
        className="flex items-center gap-1 hover:text-blue-600 transition-colors text-slate-400"
      >
        <Home className="w-3.5 h-3.5" />
        <span className="sr-only">Home</span>
      </Link>

      {segments.map((segment, index) => {
        const url = `/${segments.slice(0, index + 1).join("/")}`
        const isLast = index === segments.length - 1
        
        // Handle ID/UUID parameters for agents or details
        let name = routeMap[segment] || segment
        if (segment.match(/^[0-9a-fA-F-]{36}$/)) {
          name = "Agent Details"
        }

        return (
          <div key={url} className="flex items-center gap-1.5">
            <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
            {isLast ? (
              <span className="text-slate-800 font-semibold truncate max-w-[150px]">
                {name}
              </span>
            ) : (
              <Link 
                href={url} 
                className="hover:text-blue-600 transition-colors"
              >
                {name}
              </Link>
            )}
          </div>
        )
      })}
    </nav>
  )
}
