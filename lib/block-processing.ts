import { createClient } from '@supabase/supabase-js'
import { analyzeUrgency, explainPlanOption, explainWhatIf } from '@/lib/llm'

const ML_BASE_URL = process.env.ML_API_URL || 'https://railsync-ml.onrender.com'
const LOW_SAMPLE = 10
type Risk = 'Low' | 'Medium' | 'High'
const riskRank: Record<Risk, number> = { Low: 0, Medium: 1, High: 2 }

function normalizeRisk(r: string | number | null | undefined): Risk {
  if (r == null) return 'Medium'
  if (typeof r === 'number') return r >= 0.66 ? 'High' : r >= 0.33 ? 'Medium' : 'Low'
  const s = String(r).toLowerCase()
  return s.includes('high') || s.includes('severe') || s.includes('major') || s.includes('critical') ? 'High'
    : s.includes('low') || s.includes('minor') || s.includes('small') ? 'Low' : 'Medium'
}

const overlaps = (s1: number, d1: number, s2: number, d2: number) => s1 < s2 + d2 * 6e4 && s2 < s1 + d1 * 6e4

type ReqRow = { segment_id: number | null; work_type: string | null; requested_start: string; requested_duration_mins: number | null; safety_criticality: string | null; work_description: string | null; justification: string | null }

export async function processBlockRequest(block_request_id: string) {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // 1. Fetch block_request row
  const { data: req, error: fetchErr } = await sb.from('block_requests')
    .select('segment_id, work_type, requested_start, requested_duration_mins, safety_criticality, work_description, justification')
    .eq('id', block_request_id).single<ReqRow>()
  if (fetchErr || !req) {
    console.error('[block-processing] Fetch error:', fetchErr?.message)
    throw new Error(fetchErr?.message ?? 'block_request not found')
  }
  console.log('[block-processing] Fetched request:', { id: block_request_id, segment_id: req.segment_id, work_type: req.work_type })

  let segment = 'unknown'
  if (req.segment_id != null) {
    const { data: seg } = await sb.from('segments').select('name').eq('id', req.segment_id).single<{ name: string }>()
    if (seg?.name) segment = seg.name
  }

  // 2. Analyze urgency via LLM
  const { text_urgency_score } = await analyzeUrgency(req.work_description ?? '', req.justification ?? '')
  console.log('[block-processing] Urgency score:', text_urgency_score)

  // 3. segment_stats (default overrun 0.15, sample_count 0)
  let overrun = 0.15, sample = 0
  if (req.segment_id != null) {
    const { data: st } = await sb.from('segment_stats').select('historical_overrun_rate, sample_count').eq('segment_id', req.segment_id).eq('work_type', req.work_type).maybeSingle()
    if (st) { overrun = st.historical_overrun_rate ?? 0.15; sample = st.sample_count ?? 0 }
  }

  // 4. Conflict check: other requests on same segment (not rejected/safety_blocked), overlapping windows
  const bs = Date.parse(req.requested_start), bd = req.requested_duration_mins ?? 0
  const { data: others } = await sb.from('block_requests').select('requested_start, requested_duration_mins, status').eq('segment_id', req.segment_id).neq('id', block_request_id)
  const conflict = (others ?? []).some((c) => {
    if (c.status === 'rejected' || c.status === 'safety_blocked') return false
    const cs = Date.parse(c.requested_start)
    return !Number.isNaN(cs) && !Number.isNaN(bs) && overlaps(bs, bd, cs, c.requested_duration_mins ?? 0)
  })
  console.log('[block-processing] Conflict check:', { conflict, othersCount: others?.length })

  // 5. Build 3 options
  const dur = req.requested_duration_mins ?? 120
  type Opt = { label: string; start: Date; duration: number }
  const base = new Date(Number.isNaN(bs) ? Date.now() : bs), desc = req.work_description ?? '', just = req.justification ?? ''
  const options: Opt[] = [
    { label: 'Option A — As Requested', start: new Date(base), duration: dur },
    { label: 'Option B — Conflict-Avoiding Shift', start: new Date(base.getTime() + (conflict ? 90 : -60) * 6e4), duration: dur },
    { label: 'Option C — Shortened Duration', start: new Date(base), duration: Math.max(30, Math.round(dur * 0.75)) },
  ]
  console.log('[block-processing] Built options:', options.map(o => ({ label: o.label, start: o.start.toISOString(), duration: o.duration })))

  // 6. Score each option via ML API
  const scored = await Promise.all(options.map(async (opt): Promise<Opt & { priority_score: number; delay_risk: Risk }> => {
    let trains = 0
    if (req.segment_id != null) {
      const endMs = opt.start.getTime() + opt.duration * 6e4
      const { count } = await sb.from('timetable').select('*', { count: 'exact', head: true }).eq('segment_id', req.segment_id)
        .gte('scheduled_time', new Date(opt.start.getTime()).toISOString()).lt('scheduled_time', new Date(endMs).toISOString())
      trains = count ?? 0
    }
    const payload = { segment, requested_start_hour: opt.start.getHours(), requested_duration_mins: opt.duration,
      work_type: req.work_type, safety_criticality: req.safety_criticality, trains_scheduled_in_window: trains,
      asset_risk_flag: sample < LOW_SAMPLE ? 1 : 0, historical_overrun_rate: overrun, text_urgency_score }
    try {
      const res = await fetch(ML_BASE_URL + '/predict-priority', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), cache: 'no-store' })
      const ml = (await res.json()) as { priority_score: number; delay_risk?: string | null }
      return { ...opt, priority_score: ml.priority_score, delay_risk: normalizeRisk(ml.delay_risk) }
    } catch (err) {
      console.error('[block-processing] ML score failed:', opt.label, err)
      return { ...opt, priority_score: 50, delay_risk: 'Medium' as Risk }
    }
  }))
  console.log('[block-processing] Scored options:', scored.map(o => ({ label: o.label, priority_score: o.priority_score, delay_risk: o.delay_risk })))

  // 7. Recommend = lowest delay_risk, tie-break highest priority_score
  let recIdx = 0
  for (let i = 1; i < scored.length; i++) { if (riskRank[scored[i].delay_risk] < riskRank[scored[recIdx].delay_risk] || (riskRank[scored[i].delay_risk] === riskRank[scored[recIdx].delay_risk] && scored[i].priority_score > scored[recIdx].priority_score)) recIdx = i }
  const over240 = scored.some((o) => o.duration > 240)

  // 8. Per-option explanation; what_if_note only for the recommended option
  const withMeta = await Promise.all(scored.map(async (opt, i) => ({
    ...opt, i,
    explanation: await explainPlanOption(desc, just, opt.label, opt.priority_score, opt.delay_risk),
    what_if_note: i === recIdx && !over240 ? await explainWhatIf(desc, just, opt.label, opt.priority_score, opt.delay_risk, opt.duration + 30) : null,
  })))

  // 9. Delete existing plan options, insert 3 new rows
  await sb.from('block_plan_options').delete().eq('block_request_id', block_request_id)
  await sb.from('block_plan_options').insert(withMeta.map((o) => ({ block_request_id, option_label: o.label, adjusted_start: o.start.toISOString(), adjusted_duration_mins: o.duration, priority_score: o.priority_score, delay_risk: o.delay_risk, is_recommended: !over240 && o.i === recIdx, explanation: o.explanation, what_if_note: o.what_if_note })))
  console.log('[block-processing] Inserted plan options:', withMeta.map(o => ({ label: o.label, is_recommended: !over240 && o.i === recIdx })))

  // 10. Update block_request
  const rec = withMeta[recIdx]
  if (over240) {
    await sb.from('block_requests').update({ status: 'safety_blocked' }).eq('id', block_request_id)
  } else {
    await sb.from('block_requests').update({ priority_score: rec.priority_score, delay_risk: rec.delay_risk, ai_explanation: rec.explanation, status: 'scored' }).eq('id', block_request_id)
  }
  console.log('[block-processing] Updated request status:', over240 ? 'safety_blocked' : 'scored')

  return { block_request_id, success: true }
}
