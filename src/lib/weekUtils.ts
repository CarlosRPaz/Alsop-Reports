/**
 * Week Utility Functions
 * 
 * Weeks are defined as Monday–Sunday.
 * All functions are pure — no side effects or API calls.
 */

/** Get the Monday of the week containing `date` */
export function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day // if Sunday, go back 6 days
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Get the Sunday of the week containing `date` */
export function getWeekEnd(date: Date): Date {
  const start = getWeekStart(date)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return end
}

/** Get the most recent completed week (the Mon–Sun before today) */
export function getLastCompletedWeekStart(): Date {
  const today = new Date()
  const thisWeekStart = getWeekStart(today)
  // Go back 7 days to get last week's Monday
  const lastWeek = new Date(thisWeekStart)
  lastWeek.setDate(lastWeek.getDate() - 7)
  return lastWeek
}

/** Navigate to previous week */
export function getPreviousWeekStart(weekStart: Date): Date {
  const prev = new Date(weekStart)
  prev.setDate(prev.getDate() - 7)
  return prev
}

/** Navigate to next week */
export function getNextWeekStart(weekStart: Date): Date {
  const next = new Date(weekStart)
  next.setDate(next.getDate() + 7)
  return next
}

/** Format a date as YYYY-MM-DD (for Supabase queries) */
export function toDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** Format week range for display: "04.27 – 05.03" */
export function formatWeekRange(weekStart: Date): string {
  const end = getWeekEnd(weekStart)
  const fmt = (d: Date) => {
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${m}.${day}`
  }
  return `${fmt(weekStart)} – ${fmt(end)}`
}

/** Format week range with year for header: "Apr 27 – May 3, 2026" */
export function formatWeekRangeHeader(weekStart: Date): string {
  const end = getWeekEnd(weekStart)
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  const startStr = `${months[weekStart.getMonth()]} ${weekStart.getDate()}`
  const endStr = `${months[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`
  return `${startStr} – ${endStr}`
}
