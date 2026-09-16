import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type HorizonRow = {
  id: string
  horizon_type: 'weekly' | 'monthly'
  horizon_start: string
  horizon_end: string
  projected_availability_pct: number | null
  summary_explanation: string | null
  generated_at: string
  items_improved_by_local_search: number | null
}

const HORIZONS_SELECT =
  'id, horizon_type, horizon_start, horizon_end, projected_availability_pct, summary_explanation, generated_at, items_improved_by_local_search'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET() {
  try {
    const supabase = getSupabase()

    const { data, error } = await supabase
      .from('block_plan_horizons')
      .select(HORIZONS_SELECT)
      .order('generated_at', { ascending: false })

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
