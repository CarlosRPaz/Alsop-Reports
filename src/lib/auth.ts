import { createSupabaseServerClient } from "@/lib/supabaseServer"

/**
 * Server-side admin role check for use in Server Actions.
 * 
 * Reads the user's cookie-based session, looks up their agent record,
 * and throws if they are not an admin. Returns the authenticated user
 * on success so callers can use it if needed.
 *
 * Usage:
 *   await requireAdmin()  // throws on failure — catch in the action
 */
export async function requireAdmin() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error("Unauthorized")
  }

  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("role")
    .eq("auth_user_id", user.id)
    .single()

  if (agentError || !agent || agent.role !== "admin") {
    throw new Error("Unauthorized")
  }

  return user
}
