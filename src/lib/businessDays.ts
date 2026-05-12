/**
 * Business Day Calculator
 * 
 * Pure utility functions for calculating business days (Mon-Fri, excluding holidays).
 * All functions take holidays as an argument — no Supabase calls here.
 */

/** Check if a date falls on a weekend (Sat=6, Sun=0) */
function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6
}

/** Check if a date string (YYYY-MM-DD) is in the holidays set */
function isHoliday(date: Date, holidaySet: Set<string>): boolean {
  const dateStr = date.toISOString().split("T")[0]
  return holidaySet.has(dateStr)
}

/** Create a Set of holiday date strings for fast lookup */
export function toHolidaySet(holidays: { holiday_date: string }[]): Set<string> {
  return new Set(holidays.map(h => h.holiday_date))
}

/**
 * Get the total number of business days in a given month.
 */
export function getBusinessDaysInMonth(
  year: number,
  month: number, // 1-indexed (1=Jan, 12=Dec)
  holidaySet: Set<string>
): number {
  let count = 0
  const daysInMonth = new Date(year, month, 0).getDate()

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day)
    if (!isWeekend(date) && !isHoliday(date, holidaySet)) {
      count++
    }
  }
  return count
}

/**
 * Get the number of business days elapsed in a month up to (and including) asOfDate.
 */
export function getElapsedBusinessDays(
  year: number,
  month: number, // 1-indexed
  holidaySet: Set<string>,
  asOfDate: Date
): number {
  let count = 0
  const lastDay = asOfDate.getDate()

  for (let day = 1; day <= lastDay; day++) {
    const date = new Date(year, month - 1, day)
    if (!isWeekend(date) && !isHoliday(date, holidaySet)) {
      count++
    }
  }
  return count
}

/**
 * Get the number of business days remaining in a month after asOfDate.
 */
export function getRemainingBusinessDays(
  year: number,
  month: number, // 1-indexed
  holidaySet: Set<string>,
  asOfDate: Date
): number {
  const total = getBusinessDaysInMonth(year, month, holidaySet)
  const elapsed = getElapsedBusinessDays(year, month, holidaySet, asOfDate)
  return total - elapsed
}

/**
 * Calculate pacing statistics for monthly goal tracking.
 */
export function calcPacing(
  totalItemsMTD: number,
  elapsedBizDays: number,
  remainingBizDays: number,
  monthlyGoal: number
): {
  dailyRate: number        // Items per business day at current pace
  projectedEOM: number     // Projected end-of-month total
  requiredDaily: number    // Items needed per remaining biz day to hit goal
  onTrack: boolean         // Whether projected >= goal
  status: "ahead" | "close" | "behind"  // Granular status
} {
  const totalBizDays = elapsedBizDays + remainingBizDays

  // Daily rate: items per elapsed business day
  const dailyRate = elapsedBizDays > 0 ? totalItemsMTD / elapsedBizDays : 0

  // Projected EOM: current rate * total business days in month
  const projectedEOM = Math.round(dailyRate * totalBizDays)

  // Required daily: items needed per remaining business day
  const itemsNeeded = Math.max(0, monthlyGoal - totalItemsMTD)
  const requiredDaily = remainingBizDays > 0 ? itemsNeeded / remainingBizDays : 0

  // Status
  const onTrack = projectedEOM >= monthlyGoal
  let status: "ahead" | "close" | "behind" = "behind"
  if (projectedEOM >= monthlyGoal) {
    status = "ahead"
  } else if (projectedEOM >= monthlyGoal * 0.9) {
    status = "close"
  }

  return {
    dailyRate,
    projectedEOM,
    requiredDaily,
    onTrack,
    status,
  }
}
