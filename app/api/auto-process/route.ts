import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { analyzeUrgency } from '@/lib/llm'

// NOTE: On Vercel's Hobby plan, functions hard-cap at 10s regardless of this
// setting. Setting it here has no effect until/unless you're on Pro (raises
// the cap to 60s) or Enterprise (90s). Left in so it's ready either way.
export const maxDuration = 60

type MlPredictResponse = {
  priority_score?: number
  delay_risk?: string
}

type BlockRequestRow = {
  id: string
  segment_id: number | null
  work_type: string
  requested_start: string
  requested_duration_mins: number
  safety_criticality: string
  work_description: string | null
  justification: string | null
}

type SegmentStatsRow = {
  historical_overrun_rate: number | null
  sample_count: number | null
}

type OptionDraft = {
  option_label: string
  adjusted_start: string
  adjusted_duration_mins: number
}

type ScoredOption = OptionDraft & {
  priority_score: number
  delay_risk: string
}

const OVERRUN_DEFAULT = 0.15
const LOW_SAMPLE_THRESHOLD = 10
const SAFETY_MAX_DURATION_MINS = 240

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()

    let body: { block_request_id?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const blockRequestId = body.block_request_id
    if (!blockRequestId) {
      return NextResponse.json({ error: 'block_request_id is required' }, { status: 400 })
    }

    // --- 1. Fetch the block request ---
    const { data: blockRequest, error: fetchError } = await supabase
      .from('block_requests')
      .select('id, segment_id, work_type, requested_start, requested_duration_mins, safety_criticality, work_description, justification')
      .eq('id', blockRequestId)
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

    const description = blockRequest.work_description ?? 'Routine maintenance check'
    const justification = blockRequest.justification ?? 'No justification provided'

    // Resolve human-readable segment name (model was trained on segment names).
    let segment = 'unknown'
    if (blockRequest.segment_id != null) {
      const { data: seg } = await supabase
        .from('segments')
        .select('name')
        .eq('id', blockRequest.segment_id)
        .single<{ name: string }>()
      segment = seg?.name ?? String(blockRequest.segment_id)
    }

    // --- 2 & 3. Run urgency analysis and segment stats lookup concurrently ---
    const [llmResult, segmentStatsResult] = await Promise.all([
      analyzeUrgency(description, justification),
      supabase
        .from('segment_stats')
        .select('historical_overrun_rate, sample_count')
        .eq('segment_id', blockRequest.segment_id)
        .eq('work_type', blockRequest.work_type)
        .maybeSingle<SegmentStatsRow>(),
    ])

    const textUrgencyScore = llmResult.text_urgency_score
    const historicalOverrunRate =
      segmentStatsResult.data?.historical_overrun_rate ?? OVERRUN_DEFAULT
    const sampleCount = segmentStatsResult.data?.sample_count ?? 0
    const assetRiskFlag = sampleCount < LOW_SAMPLE_THRESHOLD ? 1 : 0

    // --- 4. Conflict detection ---
    const originalStart = new Date(blockRequest.requested_start)
    const originalEnd = new Date(
      originalStart.getTime() + blockRequest.requested_duration_mins * 60000
    )

    let hasConflict = false
    if (blockRequest.segment_id != null) {
      const { data: others } = await supabase
        .from('block_requests')
        .select('id, requested_start, requested_duration_mins')
        .eq('segment_id', blockRequest.segment_id)
        .neq('id', blockRequest.id)
        .not('status', 'in', '(rejected,safety_blocked)')

      hasConflict = (others ?? []).some((o) => {
        const oStart = new Date(o.requested_start)
        const oEnd = new Date(oStart.getTime() + o.requested_duration_mins * 60000)
        return oStart < originalEnd && oEnd > originalStart
      })
    }

    // --- 5. Build 3 candidate options ---
    const shiftMinutes = hasConflict ? 90 : -60
    const shiftedStart = new Date(originalStart.getTime() + shiftMinutes * 60000)
    const shortenedDuration = Math.max(
      30,
      Math.round(blockRequest.requested_duration_mins * 0.75)
    )

    const optionDrafts: OptionDraft[] = [
      {
        option_label: 'Option A — As Requested',
        adjusted_start: originalStart.toISOString(),
        adjusted_duration_mins: blockRequest.requested_duration_mins,
      },
      {
        option_label: hasConflict
          ? 'Option B — Conflict-Avoiding Shift'
          : 'Option B — Earlier Low-Traffic Shift',
        adjusted_start: shiftedStart.toISOString(),
        adjusted_duration_mins: blockRequest.requested_duration_mins,
      },
      {
        option_label: 'Option C — Shortened Duration',
        adjusted_start: originalStart.toISOString(),
        adjusted_duration_mins: shortenedDuration,
      },
    ]

    // Helper: count trains in the timetable overlapping a given window.
    async function countTrainsInWindow(start: Date, durationMins: number): Promise<number> {
      const end = new Date(start.getTime() + durationMins * 60000)
      try {
        const { count } = await supabase
          .from('timetable')
          .select('id', { count: 'exact', head: true })
          .eq('segment_id', blockRequest!.segment_id)
          .gte('scheduled_time', start.toISOString())
          .lte('scheduled_time', end.toISOString())
        return count ?? 0
      } catch {
        return 0
      }
    }

    // --- 6. Score all 3 options concurrently ---
    const scoredOptions: ScoredOption[] = await Promise.all(
      optionDrafts.map(async (opt) => {
        const start = new Date(opt.adjusted_start)
        const trainsInWindow = await countTrainsInWindow(start, opt.adjusted_duration_mins)

        const mlResponse = await fetch(`${mlApiUrl}/predict-priority`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            segment,
            requested_start_hour: start.getHours(),
            requested_duration_mins: opt.adjusted_duration_mins,
            work_type: blockRequest!.work_type,
            safety_criticality: blockRequest!.safety_criticality,
            trains_scheduled_in_window: trainsInWindow,
            asset_risk_flag: assetRiskFlag,
            historical_overrun_rate: historicalOverrunRate,
            text_urgency_score: textUrgencyScore,
          }),
          cache: 'no-store',
        })

        if (!mlResponse.ok) {
          throw new Error(`ML API failed for ${opt.option_label}: ${mlResponse.status}`)
        }

        const result: MlPredictResponse = await mlResponse.json()
        return {
          ...opt,
          priority_score: result.priority_score ?? 0,
          delay_risk: result.delay_risk ?? 'Unknown',
        }
      })
    )

    // --- 7. Pick the recommended option ---
    const riskRank: Record<string, number> = { Low: 0, Medium: 1, High: 2 }
    const recommendedIndex = scoredOptions.reduce((bestIdx, opt, idx) => {
      const best = scoredOptions[bestIdx]
      const optRisk = riskRank[opt.delay_risk] ?? 1
      const bestRisk = riskRank[best.delay_risk] ?? 1
      if (optRisk < bestRisk) return idx
      if (optRisk === bestRisk && opt.priority_score > best.priority_score) return idx
      return bestIdx
    }, 0)

    // --- Safety check: any option exceeding max duration blocks the request ---
    const safetyBlocked = scoredOptions.some(
      (o) => o.adjusted_duration_mins > SAFETY_MAX_DURATION_MINS
    )

    // --- 8. Generate explanations (+ what_if_note for the recommended one) concurrently ---
    async function generateExplanation(opt: ScoredOption): Promise<string> {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
  model: 'google/gemini-2.5-flash',
  max_tokens: 200,
  messages: [
              {
                role: 'system',
                content:
                  'You are a railway maintenance planning assistant. In exactly 2 plain-English sentences, explain why this plan option received its priority score and delay risk, referencing the work description and justification. No markdown, no lists, just 2 sentences.',
              },
              {
                role: 'user',
                content: `Work description: ${description}\nJustification: ${justification}\nOption: ${opt.option_label}\nAdjusted start: ${opt.adjusted_start}\nAdjusted duration: ${opt.adjusted_duration_mins} mins\nPriority score: ${opt.priority_score}\nDelay risk: ${opt.delay_risk}`,
              },
            ],
          }),
        })
        const data = await response.json()
        return data.choices?.[0]?.message?.content?.trim() ?? 'No explanation available.'
      } catch {
        return 'No explanation available.'
      }
    }

    async function generateWhatIfNote(opt: ScoredOption): Promise<string> {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
  model: 'google/gemini-2.5-flash',
  max_tokens: 100,
  messages: [
              {
                role: 'system',
                content:
                  'In exactly 1 plain-English sentence, describe what would likely happen to the delay risk if this plan\'s duration were extended by 30 minutes. No markdown, just 1 sentence.',
              },
              {
                role: 'user',
                content: `Option: ${opt.option_label}\nCurrent duration: ${opt.adjusted_duration_mins} mins\nCurrent priority score: ${opt.priority_score}\nCurrent delay risk: ${opt.delay_risk}`,
              },
            ],
          }),
        })
        const data = await response.json()
        return data.choices?.[0]?.message?.content?.trim() ?? ''
      } catch {
        return ''
      }
    }

    const explanationPromises = scoredOptions.map((opt) => generateExplanation(opt))
    const whatIfPromise = generateWhatIfNote(scoredOptions[recommendedIndex])

    const [explanations, whatIfNote] = await Promise.all([
      Promise.all(explanationPromises),
      whatIfPromise,
    ])

    // --- 9. Persist: clear old options, insert new ones ---
    await supabase.from('block_plan_options').delete().eq('block_request_id', blockRequestId)

    const rowsToInsert = scoredOptions.map((opt, idx) => ({
      block_request_id: blockRequestId,
      option_label: opt.option_label,
      adjusted_start: opt.adjusted_start,
      adjusted_duration_mins: opt.adjusted_duration_mins,
      priority_score: opt.priority_score,
      delay_risk: opt.delay_risk,
      explanation: explanations[idx],
      is_recommended: idx === recommendedIndex,
      what_if_note: idx === recommendedIndex ? whatIfNote : null,
    }))

    const { error: insertError } = await supabase.from('block_plan_options').insert(rowsToInsert)
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    // --- 10. Update the parent block_request ---
    if (safetyBlocked) {
      const { error: updateError } = await supabase
        .from('block_requests')
        .update({ status: 'safety_blocked' })
        .eq('id', blockRequestId)
      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }
    } else {
      const recommended = scoredOptions[recommendedIndex]
      const { error: updateError } = await supabase
        .from('block_requests')
        .update({
          priority_score: recommended.priority_score,
          delay_risk: recommended.delay_risk,
          status: 'scored',
        })
        .eq('id', blockRequestId)
      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }
    }

    return NextResponse.json({
      block_request_id: blockRequestId,
      success: true,
      status: safetyBlocked ? 'safety_blocked' : 'scored',
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}