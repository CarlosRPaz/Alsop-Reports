"use server"

import { exec } from "child_process"
import { promisify } from "util"
import path from "path"
import { revalidatePath } from "next/cache"
import { unstable_noStore as noStore } from "next/cache"
import { supabase } from "@/lib/supabaseClient"

const execAsync = promisify(exec)

export async function runDataSyncPipeline(dateString?: string, sources?: string[]) {
  try {
    // Determine the path to the python directory (one level up from dsr-dashboard)
    const pythonDir = path.resolve(process.cwd(), "..", "excel-report-automation")
    
    // Automated sources — everything EXCEPT Allstate DASH (quotes, nb) which
    // require manual download from the Allstate portal.
    const AUTOMATED_SOURCES = ["rc", "hs", "premium", "rico_ch", "rico_ap", "rico_leads", "eagent"]

    const activeSources = sources && sources.length > 0 ? sources : AUTOMATED_SOURCES

    // --supabase-only: push to Supabase, skip Excel master write
    // --skip-screenshots: skip eAgent OCR (entered manually via modal instead)
    let command = `python main.py --skip-screenshots --supabase-only --sources ${activeSources.join(',')}`
    if (dateString) {
      command += ` --date ${dateString}`
    }

    console.log(`Executing pipeline in ${pythonDir}: ${command}`)

    const { stdout, stderr } = await execAsync(command, {
      cwd: pythonDir,
      timeout: 600000, // 10 minute timeout (Playwright browser automation takes time)
      maxBuffer: 1024 * 1024 * 5, // 5MB output buffer (Playwright can be verbose)
    })

    revalidatePath("/reports/daily")
    revalidatePath("/reports/weekly")
    return {
      success: true,
      logs: stdout + (stderr ? "\n" + stderr : ""),
    }
  } catch (error: any) {
    console.error("Pipeline execution failed:", error)
    return {
      success: false,
      logs: (error.stdout || "") + "\n" + (error.stderr || "") + "\n" + error.message,
    }
  }
}

export async function getRangeCoverage(startDate: string, endDate: string) {
  noStore()
  try {
    // Fetch all daily_metrics rows for the date range
    const { data: metrics, error: metricsError } = await supabase
      .from("daily_metrics")
      .select("report_date, agent_id, calls, inbound, outbound, texts, out_texts, quotes, items, nb_count, prem_premium, prem_points")
      .gte("report_date", startDate)
      .lte("report_date", endDate)

    if (metricsError) throw metricsError

    // Fetch daily_reports_meta for eagent
    const { data: metaData, error: metaErr } = await supabase
      .from("daily_reports_meta")
      .select("report_date, eagent_submitted")
      .gte("report_date", startDate)
      .lte("report_date", endDate)

    if (metaErr) throw metaErr

    // Fetch leads_snapshot
    const { data: leadsData, error: leadsErr } = await supabase
      .from("leads_snapshot")
      .select("report_date, agent_id, contact, quoted, hot, xsale")
      .gte("report_date", startDate)
      .lte("report_date", endDate)

    if (leadsErr) throw leadsErr

    // Build all dates in range
    const result: Record<string, Record<string, { present: boolean; agentCount: number }>> = {}
    const start = new Date(startDate + "T12:00:00")
    const end = new Date(endDate + "T12:00:00")
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split("T")[0]
      result[dateStr] = {
        calls: { present: false, agentCount: 0 },
        texts: { present: false, agentCount: 0 },
        quotes: { present: false, agentCount: 0 },
        items: { present: false, agentCount: 0 },
        premium: { present: false, agentCount: 0 },
        eagent: { present: false, agentCount: 0 },
        leads: { present: false, agentCount: 0 },
      }
    }

    // Process metrics
    for (const m of metrics || []) {
      const day = result[m.report_date]
      if (!day) continue

      if ((m.calls || 0) > 0 || (m.inbound || 0) > 0 || (m.outbound || 0) > 0) {
        day.calls.present = true
        day.calls.agentCount++
      }
      if ((m.texts || 0) > 0 || (m.out_texts || 0) > 0) {
        day.texts.present = true
        day.texts.agentCount++
      }
      if ((m.quotes || 0) > 0) {
        day.quotes.present = true
        day.quotes.agentCount++
      }
      if ((m.items || 0) > 0 || (m.nb_count || 0) > 0) {
        day.items.present = true
        day.items.agentCount++
      }
      if (Number(m.prem_premium || 0) > 0 || (m.prem_points || 0) > 0) {
        day.premium.present = true
        day.premium.agentCount++
      }
    }

    // Process eagent
    for (const m of metaData || []) {
      const day = result[m.report_date]
      if (day && m.eagent_submitted) {
        day.eagent.present = true
        day.eagent.agentCount = 1
      }
    }

    // Process leads
    for (const l of leadsData || []) {
      const day = result[l.report_date]
      if (!day) continue
      if ((l.contact || 0) > 0 || (l.quoted || 0) > 0 || (l.hot || 0) > 0 || (l.xsale || 0) > 0) {
        day.leads.present = true
        day.leads.agentCount++
      }
    }

    return { success: true, data: result }
  } catch (error: any) {
    console.error("Error fetching range coverage:", error)
    return { success: false, error: error.message }
  }
}
