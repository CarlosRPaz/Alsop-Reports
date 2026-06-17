const fs = require('fs');
const path = require('path');

// Read .env.local
const envPath = path.join(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const idx = line.indexOf('=');
  if (idx > 0) env[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
}

const { createClient } = require(path.join(process.cwd(), 'node_modules', '@supabase/supabase-js'));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const { data: uploads, error } = await supabase.from('upload_history').select('*').order('uploaded_at', { ascending: false }).limit(2);
  if (error) {
    console.error('Error fetching uploads:', error);
    return;
  }

  console.log('--- RECENT UPLOADS ---');
  for (const u of uploads) {
    console.log(`ID: ${u.id}`);
    console.log(`Uploaded At: ${u.uploaded_at}`);
    console.log(`Target Date: ${u.target_date}`);
    console.log(`Status: ${u.status}`);
    console.log(`File Count: ${u.file_count}`);
    console.log(`Source Types: ${JSON.stringify(u.source_types)}`);
    console.log(`Logs: ${u.logs ? u.logs.substring(0, 500) : 'None'}`);
    
    const { data: files } = await supabase.from('upload_history_files').select('*').eq('upload_id', u.id);
    console.log('Files:');
    console.log(JSON.stringify(files, null, 2));
    console.log('-'.repeat(40));
  }
}

run().catch(console.error);
