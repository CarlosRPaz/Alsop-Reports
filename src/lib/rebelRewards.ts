/**
 * Rebel Rewards Calculation Engine & Tier Logic
 * Alsop & Associates Cumulative Annual Contest
 */

export interface RebelRewardTier {
  id: "anakin" | "rey" | "luke" | "obiwan"
  name: string
  character: string
  icon: string
  color: string
  bgGradient: string
  borderColor: string
  prizeText: string
  basePayout: number
  ruleText: "Hit 2 of 3" | "Hit 3 of 3"
  requiredHits: number
  targets: {
    autoItems: number
    ips: number
    afsPc: number
    ivanNlItems: number
  }
  yodaBonusText?: string
}

export const REBEL_TIERS: RebelRewardTier[] = [
  {
    id: "anakin",
    name: "Anakin Skywalker",
    character: "Anakin",
    icon: "🗡️",
    color: "blue",
    bgGradient: "from-blue-600 to-indigo-700",
    borderColor: "border-blue-400",
    prizeText: "$400 Disney",
    basePayout: 400,
    ruleText: "Hit 2 of 3",
    requiredHits: 2,
    targets: {
      autoItems: 120,
      ips: 1,
      afsPc: 1000,
      ivanNlItems: 25,
    },
  },
  {
    id: "rey",
    name: "Rey Skywalker",
    character: "Rey",
    icon: "💫",
    color: "cyan",
    bgGradient: "from-cyan-600 to-blue-700",
    borderColor: "border-cyan-400",
    prizeText: "$2,000",
    basePayout: 2000,
    ruleText: "Hit 3 of 3",
    requiredHits: 3,
    targets: {
      autoItems: 240,
      ips: 3,
      afsPc: 5000,
      ivanNlItems: 45,
    },
    yodaBonusText: "⚡ Yoda Bonus: If hit by June 30th ➔ $4,000 Payout (+$2,000 Bonus)",
  },
  {
    id: "luke",
    name: "Luke Skywalker",
    character: "Luke",
    icon: "⚔️",
    color: "amber",
    bgGradient: "from-amber-600 to-yellow-600",
    borderColor: "border-amber-400",
    prizeText: "$3,000",
    basePayout: 3000,
    ruleText: "Hit 2 of 3",
    requiredHits: 2,
    targets: {
      autoItems: 360,
      ips: 5,
      afsPc: 10000,
      ivanNlItems: 65,
    },
    yodaBonusText: "🌟 Yoda Bonus: Hit 1 of 3 ➔ Disney Bonus Prize!",
  },
  {
    id: "obiwan",
    name: "Obi-Wan Kenobi",
    character: "Obi-Wan",
    icon: "🧘",
    color: "purple",
    bgGradient: "from-purple-600 to-indigo-800",
    borderColor: "border-purple-400",
    prizeText: "$5,000",
    basePayout: 5000,
    ruleText: "Hit 3 of 3",
    requiredHits: 3,
    targets: {
      autoItems: 500,
      ips: 10,
      afsPc: 20000,
      ivanNlItems: 75,
    },
    yodaBonusText: "👑 Grand Jedi Master Award",
  },
]

export interface AgentRebelStandings {
  agentName: string
  agentId?: string | null
  office?: string
  team?: string
  autoItems: number
  ips: number
  afsPc: number
  ivanNlItems: number
  
  // Criteria checks for each tier
  anakin: {
    autoHit: boolean
    afsHit: boolean
    ivanHit: boolean
    hits: number
    earned: boolean
  }
  rey: {
    autoHit: boolean
    afsHit: boolean
    ivanHit: boolean
    hits: number
    earned: boolean
    yodaBonusEarned?: boolean
  }
  luke: {
    autoHit: boolean
    afsHit: boolean
    ivanHit: boolean
    hits: number
    earned: boolean
    yodaBonusEarned?: boolean
  }
  obiwan: {
    autoHit: boolean
    afsHit: boolean
    ivanHit: boolean
    hits: number
    earned: boolean
  }

  // Aggregate results
  highestTier: "none" | "anakin" | "rey" | "luke" | "obiwan"
  totalPayout: number
  payoutBreakdown: string[]
  nextTier: RebelRewardTier | null
  nextTierProgress: {
    autoItemsNeeded: number
    ipsNeeded: number
    afsPcNeeded: number
    ivanNeeded: number
    autoPercent: number
    afsPercent: number
    ivanPercent: number
  } | null
}

/**
 * Calculates full Rebel Rewards evaluations for an agent's YTD metrics.
 */
export function calculateAgentRebelStatus(
  agentName: string,
  rawAuto: number,
  rawIps: number,
  rawAfsPc: number,
  rawIvan: number,
  extra?: {
    agentId?: string | null
    office?: string
    team?: string
    reyByJune30?: boolean
  }
): AgentRebelStandings {
  const autoItems = Number(rawAuto) || 0
  const ips = Number(rawIps) || 0
  const afsPc = Number(rawAfsPc) || 0
  const ivanNlItems = Number(rawIvan) || 0

  // 1. Anakin (Hit 2 of 3)
  const anakinAuto = autoItems >= 120
  const anakinAfs = ips >= 1 || afsPc >= 1000
  const anakinIvan = ivanNlItems >= 25
  const anakinHits = (anakinAuto ? 1 : 0) + (anakinAfs ? 1 : 0) + (anakinIvan ? 1 : 0)
  const anakinEarned = anakinHits >= 2

  // 2. Rey (Hit 3 of 3)
  const reyAuto = autoItems >= 240
  const reyAfs = ips >= 3 || afsPc >= 5000
  const reyIvan = ivanNlItems >= 45
  const reyHits = (reyAuto ? 1 : 0) + (reyAfs ? 1 : 0) + (reyIvan ? 1 : 0)
  const reyEarned = reyHits >= 3
  const reyYodaBonusEarned = reyEarned && !!extra?.reyByJune30

  // 3. Luke (Hit 2 of 3)
  const lukeAuto = autoItems >= 360
  const lukeAfs = ips >= 5 || afsPc >= 10000
  const lukeIvan = ivanNlItems >= 65
  const lukeHits = (lukeAuto ? 1 : 0) + (lukeAfs ? 1 : 0) + (lukeIvan ? 1 : 0)
  const lukeEarned = lukeHits >= 2
  const lukeYodaBonusEarned = lukeHits >= 1 // Hit 1 of 3 Disney bonus

  // 4. Obi-Wan (Hit 3 of 3)
  const obiwanAuto = autoItems >= 500
  const obiwanAfs = ips >= 10 || afsPc >= 20000
  const obiwanIvan = ivanNlItems >= 75
  const obiwanHits = (obiwanAuto ? 1 : 0) + (obiwanAfs ? 1 : 0) + (obiwanIvan ? 1 : 0)
  const obiwanEarned = obiwanHits >= 3

  // Highest Tier Determination
  let highestTier: "none" | "anakin" | "rey" | "luke" | "obiwan" = "none"
  if (obiwanEarned) highestTier = "obiwan"
  else if (lukeEarned) highestTier = "luke"
  else if (reyEarned) highestTier = "rey"
  else if (anakinEarned) highestTier = "anakin"

  // Cumulative Payout Calculation
  let totalPayout = 0
  const payoutBreakdown: string[] = []

  if (anakinEarned) {
    totalPayout += 400
    payoutBreakdown.push("Anakin: $400 Disney")
  }
  if (reyEarned) {
    const reyAmt = reyYodaBonusEarned ? 4000 : 2000
    totalPayout += reyAmt
    payoutBreakdown.push(reyYodaBonusEarned ? "Rey (Early Bird): $4,000" : "Rey: $2,000")
  }
  if (lukeEarned) {
    totalPayout += 3000
    payoutBreakdown.push("Luke: $3,000")
  }
  if (obiwanEarned) {
    totalPayout += 5000
    payoutBreakdown.push("Obi-Wan: $5,000")
  }

  // Smart "True Goal" Determination for Next Tier
  // Instead of strict sequential (Anakin -> Rey -> Luke -> Obi-Wan), find the most
  // realistic unearned tier based on the agent's active production and required hits (2 of 3 vs 3 of 3).
  const unearnedTiers: RebelRewardTier[] = []
  if (!anakinEarned) unearnedTiers.push(REBEL_TIERS[0])
  if (!reyEarned) unearnedTiers.push(REBEL_TIERS[1])
  if (!lukeEarned) unearnedTiers.push(REBEL_TIERS[2])
  if (!obiwanEarned) unearnedTiers.push(REBEL_TIERS[3])

  let nextTier: RebelRewardTier | null = null
  if (unearnedTiers.length > 0) {
    if (unearnedTiers.length === 1) {
      nextTier = unearnedTiers[0]
    } else {
      const scoredTiers = unearnedTiers.map(tier => {
        const t = tier.targets
        const autoRatio = Math.min(1, autoItems / t.autoItems)
        const afsRatio = Math.min(1, Math.max(ips / t.ips, afsPc / t.afsPc))
        const ivanRatio = Math.min(1, ivanNlItems / t.ivanNlItems)

        const deficits = [
          { key: "auto", deficit: 1 - autoRatio, val: autoItems },
          { key: "afs", deficit: 1 - afsRatio, val: ips },
          { key: "ivan", deficit: 1 - ivanRatio, val: ivanNlItems },
        ].sort((a, b) => a.deficit - b.deficit)

        // For "Hit 2 of 3", take the 2 closest metrics (lowest deficits)
        // For "Hit 3 of 3", take all 3 metrics
        const relevantDeficits = deficits.slice(0, tier.requiredHits)
        const totalDeficit = relevantDeficits.reduce((sum, d) => sum + d.deficit, 0)
        
        // If 3 of 3 requires producing in a category where agent has 0 activity (e.g. Ivantage),
        // add a penalty so 2-of-3 tiers (like Luke) are prioritized
        const requiresZeroCat = tier.requiredHits === 3 && (autoItems === 0 || (ips === 0 && afsPc === 0) || ivanNlItems === 0)
        const adjustedDeficit = totalDeficit + (requiresZeroCat ? 0.6 : 0)

        return {
          tier,
          totalDeficit: adjustedDeficit,
        }
      })

      scoredTiers.sort((a, b) => a.totalDeficit - b.totalDeficit)
      nextTier = scoredTiers[0].tier
    }
  }

  let nextTierProgress = null
  if (nextTier) {
    const t = nextTier.targets
    const autoItemsNeeded = Math.max(0, t.autoItems - autoItems)
    const ipsNeeded = Math.max(0, t.ips - ips)
    const afsPcNeeded = Math.max(0, t.afsPc - afsPc)
    const ivanNeeded = Math.max(0, t.ivanNlItems - ivanNlItems)

    const autoPercent = Math.min(100, Math.round((autoItems / t.autoItems) * 100))
    const afsPercent = Math.min(
      100,
      Math.max(
        Math.round((ips / t.ips) * 100),
        Math.round((afsPc / t.afsPc) * 100)
      )
    )
    const ivanPercent = Math.min(100, Math.round((ivanNlItems / t.ivanNlItems) * 100))

    nextTierProgress = {
      autoItemsNeeded,
      ipsNeeded,
      afsPcNeeded,
      ivanNeeded,
      autoPercent,
      afsPercent,
      ivanPercent,
    }
  }

  return {
    agentName,
    agentId: extra?.agentId || null,
    office: extra?.office,
    team: extra?.team,
    autoItems,
    ips,
    afsPc,
    ivanNlItems,
    anakin: {
      autoHit: anakinAuto,
      afsHit: anakinAfs,
      ivanHit: anakinIvan,
      hits: anakinHits,
      earned: anakinEarned,
    },
    rey: {
      autoHit: reyAuto,
      afsHit: reyAfs,
      ivanHit: reyIvan,
      hits: reyHits,
      earned: reyEarned,
      yodaBonusEarned: reyYodaBonusEarned,
    },
    luke: {
      autoHit: lukeAuto,
      afsHit: lukeAfs,
      ivanHit: lukeIvan,
      hits: lukeHits,
      earned: lukeEarned,
      yodaBonusEarned: lukeYodaBonusEarned,
    },
    obiwan: {
      autoHit: obiwanAuto,
      afsHit: obiwanAfs,
      ivanHit: obiwanIvan,
      hits: obiwanHits,
      earned: obiwanEarned,
    },
    highestTier,
    totalPayout,
    payoutBreakdown,
    nextTier,
    nextTierProgress,
  }
}

// ---------------------------------------------------------------------------
// Contest Name Matcher & Alias Map
// ---------------------------------------------------------------------------

export const KNOWN_CONTEST_ALIASES: Record<string, string> = {
  "alex c": "alex",
  "chris e": "chris",
  "nancy g": "nancy",
  "rosario d": "rosie",
  "rosario": "rosie",
  "ricardo": "ric becerra",
  "ric": "ric becerra",
  "john paul": "john paul dizon",
  "jennifer": "jennifer martinez",
}

/**
 * Checks if a contest sheet name matches a DB agent name (bidirectional, with alias support)
 */
export function matchesContestAgent(nameA: string, nameB: string): boolean {
  if (!nameA || !nameB) return false
  const a = nameA.toLowerCase().trim()
  const b = nameB.toLowerCase().trim()

  // 1. Direct exact match
  if (a === b) return true

  // 2. Direct alias mapping
  if (KNOWN_CONTEST_ALIASES[a] === b || KNOWN_CONTEST_ALIASES[b] === a) return true

  // 3. Normalized alias check (e.g. "Rosario D" -> "Rosie", check against "Rosie")
  const aliasA = KNOWN_CONTEST_ALIASES[a] || a
  const aliasB = KNOWN_CONTEST_ALIASES[b] || b
  if (aliasA === aliasB) return true
  if (aliasA.split(" ")[0] === aliasB.split(" ")[0] && aliasA.split(" ")[0].length > 2) return true

  // 4. First name match
  const firstA = a.split(" ")[0]
  const firstB = b.split(" ")[0]
  if (firstA === firstB && firstA.length > 2) return true

  return false
}

/**
 * Finds the best DB agent match for a given contest row name
 */
export function resolveContestAgentMatch(contestName: string, dbAgents: any[]): any | null {
  const clean = contestName.toLowerCase().trim()

  // 1. Check known aliases first
  if (KNOWN_CONTEST_ALIASES[clean]) {
    const target = KNOWN_CONTEST_ALIASES[clean]
    const aliasExact = dbAgents.find(a => a.name?.toLowerCase().trim() === target)
    if (aliasExact) return aliasExact
    const aliasPartial = dbAgents.find(a => {
      const dbLower = a.name?.toLowerCase().trim() || ""
      return dbLower.includes(target) || target.includes(dbLower)
    })
    if (aliasPartial) return aliasPartial
  }

  // 2. Exact match
  const exact = dbAgents.find(a => a.name?.toLowerCase().trim() === clean)
  if (exact) return exact

  // 3. First name tiebreak
  const first = clean.split(" ")[0]
  const matches = dbAgents.filter(a => a.name?.toLowerCase().trim().split(" ")[0] === first)
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) {
    // Prioritize exact single-word first name match (e.g. "Nancy" over "Nancy Maldonado")
    const exactFirst = matches.find(a => a.name?.toLowerCase().trim() === first)
    if (exactFirst) return exactFirst
    // Prioritize active production agents
    const prodTeam = matches.find(a => ["Sales", "CSR", "EA"].includes(a.team))
    if (prodTeam) return prodTeam
    return matches[0]
  }

  return null
}

