"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { 
  LayoutDashboard, 
  CalendarDays, 
  TrendingUp, 
  MessageSquare, 
  Settings,
  Activity,
  ChevronLeft,
  ChevronRight
} from "lucide-react"

const navItems = [
  { name: 'Overview', href: '/', icon: Activity },
  { name: 'Daily Standup', href: '/reports/daily', icon: CalendarDays },
  { name: 'Weekly Report', href: '/reports/weekly', icon: LayoutDashboard },
  { name: 'MTD Performance', href: '/reports/mtd', icon: TrendingUp },
  { name: 'Communication', href: '/communication', icon: MessageSquare },
  { name: 'Admin Panel', href: '/admin', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <aside 
      className={cn(
        "bg-white border-r border-slate-200 h-screen sticky top-0 hidden md:flex flex-col z-10 transition-all duration-300",
        isExpanded ? "w-64" : "w-16"
      )}
    >
      <div className={cn("p-4 flex items-center", !isExpanded ? "justify-center" : "justify-between")}>
        {isExpanded ? (
          <div>
            <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600 whitespace-nowrap">
              Alsop Reports
            </h2>
            <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider font-semibold whitespace-nowrap">Command Center</p>
          </div>
        ) : (
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center font-bold text-white shrink-0">
            A
          </div>
        )}
      </div>

      <nav className="flex-1 px-2 space-y-1 mt-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
              title={!isExpanded ? item.name : undefined}
              className={cn(
                "flex items-center rounded-lg text-sm font-medium transition-all group overflow-hidden",
                !isExpanded ? "justify-center p-2" : "gap-3 px-3 py-2",
                isActive 
                  ? "bg-blue-50 text-blue-700" 
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              <item.icon className={cn(
                "shrink-0 transition-colors", 
                !isExpanded ? "w-5 h-5" : "w-4 h-4",
                isActive ? "text-blue-600" : "text-slate-500 group-hover:text-slate-700"
              )} />
              {isExpanded && <span className="whitespace-nowrap">{item.name}</span>}
            </Link>
          )
        })}
      </nav>

      <div className="p-2 border-t border-slate-200 flex flex-col gap-1">
        <button 
          title={!isExpanded ? "Settings" : undefined}
          className={cn(
            "flex items-center rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-all",
            !isExpanded ? "justify-center p-2" : "gap-3 px-3 py-2 w-full"
          )}
        >
          <Settings className={cn("shrink-0 text-slate-500", !isExpanded ? "w-5 h-5" : "w-4 h-4")} />
          {isExpanded && <span className="whitespace-nowrap">Settings</span>}
        </button>

        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          title={isExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
          className={cn(
            "flex items-center rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-all mt-1",
            !isExpanded ? "justify-center p-2" : "gap-3 px-3 py-2 w-full"
          )}
        >
          {isExpanded ? (
            <>
              <ChevronLeft className="w-4 h-4 shrink-0 text-slate-500" />
              <span className="whitespace-nowrap">Collapse</span>
            </>
          ) : (
            <ChevronRight className={cn("shrink-0 text-slate-500", "w-5 h-5")} />
          )}
        </button>
      </div>
    </aside>
  )
}
