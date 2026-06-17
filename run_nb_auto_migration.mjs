import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment variables from .env.local
try {
  const envPath = join(__dirname, '.env.local')
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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set in your environment or .env.local');
  process.exit(1);
}

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
