import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type MlPredictResponse = {
  priority_score?: number
  delay_risk?: string
}

/** Best-effort shape of a block_requests row (the DB stores more columns at
 * runtime than this type declares, e.g. trains_scheduled_in_window). */
type BlockRequestRow = {
  id: string
  segment_id: number | null
  work_type: string
  requested_start: string
  requested_duration_mins: number
  safety_criticality: string
  trains_scheduled_in_window?: number | null
  asset_risk_flag?: number | null
  historical_overrun_rate?: number | null
}

type ScoreRequestBody = {
  id?: string
  /** When true the requested score is returned without persisting it. Used by
   * the AI dashboard's "What if?" live preview. */
  preview?: boolean
  /** Optional overrides used only in preview mode. */
  requested_duration_mins?: number
  trains_scheduled_in_window?: number
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()

    let body: ScoreRequestBody
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { id, preview = false, requested_duration_mins, trains_scheduled_in_window } = body
    if (!id) {
      return NextResponse.json({ error: 'block_request id is required' }, { status: 400 })
    }

    const { data: blockRequest, error: fetchError } = await supabase
      .from('block_requests')
      .select('*')
      .eq('id', id)
      .single<BlockRequestRow>()

    if (fetchError || !blockRequest) {
      return NextResponse.json(
        { error: fetchError?.message ?? 'block_request not found' },
        { status: 404 }
      )
    }

    const mlApiUrl = process.env.ML_API_URL
    if (!mlApiUrl) {
      return NextResponse.json({ error: 'ML_API_URL is not configured' }, { status: 500 })
    }

    // The model was trained on a `segment` category (e.g. "A-B"), not the raw
    // segment_id. Resolve the human-readable segment name from the segments
    // table, falling back to the id if it can't be looked up.
    let segment = 'unknown'
    if (blockRequest.segment_id != null) {
      const { data: seg } = await supabase
        .from('segments')
        .select('name')
        .eq('id', blockRequest.segment_id)
        .single<{ name: string }>()
      segment = seg?.name ?? String(blockRequest.segment_id)
    }

    // Derive requested_start_hour (0-23) from the requested_start timestamp so
    // it matches the feature the model was trained on.
    let requestedStartHour = 0
    const parsed = Date.parse(blockRequest.requested_start)
    if (!Number.isNaN(parsed)) {
      requestedStartHour = new Date(parsed).getHours()
    }

    const mlResponse = await fetch(`${mlApiUrl}/predict-priority`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        segment,
        requested_start_hour: requestedStartHour,
        requested_duration_mins: requested_duration_mins ?? blockRequest.requested_duration_mins,
        work_type: blockRequest.work_type,
        safety_criticality: blockRequest.safety_criticality,
        trains_scheduled_in_window: trains_scheduled_in_window ?? blockRequest.trains_scheduled_in_window ?? 0,
        asset_risk_flag: blockRequest.asset_risk_flag ?? 0,
        historical_overrun_rate: blockRequest.historical_overrun_rate ?? 0,
      }),
      cache: 'no-store',
    })

    if (!mlResponse.ok) {
      const detail = await mlResponse.text()
      return NextResponse.json(
        { error: `ML API request failed (${mlResponse.status}): ${detail}` },
        { status: 502 }
      )
    }

    const mlResult: MlPredictResponse = await mlResponse.json()

    const priorityScore = mlResult.priority_score
    const delayRisk = mlResult.delay_risk ?? null

    if (priorityScore === undefined || priorityScore === null) {
      return NextResponse.json(
        { error: 'ML API did not return a priority_score' },
        { status: 502 }
      )
    }

    // In preview mode we return the prediction without persisting it.
    if (!preview) {
      const { error: updateError } = await supabase
        .from('block_requests')
        .update({
          priority_score: priorityScore,
          delay_risk: delayRisk,
          status: 'scored',
        })
        .eq('id', id)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }
    }

    return NextResponse.json({
      id,
      priority_score: priorityScore,
      delay_risk: delayRisk,
      status: preview ? 'preview' : 'scored',
      preview,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
