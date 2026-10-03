import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { LIVE_TRAIN_DATASET } from '@/lib/corridors'

export async function POST(req: Request) {
  const supabase = createClient()

  const body = (await req.json().catch(() => ({}))) as {
    corridorId?: unknown
  }

  const corridorId = body.corridorId
  const corridorIdNum =
    corridorId != null && !Number.isNaN(Number(corridorId))
      ? Number(corridorId)
      : null

  // Clear existing timetable entries
  const { error: clearError } = await supabase
    .from('timetable')
    .delete()
    .gte('id', 0)

  if (clearError) {
    return NextResponse.json(
      { error: 'Failed to clear timetable', details: clearError.message },
      { status: 500 }
    )
  }

  // Fetch segments to assign valid foreign keys
  const { data: segmentRows, error: segmentError } = await supabase
    .from('segments')
    .select('id, name, corridor_id')
    .order('id')

  if (segmentError) {
    return NextResponse.json(
      { error: 'Failed to fetch segments', details: segmentError.message },
      { status: 500 }
    )
  }

  const segments = segmentRows ?? []
  const c1Segments = segments.filter((s) => s.corridor_id === 1)
  const c2Segments = segments.filter((s) => s.corridor_id === 2)

  // Map each train in LIVE_TRAIN_DATASET to a realistic segment and schedule relative to now
  const now = Date.now()

  // Specific segment and status assignments for the 10 real Raipur trains
  const trainConfig: Record<
    string,
    { segmentOffset: number; minuteOffset: number; status: 'scheduled' | 'in_progress' | 'delayed' }
  > = {
    '12834': { segmentOffset: 0, minuteOffset: -12, status: 'in_progress' },
    '18237': { segmentOffset: 2, minuteOffset: -30, status: 'delayed' },
    'MAT-BOXN-541': { segmentOffset: 1, minuteOffset: -18, status: 'in_progress' },
    'MAT-BRN-209': { segmentOffset: 3, minuteOffset: -40, status: 'delayed' },
    '08701': { segmentOffset: 1, minuteOffset: 25, status: 'scheduled' },
    '20825': { segmentOffset: 2, minuteOffset: -15, status: 'in_progress' },
    '12859': { segmentOffset: 1, minuteOffset: -28, status: 'delayed' },
    'MAT-BOBRN-882': { segmentOffset: 0, minuteOffset: -10, status: 'in_progress' },
    'MAT-BFNS-304': { segmentOffset: 2, minuteOffset: 35, status: 'scheduled' },
    '08728': { segmentOffset: 3, minuteOffset: 55, status: 'scheduled' },
  }

  let selectedTrains = LIVE_TRAIN_DATASET
  if (corridorIdNum === 1) {
    selectedTrains = LIVE_TRAIN_DATASET.filter((t) => t.corridorId === 'corridor-1')
  } else if (corridorIdNum === 2) {
    selectedTrains = LIVE_TRAIN_DATASET.filter((t) => t.corridorId === 'corridor-2')
  }

  const timetableRows = selectedTrains.map((train) => {
    const isCorridor1 = train.corridorId === 'corridor-1'
    const segPool = isCorridor1
      ? (c1Segments.length > 0 ? c1Segments : segments)
      : (c2Segments.length > 0 ? c2Segments : segments)

    const cfg = trainConfig[train.id] || { segmentOffset: 0, minuteOffset: 0, status: 'scheduled' }
    const segment = segPool[cfg.segmentOffset % (segPool.length || 1)]

    const scheduledTime = new Date(now + cfg.minuteOffset * 60 * 1000).toISOString()

    return {
      train_number: train.trainNo,
      segment_id: segment ? segment.id : (isCorridor1 ? 1 : 5),
      scheduled_time: scheduledTime,
      status: cfg.status,
    }
  })

  const { data: inserted, error: insertError } = await supabase
    .from('timetable')
    .insert(timetableRows)
    .select()

  if (insertError) {
    return NextResponse.json(
      { error: 'Failed to insert trains', details: insertError.message },
      { status: 500 }
    )
  }

  return NextResponse.json(
    {
      message: 'Timetable seeded with real Raipur trains and material rakes',
      count: inserted?.length ?? timetableRows.length,
    },
    { status: 201 }
  )
}
