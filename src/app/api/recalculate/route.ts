import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { recalculateSummaries } from "@/lib/pipeline/recalculate-summaries"

/**
 * POST /api/recalculate
 *
 * Triggers a recalculation of period_summaries for a given year.
 * Accepts optional `months` array to limit scope.
 *
 * Body: { year: number, months?: number[] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const year = body.year || new Date().getFullYear()
    const months = body.months as number[] | undefined

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      ""

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { success: false, error: "Supabase credentials not configured" },
        { status: 500 },
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    const logs = await recalculateSummaries(supabase, year, {
      months,
      weekly: true,
      ytd: true,
    })

    return NextResponse.json({ success: true, logs })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Recalculate error:", message)
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
