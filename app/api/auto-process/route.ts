import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { explainPlanOption } from '@/lib/llm'

type BlockRequestRow = {
  id: string
  segment_id: number | null
  requested_start: string
  requested_duration_mins: number | null
  work_type: string | null
  safety_criticality: string | null
  work_description: string | null
  justification: string | null
  priority_score: number | null
  ai_explanation: string | null
  delay_risk: string | number | null
}

type RiskLevel = 'Low' | 'Medium' | 'High'
const RISK_ORDER: RiskLevel[] = ['Low', 'Medium', 'High']

type PlanOptionRecord = {
  title: string
  start_time: string
  end_time: string
  track_config: string
  reasoning: string
  risk_level: RiskLevel
  duration_min: number
  option_label: string
  adjusted_start: string
  adjusted_duration_mins: number
  priority_score: number | null
  delay_risk: RiskLevel
  is_recommended: boolean
  what_if_note: string | null
}

const ML_API_URL =
  process.env.ML_API_URL || 'https://railsync-ml.onrender.com/predict-priority'
const ML_REQUEST_TIMEOUT_MS = 20000
const LLM_TIMEOUT_MS = 10000

function normalizeRisk(risk: string | number | null | undefined): RiskLevel {
  if (risk == null) return 'Medium'
  if (typeof risk === 'number') {
    if (risk >= 0.66) return 'High'
    if (risk >= 0.33) return 'Medium'
    return 'Low'
  }
  const r = String(risk).toLowerCase()
  if (r.includes('high') || r.includes('severe') || r.includes('major') || r.includes('critical'))
    return 'High'
  if (r.includes('low') || r.includes('minor') || r.includes('small')) return 'Low'
  if (r.includes('medium') || r.includes('moderate')) return 'Medium'
  return 'Medium'
}

function reduceRisk(risk: RiskLevel): RiskLevel {
  const i = RISK_ORDER.indexOf(risk)
  return i > 0 ? RISK_ORDER[i - 1] : 'Low'
}

function parseDate(value: string | null | undefined): Date {
  const d = value ? new Date(value) : new Date()
  return Number.isNaN(d.getTime()) ? new Date() : d
}

function addHours(d: Date, h: number): Date {
  const out = new Date(d)
  out.setTime(out.getTime() + h * 3600000)
  return out
}

function nextDayAt(d: Date, hour: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + 1)
  out.setHours(hour, 0, 0, 0)
  return out
}

function fmtLocal(d: string): string {
  const t = Date.parse(d)
  if (Number.isNaN(t)) return d
  return new Date(t).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function deterministicReasoning(p: PlanOptionRecord): string {
  return `Scheduled for ${fmtLocal(p.start_time)} on ${p.track_config}. This ${p.risk_level.toLowerCase()} risk option runs ${p.duration_min} minutes.`
}

function deterministicExplanation(score: number | null, risk: RiskLevel): string {
  return `Priority score ${score ?? 50}/100 with ${risk.toLowerCase()} delay risk. Review the generated plan options to choose the least disruptive schedule.`
}

function generatePlans(
  base: BlockRequestRow,
  segment: string,
  priorityScore: number | null | undefined,
  baseRisk: RiskLevel,
): PlanOptionRecord[] {
  const duration = base.requested_duration_mins ?? 60
  const start = parseDate(base.requested_start)
  const track = `${segment} track section`

  const aStart = start
  const bStart = addHours(start, 2)
  const cStart = nextDayAt(start, 2)

  const make = (
    title: string,
    st: Date,
    risk: RiskLevel,
    trackConfig: string,
    note: string | null,
  ): PlanOptionRecord => ({
    title,
    start_time: st.toISOString(),
    end_time: new Date(st.getTime() + duration * 60000).toISOString(),
    track_config: trackConfig,
    reasoning: '',
    risk_level: risk,
    duration_min: duration,
    option_label: title,
    adjusted_start: st.toISOString(),
    adjusted_duration_mins: duration,
    priority_score: priorityScore ?? null,
    delay_risk: risk,
    is_recommended: false,
    what_if_note: note,
  })

  const plans: PlanOptionRecord[] = [
    make(
      'Option A — As Requested',
      aStart,
      baseRisk,
      `${track} as-requested`,
      'Earliest window; matches requested slot with baseline risk.',
    ),
    make(
      'Option B — +2h Deconflicted Track',
      bStart,
      reduceRisk(baseRisk),
      `${track} deconflicted single-block`,
      '+2 hours delays start to ease peak traffic conflict; lower risk.',
    ),
    make(
      'Option C — Next-Day Low-Traffic Window',
      cStart,
      'Low',
      `${track} overnight low-traffic`,
      'Next-day low-traffic window; minimal passenger disruption.',
    ),
  ]

  let best = 0
  for (let i = 1; i < plans.length; i++) {
    const cur = RISK_ORDER.indexOf(plans[i].risk_level)
    const bestIdx = RISK_ORDER.indexOf(plans[best].risk_level)
    if (cur < bestIdx) best = i
  }
  plans[best].is_recommended = true

  return plans
}

export async function POST(request: Request) {
  let block_request_id: string | undefined
  let supabase: SupabaseClient | null = null
  let priorityScore: number | undefined
  let delayRisk: string | number | null = null
  let usedFallback = false
  let aiExplanation: string | null = null

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

    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { data: blockRequest, error: fetchError } = await supabase
      .from('block_requests')
      .select(
        'id, segment_id, requested_start, requested_duration_mins, work_type, safety_criticality, work_description, justification',
      )
      .eq('id', block_request_id)
      .single<BlockRequestRow>()

    if (fetchError || !blockRequest) {
      return NextResponse.json(
        { error: fetchError?.message ?? 'block_request not found' },
        { status: 404 },
      )
    }

    let segment = 'unknown'
    if (blockRequest.segment_id != null) {
      const { data: seg, error: segError } = await supabase
        .from('segments')
        .select('name')
        .eq('id', blockRequest.segment_id)
        .single<{ name: string }>()
      if (!segError && seg?.name) segment = seg.name
      else segment = String(blockRequest.segment_id)
    }

    const parsed = Date.parse(blockRequest.requested_start)
    const requested_start_hour = Number.isNaN(parsed) ? 0 : new Date(parsed).getHours()

    try {
      const mlController = new AbortController()
      const mlTimeout = setTimeout(() => mlController.abort(), ML_REQUEST_TIMEOUT_MS)
      let res: Response | undefined
      try {
        res = await fetch(ML_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            segment,
            requested_start_hour,
            requested_duration_mins: blockRequest.requested_duration_mins,
            work_type: blockRequest.work_type,
            safety_criticality: blockRequest.safety_criticality,
            trains_scheduled_in_window: 3,
            asset_risk_flag: 0,
            historical_overrun_rate: 0.15,
            text_urgency_score: 50,
          }),
          signal: mlController.signal,
          cache: 'no-store',
        })
      } finally {
        clearTimeout(mlTimeout)
      }

      if (!res || !res.ok) {
        const detail = res ? await res.text() : 'ML API request errored'
        throw new Error(`ML API request failed (${res?.status}): ${detail}`)
      }

      const mlResult = (await res.json()) as {
        priority_score: number
        delay_risk?: string | number | null
      }
      priorityScore = mlResult.priority_score
      delayRisk = mlResult.delay_risk ?? null
    } catch (mlErr) {
      console.error('auto-process ML fallback:', mlErr)
      priorityScore = 50
      delayRisk = 'Medium'
      usedFallback = true
    }

    const baseRisk = normalizeRisk(delayRisk)
    const hasLlm = Boolean(process.env.OPENROUTER_API_KEY)
    const workDescription = blockRequest.work_description ?? blockRequest.work_type ?? 'maintenance block'
    const justification = blockRequest.justification ?? ''

    const plans = generatePlans(blockRequest, segment, priorityScore, baseRisk)

    const explainPlanReasoning = async (
      p: PlanOptionRecord,
    ): Promise<string> => {
      if (!hasLlm) return deterministicReasoning(p)
      try {
        const txt = await Promise.race<string>([
          explainPlanOption(
             workDescription,
             justification,
             p.title,
             priorityScore ?? null,
             p.risk_level,
           ),
          new Promise<string>((_, rej) =>
            setTimeout(() => rej(new Error('llm timeout')), LLM_TIMEOUT_MS),
          ),
        ])
        return txt?.trim() ? txt : deterministicReasoning(p)
      } catch {
        return deterministicReasoning(p)
      }
    }

    const aiExplanationPromise = (async (): Promise<string> => {
      if (!hasLlm) return deterministicExplanation(priorityScore ?? null, baseRisk)
      try {
        const txt = await Promise.race<string>([
          explainPlanOption(
            workDescription,
            justification,
            'this priority ranking',
            priorityScore ?? null,
            baseRisk,
          ),
          new Promise<string>((_, rej) =>
            setTimeout(() => rej(new Error('llm timeout')), LLM_TIMEOUT_MS),
          ),
        ])
        return txt?.trim() ? txt : deterministicExplanation(priorityScore ?? null, baseRisk)
      } catch {
        return deterministicExplanation(priorityScore ?? null, baseRisk)
      }
    })()

    const [aiExplanation, ...reasonings] = await Promise.all([
      aiExplanationPromise,
      ...plans.map((p) => explainPlanReasoning(p)),
    ])

    plans.forEach((p, i) => {
      p.reasoning = reasonings[i]
    })

    await supabase
      .from('block_plan_options')
      .delete()
      .eq('block_request_id', block_request_id)

    const insertRows = plans.map((p) => ({
      block_request_id,
      option_label: p.option_label,
      adjusted_start: p.adjusted_start,
      adjusted_duration_mins: p.adjusted_duration_mins,
      priority_score: p.priority_score,
      delay_risk: p.delay_risk,
      is_recommended: p.is_recommended,
      explanation: p.reasoning,
      what_if_note: p.what_if_note,
    }))

    const { error: insertError } = await supabase
      .from('block_plan_options')
      .insert(insertRows)
    if (insertError) throw insertError

    const { error: updateError } = await supabase
      .from('block_requests')
      .update({
    priority_score: priorityScore ?? null,
        delay_risk: delayRisk,
        ai_explanation: aiExplanation,
        status: 'scored',
      })
      .eq('id', block_request_id)

    if (updateError) throw updateError

    return NextResponse.json({
      success: true,
      score: priorityScore,
      plan_count: plans.length,
      plan_options: plans,
      used_fallback: usedFallback,
    })
  } catch (error: any) {
    console.error('auto-process error:', error)

    const fallbackScore = priorityScore ?? 50
    const fallbackRisk = delayRisk ?? 'Medium'

    if (block_request_id && supabase) {
      try {
        const { error: fbError } = await supabase
          .from('block_requests')
          .update({
            priority_score: fallbackScore,
            delay_risk: fallbackRisk,
            ai_explanation: aiExplanation,
            status: 'scored',
          })
          .eq('id', block_request_id)

        if (fbError) {
          console.error('fallback update error:', fbError.message)
        }
      } catch (fbError: any) {
        console.error('fallback update failed:', fbError)
      }
    }

    return NextResponse.json(
      {
        success: false,
        score: fallbackScore,
        plan_count: 0,
        ai_explanation: aiExplanation,
        used_fallback: true,
        error: error?.message || 'An unexpected error occurred',
      },
      { status: 500 },
    )
  }
}
