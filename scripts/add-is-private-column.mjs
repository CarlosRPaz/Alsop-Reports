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
  console.log('Adding column "is_private" to "chat_conversations" table...')
  
  // Try using RPC if available
  const { data, error } = await supabase.rpc('exec_sql', { 
    sql_text: 'ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT false' 
  })

  if (error) {
    console.error('Failed to run migration via RPC:', error)
    console.log('You might need to run this command directly in the Supabase SQL Editor:')
    console.log('ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT false;')
  } else {
    console.log('Successfully added is_private column to chat_conversations table!')
  }
}

main().catch(console.error)
