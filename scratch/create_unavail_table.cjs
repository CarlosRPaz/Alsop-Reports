const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env.local");
const envContent = fs.readFileSync(envPath, "utf8");
const env = {};
envContent.split("\n").forEach((line) => {
  const [key, ...rest] = line.split("=");
  if (key && rest.length) env[key.trim()] = rest.join("=").trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function checkTable() {
  const { data, error } = await supabase
    .from("source_unavailability")
    .select("id")
    .limit(1);
  
  if (error) {
    console.log("❌ Table source_unavailability does NOT exist.");
    console.log("Error:", error.message);
    console.log("\nPlease run this SQL in Supabase dashboard SQL editor:\n");
    console.log(`CREATE TABLE IF NOT EXISTS source_unavailability (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  report_date date NOT NULL,
  source_type text NOT NULL,
  reason text,
  marked_at timestamptz DEFAULT now(),
  UNIQUE (report_date, source_type)
);

-- Enable RLS but allow all authenticated users
ALTER TABLE source_unavailability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON source_unavailability FOR ALL USING (true);
`);
  } else {
    console.log("✅ Table source_unavailability exists!");
    console.log("Current rows:", data?.length || 0);
  }
}

checkTable();
