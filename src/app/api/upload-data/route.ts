import { NextRequest, NextResponse } from "next/server"
import { writeFile, mkdir } from "fs/promises"
import { exec } from "child_process"
import { promisify } from "util"
import path from "path"
import { existsSync } from "fs"

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

    // Create staging folder
    const pythonDir = path.resolve(process.cwd(), "..", "excel-report-automation")
    const uploadDir = path.join(pythonDir, "data", "uploads", `upload_${Date.now()}`)
    await mkdir(uploadDir, { recursive: true })

    // Process each file
    const files = formData.getAll("files") as File[]
    if (files.length === 0) {
      return NextResponse.json({ success: false, error: "No files uploaded" }, { status: 400 })
    }

    const fileResults: { name: string; type: string; label: string; date: string; hasInternalDate: boolean }[] = []

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
      })
    }

    // Group files by date for batch processing
    const dateGroups: Record<string, typeof fileResults> = {}
    for (const fr of fileResults) {
      if (fr.type === "unknown") continue
      if (!dateGroups[fr.date]) dateGroups[fr.date] = []
      dateGroups[fr.date].push(fr)
    }

    // Run the Python upload processor for each date group
    let allLogs = ""
    let allSuccess = true

    for (const [dateStr, dateFiles] of Object.entries(dateGroups)) {
      const typeList = dateFiles.map(f => f.type).join(",")
      const command = `python main.py --date ${dateStr} --upload-dir "${uploadDir}" --upload-types ${typeList} --skip-email --skip-screenshots --skip-hs-downloads --supabase-only`

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

    // Clean up staging folder (async, don't block)
    exec(`rmdir /s /q "${uploadDir}"`, { cwd: pythonDir })

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
