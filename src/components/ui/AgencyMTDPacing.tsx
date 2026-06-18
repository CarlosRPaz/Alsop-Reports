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
    <Card className={`${className} bg-white border border-slate-200 shadow-sm overflow-hidden relative flex flex-col justify-between`}>
      <CardContent className="p-5 relative z-10 flex flex-col justify-between h-full gap-4">
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-2">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2 tracking-tight">
                <TrendingUp className="w-4 h-4 text-blue-600" /> Agency MTD Pacing
              </h2>
              <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded tracking-wider border bg-indigo-50 text-indigo-700 border-indigo-100 shrink-0 select-none">
                MTD
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusColor}`}>
                {statusIcon} {statusLabel}
              </span>
            </div>
            <p className="text-[13px] text-slate-500">
              📅 {elapsed} of {totalBizDays} biz days elapsed <span className="text-slate-400 font-normal">({remainingBizDays} remaining)</span>
            </p>
          </div>
          
          {/* Unified Prominent Numbers Section */}
          <div className="flex items-center gap-8">
            {/* Current MTD Items */}
            <div className="text-right">
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Current MTD</p>
              <div className="flex items-baseline gap-1 justify-end leading-none">
                <span className="text-4xl font-black text-slate-900 font-mono tracking-tighter">{totalItemsMTD}</span>
                <span className="text-sm text-slate-400 font-mono font-medium">/ {AGENCY_GOAL}</span>
              </div>
              {remaining > 0 ? (
                <p className="text-[10px] font-bold text-amber-500 mt-1.5 uppercase tracking-wide">{remaining} needed</p>
              ) : (
                <p className="text-[10px] font-bold text-emerald-600 mt-1.5 uppercase tracking-wide">Goal Met! 🚀</p>
              )}
            </div>

            {/* Divider line */}
            <div className="h-10 w-[1px] bg-slate-200/80" />

            {/* EoM Projected Items */}
            <div className="text-right">
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Projected EOM</p>
              <div className="flex items-baseline justify-end leading-none">
                <span className={`text-4xl font-black font-mono tracking-tighter ${
                  pacing.projectedEOM >= AGENCY_GOAL ? "text-emerald-600" : "text-rose-600"
                }`}>
                  {pacing.projectedEOM}
                </span>
              </div>
              {(() => {
                const diff = pacing.projectedEOM - AGENCY_GOAL;
                return (
                  <p className={`text-[10px] font-bold mt-1.5 uppercase tracking-wide ${
                    diff >= 0 ? "text-emerald-600" : "text-rose-600"
                  }`}>
                    {diff >= 0 ? `+${diff}` : `${diff}`} vs goal
                  </p>
                );
              })()}
            </div>
          </div>
        </div>

        {/* The Elite Stacked Bar */}
        <div className="relative pt-2 pb-2">
          {/* Goal marker line */}
          <div 
            className="absolute top-0 bottom-0 border-l-2 border-dashed border-slate-300 z-10 transition-all duration-1000" 
            style={{ left: `${(AGENCY_GOAL / scaleMax) * 100}%` }}
          >
            <div className="absolute -top-5 -translate-x-1/2 bg-white border border-slate-200 text-slate-600 shadow-sm text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest whitespace-nowrap">
              Goal
            </div>
          </div>

          <div className="w-full h-6 bg-slate-100 rounded-md overflow-hidden flex ring-1 ring-inset ring-slate-200 shadow-inner">
            {offices.map(([office, count], idx) => {
              const w = (count / scaleMax) * 100;
              if (w === 0) return null;
              const barBgColor = BAR_COLORS[idx] || BAR_COLORS[BAR_COLORS.length - 1];
              return (
                <div 
                  key={office}
                  className={`h-full ${barBgColor} border-r border-white/20 transition-all duration-1000 relative group flex items-center justify-center`}
                  style={{ width: `${w}%` }}
                >
                  {w > 4 && (
                    <span className="text-white font-bold text-[11px] drop-shadow-sm select-none">{count}</span>
                  )}
                  <div className="opacity-0 group-hover:opacity-100 absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-0.5 rounded shadow-md whitespace-nowrap transition-opacity z-20 pointer-events-none">
                    {office}: {count}
                  </div>
                </div>
              );
            })}
            {remaining > 0 && (
              <div 
                className="h-full bg-[repeating-linear-gradient(45deg,transparent,transparent_8px,rgba(0,0,0,0.03)_8px,rgba(0,0,0,0.03)_16px)] transition-all duration-1000"
                style={{ width: `${(remaining / scaleMax) * 100}%` }}
              />
            )}
          </div>
        </div>

        {/* Legend & Stats Row */}
        <div className="mt-2 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
          {/* Office Legend */}
          <div className="flex flex-wrap items-center gap-2">
            {offices.map(([office, count], idx) => {
              const offPct = totalItemsMTD > 0 ? Math.round((count / totalItemsMTD) * 100) : 0;
              const dotColor = DOT_COLORS[idx] || DOT_COLORS[DOT_COLORS.length - 1];
              const textColor = TEXT_COLORS[idx] || TEXT_COLORS[TEXT_COLORS.length - 1];
              return (
                <div key={office} className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded px-3 py-1.5">
                  <div className={`w-2.5 h-2.5 rounded-full ${dotColor} ring-1 ring-black/5`} />
                  <span className={`text-[11px] font-bold ${textColor}`}>{office}</span>
                  <span className="text-sm font-mono font-bold text-slate-700 ml-0.5">{count}</span>
                  <span className="text-[10px] font-sans text-slate-400 hidden sm:inline">({offPct}%)</span>
                </div>
              );
            })}
          </div>

          {/* Pacing Stats */}
          <div className="flex items-center gap-6 pr-2">
            {/* Current Rate */}
            <div className="text-right">
              <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-1">Current Rate</p>
              <p className="text-lg font-black font-mono text-slate-900 leading-none">{pacing.dailyRate.toFixed(1)}</p>
              <p className="text-[9px] text-slate-400 font-medium mt-1">items / day</p>
            </div>

            {/* Vertical Divider */}
            <div className="h-8 w-[1px] bg-slate-200" />

            {/* Required Rate */}
            <div className="text-right">
              <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-1">Required</p>
              <p className={`text-lg font-black font-mono leading-none ${
                pacing.requiredDaily <= pacing.dailyRate ? "text-emerald-600" : "text-amber-600"
              }`}>
                {pacing.requiredDaily.toFixed(1)}
              </p>
              <p className="text-[9px] text-slate-400 font-medium mt-1">items / day required</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
