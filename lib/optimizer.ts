import { createClient } from '@supabase/supabase-js'
import { openRouterChat } from '@/lib/llm'

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const LLM_TIMEOUT_MS = 10000
const DEPARTMENTS: string[] = ['TMS', 'TDMS', 'SMMS']

type CommittedSlot = {
  date: string
  start_hour: number
  duration_mins: number
}

type RequestRow = {
  id: string
  segment_id: number | null
  requested_start: string
  requested_duration_mins: number
  priority_score: number | null
}

type ForecastRow = {
  segment_id: number | null
  forecast_date: string
  peak_hour_start: number | null
  peak_hour_end: number | null
}

type HorizonItemRow = {
  horizon_id: string
  block_request_id: string
  assigned_date: string | null
  assigned_start_hour: number | null
  assigned_duration_mins: number
  priority_score: number | null
  status: 'scheduled' | 'deferred'
  reason: string
}

const hourOverlaps = (s1: number, d1: number, s2: number, d2: number) =>
  s1 < s2 + d2 && s2 < s1 + d1

const utcMidnight = (d: Date) =>
  Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())

const hoursFromMidnight = (d: Date) => (d.getTime() - utcMidnight(d)) / HOUR_MS

export async function generateHorizonPlan(
  horizonType: 'weekly' | 'monthly',
  startDate: Date,
  corridorId?: number | null,
): Promise<{ horizonId: string }> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const dayOffset = horizonType === 'weekly' ? 7 : 30
  const endDate = new Date(startDate.getTime() + dayOffset * DAY_MS)
  const horizonMinutes = (endDate.getTime() - startDate.getTime()) / 60000
  const capPerSegment = 0.2 * horizonMinutes

  const { data: horizon, error: horizonErr } = await supabase
    .from('block_plan_horizons')
    .insert({
      horizon_type: horizonType,
      horizon_start: startDate.toISOString(),
      horizon_end: endDate.toISOString(),
      status: 'draft',
      corridor_id: corridorId ?? null,
      generated_at: new Date().toISOString(),
    })
    .select('id')
    .single<{ id: string }>()

  if (horizonErr || !horizon) {
    console.error('[optimizer] Failed to create horizon:', horizonErr?.message)
    throw new Error(horizonErr?.message ?? 'Failed to create block_plan_horizons row')
  }

  const horizonId = horizon.id
  console.log('[optimizer] Created horizon', { horizonId, horizon_type: horizonType })

  let requestQuery = supabase
    .from('block_requests')
    .select('id, segment_id, requested_start, requested_duration_mins, priority_score')
    .eq('status', 'scored')
    .order('priority_score', { ascending: false })

  if (corridorId != null) {
    const { data: segData, error: segErr } = await supabase
      .from('segments')
      .select('id')
      .eq('corridor_id', corridorId)

    if (segErr) {
      console.error('[optimizer] Failed to fetch corridor segments:', segErr?.message)
      throw new Error(segErr?.message ?? 'Failed to fetch corridor segments')
    }

    const corridorSegmentIds = (segData ?? []).map((s) => s.id)
    if (corridorSegmentIds.length > 0) {
      requestQuery = requestQuery.in('segment_id', corridorSegmentIds)
    } else {
      requestQuery = requestQuery.eq('segment_id', -1)
    }
  }

  const { data: requestData, error: requestsErr } = await requestQuery

  if (requestsErr) {
    console.error('[optimizer] Failed to fetch scored block_requests:', requestsErr?.message)
    throw new Error(requestsErr?.message ?? 'Failed to fetch block_requests')
  }

  const requests = (requestData ?? []) as RequestRow[]
  console.log('[optimizer] Fetched scored requests', { count: requests.length, corridorId })

  const { data: forecastData, error: forecastErr } = await supabase
    .from('goods_train_forecast')
    .select('segment_id, forecast_date, peak_hour_start, peak_hour_end')
    .gte('forecast_date', startDate.toISOString())
    .lte('forecast_date', endDate.toISOString())

  if (forecastErr) {
    console.error('[optimizer] Failed to fetch goods_train_forecast:', forecastErr?.message)
    throw new Error(forecastErr?.message ?? 'Failed to fetch goods_train_forecast')
  }

  const forecast = (forecastData ?? []) as ForecastRow[]

  const busyHoursBySegment = new Map<
    number,
    Map<string, Array<{ start: number; end: number }>>
  >()
  for (const row of forecast) {
    if (row.segment_id == null) continue
    if (row.peak_hour_start == null || row.peak_hour_end == null) continue
    let byDate = busyHoursBySegment.get(row.segment_id)
    if (!byDate) {
      byDate = new Map()
      busyHoursBySegment.set(row.segment_id, byDate)
    }
    const dateKey = row.forecast_date
    let windows = byDate.get(dateKey)
    if (!windows) {
      windows = []
      byDate.set(dateKey, windows)
    }
    windows.push({ start: row.peak_hour_start, end: row.peak_hour_end })
  }

  const committedSlotsBySegment = new Map<number, CommittedSlot[]>()
  const committedMinutesBySegment = new Map<number, number>()
  const planningSegments = new Set<number>()
  let totalCommittedMinutes = 0

  const isBusy = (seg: number, dateKey: string, startHour: number, durationHours: number) =>
    (busyHoursBySegment.get(seg)?.get(dateKey) ?? []).some(
      (w) => hourOverlaps(startHour, durationHours, w.start, w.end - w.start),
    )

  const conflicts = (seg: number, dateKey: string, startHour: number, durationHours: number) =>
    (committedSlotsBySegment.get(seg) ?? []).some(
      (s) =>
        s.date === dateKey &&
        hourOverlaps(s.start_hour, s.duration_mins / 60, startHour, durationHours),
    )

  const items: HorizonItemRow[] = []
  let scheduled = 0
  let deferred = 0

  for (const req of requests) {
    const duration = req.requested_duration_mins
    const durationHours = duration / 60
    const segment = req.segment_id
    const priorityScore = req.priority_score ?? null

    if (segment == null) {
      items.push({
        horizon_id: horizonId,
        block_request_id: req.id,
        assigned_date: null,
        assigned_start_hour: null,
        assigned_duration_mins: duration,
        priority_score: priorityScore,
        status: 'deferred',
        reason: 'Deferred — no segment assigned for this request',
      })
      deferred++
      continue
    }

    planningSegments.add(segment)

    const committedMin = committedMinutesBySegment.get(segment) ?? 0
    if (committedMin + duration > capPerSegment) {
      items.push({
        horizon_id: horizonId,
        block_request_id: req.id,
        assigned_date: null,
        assigned_start_hour: null,
        assigned_duration_mins: duration,
        priority_score: priorityScore,
        status: 'deferred',
        reason: 'Deferred — segment capacity exceeded for this horizon',
      })
      deferred++
      continue
    }

    let placedHour: number | null = null
    let placedDate: string | null = null
    let reason = 'Shifted to avoid goods traffic peak'

    const trySlot = (startHour: number, dateKey: string): boolean => {
      if (isBusy(segment, dateKey, startHour, durationHours)) return false
      if (conflicts(segment, dateKey, startHour, durationHours)) return false
      placedHour = startHour
      placedDate = dateKey
      return true
    }

    const requestedMs = Date.parse(req.requested_start)
    if (!Number.isNaN(requestedMs)) {
      const requested = new Date(requestedMs)
      const reqDateKey = requested.toISOString().slice(0, 10)
      const reqStartHour = hoursFromMidnight(requested)
      const inRange =
        requested.getTime() >= startDate.getTime() &&
        requested.getTime() + duration * 60000 <= endDate.getTime()
      if (inRange && trySlot(reqStartHour, reqDateKey)) {
        reason = 'Placed at original requested time — no conflicts'
      }
    }

    if (placedHour === null) {
      const startYear = startDate.getUTCFullYear()
      const startMonth = startDate.getUTCMonth()
      const startDay = startDate.getUTCDate()
      for (let day = 0; day < dayOffset && placedHour === null; day++) {
        const dayMs = Date.UTC(startYear, startMonth, startDay + day)
        const dateKey = new Date(dayMs).toISOString().slice(0, 10)
        for (let hour = 0; hour < 24 && placedHour === null; hour++) {
          const slotMs = dayMs + hour * HOUR_MS
          const endMs = slotMs + duration * 60000
          if (slotMs < startDate.getTime() || endMs > endDate.getTime()) continue
          if (trySlot(hour, dateKey)) {
            reason = 'Shifted to avoid goods traffic peak'
          }
        }
      }
    }

    if (placedHour !== null && placedDate !== null) {
      const slots = committedSlotsBySegment.get(segment) ?? []
      slots.push({
        date: placedDate,
        start_hour: placedHour,
        duration_mins: duration,
      })
      committedSlotsBySegment.set(segment, slots)
      committedMinutesBySegment.set(segment, committedMin + duration)
      totalCommittedMinutes += duration

      items.push({
        horizon_id: horizonId,
        block_request_id: req.id,
        assigned_date: placedDate,
        assigned_start_hour: placedHour,
        assigned_duration_mins: duration,
        priority_score: priorityScore,
        status: 'scheduled',
        reason,
      })
      scheduled++
    } else {
      items.push({
        horizon_id: horizonId,
        block_request_id: req.id,
        assigned_date: null,
        assigned_start_hour: null,
        assigned_duration_mins: duration,
        priority_score: priorityScore,
        status: 'deferred',
        reason: 'Deferred — no available slot in horizon',
      })
      deferred++
    }
  }

  console.log('[optimizer] Assigned horizon slots', {
    horizonId,
    scheduled,
    deferred,
    totalCommittedMinutes,
  })

  const { error: insertErr } = await supabase
    .from('block_plan_horizon_items')
    .insert(items)
  if (insertErr) {
    console.error('[optimizer] Failed to insert horizon items:', insertErr?.message)
    throw new Error(insertErr?.message ?? 'Failed to insert block_plan_horizon_items')
  }

  const numSegments = planningSegments.size
  const totalPossibleMinutes = horizonMinutes * numSegments
  const projected =
    totalPossibleMinutes > 0
      ? 100 - (totalCommittedMinutes / totalPossibleMinutes) * 100
      : 100
  const projectedAvailabilityPct = Math.max(0, Math.min(100, Math.round(projected * 100) / 100))

  const total = scheduled + deferred
  const summaryExplanation =
    `${horizonType === 'weekly' ? 'Weekly' : 'Monthly'} block plan generated for ${startDate.toISOString().slice(0, 10)}–${endDate.toISOString().slice(0, 10)}: ${scheduled} of ${total} requests scheduled, ${deferred} deferred, ${projectedAvailabilityPct}% projected segment availability.`

  const { error: updateErr } = await supabase
    .from('block_plan_horizons')
    .update({
      projected_availability_pct: projectedAvailabilityPct,
      summary_explanation: summaryExplanation,
    })
    .eq('id', horizonId)
  if (updateErr) {
    console.error('[optimizer] Failed to update projected availability:', updateErr?.message)
    throw new Error(updateErr?.message ?? 'Failed to update block_plan_horizons')
  }

  console.log('[optimizer] Completed horizon plan', {
    horizonId,
    projectedAvailabilityPct,
  })

  return { horizonId }
}

type HorizonSummaryRow = {
  id: string
  horizon_type: 'weekly' | 'monthly'
  horizon_start: string
  horizon_end: string
  projected_availability_pct: number | null
  summary_explanation: string | null
}

type HorizonItemSummaryRow = {
  block_request_id: string
  assigned_date: string | null
  assigned_start_hour: number | null
  assigned_duration_mins: number
  priority_score: number | null
  status: 'scheduled' | 'deferred'
  reason: string | null
}

type RequestSnippetRow = {
  id: string
  work_description: string | null
  department: string | null
}

function deterministicSummary(
  horizon: HorizonSummaryRow,
  scheduled: number,
  deferred: number,
  total: number,
  availability: number | null,
  deptBreakdown: Record<string, { scheduled: number; deferred: number }>,
  deferredReasons: string[],
): string {
  const period = horizon.horizon_type === 'weekly' ? 'week' : 'month'
  const start = horizon.horizon_start.slice(0, 10)
  const end = horizon.horizon_end.slice(0, 10)
  const deptParts = DEPARTMENTS.map((d) => {
    const b = deptBreakdown[d] ?? { scheduled: 0, deferred: 0 }
    return `${d}: ${b.scheduled} scheduled / ${b.deferred} deferred`
  }).join('; ')
  const extraParts: string[] = []
  if (deptBreakdown['Unassigned']) {
    const b = deptBreakdown['Unassigned']
    extraParts.push(`Unassigned: ${b.scheduled} scheduled / ${b.deferred} deferred`)
  }
  const deptText = [deptParts, ...extraParts].join('; ')
  const reasonText = deferredReasons.length
    ? ` Reasons: ${deferredReasons.join('; ')}.`
    : ''
  return `For the upcoming ${period} (${start} to ${end}), ${scheduled} of ${total} maintenance requests are scheduled and ${deferred} are deferred.${reasonText} Department breakdown — ${deptText}. Projected track availability is ${availability ?? 0}%.`
}

export async function generateHorizonSummary(horizonId: string): Promise<void> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: horizon, error: horizonErr } = await supabase
    .from('block_plan_horizons')
    .select('horizon_type, horizon_start, horizon_end, projected_availability_pct')
    .eq('id', horizonId)
    .single<HorizonSummaryRow>()

  if (horizonErr || !horizon) {
    console.error('[optimizer] horizon not found for summary:', horizonErr?.message)
    throw new Error(horizonErr?.message ?? `Horizon ${horizonId} not found`)
  }

  const { data: itemData, error: itemsErr } = await supabase
    .from('block_plan_horizon_items')
    .select('block_request_id, assigned_date, assigned_start_hour, assigned_duration_mins, priority_score, status, reason')
    .eq('horizon_id', horizonId)

  if (itemsErr) {
    console.error('[optimizer] failed to fetch horizon items:', itemsErr.message)
    throw new Error(itemsErr.message ?? 'Failed to fetch horizon items')
  }

  const items = (itemData ?? []) as HorizonItemSummaryRow[]

  const requestsById = new Map<string, RequestSnippetRow>()
  const reqIds = [...new Set(items.map((it) => it.block_request_id).filter(Boolean))]
  if (reqIds.length > 0) {
    const { data: reqData, error: reqErr } = await supabase
      .from('block_requests')
      .select('id, work_description, department')
      .in('id', reqIds)
    if (reqErr) {
      console.warn('[optimizer] failed to fetch joined requests (continuing):', reqErr.message)
    } else {
      for (const r of (reqData ?? []) as RequestSnippetRow[]) {
        requestsById.set(r.id, r)
      }
    }
  }

  const scheduledItems = items.filter((it) => it.status === 'scheduled')
  const deferredItems = items.filter((it) => it.status === 'deferred')
  const availability = horizon.projected_availability_pct

  const deptBreakdown: Record<string, { scheduled: number; deferred: number }> = {}
  for (const it of items) {
    const dept = requestsById.get(it.block_request_id)?.department ?? 'Unassigned'
    const bucket = deptBreakdown[dept] ?? { scheduled: 0, deferred: 0 }
    bucket[it.status === 'scheduled' ? 'scheduled' : 'deferred'] += 1
    deptBreakdown[dept] = bucket
  }

  const deferredReasons = [...new Set(deferredItems.map((it) => it.reason).filter((r): r is string => Boolean(r)))]

  const detSummary = deterministicSummary(
    horizon,
    scheduledItems.length,
    deferredItems.length,
    items.length,
    availability,
    deptBreakdown,
    deferredReasons,
  )

  const hasLlm = Boolean(process.env.OPENROUTER_API_KEY)
  const period = horizon.horizon_type === 'weekly' ? 'week' : 'month'

  let summaryExplanation: string = detSummary

  if (hasLlm) {
    try {
      const system =
        'You are a briefing assistant for railway control officers. You summarize capacity-planning results in plain, conversational English.'
      const scheduledSamples = scheduledItems
        .slice(0, 5)
        .map((it) => {
          const desc = requestsById.get(it.block_request_id)?.work_description ?? 'n/a'
          return `"${desc}" (priority ${it.priority_score ?? 'n/a'}, starts ${it.assigned_start_hour ?? 'n/a'})`
        })
        .join(', ')
      const deptCounts = DEPARTMENTS.map((d) => {
        const b = deptBreakdown[d] ?? { scheduled: 0, deferred: 0 }
        return `${d}: ${b.scheduled}/${b.deferred}`
      }).join(', ')

      const user = [
        `Summarize this railway block-work plan for a control officer reviewing the whole ${period} at once, in exactly 3-4 sentences.`,
        `Horizon: ${horizon.horizon_start.slice(0, 10)} to ${horizon.horizon_end.slice(0, 10)} (${horizon.horizon_type}).`,
        `Requests scheduled: ${scheduledItems.length}; deferred: ${deferredItems.length}.`,
        `Deferred reasons: ${deferredReasons.join('; ') || 'n/a'}.`,
        `Projected track availability: ${availability ?? 0}%.`,
        `Department breakdown (scheduled/deferred): ${deptCounts}.`,
        `Scheduled request samples: ${scheduledSamples || 'none'}.`,
        'Keep it plain English, no markdown, no bullet points.',
      ].join(' ')

      const txt = await Promise.race<string>([
        openRouterChat(system, user),
        new Promise<string>((_, rej) =>
          setTimeout(() => rej(new Error('llm timeout')), LLM_TIMEOUT_MS),
        ),
      ])
      summaryExplanation = txt?.trim() ? txt : detSummary
    } catch (e) {
      console.warn('[optimizer] OpenRouter summary failed, using deterministic fallback:', e)
      summaryExplanation = detSummary
    }
  }

  const { error: updateErr } = await supabase
    .from('block_plan_horizons')
    .update({ summary_explanation: summaryExplanation })
    .eq('id', horizonId)

  if (updateErr) {
    console.error('[optimizer] failed to write horizon summary:', updateErr.message)
    throw new Error(updateErr.message ?? 'Failed to write summary_explanation')
  }

  console.log('[optimizer] Wrote horizon summary', { horizonId, length: summaryExplanation.length })
}
