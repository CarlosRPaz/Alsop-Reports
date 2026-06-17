import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://xejmpdfqaghamemjrhxa.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhlam1wZGZxYWdoYW1lbWpyaHhhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjQ1OTExNSwiZXhwIjoyMDkyMDM1MTE1fQ.hSj5ILJ-5uPvJ2ueiJ_DlFvGN7vMVq_-Hqr_eTY1X8o'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhlam1wZGZxYWdoYW1lbWpyaHhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NTkxMTUsImV4cCI6MjA5MjAzNTExNX0.0m_8BHyk-2dVZUjCme-yDXwrpswhpBi8gFZVTdIyWOc'

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
