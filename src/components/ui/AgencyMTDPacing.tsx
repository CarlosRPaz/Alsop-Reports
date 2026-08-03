"use client"

import { Card, CardContent } from "@/components/ui/Card"
import { TrendingUp } from "lucide-react"
import { calcPacing, toHolidaySet, getBusinessDaysInMonth, getElapsedBusinessDays } from "@/lib/businessDays"

const AGENCY_GOAL = 500

interface AgencyMTDPacingProps {
  /** Agency-wide total items MTD (all agents, Standard Auto only) */
  agencyItemsMTD: number
  /** Per-office item counts (all agents, including hidden/archived) */
  agencyOfficeBreakdown: Record<string, number>
  /** Holiday objects for business day calculations */
  holidays: { holiday_date: string }[]
  /** Last month's agency-wide NB Auto Item Count */
  lastMonthItems?: number
  /** Override year/month for pacing (defaults to current month) */
  year?: number
  month?: number
  /** CSS class for the outer wrapper */
  className?: string
}

/**
 * Shared Agency MTD Pacing card used across Daily, Weekly, and MTD report pages.
 *
 * Shows:
 * - Current MTD items vs goal (500)
 * - Projected EOM total
 * - Office stacked bar breakdown
 * - Current rate & required rate (items/day)
 *
 * Agency KPI rules:
 * - Uses nb_auto_items (Standard Auto only)
 * - Includes ALL agents regardless of visibility (hidden, archived, on-leave)
 */
export default function AgencyMTDPacing({
  agencyItemsMTD,
  agencyOfficeBreakdown,
  holidays,
  lastMonthItems,
  year,
  month,
  className = "col-span-12 lg:col-span-8 lg:row-span-2 order-3 lg:order-none",
}: AgencyMTDPacingProps) {
  const totalItemsMTD = agencyItemsMTD
  const remaining = Math.max(0, AGENCY_GOAL - totalItemsMTD)

  // Office breakdown (all agents)
  const offices = Object.entries(agencyOfficeBreakdown)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])

  const scaleMax = Math.max(AGENCY_GOAL, totalItemsMTD)

  // Pacing calculations
  const holidaySet = toHolidaySet(holidays)
  const now = new Date()
  const currentYear = year ?? now.getFullYear()
  const currentMonth = month ?? (now.getMonth() + 1)
  const totalBizDays = getBusinessDaysInMonth(currentYear, currentMonth, holidaySet)

  const isCurrentMonth = now.getFullYear() === currentYear && (now.getMonth() + 1) === currentMonth
  let elapsed = totalBizDays
  if (isCurrentMonth) {
    if (now.getDate() > 1) {
      const yesterday = new Date(now)
      yesterday.setDate(now.getDate() - 1)
      elapsed = getElapsedBusinessDays(currentYear, currentMonth, holidaySet, yesterday)
    } else {
      elapsed = 0
    }
  }

  const remainingBizDays = totalBizDays - elapsed
  const pacing = calcPacing(totalItemsMTD, elapsed, remainingBizDays, AGENCY_GOAL)

  const statusColor = pacing.status === "ahead"
    ? "text-emerald-600 bg-emerald-50 border-emerald-200"
    : pacing.status === "close"
    ? "text-amber-600 bg-amber-50 border-amber-200"
    : "text-red-600 bg-red-50 border-red-200"
  const statusIcon = pacing.status === "ahead" ? "🟢" : pacing.status === "close" ? "🟡" : "🔴"
  const statusLabel = pacing.status === "ahead" ? "On Track" : pacing.status === "close" ? "Close" : "Behind Pace"

  // Bar color palette
  const BAR_COLORS = ["bg-emerald-600", "bg-blue-600", "bg-blue-400", "bg-blue-300", "bg-blue-200"]
  const DOT_COLORS = ["bg-emerald-600", "bg-blue-600", "bg-blue-400", "bg-blue-300", "bg-blue-200"]
  const TEXT_COLORS = ["text-emerald-600", "text-blue-600", "text-blue-400", "text-blue-300", "text-blue-200"]

  return (
    <>
      <style>{`
        @keyframes shimmer-sweep {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer-sweep {
          animation: shimmer-sweep 2.5s infinite;
        }
      `}</style>
      <Card className={`${className} bg-white border border-slate-200 shadow-sm overflow-hidden relative flex flex-col`}>
        <CardContent className="p-4 relative z-10 flex flex-col justify-between h-full gap-3">
          {/* Top Row: Title + Stats */}
          <div className="flex flex-col sm:flex-row justify-between gap-3">
            <div className="flex flex-col justify-center">
              <div className="flex items-center gap-2.5 mb-0.5">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5 tracking-tight">
                  <TrendingUp className="w-3.5 h-3.5 text-blue-600" /> Agency MTD Pacing
                </h2>
                <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded tracking-wider border bg-indigo-50 text-indigo-700 border-indigo-100 shrink-0 select-none">
                  MTD
                </span>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${statusColor}`}>
                  {statusIcon} {statusLabel}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                📅 {elapsed} of {totalBizDays} biz days elapsed <span className="text-slate-400">({remainingBizDays} remaining)</span>
              </p>
            </div>
            
            {/* Prominent Numbers */}
            <div className="flex items-center gap-5 bg-slate-50 rounded-lg border border-slate-100 px-4 py-2.5">
              <div className="text-right relative">
                <p className="text-[9px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">Current MTD</p>
                <div className="flex items-baseline gap-1 justify-end leading-none">
                  <span className="text-3xl font-black text-slate-900 font-mono tracking-tighter">{totalItemsMTD}</span>
                  <span className="text-xs text-slate-400 font-mono font-medium">/ {AGENCY_GOAL}</span>
                </div>
                {remaining > 0 ? (
                  <p className="text-[9px] font-bold text-amber-500 mt-1 uppercase tracking-wide">{remaining} needed</p>
                ) : (
                  <div className="mt-1 relative group">
                    <div className="inline-block bg-gradient-to-r from-emerald-500 to-emerald-400 text-white text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full shadow-[0_2px_10px_rgba(16,185,129,0.3)] border border-emerald-300 cursor-default">
                      Goal Met! 🚀
                    </div>
                    {/* Hover tooltip */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap shadow-xl pointer-events-none z-50">
                      Crushing it! {Math.round((totalItemsMTD / AGENCY_GOAL) * 100)}% to goal
                    </div>
                  </div>
                )}
              </div>

              <div className="h-12 w-[1px] bg-slate-200" />

              <div className="text-right">
                <p className="text-[9px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">Projected EOM</p>
                <div className="flex items-baseline justify-end leading-none">
                  <span className={`text-3xl font-black font-mono tracking-tighter ${
                    pacing.projectedEOM >= AGENCY_GOAL ? "text-emerald-600" : "text-rose-600"
                  }`}>
                    {pacing.projectedEOM}
                  </span>
                </div>
                {(() => {
                  const diff = pacing.projectedEOM - AGENCY_GOAL;
                  return (
                    <p className={`text-[9px] font-bold mt-1 uppercase tracking-wide ${
                      diff >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}>
                      {diff >= 0 ? `+${diff}` : `${diff}`} vs goal
                    </p>
                  );
                })()}
              </div>

            {/* Last Month Reference */}
            {lastMonthItems != null && (
              <>
                <div className="h-8 w-[1px] bg-slate-200" />
                <div className="text-right">
                  <p className="text-[8px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Last Month</p>
                  <p className="text-base font-black font-mono text-slate-900 leading-none">{lastMonthItems}</p>
                  <p className="text-[8px] text-slate-400 font-medium mt-0.5">NB auto items</p>
                </div>
              </>
            )}
            </div>
          </div>

          {/* Stacked Bar — THICK */}
          <div className="relative mt-8">
            {/* Goal marker */}
            <div 
              className="absolute top-0 bottom-0 z-40 flex flex-col items-center pointer-events-none" 
              style={{ left: `${(AGENCY_GOAL / scaleMax) * 100}%` }}
            >
              {totalItemsMTD >= AGENCY_GOAL ? (
                // Goal Met State (Gold & Fun)
                <>
                  <div className="absolute bottom-full mb-2 -translate-x-1/2 flex items-baseline gap-1.5 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 text-amber-950 px-3 py-1 rounded-full shadow-lg shadow-amber-500/20 whitespace-nowrap border border-amber-200">
                    <span className="text-sm font-black uppercase tracking-widest drop-shadow-sm">Goal</span>
                    <span className="text-sm font-black drop-shadow-sm">
                      +{totalItemsMTD - AGENCY_GOAL}
                    </span>
                  </div>
                  {/* Clean white gap with glowing gold line */}
                  <div className="absolute top-0 bottom-0 w-1.5 bg-white -translate-x-1/2 flex items-center justify-center">
                    <div className="h-full border-l-[2px] border-dashed border-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
                  </div>
                </>
              ) : (
                // Goal Not Met State (Clean & Subtle)
                <>
                  <div className="absolute bottom-full mb-2 -translate-x-1/2 flex items-baseline gap-1.5 bg-white border border-slate-200 text-slate-500 px-3 py-1 rounded-full shadow-sm whitespace-nowrap">
                    <span className="text-sm font-bold uppercase tracking-widest">Goal</span>
                  </div>
                  <div className="absolute top-0 bottom-0 w-1.5 bg-white -translate-x-1/2 flex items-center justify-center">
                    <div className="h-full border-l-2 border-dashed border-slate-300" />
                  </div>
                </>
              )}
            </div>

            <div className="w-full h-10 bg-slate-100 rounded-lg overflow-hidden flex ring-1 ring-inset ring-slate-200 shadow-inner relative group">
              {/* Shimmer overlay when goal met */}
              {totalItemsMTD >= AGENCY_GOAL && (
                <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/40 to-transparent animate-shimmer-sweep pointer-events-none z-20" />
              )}
              
              {offices.map(([office, count], idx) => {
                const w = (count / scaleMax) * 100;
                if (w === 0) return null;
                const barBgColor = BAR_COLORS[idx] || BAR_COLORS[BAR_COLORS.length - 1];
                return (
                  <div 
                    key={office}
                    className={`h-full ${barBgColor} border-r border-white/20 transition-all duration-1000 relative flex items-center justify-center z-10 hover:brightness-110`}
                    style={{ width: `${w}%` }}
                  >
                    {w > 4 && (
                      <span className="text-white font-bold text-xs drop-shadow-sm select-none">{count}</span>
                    )}
                    <div className="opacity-0 hover:opacity-100 absolute inset-0 z-30" title={`${office}: ${count}`} />
                  </div>
                );
              })}
              {remaining > 0 && (
                <div 
                  className="h-full bg-[repeating-linear-gradient(45deg,transparent,transparent_8px,rgba(0,0,0,0.03)_8px,rgba(0,0,0,0.03)_16px)] transition-all duration-1000 z-10"
                  style={{ width: `${(remaining / scaleMax) * 100}%` }}
                />
              )}

            </div>
          </div>

          {/* Legend & Pacing Stats */}
          <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-2">
            {/* Office Legend */}
            <div className="flex flex-wrap items-center gap-1.5 z-10">
              {offices.map(([office, count], idx) => {
                const offPct = totalItemsMTD > 0 ? Math.round((count / totalItemsMTD) * 100) : 0;
                const dotColor = DOT_COLORS[idx] || DOT_COLORS[DOT_COLORS.length - 1];
                const textColor = TEXT_COLORS[idx] || TEXT_COLORS[TEXT_COLORS.length - 1];
                return (
                  <div key={office} className="flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded px-2.5 py-1">
                    <div className={`w-2 h-2 rounded-full ${dotColor} ring-1 ring-black/5`} />
                    <span className={`text-[11px] font-bold ${textColor}`}>{office}</span>
                    <span className="text-sm font-mono font-bold text-slate-700">{count}</span>
                    <span className="text-[10px] font-sans text-slate-400 hidden sm:inline">({offPct}%)</span>
                  </div>
                );
              })}
            </div>

            {/* Pacing Stats */}
            <div className="flex items-center gap-4 bg-slate-50 rounded-lg border border-slate-100 px-3 py-2 z-10">
              <div className="text-right">
                <p className="text-[8px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Current Rate</p>
                <p className="text-base font-black font-mono text-slate-900 leading-none">{pacing.dailyRate.toFixed(1)}</p>
                <p className="text-[8px] text-slate-400 font-medium mt-0.5">items / day</p>
              </div>
              <div className="h-8 w-[1px] bg-slate-200" />
              {remaining > 0 ? (
                <div className="text-right">
                  <p className="text-[8px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Required</p>
                  <p className={`text-base font-black font-mono leading-none ${
                    pacing.requiredDaily <= pacing.dailyRate ? "text-emerald-600" : "text-amber-600"
                  }`}>
                    {pacing.requiredDaily.toFixed(1)}
                  </p>
                  <p className="text-[8px] text-slate-400 font-medium mt-0.5">items / day required</p>
                </div>
              ) : (
                <div className="text-right flex flex-col justify-center h-full min-w-fit pl-2">
                  <p className="text-[8px] uppercase tracking-wider text-emerald-600/80 font-black mb-0.5">Pace:</p>
                  <p className="text-[11px] sm:text-xs font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-400 leading-none tracking-tight uppercase animate-pulse">
                    Unstoppable
                  </p>
                  <p className="text-[7px] sm:text-[8px] text-emerald-600 font-bold mt-1 tracking-wider uppercase">Goal Secured 🏆</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
