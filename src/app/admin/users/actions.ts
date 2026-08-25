"use server"

import { createSupabaseAdmin } from "@/lib/supabaseServer"
import { requireAdmin } from "@/lib/auth"

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
  await requireAdmin()
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
  await requireAdmin()
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
  await requireAdmin()
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

  // Sync agent into their correct team/office channels
  await syncAgentChannelsInternal(supabase, agentId)

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
  await requireAdmin()
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
  await requireAdmin()
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
  await requireAdmin()
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
  await requireAdmin()
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
const DEFAULT_PAGES = [
  { page_key: "daily", page_label: "Daily Standup", allowed_teams: ["Sales", "CSR", "EA"] },
  { page_key: "weekly", page_label: "Weekly Report", allowed_teams: ["Sales", "CSR", "EA"] },
  { page_key: "mtd", page_label: "MTD Performance", allowed_teams: ["Sales", "CSR", "EA"] },
  { page_key: "quotes", page_label: "Quotes & NB", allowed_teams: ["Sales", "CSR", "EA"] },
  { page_key: "heatmap", page_label: "Agent Heatmap", allowed_teams: ["Sales", "CSR", "EA"] },
  { page_key: "agent_portal", page_label: "Agent Portal", allowed_teams: ["Sales", "CSR", "EA"] },
]

/**
 * Get all page permission rows.
 */
export async function getPagePermissions(): Promise<PagePermission[]> {
  await requireAdmin()
  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from("page_permissions")
    .select("page_key, page_label, allowed_teams")
    .order("page_key")

  if (error) {
    console.error("Failed to fetch page permissions:", error)
    return []
  }

  const existing = (data || []) as PagePermission[]
  const existingKeys = new Set(existing.map(p => p.page_key))

  // Find missing required pages (e.g. heatmap)
  const missing = DEFAULT_PAGES.filter(p => !existingKeys.has(p.page_key))

  if (missing.length > 0) {
    try {
      await supabase.from("page_permissions").upsert(missing, { onConflict: "page_key" })
      const { data: updatedData } = await supabase
        .from("page_permissions")
        .select("page_key, page_label, allowed_teams")
        .order("page_key")
      if (updatedData) return updatedData as PagePermission[]
    } catch (err) {
      console.error("Failed to auto-seed missing page permissions:", err)
    }
  }

  return existing
}

/**
 * Update the allowed_teams array for a single page.
 */
export async function updatePagePermission(
  pageKey: string,
  allowedTeams: string[]
): Promise<InviteResult> {
  await requireAdmin()
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

// ---------------------------------------------------------------------------
// Channel sync (team + office + role → managed channel memberships)
// ---------------------------------------------------------------------------

/** Team → channel name mapping */
const TEAM_CHANNEL_MAP: Record<string, string> = {
  Sales: 'Sales',
  CSR: 'CSR',
  EA: 'EA',
  Managers: 'Managers',
}

/** Office → channel name mapping */
const OFFICE_CHANNEL_MAP: Record<string, string> = {
  CH: 'CH Office',
  MB: 'MB Office',
  MCM: 'MCM Office',
  RC: 'RC Office',
}

const ALL_MANAGED_CHANNEL_NAMES = [
  'All',
  ...Object.values(TEAM_CHANNEL_MAP),
  ...Object.values(OFFICE_CHANNEL_MAP),
  'Admin',
]

/**
 * Internal: sync an agent's managed channel memberships using the given
 * Supabase client (works with admin client in server actions).
 */
async function syncAgentChannelsInternal(
  sb: ReturnType<typeof createSupabaseAdmin>,
  agentId: string,
): Promise<void> {
  // Fetch agent's team, office, role
  const { data: agent } = await sb
    .from('agents')
    .select('team, office, role')
    .eq('id', agentId)
    .single()

  if (!agent) return

  const team = agent.team || ''
  const office = agent.office || ''
  const role = agent.role || ''

  // Compute target channels
  const targetNames = new Set<string>(['All'])

  // Support team members get full access to all team and office channels
  if (team === 'Support') {
    Object.values(TEAM_CHANNEL_MAP).forEach((ch) => targetNames.add(ch))
    Object.values(OFFICE_CHANNEL_MAP).forEach((ch) => targetNames.add(ch))
    targetNames.add('Admin')
  } else {
    // Normal agent channel assignment
    if (team && TEAM_CHANNEL_MAP[team]) targetNames.add(TEAM_CHANNEL_MAP[team])
    if (office && OFFICE_CHANNEL_MAP[office]) targetNames.add(OFFICE_CHANNEL_MAP[office])
    if (role === 'admin') targetNames.add('Admin')
    if (team === 'Managers') targetNames.add('Managers')
  }

  // Fetch all managed channels
  const { data: channels } = await sb
    .from('chat_conversations')
    .select('id, name')
    .in('name', ALL_MANAGED_CHANNEL_NAMES)
    .eq('archived', false)

  if (!channels || channels.length === 0) return

  const channelsByName = new Map(channels.map((c: { name: string; id: string }) => [c.name, c.id]))

  // Join target channels
  const joinIds = [...targetNames]
    .filter(n => channelsByName.has(n))
    .map(n => channelsByName.get(n)!)

  if (joinIds.length > 0) {
    await sb
      .from('chat_conversation_members')
      .upsert(
        joinIds.map(cid => ({ conversation_id: cid, agent_id: agentId, role: 'member' })),
        { onConflict: 'conversation_id,agent_id' },
      )
  }

  // Leave channels agent shouldn't be in
  const leaveIds = ALL_MANAGED_CHANNEL_NAMES
    .filter(n => !targetNames.has(n) && channelsByName.has(n))
    .map(n => channelsByName.get(n)!)

  if (leaveIds.length > 0) {
    await sb
      .from('chat_conversation_members')
      .delete()
      .eq('agent_id', agentId)
      .in('conversation_id', leaveIds)
  }
}

/**
 * Public server action: sync an agent's channel memberships.
 * Called from the admin agents page after editing team/office.
 */
export async function syncAgentChannels(agentId: string): Promise<void> {
  await requireAdmin()
  const supabase = createSupabaseAdmin()
  await syncAgentChannelsInternal(supabase, agentId)
}
