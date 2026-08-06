import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const envPath = path.resolve(process.cwd(), '.env.local')
const envContent = fs.readFileSync(envPath, 'utf8')
for (const line of envContent.split('\n')) {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
  if (match) {
    const key = match[1]
    let value = match[2] || ''
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
    process.env[key] = value
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function checkJulyDailyMetrics() {
  console.log("Analyzing daily_metrics for July 2026...")
  const { data: metrics, error } = await supabase
    .from('daily_metrics')
    .select('report_date, agent_id, calls, inbound, outbound, talk_time_seconds, agents(name, team, office)')
    .gte('report_date', '2026-07-01')
    .lte('report_date', '2026-07-31')
    .order('report_date', { ascending: true })

  if (error) {
    console.error("Error:", error)
    return
  }

  console.log(`Total daily metric rows in July: ${metrics?.length || 0}`)

  // Find rows with unusually high call counts or talk time
  const suspiciousRows = []
  for (const m of metrics || []) {
    const agentName = (m.agents as any)?.name || 'Unknown'
    const calls = m.calls || 0
    const sec = m.talk_time_seconds || 0
    const secPerCall = calls > 0 ? sec / calls : 0

    // Suspicious if calls > 300 or sec > 12000 (3.3 hrs) or sec/call > 200
    if (calls > 300 || sec > 12000 || (calls > 20 && secPerCall > 180)) {
      suspiciousRows.push({
        date: m.report_date,
        agent: agentName,
        calls,
        inbound: m.inbound,
        outbound: m.outbound,
        talkSec: sec,
        fmt: `${Math.floor(sec/3600)}:${Math.floor((sec%3600)/60).toString().padStart(2,'0')}`,
        secPerCall: secPerCall.toFixed(1)
      })
    }
  }

  console.log(`Found ${suspiciousRows.length} potentially inflated rows in July:`)
  console.table(suspiciousRows)
}

checkJulyDailyMetrics()
