import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const SEGMENTS = ['A-B', 'B-C', 'C-D', 'D-E']
const TRAIN_COUNT = 15
const WINDOW_MS = 24 * 60 * 60 * 1000

export async function POST() {
  const supabase = createClient()

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

  const { data: segmentRows, error: segmentError } = await supabase
    .from('segments')
    .select('id, name')
    .in('name', SEGMENTS)

  if (segmentError) {
    return NextResponse.json(
      { error: 'Failed to fetch segments', details: segmentError.message },
      { status: 500 }
    )
  }

  const segmentByName = new Map(
    (segmentRows ?? []).map((segment) => [segment.name, segment.id])
  )
  const missing = SEGMENTS.filter((name) => !segmentByName.has(name))

  if (missing.length > 0) {
    return NextResponse.json(
      { error: 'Missing required segments', missing },
      { status: 404 }
    )
  }

  const now = Date.now()
  const trains = Array.from({ length: TRAIN_COUNT }, (_, i) => ({
    train_number: String(10001 + i),
    segment_id: segmentByName.get(SEGMENTS[i % SEGMENTS.length])!,
    scheduled_time: new Date(now + (i / TRAIN_COUNT) * WINDOW_MS).toISOString(),
    status: 'scheduled' as const,
  }))

  const { data: inserted, error: insertError } = await supabase
    .from('timetable')
    .insert(trains)
    .select()

  if (insertError) {
    return NextResponse.json(
      { error: 'Failed to insert trains', details: insertError.message },
      { status: 500 }
    )
  }

  return NextResponse.json(
    { message: 'Timetable seeded', count: inserted?.length ?? TRAIN_COUNT },
    { status: 201 }
  )
}
