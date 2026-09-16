import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type HorizonRow = {
  id: string
  horizon_type: 'weekly' | 'monthly'
  horizon_start: string
  horizon_end: string
  projected_availability_pct: number | null
  corridor_id: number | null
  summary_explanation: string | null
  generated_at: string
}

const HORIZONS_SELECT =
  'id, horizon_type, horizon_start, horizon_end, projected_availability_pct, corridor_id, summary_explanation, generated_at'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const corridorIdParam = searchParams.get('corridorId')

    let corridorId: number | null = null
    if (corridorIdParam != null) {
      corridorId = Number(corridorIdParam)
      if (Number.isNaN(corridorId) || !Number.isInteger(corridorId)) {
        return NextResponse.json({ error: 'corridorId must be an integer' }, { status: 400 })
      }
    }

    const supabase = getSupabase()

    let query = supabase
      .from('block_plan_horizons')
      .select(HORIZONS_SELECT)
      .order('generated_at', { ascending: false })

    if (corridorId != null) {
      query = query.eq('corridor_id', corridorId)
    }

    const { data, error } = await query

    if (error) {
      console.error('[api/horizons] fetch error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ horizons: (data as HorizonRow[] | null) ?? [] })
  } catch (error) {
    console.error('[api/horizons] CRASHED:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An unexpected error occurred' },
      { status: 500 },
    )
  }
}
