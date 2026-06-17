import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = 'https://xejmpdfqaghamemjrhxa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhlam1wZGZxYWdoYW1lbWpyaHhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NTkxMTUsImV4cCI6MjA5MjAzNTExNX0.0m_8BHyk-2dVZUjCme-yDXwrpswhpBi8gFZVTdIyWOc';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const sql = readFileSync(join(__dirname, 'supabase', 'migrations', '00012_add_nb_auto_columns.sql'), 'utf-8');

// Filter out comments line by line
const lines = sql.split('\n')
  .map(line => line.trim())
  .filter(line => line && !line.startsWith('--'))
  .join('\n');

// Split by semicolon
const statements = lines
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 5);

console.log(`Found ${statements.length} SQL statements to execute`);

for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i] + ';';
  console.log(`Executing: ${stmt}`);
  
  const { error } = await supabase.rpc('exec_sql', { sql_text: stmt });
  
  if (error) {
    console.warn(`RPC failed: ${error.message}. Trying direct REST API...`);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql_text: stmt }),
    });
    
    if (!res.ok) {
      console.error(`FAILED: ${res.status} ${await res.text()}`);
    } else {
      console.log('OK (via REST fetch)');
    }
  } else {
    console.log('OK (via RPC)');
  }
}
