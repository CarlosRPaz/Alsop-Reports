"use server"

import { createSupabaseAdmin } from "@/lib/supabaseServer"

export interface InviteResult {
  success: boolean
  message: string
}

export interface UnlinkedAgent {
  id: string
  name: string
  team: string | null
  office: string | null
  role: string
  email: string | null
  auth_user_id: string | null
}

/**
 * Get all agents that don't have a linked auth account yet.
 * These are the agents available to invite.
 */
export async function getUnlinkedAgents(): Promise<UnlinkedAgent[]> {
  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from("agents")
    .select("id, name, team, office, role, email, auth_user_id")
    .eq("active", true)
    .is("auth_user_id", null)
    .order("name")

  if (error) {
    console.error("Failed to fetch unlinked agents:", error)
    return []
  }
  return data || []
}

/**
 * Get all agents that already have a linked auth account.
 */
export async function getLinkedAgents(): Promise<UnlinkedAgent[]> {
  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from("agents")
    .select("id, name, team, office, role, email, auth_user_id")
    .eq("active", true)
    .not("auth_user_id", "is", null)
    .order("name")

  if (error) {
    console.error("Failed to fetch linked agents:", error)
    return []
  }
  return data || []
}

/**
 * Invite a user by linking an email/password to an EXISTING agent.
 * Creates a Supabase Auth account and updates the agent record.
 */
export async function inviteExistingAgent(
  agentId: string,
  email: string,
  tempPassword: string
): Promise<InviteResult> {
  const supabase = createSupabaseAdmin()

  if (!agentId || !email || !tempPassword) {
    return { success: false, message: "Agent, email, and temporary password are required." }
  }
  if (tempPassword.length < 6) {
    return { success: false, message: "Password must be at least 6 characters." }
  }

  // Verify agent exists and doesn't already have auth
  const { data: agent, error: agentErr } = await supabase
    .from("agents")
    .select("id, name, auth_user_id")
    .eq("id", agentId)
    .single()

  if (agentErr || !agent) {
    return { success: false, message: "Agent not found." }
  }
  if (agent.auth_user_id) {
    return { success: false, message: `${agent.name} already has a login account.` }
  }

  // Create Supabase Auth user
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password: tempPassword,
    email_confirm: true,
  })

  if (authError) {
    if (authError.message.includes("already been registered")) {
      return { success: false, message: "This email is already registered to another account." }
    }
    return { success: false, message: `Auth error: ${authError.message}` }
  }

  // Link auth user to existing agent
  const { error: updateErr } = await supabase
    .from("agents")
    .update({
      auth_user_id: authUser.user.id,
      email: email.trim().toLowerCase(),
    })
    .eq("id", agentId)

  if (updateErr) {
    // Cleanup auth user
    await supabase.auth.admin.deleteUser(authUser.user.id)
    return { success: false, message: `Failed to link account: ${updateErr.message}` }
  }

  return {
    success: true,
    message: `${agent.name} can now log in with ${email}`,
  }
}

/**
 * Invite a brand new person (not yet in agents table).
 * Creates both the auth account and a new agent record.
 */
export async function inviteNewUser(
  name: string,
  email: string,
  tempPassword: string
): Promise<InviteResult> {
  const supabase = createSupabaseAdmin()

  if (!name || !email || !tempPassword) {
    return { success: false, message: "Name, email, and temporary password are required." }
  }
  if (tempPassword.length < 6) {
    return { success: false, message: "Password must be at least 6 characters." }
  }

  // Create Supabase Auth user
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password: tempPassword,
    email_confirm: true,
  })

  if (authError) {
    if (authError.message.includes("already been registered")) {
      return { success: false, message: "This email is already registered." }
    }
    return { success: false, message: `Auth error: ${authError.message}` }
  }

  // Create agent record
  const { error: agentError } = await supabase
    .from("agents")
    .insert({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      auth_user_id: authUser.user.id,
      role: "agent",
      active: true,
      report_visible: false,
    })

  if (agentError) {
    await supabase.auth.admin.deleteUser(authUser.user.id)
    if (agentError.message.includes("duplicate") || agentError.message.includes("unique")) {
      return { success: false, message: "An agent with this name already exists. Use 'Link existing agent' instead." }
    }
    return { success: false, message: `Failed to create agent: ${agentError.message}` }
  }

  return {
    success: true,
    message: `${name} has been invited and can log in with ${email}`,
  }
}

/**
 * Reset a user's password (admin action).
 */
export async function resetUserPassword(agentId: string, newPassword: string): Promise<InviteResult> {
  const supabase = createSupabaseAdmin()

  const { data: agent, error: fetchError } = await supabase
    .from("agents")
    .select("auth_user_id, name")
    .eq("id", agentId)
    .single()

  if (fetchError || !agent?.auth_user_id) {
    return { success: false, message: "Agent not found or no login account linked." }
  }

  const { error } = await supabase.auth.admin.updateUserById(agent.auth_user_id, {
    password: newPassword,
  })

  if (error) {
    return { success: false, message: `Failed to reset password: ${error.message}` }
  }

  return { success: true, message: `Password for ${agent.name} has been reset.` }
}

/**
 * Remove a user's login access (unlink auth, keep agent record).
 */
export async function revokeAccess(agentId: string): Promise<InviteResult> {
  const supabase = createSupabaseAdmin()

  const { data: agent, error: fetchError } = await supabase
    .from("agents")
    .select("auth_user_id, name")
    .eq("id", agentId)
    .single()

  if (fetchError || !agent?.auth_user_id) {
    return { success: false, message: "Agent not found or no login account linked." }
  }

  await supabase.auth.admin.deleteUser(agent.auth_user_id)

  await supabase
    .from("agents")
    .update({ auth_user_id: null, email: null })
    .eq("id", agentId)

  return { success: true, message: `Login access for ${agent.name} has been revoked.` }
}

/**
 * Update a user's role (admin action).
 */
export async function updateUserRole(agentId: string, role: string): Promise<InviteResult> {
  const supabase = createSupabaseAdmin()
  const { error } = await supabase
    .from("agents")
    .update({ role })
    .eq("id", agentId)

  if (error) {
    return { success: false, message: `Failed to update role: ${error.message}` }
  }
  return { success: true, message: `Role updated successfully to ${role}.` }
}

/* ── Page Permissions ──────────────────────────────────────────────── */

export interface PagePermission {
  page_key: string
  page_label: string
  allowed_teams: string[]
}

/**
 * Get all page permission rows.
 */
export async function getPagePermissions(): Promise<PagePermission[]> {
  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from("page_permissions")
    .select("page_key, page_label, allowed_teams")
    .order("page_key")

  if (error) {
    console.error("Failed to fetch page permissions:", error)
    return []
  }
  return (data || []) as PagePermission[]
}

/**
 * Update the allowed_teams array for a single page.
 */
export async function updatePagePermission(
  pageKey: string,
  allowedTeams: string[]
): Promise<InviteResult> {
  const supabase = createSupabaseAdmin()
  const { error } = await supabase
    .from("page_permissions")
    .update({ allowed_teams: allowedTeams })
    .eq("page_key", pageKey)

  if (error) {
    return { success: false, message: `Failed to update: ${error.message}` }
  }
  return { success: true, message: `Permissions updated for ${pageKey}.` }
}
