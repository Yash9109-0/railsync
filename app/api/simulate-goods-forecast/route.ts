import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const SEGMENT_NAMES = ['A-B', 'B-C', 'C-D', 'D-E']
const FORECAST_DAYS = 30

function rngInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function forecastDate(dayOffset: number): string {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() + dayOffset)
  return d.toISOString().split('T')[0]
}

export async function POST() {
  const supabase = createClient()

  // Clear existing forecast rows so each run produces a fresh 30-day forecast.
  const { error: clearError } = await supabase
    .from('goods_train_forecast')
    .delete()
    .gte('forecast_date', forecastDate(0))

  if (clearError) {
    return NextResponse.json(
      { error: 'Failed to clear goods train forecast', details: clearError.message },
      { status: 500 }
    )
  }

  // Fetch the 4 corridor segments
  const { data: segmentRows, error: segmentError } = await supabase
    .from('segments')
    .select('id, name')
    .in('name', SEGMENT_NAMES)

  if (segmentError) {
    return NextResponse.json(
      { error: 'Failed to fetch segments', details: segmentError.message },
      { status: 500 }
    )
  }

  const segmentByName = new Map(
    (segmentRows ?? []).map((segment) => [segment.name, segment.id])
  )
  const missing = SEGMENT_NAMES.filter((name) => !segmentByName.has(name))

  if (missing.length > 0) {
    return NextResponse.json(
      { error: 'Missing required segments', missing },
      { status: 404 }
    )
  }

  const segmentIds = SEGMENT_NAMES.map((name) => segmentByName.get(name)!)

  // Build forecast rows: one per segment per day for the next 30 days
  const rows: {
    segment_id: number
    forecast_date: string
    expected_goods_trains: number
    peak_hour_start: number
    peak_hour_end: number
  }[] = []

  for (let day = 0; day < FORECAST_DAYS; day++) {
    const date = forecastDate(day)
    for (const segmentId of segmentIds) {
      const expected = rngInt(2, 10)
      const peakStart = rngInt(6, 10)
      const peakEnd = Math.min(22, peakStart + rngInt(3, 6))
      rows.push({
        segment_id: segmentId,
        forecast_date: date,
        expected_goods_trains: expected,
        peak_hour_start: peakStart,
        peak_hour_end: peakEnd,
      })
    }
  }

  const { data: inserted, error: insertError } = await supabase
    .from('goods_train_forecast')
    .insert(rows)
    .select()

  if (insertError) {
    return NextResponse.json(
      { error: 'Failed to insert goods train forecast', details: insertError.message },
      { status: 500 }
    )
  }

  return NextResponse.json(
    {
      message: 'Goods train forecast generated',
      count: inserted?.length ?? rows.length,
      forecast_days: FORECAST_DAYS,
      segments: SEGMENT_NAMES.length,
    },
    { status: 201 }
  )
}
