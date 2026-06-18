import { NextRequest, NextResponse } from "next/server"
import { writeFile, mkdir } from "fs/promises"
import { exec } from "child_process"
import { promisify } from "util"
import path from "path"
import { existsSync } from "fs"
import { createClient } from "@supabase/supabase-js"

const execAsync = promisify(exec)

/**
 * File type detection patterns.
 * Order matters — first match wins.
 */
const FILE_PATTERNS: { pattern: RegExp; type: string; label: string; hasInternalDate: boolean }[] = [
  { pattern: /^rc_/i, type: "rc", label: "RC (RingCentral)", hasInternalDate: true },
  { pattern: /Office_Perf.*Users/i, type: "rc", label: "RC (RingCentral)", hasInternalDate: true },
  { pattern: /Performance Breakdown Report/i, type: "hs", label: "Hearsay", hasInternalDate: false },
  { pattern: /Quotes Detail Report/i, type: "quotes", label: "Quotes", hasInternalDate: true },
  { pattern: /New Business Details/i, type: "nb", label: "NB (Items)", hasInternalDate: true },
  { pattern: /sales-report/i, type: "premium", label: "Premium (AgencyZoom)", hasInternalDate: false },
  { pattern: /^ch-/i, type: "rico_ch", label: "Rico CH (Talk Time)", hasInternalDate: true },
  { pattern: /Agent Performance/i, type: "rico_ap", label: "Rico AP (Calls)", hasInternalDate: false },
]

function detectFileType(filename: string) {
  for (const p of FILE_PATTERNS) {
    if (p.pattern.test(filename)) {
      return p
    }
  }
  return null
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    // Parse the file-to-date mapping (JSON string)
    const fileDatesRaw = formData.get("fileDates") as string
    const fileDates: Record<string, string> = fileDatesRaw ? JSON.parse(fileDatesRaw) : {}
    const defaultDate = formData.get("defaultDate") as string

    if (!defaultDate) {
      return NextResponse.json({ success: false, error: "Target date is required" }, { status: 400 })
    }

    // Check if we are running in Vercel or if the local python pipeline directory is missing
    const pythonDir = path.resolve(process.cwd(), "..", "excel-report-automation")
    if (process.env.VERCEL || !existsSync(pythonDir)) {
      return NextResponse.json({
        success: false,
        error: "Data synchronization must be run from your local server (http://localhost:3000/admin/sync). The live website runs in a serverless cloud environment that cannot access your local files or execute the Python processing pipeline."
      }, { status: 400 })
    }

    const uploadDir = path.join(pythonDir, "data", "uploads", `upload_${Date.now()}`)
    await mkdir(uploadDir, { recursive: true })

    // Process each file
    const files = formData.getAll("files") as File[]
    const autoScrape = formData.get("autoScrape") as string

    if (files.length === 0 && !autoScrape) {
      return NextResponse.json({ success: false, error: "No files uploaded and no scraper specified" }, { status: 400 })
    }

    const fileResults: { name: string; type: string; label: string; date: string; hasInternalDate: boolean; sizeBytes: number }[] = []

    for (const file of files) {
      const detection = detectFileType(file.name)
      const fileDate = fileDates[file.name] || defaultDate

      // Save file to staging
      const buffer = Buffer.from(await file.arrayBuffer())
      const destPath = path.join(uploadDir, file.name)
      await writeFile(destPath, buffer)

      fileResults.push({
        name: file.name,
        type: detection?.type || "unknown",
        label: detection?.label || "Unknown",
        date: fileDate,
        hasInternalDate: detection?.hasInternalDate || false,
        sizeBytes: buffer.length,
      })
    }

    // Split files into internal-date (multi-day) and override-date (single day) groups
    const internalDateFiles = fileResults.filter(f => f.hasInternalDate && f.type !== "unknown")
    const overrideDateFiles = fileResults.filter(f => !f.hasInternalDate && f.type !== "unknown")

    // Record upload history initially as processing
    let uploadId: string | null = null
    const knownFiles = fileResults.filter(f => f.type !== "unknown")
    const sourceTypes = [...new Set(knownFiles.map(f => f.type))]
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
      if (supabaseUrl && supabaseKey && knownFiles.length > 0) {
        const supabase = createClient(supabaseUrl, supabaseKey)
        const { data: uploadRow } = await supabase
          .from("upload_history")
          .insert({
            target_date: defaultDate,
            status: "processing",
            file_count: knownFiles.length,
            source_types: sourceTypes,
            logs: "Uploading and processing...",
          })
          .select("id")
          .single()
        
        if (uploadRow?.id) {
          uploadId = uploadRow.id
          
          const fileRows = knownFiles.map(f => ({
            upload_id: uploadId,
            filename: f.name,
            file_type: f.type,
            file_label: f.label,
            has_internal_date: f.hasInternalDate,
            target_date: f.hasInternalDate ? defaultDate : f.date,
            file_size_bytes: f.sizeBytes,
            status: "active"
          }))
          await supabase.from("upload_history_files").insert(fileRows)
        }
      }
    } catch (historyErr) {
      console.error("Failed to initialize upload history:", historyErr)
    }

    if (files.length === 0 && autoScrape) {
      // Map frontend source keys to Python source names
      const SOURCE_KEY_MAP: Record<string, string> = { leads: "rico_leads" }
      const pythonSourceKey = SOURCE_KEY_MAP[autoScrape] || autoScrape

      let allLogs = `\n${"=".repeat(60)}\n  Running Auto-Scraper for ${defaultDate}: ${pythonSourceKey}\n${"=".repeat(60)}\n`
      let allSuccess = true
      // Don't pass --skip-email: the portal-fetch step must run for auto-scrape downloads.
      // The --sources filter ensures only the requested source's downloader executes.
      const command = `python main.py --date ${defaultDate} --sources ${pythonSourceKey} --skip-screenshots --skip-hs-downloads --supabase-only`

      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd: pythonDir,
          timeout: 120000,
          maxBuffer: 1024 * 1024,
        })
        allLogs += stdout + (stderr ? "\n" + stderr : "")
      } catch (error: any) {
        allSuccess = false
        allLogs += (error.stdout || "") + "\n" + (error.stderr || "") + "\n" + error.message
      }

      return NextResponse.json({
        success: allSuccess,
        files: [],
        logs: allLogs,
      })
    }

    // Run the Python upload processor
    let allLogs = ""
    let allSuccess = true

    // 1. Process internal-date files (quotes, nb, rc, rico_ch) — no date filter,
    //    the parser reads ALL dates from within the file data
    if (internalDateFiles.length > 0) {
      const typeList = [...new Set(internalDateFiles.map(f => f.type))].join(",")
      const uploadIdArg = uploadId ? ` --upload-id ${uploadId}` : ""
      const command = `python main.py --upload-dir "${uploadDir}" --upload-types ${typeList} --no-date-filter --skip-email --skip-screenshots --skip-hs-downloads --supabase-only${uploadIdArg}`

      allLogs += `\n${"=".repeat(60)}\n  Processing (all dates from file): ${internalDateFiles.map(f => f.label).join(", ")}\n${"=".repeat(60)}\n`

      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd: pythonDir,
          timeout: 120000,
          maxBuffer: 1024 * 1024,
        })
        allLogs += stdout + (stderr ? "\n" + stderr : "")
      } catch (error: any) {
        allSuccess = false
        allLogs += (error.stdout || "") + "\n" + (error.stderr || "") + "\n" + error.message
      }
    }

    // 2. Process override-date files (hs, premium, rico_ap) — grouped by date
    if (overrideDateFiles.length > 0) {
      const dateGroups: Record<string, typeof fileResults> = {}
      for (const fr of overrideDateFiles) {
        const d = fr.date
        if (!dateGroups[d]) dateGroups[d] = []
        dateGroups[d].push(fr)
      }

      for (const [dateStr, dateFiles] of Object.entries(dateGroups)) {
        const typeList = [...new Set(dateFiles.map(f => f.type))].join(",")
        const uploadIdArg = uploadId ? ` --upload-id ${uploadId}` : ""
        const command = `python main.py --date ${dateStr} --upload-dir "${uploadDir}" --upload-types ${typeList} --skip-email --skip-screenshots --skip-hs-downloads --supabase-only${uploadIdArg}`

        allLogs += `\n${"=".repeat(60)}\n  Processing ${dateStr}: ${dateFiles.map(f => f.label).join(", ")}\n${"=".repeat(60)}\n`

        try {
          const { stdout, stderr } = await execAsync(command, {
            cwd: pythonDir,
            timeout: 120000,
            maxBuffer: 1024 * 1024,
          })
          allLogs += stdout + (stderr ? "\n" + stderr : "")
        } catch (error: any) {
          allSuccess = false
          allLogs += (error.stdout || "") + "\n" + (error.stderr || "") + "\n" + error.message
        }
      }
    }

    // Clean up staging folder (async, don't block)
    exec(`rmdir /s /q "${uploadDir}"`, { cwd: pythonDir })

    // Update upload history record with final status and logs
    if (uploadId) {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
        if (supabaseUrl && supabaseKey) {
          const supabase = createClient(supabaseUrl, supabaseKey)
          await supabase
            .from("upload_history")
            .update({
              status: allSuccess ? "success" : "error",
              logs: allLogs.substring(0, 2000),
            })
            .eq("id", uploadId)
        }
      } catch (historyErr) {
        console.error("Failed to update upload history:", historyErr)
      }
    }

    return NextResponse.json({
      success: allSuccess,
      files: fileResults,
      logs: allLogs,
    })
  } catch (error: any) {
    console.error("Upload error:", error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

/** GET handler for file type detection (preview without uploading) */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    patterns: FILE_PATTERNS.map(p => ({
      type: p.type,
      label: p.label,
      hasInternalDate: p.hasInternalDate,
    })),
  })
}
