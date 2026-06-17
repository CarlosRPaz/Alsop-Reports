/**
 * Run the auth columns migration and verify Charlie's account
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

async function main() {
  // 1. Add columns via SQL
  console.log('Adding email and auth_user_id columns to agents...')
  
  const { error: e1 } = await supabase.rpc('exec_sql', { 
    sql_text: 'ALTER TABLE agents ADD COLUMN IF NOT EXISTS email TEXT UNIQUE' 
  }).single()
  
  // If rpc doesn't work, try raw SQL via PostgREST
  if (e1) {
    console.log('rpc not available, trying via REST...')
    // Use the Supabase Management API or direct SQL
    // For now, let's just verify the columns exist by trying to query them
    const { data, error } = await supabase
      .from('agents')
      .select('id, name, email, auth_user_id')
      .limit(1)
    
    if (error && error.message.includes('email')) {
      console.log('Columns do not exist yet. Please run this SQL in the Supabase SQL Editor:')
      console.log('')
      console.log('ALTER TABLE agents ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;')
      console.log('ALTER TABLE agents ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE;')
      console.log('CREATE INDEX IF NOT EXISTS idx_agents_auth_user_id ON agents(auth_user_id);')
      return
    } else if (data) {
      console.log('Columns already exist!')
    }
  } else {
    console.log('Email column added.')
    await supabase.rpc('exec_sql', { 
      sql_text: 'ALTER TABLE agents ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE' 
    })
    console.log('auth_user_id column added.')
    await supabase.rpc('exec_sql', { 
      sql_text: 'CREATE INDEX IF NOT EXISTS idx_agents_auth_user_id ON agents(auth_user_id)' 
    })
    console.log('Index created.')
  }

  // 2. Verify Charlie's account
  console.log('\nVerifying Charlie Paz account...')
  const { data: charlie, error: cerr } = await supabase
    .from('agents')
    .select('id, name, email, auth_user_id, role, team')
    .eq('name', 'Charlie Paz')
    .single()

  if (cerr || !charlie) {
    console.log('Charlie Paz not found in agents table!')
    return
  }

  console.log('Agent record:', charlie)
  
  if (charlie.auth_user_id) {
    console.log('\n✅ Charlie is linked to auth account:', charlie.auth_user_id)
  } else {
    console.log('\n⚠️ Charlie has no auth_user_id — need to relink')
  }

  // 3. Check how many agents have auth vs don't
  const { data: linked } = await supabase
    .from('agents')
    .select('name, email')
    .not('auth_user_id', 'is', null)
  
  const { data: unlinked } = await supabase
    .from('agents')
    .select('name')
    .is('auth_user_id', null)
    .eq('active', true)

  console.log(`\nLinked users (${linked?.length || 0}):`, linked?.map(a => `${a.name} <${a.email}>`).join(', '))
  console.log(`Unlinked agents (${unlinked?.length || 0}):`, unlinked?.map(a => a.name).join(', '))
}

main().catch(console.error)
