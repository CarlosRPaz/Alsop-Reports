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

  // Next Tier Requirements Target
  let nextTier: RebelRewardTier | null = null
  if (!anakinEarned) nextTier = REBEL_TIERS[0]
  else if (!reyEarned) nextTier = REBEL_TIERS[1]
  else if (!lukeEarned) nextTier = REBEL_TIERS[2]
  else if (!obiwanEarned) nextTier = REBEL_TIERS[3]

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
