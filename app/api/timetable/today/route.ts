import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type TimetableRow = {
  train_number: string
  scheduled_time: string
}

export async function GET() {
  try {
    const supabase = createClient()
    const now = new Date()

    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      .toISOString()
    const endOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
    ).toISOString()

    const { data, error } = await supabase
      .from('timetable')
      .select('train_number, scheduled_time')
      .gte('scheduled_time', startOfDay)
      .lte('scheduled_time', endOfDay)
      .order('scheduled_time', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json((data as TimetableRow[] | null) ?? [])
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An unexpected error occurred' },
      { status: 500 },
    )
  }
}
