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
  // Get the current week range (Mon-Sun for the week of 7/21-7/27)
  const weekStart = "2026-07-20";  // Last Monday
  const weekEnd = "2026-07-26";    // Last Sunday (full week)

  // 1. Sum daily dismissed_todos for the week
  const { data: dailyRows } = await supabase
    .from("daily_metrics")
    .select("agent_id, report_date, dismissed_todos, pivots, agents(name)")
    .gte("report_date", weekStart)
    .lte("report_date", weekEnd)
    .not("dismissed_todos", "eq", 0)
    .order("agent_id");

  const dailySums = {};
  (dailyRows || []).forEach(r => {
    const name = r.agents?.name || r.agent_id;
    if (!dailySums[name]) dailySums[name] = { daily_sum: 0, days: [] };
    dailySums[name].daily_sum += r.dismissed_todos || 0;
    dailySums[name].days.push(`${r.report_date}:${r.dismissed_todos}`);
  });

  // 2. Get manual weekly data
  const { data: manualRows } = await supabase
    .from("weekly_manual_metrics")
    .select("agent_id, dismissed_todos, past_due_todos, pivot, saved, agents(name)")
    .eq("week_start", weekStart);

  const manualMap = {};
  (manualRows || []).forEach(r => {
    const name = r.agents?.name || r.agent_id;
    manualMap[name] = r.dismissed_todos || 0;
  });

  console.log("=== Week", weekStart, "to", weekEnd, "===\n");
  console.log("Agent".padEnd(25) + "| Daily Sum  | Manual Form | Displayed (|| logic)");
  console.log("-".repeat(80));

  // Get all unique agents
  const allAgents = new Set([...Object.keys(dailySums), ...Object.keys(manualMap)]);
  const sorted = [...allAgents].sort();

  for (const name of sorted) {
    const daily = dailySums[name]?.daily_sum || 0;
    const manual = manualMap[name] || 0;
    const displayed = daily || manual || 0;  // This is the || logic from line 280
    const mismatch = manual > 0 && daily > 0 && daily !== manual ? " ⚠️ MISMATCH" : "";
    if (daily > 0 || manual > 0) {
      console.log(
        `${name.padEnd(25)}| ${String(daily).padStart(10)} | ${String(manual).padStart(11)} | ${String(displayed).padStart(9)}${mismatch}`
      );
    }
  }
})();
