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

(async () => {
  // Get uploads for 7/23 specifically, with full logs
  const { data: uploads, error } = await supabase
    .from("upload_history")
    .select("id, uploaded_at, target_date, source_types, logs")
    .eq("target_date", "2026-07-23")
    .order("uploaded_at", { ascending: true });

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log(`Found ${uploads.length} uploads for 2026-07-23\n`);
  for (const u of uploads) {
    console.log(`=== Upload ${u.id} at ${u.uploaded_at} ===`);
    console.log(`  Sources: ${JSON.stringify(u.source_types)}`);
    // Print only the RC-related and Rico CH-related log lines
    const logLines = (u.logs || "").split("\n");
    const relevantLines = logLines.filter(l => 
      l.includes("[rc-parser]") || 
      l.includes("[rico_ch]") || 
      l.includes("Rico CH") || 
      l.includes("RC") ||
      l.includes("talk_time") ||
      l.includes("TalkTime") ||
      l.includes("Handle Time") ||
      l.includes("PARTIAL") ||
      l.includes("source")
    );
    if (relevantLines.length > 0) {
      console.log("  Relevant log lines:");
      relevantLines.forEach(l => console.log(`    ${l.trim()}`));
    }
    console.log();
  }
})();
