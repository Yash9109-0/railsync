import { createClient } from '@supabase/supabase-js'
import { openRouterChat } from '@/lib/llm'
import { createNotificationsForUsers, getControlOfficers } from '@/lib/notifications'

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
  corridorId?: number
): Promise<{ horizonId: string }> {
  let lastPayload: string | undefined;
  try {
    const HORIZON_MINS = horizonType === 'weekly' ? 10080 : 43200;
    const dayOffset = horizonType === 'weekly' ? 7 : 30;
    const endDate = new Date(startDate.getTime() + dayOffset * DAY_MS);
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    console.log("[optimizer] Fetching data for CP-SAT Solver...");

    // 1. Fetch Segments
    let segmentIds: number[] | undefined;
    if (corridorId != null) {
      const { data: corridorSegs, error: segErr } = await supabase
        .from('segments')
        .select('id')
        .eq('corridor_id', corridorId);
      if (segErr) throw new Error(`Failed to fetch segments: ${segErr.message}`);
      segmentIds = (corridorSegs ?? []).map((s: { id: number }) => s.id);
    }

    // 2. Fetch Requests
    let requestQuery = supabase
      .from('block_requests')
      .select('id, segment_id, requested_start, requested_duration_mins, priority_score')
      .eq('status', 'scored')
      .order('priority_score', { ascending: false });

    if (segmentIds && segmentIds.length > 0) {
      requestQuery = requestQuery.in('segment_id', segmentIds);
    } else if (segmentIds) {
      // empty segments
      requestQuery = requestQuery.in('segment_id', [-1]); 
    }

    const { data: reqData, error: reqErr } = await requestQuery;
    if (reqErr) throw new Error(`Failed to fetch requests: ${reqErr.message}`);
    const requests = (reqData ?? []) as RequestRow[];

    // 3. Fetch Segment Capacities
    const uniqueSegments = [...new Set(requests.map(r => r.segment_id).filter(id => id != null))] as number[];
    const segment_capacity_mins: Record<number, number> = {};
    
    if (uniqueSegments.length > 0) {
      const { data: statData } = await supabase
        .from('segment_stats')
        .select('segment_id, capacity_pct')
        .in('segment_id', uniqueSegments);
      
      const capMap = new Map((statData || []).map(s => [s.segment_id, s.capacity_pct]));
      for (const segId of uniqueSegments) {
        const pct = capMap.get(segId) ?? 20;
        segment_capacity_mins[segId] = Math.round((pct / 100) * HORIZON_MINS);
      }
    }

    // 4. Build API Payload
    const validRequests = requests.filter(r => r.segment_id != null);
    const apiPayload = {
      horizon_total_mins: HORIZON_MINS,
      segment_capacity_mins: segment_capacity_mins,
      requests: validRequests.map((req) => {
        let preferred = 0;
        if (req.requested_start) {
          const reqStart = new Date(req.requested_start).getTime();
          preferred = Math.max(0, Math.floor((reqStart - startDate.getTime()) / 60000));
        }
        return {
          id: req.id,
          segment_id: req.segment_id,
          duration_mins: req.requested_duration_mins,
          priority_score: req.priority_score ?? 0,
          preferred_start_mins: preferred,
          avoids_peak_start_mins: [] 
        };
      })
    };

     console.log("[optimizer] Calling CP-SAT Solver API...");
    const ML_API_URL = process.env.ML_API_URL || 'https://YOUR-RENDER-URL.onrender.com';
    const solverUrl = `${ML_API_URL}/solve-horizon`;
    lastPayload = JSON.stringify(apiPayload);
    console.log("Attempting CP-SAT call to:", solverUrl);
    const response = await fetch(solverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apiPayload),
      signal: AbortSignal.timeout(45000)
    });

    if (!response.ok) {
      throw new Error(`ML API Failed with status: ${response.status}`);
    }

    const solverResults = await response.json();

    // 5. Create Horizon Row (CP-SAT success)
    const { data: horizon, error: horizonErr } = await supabase
      .from('block_plan_horizons')
      .insert({
        horizon_type: horizonType,
        horizon_start: startDate.toISOString(),
        horizon_end: endDate.toISOString(),
        status: 'draft',
        generated_at: new Date().toISOString(),
        corridor_id: corridorId ?? null,
        solver_used: 'cp-sat' // <--- New DB flag
      })
      .select('id')
      .single<{ id: string }>();

    if (horizonErr || !horizon) throw new Error(horizonErr?.message ?? 'Failed to create horizon');
    const horizonId = horizon.id;

    // 6. Format and Insert Items
    const itemsToInsert: HorizonItemRow[] = [];
    let scheduledCount = 0;
    let deferredCount = 0;
    let totalScheduledMins = 0;

    for (const res of solverResults) {
      const originalReq = requests.find(r => r.id === res.id);
      if (!originalReq) continue;

      if (res.scheduled && res.start_mins != null) {
        const itemDate = new Date(startDate.getTime() + res.start_mins * 60000);
        itemsToInsert.push({
          horizon_id: horizonId,
          block_request_id: res.id,
          assigned_date: itemDate.toISOString().slice(0, 10),
          assigned_start_hour: hoursFromMidnight(itemDate),
          assigned_duration_mins: res.duration_mins,
          priority_score: originalReq.priority_score,
          status: 'scheduled',
          reason: 'Placed optimally by CP-SAT solver.'
        });
        scheduledCount++;
        totalScheduledMins += res.duration_mins;
      } else {
        itemsToInsert.push({
          horizon_id: horizonId,
          block_request_id: res.id,
          assigned_date: null,
          assigned_start_hour: null,
          assigned_duration_mins: res.duration_mins,
          priority_score: originalReq.priority_score,
          status: 'deferred',
          reason: 'Deferred — could not fit within segment capacity during solver optimization.'
        });
        deferredCount++;
      }
    }

    // Catch requests that had no segment
    for (const req of requests) {
      if (req.segment_id == null) {
        itemsToInsert.push({
          horizon_id: horizonId,
          block_request_id: req.id,
          assigned_date: null,
          assigned_start_hour: null,
          assigned_duration_mins: req.requested_duration_mins,
          priority_score: req.priority_score,
          status: 'deferred',
          reason: 'Deferred — no segment assigned for this request'
        });
        deferredCount++;
      }
    }

    await supabase.from('block_plan_horizon_items').insert(itemsToInsert);

    // 7. Calculate Availability for CP-SAT run
    const numSegments = uniqueSegments.length || 1;
    const totalPossibleMinutes = HORIZON_MINS * numSegments;
    const projected = totalPossibleMinutes > 0 ? 100 - (totalScheduledMins / totalPossibleMinutes) * 100 : 100;
    const projectedAvailabilityPct = Math.max(0, Math.min(100, Math.round(projected * 100) / 100));

    await supabase.from('block_plan_horizons').update({
      projected_availability_pct: projectedAvailabilityPct,
      summary_explanation: `${horizonType === 'weekly' ? 'Weekly' : 'Monthly'} block plan generated using CP-SAT solver: ${scheduledCount} scheduled, ${deferredCount} deferred. Projected track availability: ${projectedAvailabilityPct}%.`,
      items_improved_by_local_search: 0
    }).eq('id', horizonId);

    console.log("✅ CP-SAT Solver Plan Generated Successfully!", { horizonId });

    // Notify Control officers that horizon plan is ready
    try {
      const controlOfficers = await getControlOfficers()
      if (controlOfficers.length > 0) {
        await createNotificationsForUsers(
          controlOfficers,
          'Horizon Plan Generated',
          `${horizonType === 'weekly' ? 'Weekly' : 'Monthly'} block plan for ${startDate.toISOString().slice(0, 10)} has been generated with ${scheduledCount} scheduled and ${deferredCount} deferred requests. Projected track availability: ${projectedAvailabilityPct}%.`,
          `/dashboard/control?horizon=${horizonId}`
        )
        console.log('[optimizer] Notified control officers of horizon plan completion')
      }
    } catch (notifyErr) {
      console.error('[optimizer] Failed to notify control officers:', notifyErr)
    }

    return { horizonId };

  } catch (error) {
    console.error(
      "🔴 CP-SAT SOLVER CALL FAILED:",
      error instanceof Error ? error.message : String(error),
      error instanceof Error ? error.stack : undefined,
      "Payload sent:",
      lastPayload
    );
    return generateHorizonPlanGreedy(horizonType, startDate, corridorId);
  }
}

export async function generateHorizonPlanGreedy(
  horizonType: 'weekly' | 'monthly',
  startDate: Date,
  corridorId?: number,
): Promise<{ horizonId: string }> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const dayOffset = horizonType === 'weekly' ? 7 : 30
  const endDate = new Date(startDate.getTime() + dayOffset * DAY_MS)
  const horizonMinutes = (endDate.getTime() - startDate.getTime()) / 60000

  const { data: horizon, error: horizonErr } = await supabase
    .from('block_plan_horizons')
    .insert({
      horizon_type: horizonType,
      horizon_start: startDate.toISOString(),
      horizon_end: endDate.toISOString(),
      status: 'draft',
      generated_at: new Date().toISOString(),
      corridor_id: corridorId ?? null,
      solver_used: 'greedy' // <--- Explicitly tagged as fallback
    })
    .select('id')
    .single<{ id: string }>()

  if (horizonErr || !horizon) {
    console.error('[optimizer] Failed to create horizon:', horizonErr?.message)
    throw new Error(horizonErr?.message ?? 'Failed to create block_plan_horizons row')
  }

  const horizonId = horizon.id
  console.log('[optimizer] Created horizon (Greedy)', { horizonId, horizon_type: horizonType, corridor_id: corridorId ?? null })

  let segmentIds: number[] | undefined
  if (corridorId != null) {
    const { data: corridorSegs, error: segErr } = await supabase
      .from('segments')
      .select('id')
      .eq('corridor_id', corridorId)
    if (segErr) {
      console.error('[optimizer] Failed to fetch segments for corridor:', segErr?.message)
      throw new Error(segErr?.message ?? `Failed to fetch segments for corridor ${corridorId}`)
    }
    segmentIds = (corridorSegs ?? []).map((s: { id: number }) => s.id)
    console.log('[optimizer] Corridor segments', { corridorId, count: segmentIds.length })
  }

  const requestsQuery = () =>
    supabase
      .from('block_requests')
      .select('id, segment_id, requested_start, requested_duration_mins, priority_score')
      .eq('status', 'scored')
      .order('priority_score', { ascending: false })

  let requestData: RequestRow[] = []
  let requestsErr: { message?: string } | null = null
  if (segmentIds && segmentIds.length > 0) {
    const res = await requestsQuery().in('segment_id', segmentIds)
    requestData = (res.data ?? []) as RequestRow[]
    requestsErr = res.error ?? null
  } else if (segmentIds) {
    requestData = []
  } else {
    const res = await requestsQuery()
    requestData = (res.data ?? []) as RequestRow[]
    requestsErr = res.error ?? null
  }

  if (requestsErr) {
    console.error('[optimizer] Failed to fetch scored block_requests:', requestsErr?.message)
    throw new Error(requestsErr?.message ?? 'Failed to fetch block_requests')
  }

  const requests = requestData
  console.log('[optimizer] Fetched scored requests', { count: requests.length, corridor_id: corridorId ?? null })

  const forecastQuery = () =>
    supabase
      .from('goods_train_forecast')
      .select('segment_id, forecast_date, peak_hour_start, peak_hour_end')
      .gte('forecast_date', startDate.toISOString())
      .lte('forecast_date', endDate.toISOString())

  let forecastData: ForecastRow[] = []
  let forecastErr: { message?: string } | null = null
  if (segmentIds && segmentIds.length > 0) {
    const res = await forecastQuery().in('segment_id', segmentIds)
    forecastData = (res.data ?? []) as ForecastRow[]
    forecastErr = res.error ?? null
  } else if (segmentIds) {
    forecastData = []
  } else {
    const res = await forecastQuery()
    forecastData = (res.data ?? []) as ForecastRow[]
    forecastErr = res.error ?? null
  }

  if (forecastErr) {
    console.error('[optimizer] Failed to fetch goods_train_forecast:', forecastErr?.message)
    throw new Error(forecastErr?.message ?? 'Failed to fetch goods_train_forecast')
  }

  const forecast = forecastData

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
  const capacityPctBySegment = new Map<number, number>()
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

  type SlotResult = { startHour: number; dateKey: string; atRequestedTime: boolean }

  const findSlotFor = (
    segment: number,
    durationMin: number,
    requestedStart: string | null,
  ): SlotResult | null => {
    const durationHours = durationMin / 60
    const canPlace = (startHour: number, dateKey: string): boolean => {
      if (isBusy(segment, dateKey, startHour, durationHours)) return false
      if (conflicts(segment, dateKey, startHour, durationHours)) return false
      return true
    }

    if (requestedStart) {
      const requestedMs = Date.parse(requestedStart)
      if (!Number.isNaN(requestedMs)) {
        const requested = new Date(requestedMs)
        const reqDateKey = requested.toISOString().slice(0, 10)
        const reqStartHour = hoursFromMidnight(requested)
        const inRange =
          requested.getTime() >= startDate.getTime() &&
          requested.getTime() + durationMin * 60000 <= endDate.getTime()
        if (inRange && canPlace(reqStartHour, reqDateKey)) {
          return { startHour: reqStartHour, dateKey: reqDateKey, atRequestedTime: true }
        }
      }
    }

    const startYear = startDate.getUTCFullYear()
    const startMonth = startDate.getUTCMonth()
    const startDay = startDate.getUTCDate()
    for (let day = 0; day < dayOffset; day++) {
      const dayMs = Date.UTC(startYear, startMonth, startDay + day)
      const dateKey = new Date(dayMs).toISOString().slice(0, 10)
      for (let hour = 0; hour < 24; hour++) {
        const slotMs = dayMs + hour * HOUR_MS
        const endMs = slotMs + durationMin * 60000
        if (slotMs < startDate.getTime() || endMs > endDate.getTime()) continue
        if (canPlace(hour, dateKey)) {
          return { startHour: hour, dateKey, atRequestedTime: false }
        }
      }
    }

    return null
  }

  const items: HorizonItemRow[] = []
  let scheduled = 0
  let deferred = 0

  for (const req of requests) {
    const duration = req.requested_duration_mins
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

    if (!capacityPctBySegment.has(segment)) {
      const { data: statData, error: statErr } = await supabase
        .from('segment_stats')
        .select('capacity_pct')
        .eq('segment_id', segment)
        .limit(1)
      if (statErr) {
        console.warn(
          '[optimizer] Failed to fetch segment_stats capacity_pct for segment',
          segment,
          ':',
          statErr.message,
        )
      }
      const capacityPct = (statData?.[0]?.capacity_pct ?? 20) as number
      capacityPctBySegment.set(segment, capacityPct)
    }
    const capPerSegment = (capacityPctBySegment.get(segment)! / 100) * horizonMinutes
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

    const slot = findSlotFor(segment, duration, req.requested_start)

    if (slot) {
      const reason = slot.atRequestedTime
        ? 'Placed at original requested time — no conflicts'
        : 'Shifted to avoid goods traffic peak'

      const slots = committedSlotsBySegment.get(segment) ?? []
      slots.push({
        date: slot.dateKey,
        start_hour: slot.startHour,
        duration_mins: duration,
      })
      committedSlotsBySegment.set(segment, slots)
      committedMinutesBySegment.set(segment, committedMin + duration)
      totalCommittedMinutes += duration

      items.push({
        horizon_id: horizonId,
        block_request_id: req.id,
        assigned_date: slot.dateKey,
        assigned_start_hour: slot.startHour,
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

  let itemsImproved = 0

  const requestSegmentById = new Map<string, number>()
  const requestStartById = new Map<string, string>()
  for (const req of requests) {
    if (req.segment_id != null) {
      requestSegmentById.set(req.id, req.segment_id)
    }
    requestStartById.set(req.id, req.requested_start)
  }

  const deferredItems = items.filter((it) => it.status === 'deferred')
  deferredItems.sort((a, b) => {
    const pa = a.priority_score ?? 0
    const pb = b.priority_score ?? 0
    return pb - pa
  })

  for (const deferredItem of deferredItems) {
    if (deferredItem.priority_score == null) continue

    const segment = requestSegmentById.get(deferredItem.block_request_id)
    if (segment == null) continue

    const duration = deferredItem.assigned_duration_mins
    const deferredPriority = deferredItem.priority_score

    const schedOnSegment = items
      .filter(
        (it) =>
          it.status === 'scheduled' &&
          requestSegmentById.get(it.block_request_id) === segment &&
          (it.priority_score ?? 0) < deferredPriority,
      )
      .sort((a, b) => {
        const pa = a.priority_score ?? 0
        const pb = b.priority_score ?? 0
        return pa - pb
      })

    for (const schedItem of schedOnSegment) {
      const schedDuration = schedItem.assigned_duration_mins
      const schedDate = schedItem.assigned_date!
      const schedHour = schedItem.assigned_start_hour!

      const slots = committedSlotsBySegment.get(segment) ?? []
      const slotIdx = slots.findIndex(
        (s) =>
          s.date === schedDate &&
          s.start_hour === schedHour &&
          s.duration_mins === schedDuration,
      )
      if (slotIdx < 0) continue

      slots.splice(slotIdx, 1)
      const committedMinBefore = committedMinutesBySegment.get(segment) ?? 0
      committedMinutesBySegment.set(segment, committedMinBefore - schedDuration)
      totalCommittedMinutes -= schedDuration

      const capPerSegment = (capacityPctBySegment.get(segment)! / 100) * horizonMinutes
      if (committedMinBefore - schedDuration + duration > capPerSegment) {
        slots.splice(slotIdx, 0, {
          date: schedDate,
          start_hour: schedHour,
          duration_mins: schedDuration,
        })
        committedMinutesBySegment.set(segment, committedMinBefore)
        totalCommittedMinutes += schedDuration
        continue
      }

      const reqStart = requestStartById.get(deferredItem.block_request_id) ?? null
      const newSlot = findSlotFor(segment, duration, reqStart)

      if (newSlot) {
        deferredItem.status = 'scheduled'
        deferredItem.assigned_date = newSlot.dateKey
        deferredItem.assigned_start_hour = newSlot.startHour
        deferredItem.reason = newSlot.atRequestedTime
          ? 'Placed at original requested time — no conflicts'
          : 'Shifted to avoid goods traffic peak'

        schedItem.status = 'deferred'
        schedItem.assigned_date = null
        schedItem.assigned_start_hour = null
        schedItem.reason =
          'Displaced by higher-priority request during optimization pass.'

        const newSlots = committedSlotsBySegment.get(segment) ?? []
        newSlots.push({
          date: newSlot.dateKey,
          start_hour: newSlot.startHour,
          duration_mins: duration,
        })
        committedSlotsBySegment.set(segment, newSlots)
        committedMinutesBySegment.set(
          segment,
          (committedMinutesBySegment.get(segment) ?? 0) + duration,
        )
        totalCommittedMinutes += duration

        itemsImproved++
        scheduled++
        deferred--
        break
      } else {
        slots.splice(slotIdx, 0, {
          date: schedDate,
          start_hour: schedHour,
          duration_mins: schedDuration,
        })
        committedMinutesBySegment.set(segment, committedMinBefore)
        totalCommittedMinutes += schedDuration
      }
    }
  }

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
  const localSearchNote = itemsImproved > 0
    ? `; ${itemsImproved} deferred request(s) placed via local-search displacement.`
    : ''
  const summaryExplanation =
    `${horizonType === 'weekly' ? 'Weekly' : 'Monthly'} block plan generated for ${startDate.toISOString().slice(0, 10)}–${endDate.toISOString().slice(0, 10)}: ${scheduled} of ${total} requests scheduled, ${deferred} deferred, ${projectedAvailabilityPct}% projected segment availability.${localSearchNote}`

  const { error: updateErr } = await supabase
    .from('block_plan_horizons')
    .update({
      projected_availability_pct: projectedAvailabilityPct,
      summary_explanation: summaryExplanation,
      items_improved_by_local_search: itemsImproved,
    })
    .eq('id', horizonId)
  if (updateErr) {
    console.error('[optimizer] Failed to update projected availability:', updateErr?.message)
    throw new Error(updateErr?.message ?? 'Failed to update block_plan_horizons')
  }

  // Notify Control officers that horizon plan is ready
  try {
    const controlOfficers = await getControlOfficers()
    if (controlOfficers.length > 0) {
      await createNotificationsForUsers(
        controlOfficers,
        'Horizon Plan Generated',
        `${horizonType === 'weekly' ? 'Weekly' : 'Monthly'} block plan for ${startDate.toISOString().slice(0, 10)} has been generated with ${scheduled} scheduled and ${deferred} deferred requests. Projected track availability: ${projectedAvailabilityPct}%.`,
        `/dashboard/control?horizon=${horizonId}`
      )
      console.log('[optimizer] Notified control officers of horizon plan completion (greedy)')
    }
  } catch (notifyErr) {
    console.error('[optimizer] Failed to notify control officers:', notifyErr)
  }

  return { horizonId }
}

type HorizonSummaryRow = {
  id: string
  horizon_type: 'weekly' | 'monthly'
  horizon_start: string
  horizon_end: string
  projected_availability_pct: number | null
  summary_explanation: string | null
  items_improved_by_local_search: number | null
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
  const improvementNote = (horizon.items_improved_by_local_search ?? 0) > 0
    ? ` ${horizon.items_improved_by_local_search} deferred request(s) were successfully scheduled via a local-search displacement pass.`
    : ''
  return `For the upcoming ${period} (${start} to ${end}), ${scheduled} of ${total} maintenance requests are scheduled and ${deferred} are deferred.${reasonText}${improvementNote} Department breakdown — ${deptText}. Projected track availability is ${availability ?? 0}%.`
}

export async function generateHorizonSummary(horizonId: string): Promise<void> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: horizon, error: horizonErr } = await supabase
    .from('block_plan_horizons')
    .select('horizon_type, horizon_start, horizon_end, projected_availability_pct, items_improved_by_local_search')
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