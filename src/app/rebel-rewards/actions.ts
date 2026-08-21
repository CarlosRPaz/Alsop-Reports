"use server"

import { unstable_noStore as noStore } from "next/cache"
import { supabase } from "@/lib/supabaseClient"
import { REBEL_REWARDS_2026_SEED, RawRebelAgentRow } from "@/lib/rebelRewardsSeed"
import { calculateAgentRebelStatus, AgentRebelStandings } from "@/lib/rebelRewards"
import * as XLSX from "xlsx"

// In-memory / dynamic cache for uploaded snapshots in current server lifetime
let customUploadedRows: RawRebelAgentRow[] | null = null
let customPeriodLabel = "YTD July 2026"
let customLastUpdated = "2026-07-31"

/**
 * Fuzzy matcher to resolve Excel shortened names to Supabase agents
 */
function findBestAgentMatch(excelName: string, dbAgents: any[]) {
  const clean = excelName.toLowerCase().trim()
  
  // 1. Exact match
  const exact = dbAgents.find(a => a.name.toLowerCase().trim() === clean)
  if (exact) return exact

  // 2. Starts with / first name match (e.g. "Alex C" -> "Alex", "Chris E" -> "Chris", "Nancy G" -> "Nancy")
  const firstName = clean.split(" ")[0]
  const startsWith = dbAgents.find(a => {
    const dbFirst = a.name.toLowerCase().trim().split(" ")[0]
    return dbFirst === firstName
  })
  if (startsWith) return startsWith

  // 3. Substring includes
  const includes = dbAgents.find(a => a.name.toLowerCase().includes(firstName) || firstName.includes(a.name.toLowerCase()))
  return includes || null
}

export async function getRebelRewardsStandings(): Promise<{
  success: boolean
  standings: AgentRebelStandings[]
  periodLabel: string
  lastUpdated: string
  summary: {
    totalAgents: number
    prizeEarnersCount: number
    totalAgencyPayout: number
    anakinCount: number
    reyCount: number
    lukeCount: number
    obiwanCount: number
  }
  error?: string
}> {
  noStore()
  try {
    // 1. Fetch ALL agents from DB to match against Excel sheet
    const { data: dbAgents } = await supabase
      .from("agents")
      .select("id, name, office, team, active, report_visible")

    const agentsList = dbAgents || []
    const sourceRows = customUploadedRows || REBEL_REWARDS_2026_SEED

    // 2. Compute Rebel standings for each row
    const standings: AgentRebelStandings[] = sourceRows
      .filter(row => {
        const matchedAgent = findBestAgentMatch(row.name, agentsList)
        if (matchedAgent) {
          // If matched, hide them if they are inactive, hidden, or on Support/Other team
          if (!matchedAgent.active) return false
          if (!matchedAgent.report_visible) return false
          if (["Other", "Support"].includes(matchedAgent.team)) return false
        }
        return true
      })
      .map(row => {
        const matchedAgent = findBestAgentMatch(row.name, agentsList)
        return calculateAgentRebelStatus(
          row.name,
          row.autoItems,
          row.ips,
          row.afsPc,
          row.ivanNlItems,
          {
            agentId: matchedAgent?.id || null,
            office: matchedAgent?.office || undefined,
            team: matchedAgent?.team || undefined,
            reyByJune30: row.reyByJune30,
          }
        )
      })

    // 3. Sort by:
    // Highest Tier Rank (Obi-Wan > Luke > Rey > Anakin > None)
    // Then by Total Payout ($) descending
    // Then by Auto Items descending
    const tierWeights: Record<string, number> = {
      obiwan: 4,
      luke: 3,
      rey: 2,
      anakin: 1,
      none: 0,
    }

    standings.sort((a, b) => {
      const weightDiff = (tierWeights[b.highestTier] || 0) - (tierWeights[a.highestTier] || 0)
      if (weightDiff !== 0) return weightDiff
      if (b.totalPayout !== a.totalPayout) return b.totalPayout - a.totalPayout
      return b.autoItems - a.autoItems
    })

    // 4. Calculate Summary Statistics
    let totalAgencyPayout = 0
    let prizeEarnersCount = 0
    let anakinCount = 0
    let reyCount = 0
    let lukeCount = 0
    let obiwanCount = 0

    for (const s of standings) {
      if (s.totalPayout > 0) prizeEarnersCount++
      totalAgencyPayout += s.totalPayout
      if (s.anakin.earned) anakinCount++
      if (s.rey.earned) reyCount++
      if (s.luke.earned) lukeCount++
      if (s.obiwan.earned) obiwanCount++
    }

    return {
      success: true,
      standings,
      periodLabel: customPeriodLabel,
      lastUpdated: customLastUpdated,
      summary: {
        totalAgents: standings.length,
        prizeEarnersCount,
        totalAgencyPayout,
        anakinCount,
        reyCount,
        lukeCount,
        obiwanCount,
      },
    }
  } catch (err: any) {
    console.error("Error fetching Rebel Rewards standings:", err)
    return {
      success: false,
      standings: [],
      periodLabel: customPeriodLabel,
      lastUpdated: customLastUpdated,
      summary: {
        totalAgents: 0,
        prizeEarnersCount: 0,
        totalAgencyPayout: 0,
        anakinCount: 0,
        reyCount: 0,
        lukeCount: 0,
        obiwanCount: 0,
      },
      error: err?.message || "Failed to calculate standings",
    }
  }
}

/**
 * Server action to process an uploaded monthly Excel report
 */
export async function uploadRebelRewardsExcel(base64Data: string, fileName: string) {
  noStore()
  try {
    const buffer = Buffer.from(base64Data, "base64")
    const wb = XLSX.read(buffer, { type: "buffer" })
    const sheetName = wb.SheetNames[0]
    const ws = wb.Sheets[sheetName]
    const rawRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 })

    if (rawRows.length < 7) {
      return { success: false, error: "The uploaded file does not contain enough data rows." }
    }

    const parsedAgents: RawRebelAgentRow[] = []

    // Read rows starting from row 7 (index 6)
    for (let i = 6; i < rawRows.length; i++) {
      const row = rawRows[i]
      if (row && typeof row[0] === "string" && row[0].trim() !== "") {
        const name = row[0].trim()
        const autoItems = Number(row[1]) || 0
        const ips = Number(row[2]) || 0
        const afsPc = Number(row[3]) || 0
        const ivanNlItems = Number(row[4]) || 0
        parsedAgents.push({ name, autoItems, ips, afsPc, ivanNlItems })
      }
    }

    if (parsedAgents.length === 0) {
      return { success: false, error: "No valid agent rows were found in the uploaded file." }
    }

    // Extract period label from header if present
    let detectedPeriod = fileName.replace(/\.[^/.]+$/, "")
    if (rawRows[2] && typeof rawRows[2][1] === "string") {
      detectedPeriod = rawRows[2][1]
    }

    customUploadedRows = parsedAgents
    customPeriodLabel = detectedPeriod || "Updated YTD Report"
    customLastUpdated = new Date().toISOString().split("T")[0]

    return {
      success: true,
      agentCount: parsedAgents.length,
      periodLabel: customPeriodLabel,
    }
  } catch (err: any) {
    console.error("Error parsing uploaded Rebel Rewards Excel file:", err)
    return { success: false, error: err?.message || "Failed to parse Excel file." }
  }
}
