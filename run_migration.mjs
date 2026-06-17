/**
 * Run the chat schema migration against Supabase
 * Usage: node run_migration.mjs
 */

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

// Read the migration file
const sql = readFileSync(join(__dirname, 'supabase', 'migrations', '00009_chat_schema.sql'), 'utf-8');

// Split into individual statements (skip comments and empty lines)
const statements = sql
  .split(/;\s*\n/)
  .map(s => s.trim())
  .filter(s => s && !s.startsWith('--') && s.length > 5);

console.log(`Found ${statements.length} SQL statements to execute`);
console.log('');

let success = 0;
let failed = 0;

for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i] + ';';
  const preview = stmt.substring(0, 80).replace(/\n/g, ' ');
  process.stdout.write(`[${i + 1}/${statements.length}] ${preview}... `);
  
  const { error } = await supabase.rpc('exec_sql', { sql_text: stmt });
  
  if (error) {
    // Try direct approach via REST
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
      console.log(`SKIP (${error.message?.substring(0, 60) || 'rpc not available'})`);
      failed++;
    } else {
      console.log('OK');
      success++;
    }
  } else {
    console.log('OK');
    success++;
  }
}

console.log('');
console.log(`Done: ${success} succeeded, ${failed} skipped/failed`);
console.log('');
console.log('NOTE: If statements failed, you need to run the migration manually.');
console.log('Go to: https://supabase.com/dashboard → SQL Editor → paste the migration file.');
console.log(`File: supabase/migrations/00009_chat_schema.sql`);
