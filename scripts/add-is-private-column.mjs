import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://xejmpdfqaghamemjrhxa.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhlam1wZGZxYWdoYW1lbWpyaHhhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjQ1OTExNSwiZXhwIjoyMDkyMDM1MTE1fQ.hSj5ILJ-5uPvJ2ueiJ_DlFvGN7vMVq_-Hqr_eTY1X8o'

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
