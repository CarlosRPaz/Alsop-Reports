"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createSupabaseBrowserClient } from "@/lib/supabaseBrowser"
import { Loader2, ShieldAlert } from "lucide-react"

interface PageGuardProps {
  pageKey: string
  children: React.ReactNode
}

/**
 * Wraps page content and enforces team-based page access permissions.
 *
 * Rules:
 * - Admins always have access (role === "admin")
 * - Managers always have access (team === "Managers")
 * - Everyone else: team must be in the page's `allowed_teams` array
 * - If the page_permissions table doesn't exist or the pageKey isn't found,
 *   access is granted by default (fail-open).
 */
export function PageGuard({ pageKey, children }: PageGuardProps) {
  const [status, setStatus] = useState<"loading" | "allowed" | "denied">("loading")
  const router = useRouter()

  useEffect(() => {
    async function check() {
      try {
        const supabase = createSupabaseBrowserClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          router.push("/login")
          return
        }

        // Get the agent's role and team
        const { data: agent } = await supabase
          .from("agents")
          .select("role, team")
          .eq("auth_user_id", user.id)
          .single()

        // Heatmap is strictly Admin-only
        if (pageKey === "heatmap") {
          if (agent?.role === "admin") {
            setStatus("allowed")
          } else {
            setStatus("denied")
          }
          return
        }

        // Admins and Managers always have access
        if (agent?.role === "admin" || agent?.team === "Managers") {
          setStatus("allowed")
          return
        }

        // Query the page permission for this specific page
        const { data: perm, error } = await supabase
          .from("page_permissions")
          .select("allowed_teams")
          .eq("page_key", pageKey)
          .single()

        // If table doesn't exist or page not found, fail-open (allow access)
        if (error || !perm) {
          setStatus("allowed")
          return
        }

        // Check if the agent's team is in the allowed list
        const agentTeam = agent?.team || ""
        if (perm.allowed_teams.includes(agentTeam)) {
          setStatus("allowed")
        } else {
          setStatus("denied")
        }
      } catch {
        // On error, fail-open
        setStatus("allowed")
      }
    }

    check()
  }, [pageKey, router])

  if (status === "loading") {
    return (
      <div className="h-[60vh] w-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Checking access...</p>
        </div>
      </div>
    )
  }

  if (status === "denied") {
    return (
      <div className="h-[60vh] w-full flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mx-auto mb-6">
            <ShieldAlert className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">Access Restricted</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
            Your team does not have access to this page. Contact your administrator if you believe this is an error.
          </p>
          <button
            onClick={() => router.push("/")}
            className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-semibold rounded-lg shadow-sm shadow-blue-500/20 transition-all cursor-pointer"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
