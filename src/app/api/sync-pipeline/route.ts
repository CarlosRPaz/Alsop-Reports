import { NextRequest } from "next/server"
import { spawn } from "child_process"
import path from "path"

/**
 * Streaming sync pipeline endpoint.
 * Spawns `python main.py` and streams stdout/stderr as SSE events
 * so the client can show real-time progress.
 */
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { date, sources } = body

  if (!date) {
    return new Response(JSON.stringify({ error: "date is required" }), { status: 400 })
  }

  // Automated sources — everything except Allstate DASH (quotes, nb)
  const AUTOMATED_SOURCES = ["rc", "hs", "premium", "rico_ch", "rico_ap", "rico_leads", "eagent"]
  const activeSources = sources && sources.length > 0 ? sources : AUTOMATED_SOURCES

  const pythonDir = path.resolve(process.cwd(), "..", "excel-report-automation")
  const args = [
    "-u",  // unbuffered output — critical for streaming
    "main.py",
    "--skip-screenshots",
    "--supabase-only",
    "--sources", activeSources.join(","),
    "--date", date,
  ]

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      const proc = spawn("python", args, {
        cwd: pythonDir,
        env: { ...process.env },
      })

      function send(event: string, data: string) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      send("status", "Pipeline started...")

      proc.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf-8")
        // Send each line as a separate event
        for (const line of text.split("\n")) {
          if (line.trim()) {
            send("log", line)

            // Parse progress hints from the output
            if (line.includes("[1/6]")) send("step", "Loading agent roster...")
            else if (line.includes("[2/6]")) send("step", "Fetching data from portals...")
            else if (line.includes("[Auto-pull] Scraping eAgent")) send("step", "Scraping eAgent To-Dos...")
            else if (line.includes("[rico_leads_downloader]") && line.includes("Navigating")) send("step", "Downloading Rico Leads snapshot...")
            else if (line.includes("[rico_leads_downloader]") && line.includes("Download complete")) send("step", "Rico Leads downloaded ✓")
            else if (line.includes("DISMISSED TO-DOS")) send("step", "eAgent: Scraping dismissed to-dos...")
            else if (line.includes("PAST DUE TO-DOS")) send("step", "eAgent: Scraping past due to-dos...")
            else if (line.includes("PIVOT COMMENTS")) send("step", "eAgent: Scraping pivot comments...")
            else if (line.includes("eAgent pull successful")) send("step", "eAgent data scraped ✓")
            else if (line.includes("[az_downloader]") && line.includes("Auto-pulling")) send("step", "Downloading Premium from AgencyZoom...")
            else if (line.includes("[az_downloader]") && line.includes("Auto-downloaded")) send("step", "Premium downloaded ✓")
            else if (line.includes("[rico_ap]") && line.includes("Auto-pulling")) send("step", "Downloading Agent Performance from Ricochet...")
            else if (line.includes("[rico_ap]") && line.includes("Auto-downloaded")) send("step", "Agent Performance downloaded ✓")
            else if (line.includes("[rico_ch]") && line.includes("Auto-triggering")) send("step", "Triggering Call History export...")
            else if (line.includes("[rico_ch]") && line.includes("Waiting for emailed")) send("step", "Waiting for Call History email (up to 5 min)...")
            else if (line.includes("[rico_ch]") && line.includes("Auto-downloaded")) send("step", "Call History downloaded ✓")
            else if (line.includes("RC email fetch")) send("step", "Fetching RC from Outlook...")
            else if (line.includes("RC:") && line.includes("file(s)")) send("step", "RC downloaded from Outlook ✓")
            else if (line.includes("Hearsay auto-download")) send("step", "Downloading Hearsay reports...")
            else if (line.includes("Hearsay downloads should be ready")) send("step", "Hearsay downloaded ✓")
            else if (line.includes("[3/6]")) send("step", "Parsing all data sources...")
            else if (line.includes("[4/6]")) send("step", "Processing screenshots...")
            else if (line.includes("[5/6]")) send("step", "Pushing to Supabase...")
            else if (line.includes("[Supabase] Successfully pushed")) send("step", "Supabase push complete ✓")
            else if (line.includes("[6/6]")) send("step", "Pipeline complete!")
            else if (line.includes("SOURCE STATUS")) send("step", "Generating source status report...")
          }
        }
      })

      proc.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf-8")
        // Filter out node deprecation warnings
        if (!text.includes("DEP0169") && !text.includes("trace-deprecation")) {
          send("log", text)
        }
      })

      proc.on("close", (code) => {
        send("done", code === 0 ? "success" : "completed_with_warnings")
        controller.close()
      })

      proc.on("error", (err) => {
        send("error", err.message)
        controller.close()
      })

      // Safety timeout — 10 minutes
      setTimeout(() => {
        try {
          proc.kill()
          send("error", "Pipeline timed out after 10 minutes")
          controller.close()
        } catch {}
      }, 600000)
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
