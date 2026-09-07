import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ScoreError } from '@/lib/scoring'

type ScoreRequestBody = {
  id?: string
  preview?: boolean
  requested_duration_mins?: number
  trains_scheduled_in_window?: number
}

type MlPredictResponse = {
  priority_score: number
  delay_risk?: number | null
}

export async function POST(request: NextRequest) {
  try {
    let body: ScoreRequestBody
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const {
      id,
      preview = false,
      requested_duration_mins,
      trains_scheduled_in_window,
    } = body

    if (!id) {
      return NextResponse.json(
        { error: 'block_request id is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const { data: blockRequest, error: fetchError } = await supabase
      .from('block_requests')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !blockRequest) {
      return NextResponse.json(
        { error: fetchError?.message ?? 'block_request not found' },
        { status: 404 }
      )
    }

    const mlApiUrl = process.env.ML_API_URL || 'https://railsync-ml.onrender.com'
    
    let segment = 'unknown'
    if ((blockRequest as any).segment_id != null) {
      const { data: seg } = await supabase
        .from('segments')
        .select('name')
        .eq('id', (blockRequest as any).segment_id)
        .single<{ name: string }>()
      segment = seg?.name ?? String((blockRequest as any).segment_id)
    }

    let requestedStartHour = 0
    const parsed = Date.parse((blockRequest as any).requested_start)
    if (!Number.isNaN(parsed)) {
      requestedStartHour = new Date(parsed).getHours()
    }

    const mlResponse = await fetch(`${mlApiUrl}/predict-priority`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        segment,
        requested_start_hour: requestedStartHour,
        requested_duration_mins: requested_duration_mins ?? (blockRequest as any).requested_duration_mins,
        work_type: (blockRequest as any).work_type,
        safety_criticality: (blockRequest as any).safety_criticality,
        trains_scheduled_in_window: trains_scheduled_in_window ?? (blockRequest as any).trains_scheduled_in_window ?? 0,
        asset_risk_flag: (blockRequest as any).asset_risk_flag ?? 0,
        historical_overrun_rate: (blockRequest as any).historical_overrun_rate ?? 0,
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

    if (!preview) {
      const { error: updateError } = await supabase
        .from('block_requests')
        .update({
          priority_score: priorityScore,
          delay_risk: delayRisk,
          status: 'Scored',
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
      status: preview ? 'preview' : 'Scored',
      preview,
      requested_duration_mins,
      trains_scheduled_in_window,
    })
  } catch (error) {
    if (error instanceof ScoreError) {
      return NextResponse.json(error.body, { status: error.status })
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
      },
      { status: 500 }
    )
  }
}