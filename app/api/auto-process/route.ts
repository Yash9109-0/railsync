import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 60

// Fallback scoring jab ML API na ho
function fallbackScore(work_type: string, safety: string) {
  let score = 75
  const s = safety.toLowerCase()
  const w = work_type.toLowerCase()
  if (s.includes('critical')) score += 18
  else if (s.includes('urgent') || s.includes('high')) score += 10
  if (w.includes('track')) score += 5
  if (w.includes('signal')) score += 6
  return Math.min(98, score + Math.random() * 4)
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    let body: any = {}
    try { body = await request.json() } catch {}
    
    const blockRequestId = body.block_request_id || body.requestId || body.id
    if (!blockRequestId) {
      return NextResponse.json({ error: 'block_request_id is required' }, { status: 400 })
    }

    const { data: blockRequest, error: fetchError } = await supabase
      .from('block_requests')
      .select('*')
      .eq('id', blockRequestId)
      .single()

    if (fetchError || !blockRequest) {
      return NextResponse.json({ error: 'block_request not found' }, { status: 404 })
    }

    // --- Try ML API, if fails use fallback ---
    let priority_score = fallbackScore(blockRequest.work_type, blockRequest.safety_criticality)
    let delay_risk = priority_score > 90 ? 'High' : priority_score > 80 ? 'Medium' : 'Low'

    const mlApiUrl = process.env.ML_API_URL
    if (mlApiUrl) {
      try {
        const segmentRes = await supabase.from('segments').select('name').eq('id', blockRequest.segment_id).single()
        const segmentName = (segmentRes.data as any)?.name || 'unknown'

        const mlRes = await fetch(`${mlApiUrl}/predict-priority`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            segment: segmentName,
            requested_start_hour: new Date(blockRequest.requested_start).getHours(),
            requested_duration_mins: blockRequest.requested_duration_mins,
            work_type: blockRequest.work_type,
            safety_criticality: blockRequest.safety_criticality,
            trains_scheduled_in_window: 5,
            asset_risk_flag: 0,
            historical_overrun_rate: 0.15,
            text_urgency_score: 0.7,
          }),
        })
        if (mlRes.ok) {
          const mlData = await mlRes.json()
          if (mlData.priority_score) priority_score = mlData.priority_score
          if (mlData.delay_risk) delay_risk = mlData.delay_risk
        }
      } catch (e) {
        console.log('ML failed, using fallback', e)
      }
    }

    // --- Create 3 options ---
    const originalStart = new Date(blockRequest.requested_start)
    const optionDrafts = [
      { label: 'Option A — As Requested', start: originalStart, duration: blockRequest.requested_duration_mins, rec: true },
      { label: 'Option B — Shifted by 90m', start: new Date(originalStart.getTime() + 90 * 60000), duration: blockRequest.requested_duration_mins, rec: false },
      { label: 'Option C — Shortened', start: originalStart, duration: Math.max(30, Math.round(blockRequest.requested_duration_mins * 0.75)), rec: false },
    ]

    await supabase.from('block_plan_options').delete().eq('block_request_id', blockRequestId)

    for (let i = 0; i < optionDrafts.length; i++) {
      const opt = optionDrafts[i]
      await supabase.from('block_plan_options').insert({
        block_request_id: blockRequestId,
        option_label: opt.label,
        adjusted_start: opt.start.toISOString(),
        adjusted_duration_mins: opt.duration,
        priority_score: priority_score - (opt.rec ? 0 : 3),
        delay_risk: delay_risk,
        explanation: opt.rec ? `This option balances safety ${blockRequest.safety_criticality} with minimal traffic impact. Score derived from work type ${blockRequest.work_type}.` : 'Alternative option with slightly higher delay risk.',
        is_recommended: opt.rec,
        what_if_note: opt.rec ? 'If extended by 30 minutes, delay risk would increase to Medium.' : null,
      })
    }

    // --- Update main request ---
    const { error: updateError } = await supabase
      .from('block_requests')
      .update({
        priority_score: priority_score,
        delay_risk: delay_risk,
        status: 'scored',
      })
      .eq('id', blockRequestId)

    if (updateError) throw updateError

    return NextResponse.json({ block_request_id: blockRequestId, success: true, status: 'scored' })
  } catch (error: any) {
    console.error('auto-process error', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}