import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const TRAIN_COUNT = 15
const WINDOW_MS = 24 * 60 * 60 * 1000

export async function POST(req: Request) {
  const supabase = createClient()

  const body = (await req.json().catch(() => ({}))) as {
    corridorId?: unknown
  }

  const corridorId = body.corridorId

  if (corridorId == null || Number.isNaN(Number(corridorId))) {
    return NextResponse.json(
      { error: 'corridorId is required in the request body' },
      { status: 400 }
    )
  }

  const corridorIdNum = Number(corridorId)

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
    .eq('corridor_id', corridorIdNum)

  if (segmentError) {
    return NextResponse.json(
      { error: 'Failed to fetch segments', details: segmentError.message },
      { status: 500 }
    )
  }

  const segments = segmentRows ?? []

  if (segments.length === 0) {
    return NextResponse.json(
      {
        error: 'No segments found for the given corridor_id',
        corridorId: corridorIdNum,
      },
      { status: 404 }
    )
  }

  const now = Date.now()
  const trains = Array.from({ length: TRAIN_COUNT }, (_, i) => ({
    train_number: String(10001 + i),
    segment_id: segments[i % segments.length].id,
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
