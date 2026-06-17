/**
 * Run the auth columns migration and verify Charlie's account
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://xejmpdfqaghamemjrhxa.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhlam1wZGZxYWdoYW1lbWpyaHhhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjQ1OTExNSwiZXhwIjoyMDkyMDM1MTE1fQ.hSj5ILJ-5uPvJ2ueiJ_DlFvGN7vMVq_-Hqr_eTY1X8o'

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
