// ============================================================================
// Chat System — Permission Checking Utilities
// ============================================================================

import { supabase } from '@/lib/supabaseClient'
import type { Agent, ChatPermission } from './types'

// ---------------------------------------------------------------------------
// Synchronous check given pre-loaded data
// ---------------------------------------------------------------------------

/**
 * Check whether an agent satisfies a permission rule.
 * An admin role always passes. Otherwise the agent passes if their role is in
 * `allowed_roles` OR their team is in `allowed_teams`.
 */
export function checkPermission(
  agent: Pick<Agent, 'role' | 'team'>,
  permission: Pick<ChatPermission, 'allowed_roles' | 'allowed_teams'>,
): boolean {
  // Admin bypasses all permission checks
  if (agent.role === 'admin') return true

  const roleMatch = permission.allowed_roles.includes(agent.role)
  const teamMatch = permission.allowed_teams.includes(agent.team)
  return roleMatch || teamMatch
}

// ---------------------------------------------------------------------------
// Async permission check (loads from DB)
// ---------------------------------------------------------------------------

/**
 * Check if a specific agent has a specific permission key.
 * Fetches the agent row and the permission row, then delegates to
 * `checkPermission`.
 */
export async function hasPermission(
  agentId: string,
  permissionKey: string,
): Promise<boolean> {
  // Fetch agent and permission in parallel
  const [agentResult, permResult] = await Promise.all([
    supabase
      .from('agents')
      .select('role, team')
      .eq('id', agentId)
      .single(),
    supabase
      .from('chat_permissions')
      .select('allowed_roles, allowed_teams')
      .eq('permission_key', permissionKey)
      .single(),
  ])

  if (agentResult.error || !agentResult.data) {
    console.error('[permissions] Agent not found:', agentId, agentResult.error)
    return false
  }

  if (permResult.error || !permResult.data) {
    // If the permission row doesn't exist, deny by default
    console.warn('[permissions] Permission key not found:', permissionKey)
    return false
  }

  return checkPermission(
    agentResult.data as Pick<Agent, 'role' | 'team'>,
    permResult.data as Pick<ChatPermission, 'allowed_roles' | 'allowed_teams'>,
  )
}

// ---------------------------------------------------------------------------
// Bulk permission fetch (for admin UI)
// ---------------------------------------------------------------------------

/**
 * Fetch every row in `chat_permissions`, sorted by permission_key.
 */
export async function getAllPermissions(): Promise<ChatPermission[]> {
  const { data, error } = await supabase
    .from('chat_permissions')
    .select('*')
    .order('permission_key', { ascending: true })

  if (error) {
    console.error('[permissions] Failed to fetch permissions:', error)
    throw error
  }

  return (data ?? []) as ChatPermission[]
}

// ---------------------------------------------------------------------------
// Update permission (admin only — caller must verify authorization)
// ---------------------------------------------------------------------------

/**
 * Update the allowed_roles and allowed_teams arrays for a permission key.
 */
export async function updatePermission(
  permissionKey: string,
  allowedRoles: string[],
  allowedTeams: string[],
): Promise<void> {
  const { error } = await supabase
    .from('chat_permissions')
    .update({
      allowed_roles: allowedRoles,
      allowed_teams: allowedTeams,
      updated_at: new Date().toISOString(),
    })
    .eq('permission_key', permissionKey)

  if (error) {
    console.error('[permissions] Failed to update permission:', permissionKey, error)
    throw error
  }
}

// ---------------------------------------------------------------------------
// Batch check — load all permissions for an agent at once
// ---------------------------------------------------------------------------

/**
 * Load every permission row and evaluate them all against a single agent.
 * Returns a map of `{ [permission_key]: boolean }` — useful for hydrating
 * the ChatContext on sign-in.
 */
export async function getPermissionsForAgent(
  agentId: string,
): Promise<Record<string, boolean>> {
  const [agentResult, permsResult] = await Promise.all([
    supabase.from('agents').select('role, team').eq('id', agentId).single(),
    supabase.from('chat_permissions').select('permission_key, allowed_roles, allowed_teams'),
  ])

  if (agentResult.error || !agentResult.data) {
    console.error('[permissions] Agent not found for batch check:', agentId)
    return {}
  }

  const agent = agentResult.data as Pick<Agent, 'role' | 'team'>
  const perms = (permsResult.data ?? []) as Pick<
    ChatPermission,
    'permission_key' | 'allowed_roles' | 'allowed_teams'
  >[]

  const map: Record<string, boolean> = {}
  for (const perm of perms) {
    map[perm.permission_key] = checkPermission(agent, perm)
  }
  return map
}
