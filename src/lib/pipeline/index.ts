/**
 * index.ts — Main pipeline orchestrator.
 *
 * Port of Python's _run_from_uploads() from main.py.
 * Receives uploaded files, auto-detects types, parses them client-side,
 * merges the data, and pushes to Supabase.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { Spine } from "./spine"
import { detectFileType, type ParseResult, type PipelineResult, type QuoteRecord, type QuoteDuplicate } from "./types"
import { mergeAllData } from "./merge"
import { pushToSupabase } from "./supabase-pusher"

// Lazy-load parsers to keep bundle size down
async function loadParsers() {
  const [rc, hs, quotes, nb, premium, ricoCH, ricoAP] = await Promise.all([
    import("./parsers/rc-parser"),
    import("./parsers/hs-parser"),
    import("./parsers/quotes-parser"),
    import("./parsers/nb-parser"),
    import("./parsers/premium-parser"),
    import("./parsers/rico-ch-parser"),
    import("./parsers/rico-ap-parser"),
  ])
  return { rc, hs, quotes, nb, premium, ricoCH, ricoAP }
}

export interface UploadFile {
  file: File
  type: string
  label: string
  hasInternalDate: boolean
  dateOverride?: string | null
}

/**
 * Process uploaded files entirely on the client side.
 * Returns a PipelineResult with structured logs.
 * 
 * @param onLog - Optional callback for real-time log streaming to the UI
 */
export async function processUploadedFiles(
  supabase: SupabaseClient,
  files: UploadFile[],
  defaultDate: string,
  onLog?: (message: string) => void,
): Promise<PipelineResult> {
  const allLogs: string[] = []
  const log = (msg: string) => {
    allLogs.push(msg)
    onLog?.(msg)
  }

  try {
    log("=" .repeat(60))
    log("  CLIENT-SIDE PIPELINE — Processing uploaded files")
    log("=" .repeat(60))
    log(`  Target date: ${defaultDate}`)
    log(`  Files: ${files.length}`)
    log("")

    // 1. Load Spine from Supabase
    log("[1/4] Loading agent name resolver from Supabase...")
    const spine = await Spine.fromSupabase(supabase)
    log(`  Loaded ${spine.agentNames().length} active agents`)

    // 2. Load parsers
    log("[2/4] Loading parsers...")
    const parsers = await loadParsers()

    // 3. Parse each file
    log("[3/4] Parsing uploaded files...")
    log("-".repeat(60))

    // Group files by type
    const filesByType = new Map<string, UploadFile[]>()
    for (const f of files) {
      if (f.type === "unknown") {
        log(`  SKIP: ${f.file.name} (unknown type)`)
        continue
      }
      const list = filesByType.get(f.type) || []
      list.push(f)
      filesByType.set(f.type, list)
      log(`  ${f.file.name} → ${f.label}`)
    }

    // Split files into internal-date (multi-day) and override-date (single day) groups
    const internalDateTypes = new Set(["rc", "quotes", "nb", "rico_ch"])
    const hasInternalDateFiles = [...filesByType.keys()].some(t => internalDateTypes.has(t))
    const hasOverrideDateFiles = [...filesByType.keys()].some(t => !internalDateTypes.has(t))

    // Parse results keyed by type
    const parseResults = new Map<string, ParseResult>()

    for (const [type, uploadFiles] of filesByType) {
      for (const uf of uploadFiles) {
        try {
          const buffer = await uf.file.arrayBuffer()
          const targetDate = uf.hasInternalDate ? null : (uf.dateOverride || defaultDate)
          let result: ParseResult

          switch (type) {
            case "rc":
              result = parsers.rc.parseRC(buffer, uf.file.name, spine, targetDate)
              break
            case "hs":
              result = parsers.hs.parseHS(buffer, uf.file.name, spine, targetDate)
              break
            case "quotes":
              result = parsers.quotes.parseQuotes(buffer, uf.file.name, spine, targetDate)
              break
            case "nb":
              result = parsers.nb.parseNB(buffer, uf.file.name, spine, targetDate)
              break
            case "premium":
              result = parsers.premium.parsePremium(buffer, uf.file.name, spine, targetDate)
              break
            case "rico_ch":
              result = parsers.ricoCH.parseRicoCH(buffer, uf.file.name, spine, targetDate)
              break
            case "rico_ap":
              result = parsers.ricoAP.parseRicoAP(buffer, uf.file.name, spine, targetDate)
              break
            default:
              log(`  SKIP: Unknown parser for type ${type}`)
              continue
          }

          // Merge into existing results for this type
          for (const l of result.logs) log(`  ${l}`)

          const existing = parseResults.get(type)
          if (existing) {
            existing.rows.push(...result.rows)
            if (result.quoteRecords) {
              existing.quoteRecords = [...(existing.quoteRecords || []), ...result.quoteRecords]
            }
            if (result.quoteDuplicates) {
              existing.quoteDuplicates = [...(existing.quoteDuplicates || []), ...result.quoteDuplicates]
            }
          } else {
            parseResults.set(type, result)
          }
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err)
          log(`  ERROR parsing ${uf.file.name}: ${errMsg}`)
        }
      }
    }

    // Source status
    log("")
    log("-".repeat(60))
    log(`  UPLOAD SOURCE STATUS for ${defaultDate}`)
    log("-".repeat(60))
    const sourceLabels: [string, string][] = [
      ["rc", "RC"], ["rico_ap", "Rico AP"], ["rico_ch", "Rico CH"],
      ["hs", "Hearsay"], ["quotes", "Quotes"], ["nb", "NB"], ["premium", "Premium"],
    ]
    for (const [key, label] of sourceLabels) {
      const r = parseResults.get(key)
      const count = r ? r.rows.length : 0
      log(`  ${label.padEnd(12)} ${count > 0 ? `✓ ${count} rows` : "— not uploaded"}`)
    }
    log("-".repeat(60))

    // Determine actual types that returned data
    const actualTypes: string[] = []
    for (const [type, result] of parseResults) {
      if (result.rows.length > 0) actualTypes.push(type)
    }

    if (actualTypes.length === 0) {
      log("")
      log("[!] No sources returned data — skipping Supabase push to preserve existing data.")
      return { success: false, logs: allLogs.join("\n"), filesProcessed: 0, sourceTypes: [], datesProcessed: [] }
    }

    // 4. Handle multi-date vs single-date mode
    log("")
    log("[4/4] Pushing to Supabase...")

    // Check if any internal-date files have multiple dates
    const allDates = new Set<string>()
    for (const type of ["quotes", "nb", "rc", "rico_ch"]) {
      const r = parseResults.get(type)
      if (r) {
        for (const row of r.rows) {
          if (row.Date) allDates.add(String(row.Date))
        }
      }
    }

    // Also add defaultDate for override-date sources
    if (hasOverrideDateFiles) allDates.add(defaultDate)

    // Collect all quote records and duplicates
    const allQuoteRecords: QuoteRecord[] = []
    const allQuoteDuplicates: QuoteDuplicate[] = []
    for (const [, result] of parseResults) {
      if (result.quoteRecords) allQuoteRecords.push(...result.quoteRecords)
      if (result.quoteDuplicates) allQuoteDuplicates.push(...result.quoteDuplicates)
    }

    const sortedDates = [...allDates].sort()
    const datesProcessed: string[] = []

    if (sortedDates.length > 1 && hasInternalDateFiles) {
      // Multi-date mode
      log(`  [MULTI-DATE] Found ${sortedDates.length} unique dates: ${sortedDates.join(", ")}`)

      for (const targetDate of sortedDates) {
        log(`\n  ${"─".repeat(50)}`)
        log(`  [MULTI-DATE] Processing ${targetDate}...`)

        // Filter each source to this specific date
        const dayData = new Map<string, Record<string, unknown>[]>()
        for (const [type, result] of parseResults) {
          if (internalDateTypes.has(type)) {
            const filtered = result.rows.filter(r => String(r.Date) === targetDate)
            if (filtered.length > 0) {
              dayData.set(type, filtered)
              log(`    ${type}: ${filtered.length} rows`)
            }
          } else {
            // Override-date sources use defaultDate
            if (targetDate === defaultDate) {
              dayData.set(type, result.rows)
            }
          }
        }

        const dayTypes = [...dayData.keys()]
        if (dayTypes.length === 0) {
          log(`    No data for ${targetDate} — skipping.`)
          continue
        }

        const dayQuotes = dayData.get("quotes") || null
        const dayNB = dayData.get("nb") || null

        const dayQuotesMain = dayQuotes ? dayQuotes.filter(r => "QuoteCount" in r) : null
        const dayQuotesDeduped = dayQuotes ? dayQuotes.filter(r => "QuotesDeduped" in r) : null
        const dayNBMain = dayNB ? dayNB.filter(r => "NBCount" in r) : null
        const dayNBAuto = dayNB ? dayNB.filter(r => "NBAutoCount" in r) : null

        const merged = mergeAllData(
          spine,
          dayData.get("rc") || null,
          dayData.get("hs") || null,
          dayNBMain,
          dayQuotesMain,
          dayData.get("premium") || null,
          dayData.get("rico_ch") || null,
          dayData.get("rico_ap") || null,
          dayQuotesDeduped,
          dayNBAuto,
        )

        const dayQuoteRecords = allQuoteRecords.filter(r => r.report_date === targetDate)
        const dayQuoteDuplicates = allQuoteDuplicates.filter(d => {
          const dm = targetDate.substring(0, 7)
          return d.report_month === dm
        })

        const pushLogs = await pushToSupabase(
          supabase, merged, targetDate, dayTypes,
          dayQuoteRecords.length > 0 ? dayQuoteRecords : undefined,
          dayQuoteDuplicates.length > 0 ? dayQuoteDuplicates : undefined,
        )
        for (const l of pushLogs) log(`    ${l}`)
        datesProcessed.push(targetDate)
      }
    } else {
      // Single-date mode
      const targetDate = sortedDates[0] || defaultDate

      // Separate quotes data into main and deduped
      const quotesMainRows = parseResults.get("quotes")?.rows.filter(r => "QuoteCount" in r) || null
      const quotesDeduped = parseResults.get("quotes")?.rows.filter(r => "QuotesDeduped" in r) || null
      const nbMainRows = parseResults.get("nb")?.rows.filter(r => "NBCount" in r) || null
      const nbAutoRows = parseResults.get("nb")?.rows.filter(r => "NBAutoCount" in r) || null

      const merged = mergeAllData(
        spine,
        parseResults.get("rc")?.rows || null,
        parseResults.get("hs")?.rows || null,
        nbMainRows,
        quotesMainRows,
        parseResults.get("premium")?.rows || null,
        parseResults.get("rico_ch")?.rows || null,
        parseResults.get("rico_ap")?.rows || null,
        quotesDeduped,
        nbAutoRows,
      )

      log(`  Merging uploaded data (sources: ${actualTypes.join(", ")})...`)

      const pushLogs = await pushToSupabase(
        supabase, merged, targetDate, actualTypes,
        allQuoteRecords.length > 0 ? allQuoteRecords : undefined,
        allQuoteDuplicates.length > 0 ? allQuoteDuplicates : undefined,
      )
      for (const l of pushLogs) log(`  ${l}`)
      datesProcessed.push(targetDate)
    }

    log("")
    log("=" .repeat(60))
    log(`  UPLOAD COMPLETE — ${datesProcessed.length} date(s) processed`)
    log("=" .repeat(60))

    return {
      success: true,
      logs: allLogs.join("\n"),
      filesProcessed: files.filter(f => f.type !== "unknown").length,
      sourceTypes: actualTypes,
      datesProcessed,
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    log(`\n[FATAL ERROR] ${errMsg}`)
    return { success: false, logs: allLogs.join("\n"), filesProcessed: 0, sourceTypes: [], datesProcessed: [] }
  }
}

// Re-export key pieces for external use
export { Spine } from "./spine"
export { detectFileType } from "./types"
export type { PipelineResult } from "./types"
