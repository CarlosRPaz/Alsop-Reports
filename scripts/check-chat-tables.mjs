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
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set in your environment or .env.local')
  process.exit(1)
}

async function main() {
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  console.log('--- Checking tables with Admin client (Service Role) ---')
  const { data: adminData, error: adminErr } = await adminClient
    .from('chat_conversation_members')
    .select('conversation_id')
    .limit(1)
  
  if (adminErr) {
    console.error('Admin query error:', adminErr)
  } else {
    console.log('Admin query succeeded:', adminData)
  }

  console.log('\n--- Checking tables with Anon client ---')
  const { data: anonData, error: anonErr } = await anonClient
    .from('chat_conversation_members')
    .select('conversation_id')
    .limit(1)
  
  if (anonErr) {
    console.error('Anon query error (raw object):', anonErr)
    console.error('Anon query error message:', anonErr.message)
    console.error('Anon query error code:', anonErr.code)
    console.error('Anon query error details:', anonErr.details)
    console.error('Anon query error hint:', anonErr.hint)
  } else {
    console.log('Anon query succeeded:', anonData)
  }
}

main().catch(console.error)
