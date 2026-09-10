import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type BlockRequestRow = {
  id: string
  segment_id: number | null
  requested_start: string
  requested_duration_mins: number | null
  work_type: string | null
  safety_criticality: string | null
  priority_score: number | null
  ai_explanation: string | null
  delay_risk: string | number | null
}

type SegmentRow = {
  name: string
}

type MLPayload = {
  segment: string
  requested_start_hour: number
  requested_duration_mins: number | null
  work_type: string | null
  safety_criticality: string | null
  trains_scheduled_in_window: number
  asset_risk_flag: number
  historical_overrun_rate: number
  text_urgency_score: number
}

type MLResult = {
  priority_score: number
  delay_risk?: string | number | null
}

const ML_API_URL = process.env.ML_API_URL || 'https://railsync-ml.onrender.com/predict-priority'

function normalizeRisk(risk: string | number | null | undefined): 'Low' | 'Medium' | 'High' {
  if (risk == null) return 'Medium'
  if (typeof risk === 'number') {
    if (risk >= 0.66) return 'High'
    if (risk >= 0.33) return 'Medium'
    return 'Low'
  }
  const r = String(risk).toLowerCase()
  if (r.includes('high') || r.includes('severe') || r.includes('major') || r.includes('critical')) return 'High'
  if (r.includes('low') || r.includes('minor') || r.includes('small')) return 'Low'
  if (r.includes('medium') || r.includes('moderate')) return 'Medium'
  return 'Medium'
}

export async function POST(request: Request) {
  let block_request_id: string | undefined
  let supabase: SupabaseClient | null = null
  let usedFallback = false

  try {
    try {
      const body = await request.json()
      block_request_id = body?.block_request_id ?? body?.request_id
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (!block_request_id) {
      return NextResponse.json({ error: 'block_request_id is required' }, { status: 400 })
    }

    console.log('STEP 1: received', block_request_id)

    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { data: blockRequest, error: fetchError } = await supabase
      .from('block_requests')
      .select('*')
      .eq('id', block_request_id)
      .single<BlockRequestRow>()

    let segment = 'unknown'
    if (blockRequest?.segment_id != null) {
      const { data: seg } = await supabase
        .from('segments')
        .select('name')
        .eq('id', blockRequest.segment_id)
        .single<SegmentRow>()
      if (seg?.name) segment = seg.name
    }

    if (fetchError || !blockRequest) {
      console.log('STEP 2: fetched request', null)
      return NextResponse.json(
        { error: fetchError?.message ?? 'block_request not found' },
        { status: 404 },
      )
    }

    console.log('STEP 2: fetched request', { ...blockRequest, segment })

    const parsedStart = Date.parse(blockRequest.requested_start)
    const requested_start_hour = Number.isNaN(parsedStart) ? 0 : new Date(parsedStart).getHours()

    const mlPayload: MLPayload = {
      segment,
      requested_start_hour,
      requested_duration_mins: blockRequest.requested_duration_mins,
      work_type: blockRequest.work_type,
      safety_criticality: blockRequest.safety_criticality,
      trains_scheduled_in_window: 3,
      asset_risk_flag: 0,
      historical_overrun_rate: 0.15,
      text_urgency_score: 50,
    }

    console.log('STEP 3: ML payload', mlPayload)

    let mlResult: MLResult | null = null
    let mlError: Error | null = null

    try {
      const response = await fetch(ML_API_URL + '/predict-priority', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mlPayload),
        cache: 'no-store',
      })

      console.log('STEP 4: ML API status', response.status)

      const responseText = await response.text()
      let parsedResult: MLResult | null = null
      try {
        parsedResult = JSON.parse(responseText) as MLResult
      } catch {
        parsedResult = null
      }

      console.log('STEP 5: ML API result', parsedResult)

      if (!response.ok || !parsedResult || typeof parsedResult.priority_score !== 'number') {
        throw new Error(`ML API failed: status=${response.status}, body=${responseText}`)
      }

      mlResult = parsedResult
    } catch (err) {
      mlError = err instanceof Error ? err : new Error(String(err))
      console.error('ML API CALL FAILED', mlError.message)
    }

    let priorityScore: number
    let delayRisk: 'Low' | 'Medium' | 'High'
    let aiExplanation: string

    if (mlResult) {
      priorityScore = mlResult.priority_score
      delayRisk = normalizeRisk(mlResult.delay_risk)
      aiExplanation = 'Scored using live ML model.'
      usedFallback = false
    } else {
      priorityScore = 50
      delayRisk = 'Medium'
      aiExplanation = 'ML API unreachable, using fallback score'
      usedFallback = true
    }

    const { error: updateError } = await supabase
      .from('block_requests')
      .update({
        priority_score: priorityScore,
        delay_risk: delayRisk,
        ai_explanation: aiExplanation,
        status: 'scored',
      })
      .eq('id', block_request_id)

    if (updateError) {
      throw updateError
    }

    return NextResponse.json({
      success: true,
      score: priorityScore,
      delay_risk: delayRisk,
      ai_explanation: aiExplanation,
      used_fallback: usedFallback,
    })
  } catch (error: any) {
    console.error('AUTO-PROCESS CRASHED', error)

    if (block_request_id && supabase) {
      try {
        await supabase
          .from('block_requests')
          .update({
            priority_score: 50,
            delay_risk: 'Medium',
            ai_explanation: 'Auto-process crashed, using emergency fallback score',
            status: 'scored',
          })
          .eq('id', block_request_id)
      } catch (fbError) {
        console.error('Emergency fallback update failed:', fbError)
      }
    }

    return NextResponse.json(
      {
        success: false,
        score: 50,
        delay_risk: 'Medium',
        ai_explanation: 'Auto-process crashed, using emergency fallback score',
        used_fallback: true,
        error: error?.message || 'An unexpected error occurred',
      },
      { status: 500 },
    )
  }
}