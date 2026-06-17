/**
 * One-time setup: Create the admin user account
 * Run with: node scripts/setup-admin.mjs
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://xejmpdfqaghamemjrhxa.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhlam1wZGZxYWdoYW1lbWpyaHhhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjQ1OTExNSwiZXhwIjoyMDkyMDM1MTE1fQ.hSj5ILJ-5uPvJ2ueiJ_DlFvGN7vMVq_-Hqr_eTY1X8o'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const ADMIN_USER = {
  email: 'carlospaz@allstate.com',
  password: 'AlsopAdmin2026!',  // Temporary — change after first login
  name: 'Charlie Paz',
  team: 'Support',
  office: 'MCM',
  role: 'admin',
}

async function main() {
  console.log('=== Setting up admin account ===\n')

  // 1. Create Supabase Auth user
  console.log(`Creating auth user: ${ADMIN_USER.email}...`)
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: ADMIN_USER.email,
    password: ADMIN_USER.password,
    email_confirm: true, // Auto-confirm, no email verification needed
  })

  if (authError) {
    if (authError.message.includes('already been registered')) {
      console.log('Auth user already exists — fetching...')
      const { data: { users } } = await supabase.auth.admin.listUsers()
      const existing = users?.find(u => u.email === ADMIN_USER.email)
      if (existing) {
        console.log(`Found existing auth user: ${existing.id}`)
        await setupAgent(existing.id)
      }
    } else {
      console.error('Failed to create auth user:', authError.message)
    }
    return
  }

  console.log(`Auth user created: ${authUser.user.id}`)
  await setupAgent(authUser.user.id)
}

async function setupAgent(authUserId) {
  // 2. Create or update agent record
  console.log(`\nSetting up agent record for ${ADMIN_USER.name}...`)

  // Check if agent already exists
  const { data: existing } = await supabase
    .from('agents')
    .select('id')
    .eq('name', ADMIN_USER.name)
    .single()

  if (existing) {
    // Update existing
    const { error } = await supabase
      .from('agents')
      .update({
        auth_user_id: authUserId,
        email: ADMIN_USER.email,
        team: ADMIN_USER.team,
        office: ADMIN_USER.office,
        role: ADMIN_USER.role,
        active: true,
        report_visible: false,
      })
      .eq('id', existing.id)

    if (error) {
      console.error('Failed to update agent:', error.message)
    } else {
      console.log(`Updated existing agent: ${existing.id}`)
    }
  } else {
    // Insert new
    const { data: agent, error } = await supabase
      .from('agents')
      .insert({
        name: ADMIN_USER.name,
        email: ADMIN_USER.email,
        auth_user_id: authUserId,
        team: ADMIN_USER.team,
        office: ADMIN_USER.office,
        role: ADMIN_USER.role,
        active: true,
        report_visible: false,
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to create agent:', error.message)
    } else {
      console.log(`Created agent: ${agent.id}`)
    }
  }

  console.log('\n=== Setup Complete ===')
  console.log(`\nLogin credentials:`)
  console.log(`  Email:    ${ADMIN_USER.email}`)
  console.log(`  Password: ${ADMIN_USER.password}`)
  console.log(`\n⚠️  Change your password after first login!`)
}

main().catch(console.error)
