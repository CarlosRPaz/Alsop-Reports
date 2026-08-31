"use client"

import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react"
import { X, Bell, MessageSquare, AlertTriangle, CheckCircle2, Info } from "lucide-react"

/* ── Types ─────────────────────────────────────────────────────────── */

export type ToastVariant = "info" | "success" | "warning" | "error" | "notification"

interface Toast {
  id: string
  title: string
  message?: string
  variant: ToastVariant
  duration?: number // ms, 0 = persistent
  onClick?: () => void
  metadata?: Record<string, any>
}

interface ToastContextValue {
  addToast: (toast: Omit<Toast, "id">) => void
  dismissToasts: (predicate: (toast: Toast) => boolean) => void
}

/* ── Context ───────────────────────────────────────────────────────── */

const ToastContext = createContext<ToastContextValue>({
  addToast: () => {},
  dismissToasts: () => {},
})

export const useToast = () => useContext(ToastContext)

/* ── Provider ──────────────────────────────────────────────────────── */

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  const addToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const duration = toast.duration ?? 5000

    setToasts(prev => [...prev, { ...toast, id }])

    if (duration > 0) {
      const timer = setTimeout(() => removeToast(id), duration)
      timersRef.current.set(id, timer)
    }
  }, [removeToast])

  const dismissToasts = useCallback((predicate: (toast: Toast) => boolean) => {
    setToasts(prev => {
      const remaining = prev.filter(t => !predicate(t))
      const removed = prev.filter(t => predicate(t))
      removed.forEach(t => {
        const timer = timersRef.current.get(t.id)
        if (timer) {
          clearTimeout(timer)
          timersRef.current.delete(t.id)
        }
      })
      return remaining
    })
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach(timer => clearTimeout(timer))
      timersRef.current.clear()
    }
  }, [])

  return (
    <ToastContext.Provider value={{ addToast, dismissToasts }}>
      {children}

      {/* Toast Container — fixed bottom-right */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}

/* ── Individual Toast ──────────────────────────────────────────────── */

const variantStyles: Record<ToastVariant, {
  bg: string, border: string, icon: typeof Bell, iconColor: string, titleColor: string
}> = {
  info: {
    bg: "bg-white",
    border: "border-slate-200",
    icon: Info,
    iconColor: "text-blue-500",
    titleColor: "text-slate-800",
  },
  success: {
    bg: "bg-white",
    border: "border-emerald-200",
    icon: CheckCircle2,
    iconColor: "text-emerald-500",
    titleColor: "text-slate-800",
  },
  warning: {
    bg: "bg-white",
    border: "border-amber-200",
    icon: AlertTriangle,
    iconColor: "text-amber-500",
    titleColor: "text-slate-800",
  },
  error: {
    bg: "bg-white",
    border: "border-red-200",
    icon: AlertTriangle,
    iconColor: "text-red-500",
    titleColor: "text-slate-800",
  },
  notification: {
    bg: "bg-white",
    border: "border-blue-200",
    icon: Bell,
    iconColor: "text-blue-600",
    titleColor: "text-slate-800",
  },
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [isVisible, setIsVisible] = useState(false)
  const style = variantStyles[toast.variant]
  const Icon = style.icon

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => setIsVisible(true))
  }, [])

  return (
    <div
      onClick={() => {
        if (toast.onClick) {
          toast.onClick()
          onDismiss()
        }
      }}
      className={`pointer-events-auto ${style.bg} border ${style.border} rounded-xl shadow-lg shadow-slate-900/5 px-4 py-3 flex items-start gap-3 transition-all duration-300 ease-out ${
        isVisible
          ? "opacity-100 translate-x-0"
          : "opacity-0 translate-x-8"
      } ${toast.onClick ? "cursor-pointer hover:scale-[1.02]" : ""}`}
    >
      {/* Icon */}
      <div className={`mt-0.5 shrink-0 ${style.iconColor}`}>
        <Icon className="w-4.5 h-4.5" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${style.titleColor} leading-tight`}>
          {toast.title}
        </p>
        {toast.message && (
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            {toast.message}
          </p>
        )}
      </div>

      {/* Dismiss */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDismiss()
        }}
        className="shrink-0 mt-0.5 p-0.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
