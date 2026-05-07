"use server"

import { exec } from "child_process"
import { promisify } from "util"
import path from "path"

const execAsync = promisify(exec)

export async function runDataSyncPipeline(dateString?: string) {
  try {
    // Determine the path to the python directory (one level up from dsr-dashboard)
    const pythonDir = path.resolve(process.cwd(), "..", "excel-report-automation")
    
    // Construct the command
    // --supabase-only: skip Excel master write (avoids crashes if the file is open)
    // --skip-email: use existing downloaded files
    // --skip-screenshots: skip OCR processing
    let command = 'python main.py --skip-email --skip-screenshots --supabase-only'
    if (dateString) {
      command += ` --date ${dateString}`
    }

    console.log(`Executing pipeline in ${pythonDir}: ${command}`)

    const { stdout, stderr } = await execAsync(command, {
      cwd: pythonDir,
      timeout: 120000, // 2 minute timeout
      maxBuffer: 1024 * 1024, // 1MB output buffer
    })

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
