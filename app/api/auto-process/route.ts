import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { analyzeUrgency, explainPlanOption, explainWhatIf } from '@/lib/llm'

export const maxDuration = 60
export const runtime = 'nodejs'

const DEFAULT_OVERRUN_RATE = 0.15
const LOW_SAMPLE_THRESHOLD = 5
const MAX_SAFE_DURATION_MINS = 240
const LOW_RISK_SHIFT_MINS = -60
const CONFLICT_SHIFT_MINS = 90

type PlanDraft = {
  option_label: string
  start: Date
  duration: number
}

type PlanResult = {
  option_label: string
  adjusted_start: string
  adjusted_duration_mins: number
  priority_score: number | null
  delay_risk: string | null
  explanation: string | null
  is_recommended: boolean
  what_if_note: string | null
}

function delayRiskRank(risk: string | null | undefined): number {
  const r = (risk ?? '').toLowerCase()
  if (r === 'low') return 0
  if (r === 'medium') return 1
  if (r === 'high') return 2
  return 3
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function countTrainsInWindow(
  supabase: ReturnType<typeof getSupabase>,
  segmentId: number | null,
  start: Date,
  durationMins: number
): Promise<number> {
  if (segmentId == null) return 0
  const end = new Date(start.getTime() + durationMins * 60_000)
  const { count, error } = await supabase
    .from('timetable')
    .select('*', { count: 'exact', head: true })
    .eq('segment_id', segmentId)
    .gte('scheduled_time', start.toISOString())
    .lte('scheduled_time', end.toISOString())
  if (error) {
    console.error('countTrainsInWindow error:', error.message)
    return 0
  }
  return count ?? 0
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase()

    const body: any = await request.json().catch(() => ({}))
    const blockRequestId = body.block_request_id ?? body.requestId ?? body.id
    if (!blockRequestId) {
      return NextResponse.json(
        { error: 'block_request_id is required' },
        { status: 400 }
      )
    }

    // 1. Fetch the block_request row (the fields the plan depends on).
    const { data: br, error: brError }: { data: any; error: any } = await supabase
      .from('block_requests')
      .select(
        'segment_id, work_type, requested_start, requested_duration_mins, safety_criticality, work_description, justification'
      )
      .eq('id', blockRequestId)
      .single()

    if (brError || !br) {
      return NextResponse.json(
        { error: brError?.message ?? 'block_request not found' },
        { status: 404 }
      )
    }

    const workDescription: string = br.work_description ?? ''
    const justification: string = br.justification ?? ''

    // 2. Read text urgency from the description + justification.
    const { text_urgency_score } = await analyzeUrgency(workDescription, justification)

    // 3. Fetch segment_stats for this segment + work_type (fallback defaults).
    let historicalOverrunRate = DEFAULT_OVERRUN_RATE
    let sampleCount = 0
    const { data: stats }: { data: any } = await supabase
      .from('segment_stats')
      .select('historical_overrun_rate, sample_count')
      .eq('segment_id', br.segment_id)
      .eq('work_type', br.work_type)
      .maybeSingle()
    if (stats) {
      historicalOverrunRate = stats.historical_overrun_rate ?? DEFAULT_OVERRUN_RATE
      sampleCount = stats.sample_count ?? 0
    }
    // Little proven history => flag the asset as risky.
    const assetRiskFlag = sampleCount < LOW_SAMPLE_THRESHOLD ? 1 : 0

    // 4. Conflict detection: other open requests on this segment whose time
    //    window overlaps the requested window.
    const originalStart = new Date(br.requested_start)
    const originalEnd = new Date(
      originalStart.getTime() + br.requested_duration_mins * 60_000
    )
    const { data: others }: { data: any } = await supabase
      .from('block_requests')
      .select('id, requested_start, requested_duration_mins')
      .eq('segment_id', br.segment_id)
      .neq('id', blockRequestId)
      .not('status', 'in', ['rejected', 'safety_blocked'])

    let hasConflict = false
    for (const c of others ?? []) {
      const cs = new Date(c.requested_start)
      const ce = new Date(
        cs.getTime() + (c.requested_duration_mins ?? 0) * 60_000
      )
      if (cs < originalEnd && ce > originalStart) {
        hasConflict = true
        break
      }
    }

    // 5. Build the 3 candidate plan options.
    const drafts: PlanDraft[] = [
      {
        option_label: 'Option A — As Requested',
        start: new Date(originalStart),
        duration: br.requested_duration_mins,
      },
    ]
    const shift = hasConflict ? CONFLICT_SHIFT_MINS : LOW_RISK_SHIFT_MINS
    drafts.push({
      option_label: 'Option B — Conflict-Avoiding Shift',
      start: new Date(originalStart.getTime() + shift * 60_000),
      duration: br.requested_duration_mins,
    })
    const shortened = Math.max(30, Math.round(br.requested_duration_mins * 0.75))
    drafts.push({
      option_label: 'Option C — Shortened Duration',
      start: new Date(originalStart),
      duration: shortened,
    })

    // Safety gate: any option exceeding the 240-minute cap blocks the request.
    const safetyBlocked = drafts.some((o) => o.duration > MAX_SAFE_DURATION_MINS)

    // The model was trained on the human-readable segment name (A-B, ...).
    let segment = 'unknown'
    if (br.segment_id != null) {
      const { data: seg }: { data: any } = await supabase
        .from('segments')
        .select('name')
        .eq('id', br.segment_id)
        .single()
      segment = seg?.name ?? String(br.segment_id)
    }

    // 6. Score each option through the ML API.
    const mlApiUrl = process.env.ML_API_URL
    const results: PlanResult[] = []
    for (const d of drafts) {
      const trains = await countTrainsInWindow(
        supabase,
        br.segment_id,
        d.start,
        d.duration
      )
      let priorityScore: number | null = null
      let delayRisk: string | null = null

      if (mlApiUrl) {
        try {
          const res = await fetch(`${mlApiUrl}/predict-priority`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              segment,
              requested_start_hour: d.start.getHours(),
              requested_duration_mins: d.duration,
              work_type: br.work_type,
              safety_criticality: br.safety_criticality,
              trains_scheduled_in_window: trains,
              asset_risk_flag: assetRiskFlag,
              historical_overrun_rate: historicalOverrunRate,
              text_urgency_score,
            }),
          })
          if (res.ok) {
            const ml: any = await res.json()
            priorityScore = ml.priority_score ?? null
            delayRisk = ml.delay_risk ?? null
          } else {
            console.error('ML API error:', await res.text())
          }
        } catch (e) {
          console.error('ML predict failed for an option:', e)
        }
      }

      results.push({
        option_label: d.option_label,
        adjusted_start: d.start.toISOString(),
        adjusted_duration_mins: d.duration,
        priority_score: priorityScore,
        delay_risk: delayRisk,
        explanation: null,
        is_recommended: false,
        what_if_note: null,
      })
    }

    // 7. Pick the recommended option: lowest delay_risk, tie-break highest score.
    //    Skipped entirely when safety-blocked.
    let recommendedIdx = -1
    if (!safetyBlocked) {
      recommendedIdx = 0
      for (let i = 1; i < results.length; i++) {
        const curRank = delayRiskRank(results[i].delay_risk)
        const bestRank = delayRiskRank(results[recommendedIdx].delay_risk)
        const curScore = results[i].priority_score ?? -1
        const bestScore = results[recommendedIdx].priority_score ?? -1
        if (curRank < bestRank || (curRank === bestRank && curScore > bestScore)) {
          recommendedIdx = i
        }
      }
      results[recommendedIdx].is_recommended = true
    }

    // 8. Generate a 2-sentence explanation per option; what-if note for the
    //    recommended one (duration +30m).
    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      r.explanation = await explainPlanOption(
        workDescription,
        justification,
        r.option_label,
        r.priority_score,
        r.delay_risk
      )
      if (r.is_recommended) {
        r.what_if_note = await explainWhatIf(
          workDescription,
          justification,
          r.option_label,
          r.priority_score,
          r.delay_risk,
          r.adjusted_duration_mins + 30
        )
      }
    }

    // 9. Replace any existing plan options for this request, then insert the 3 new ones.
    await supabase.from('block_plan_options').delete().eq('block_request_id', blockRequestId)

    const { error: insertError } = await supabase
      .from('block_plan_options')
      .insert(
        results.map((r) => ({
          block_request_id: blockRequestId,
          option_label: r.option_label,
          adjusted_start: r.adjusted_start,
          adjusted_duration_mins: r.adjusted_duration_mins,
          priority_score: r.priority_score,
          delay_risk: r.delay_risk,
          explanation: r.explanation,
          is_recommended: r.is_recommended,
          what_if_note: r.what_if_note,
        }))
      )
    if (insertError) throw insertError

    // 10. Update the block_request row.
    if (safetyBlocked) {
      const { error: updErr } = await supabase
        .from('block_requests')
        .update({ status: 'safety_blocked' })
        .eq('id', blockRequestId)
      if (updErr) throw updErr
      return NextResponse.json({
        block_request_id: blockRequestId,
        success: true,
        status: 'safety_blocked',
      })
    }

    const rec = results[recommendedIdx]
    const { error: updErr } = await supabase
      .from('block_requests')
      .update({
        priority_score: rec.priority_score,
        delay_risk: rec.delay_risk,
        status: 'scored',
      })
      .eq('id', blockRequestId)
    if (updErr) throw updErr

    return NextResponse.json({
      block_request_id: blockRequestId,
      success: true,
      status: 'scored',
      recommended_option: rec.option_label,
    })
  } catch (error: any) {
    console.error('auto-process error', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
