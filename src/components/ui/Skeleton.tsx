"use client"

export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`animate-pulse bg-slate-200 dark:bg-slate-700 rounded ${className}`} style={style} />
  )
}

export function CardSkeleton() {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-2 w-40" />
    </div>
  )
}

export function TableSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
      <div className="border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex gap-4 bg-slate-50 dark:bg-slate-800">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="px-4 py-3 flex gap-4 border-b border-slate-100 dark:border-slate-700 last:border-0 bg-white dark:bg-slate-900">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-3.5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function ChartSkeleton() {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4 shadow-sm">
      <Skeleton className="h-4 w-32" />
      <div className="h-[300px] flex items-end gap-3 px-4 pt-4 border-l border-b border-slate-200 dark:border-slate-700">
        {Array.from({ length: 8 }).map((_, i) => {
          const heights = [40, 65, 30, 85, 50, 75, 45, 90]
          return (
            <Skeleton 
              key={i} 
              className="flex-1" 
              style={{ height: `${heights[i % heights.length]}%` }} 
            />
          )
        })}
      </div>
    </div>
  )
}
