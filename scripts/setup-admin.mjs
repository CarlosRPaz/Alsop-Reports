/**
 * One-time setup: Create the admin user account
 * Run with: node scripts/setup-admin.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// Load environment variables from .env.local
const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const envPath = join(__dirname, '..', '.env.local')
  const envContent = readFileSync(envPath, 'utf-8')
  envContent.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=')
      if (idx !== -1) {
        const key = trimmed.substring(0, idx).trim()
        const val = trimmed.substring(idx + 1).trim()
        process.env[key] = val
      }
    }
  })
} catch (e) {
  // Ignore missing file
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in your environment or .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const adminPassword = process.env.ADMIN_PASSWORD || process.argv[2]
if (!adminPassword) {
  console.error('Error: Please specify the admin password. You can:')
  console.error('  1. Set ADMIN_PASSWORD in your .env.local file, OR')
  console.error('  2. Pass it as an argument: node scripts/setup-admin.mjs <password>')
  process.exit(1)
}

const ADMIN_USER = {
  email: 'carlospaz@allstate.com',
  password: adminPassword,
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
