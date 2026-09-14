import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type HorizonItemRow = {
  id: string
  horizon_id: string
  block_request_id: string | null
  assigned_date: string | null
  assigned_start_hour: number | null
  assigned_duration_mins: number | null
  priority_score: number | null
  status: 'scheduled' | 'deferred'
  reason: string | null
}

const ITEMS_SELECT =
  'id, horizon_id, block_request_id, assigned_date, assigned_start_hour, assigned_duration_mins, priority_score, status, reason'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const horizonId = searchParams.get('horizonId')

    if (!horizonId) {
      return NextResponse.json({ error: 'horizonId query parameter is required' }, { status: 400 })
    }

    const supabase = getSupabase()

    const { data: items, error: itemsErr } = await supabase
      .from('block_plan_horizon_items')
      .select(ITEMS_SELECT)
      .eq('horizon_id', horizonId)
      .order('assigned_date', { ascending: true })

    if (itemsErr) {
      console.error('[api/horizon-items] items fetch error:', itemsErr.message)
      return NextResponse.json({ error: itemsErr.message }, { status: 500 })
    }

    const itemsList = (items ?? []) as HorizonItemRow[]

    const reqIds = [
      ...new Set(
        itemsList
          .map((i) => i.block_request_id)
          .filter((r): r is string => Boolean(r)),
      ),
    ]

    let requests: { id: string; work_description: string | null }[] = []
    if (reqIds.length > 0) {
      const { data: reqData } = await supabase
        .from('block_requests')
        .select('id, work_description')
        .in('id', reqIds)
      requests = (reqData ?? []) as { id: string; work_description: string | null }[]
    }

    return NextResponse.json({ items: itemsList, requests })
  } catch (error) {
    console.error('[api/horizon-items] CRASHED:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An unexpected error occurred' },
      { status: 500 },
    )
  }
}
