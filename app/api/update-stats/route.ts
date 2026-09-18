import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    
    if (!supabaseUrl || !serviceKey) {
      throw new Error('Missing Supabase env vars')
    }

    const supabase = createClient(supabaseUrl, serviceKey)

    const { segment_id, work_type } = await req.json()
    if (!segment_id || !work_type) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const { data: logs, error } = await supabase
      .from('execution_logs')
      .select(`
        actual_start,
        actual_end,
        block_request_id,
        block_requests!inner(segment_id, work_type, requested_duration_mins)
      `)
      .eq('status', 'completed')
      .eq('block_requests.segment_id', segment_id)
      .eq('block_requests.work_type', work_type)

    if (error) throw error

    if (!logs || logs.length === 0) {
      return NextResponse.json({ message: 'No completed logs yet' })
    }

    let totalRate = 0
    let validCount = 0

    for (const log of logs as any[]) {
      const br = log.block_requests
      if (!log.actual_start || !log.actual_end || !br?.requested_duration_mins) continue
      const start = new Date(log.actual_start).getTime()
      const end = new Date(log.actual_end).getTime()
      const actualMins = (end - start) / 60000
      const requested = br.requested_duration_mins
      if (requested <= 0) continue
      const overrun = actualMins - requested
      const rate = overrun / requested
      totalRate += rate
      validCount++
    }

    if (validCount === 0) {
      return NextResponse.json({ message: 'No valid durations' })
    }

    let avgRate = totalRate / validCount
    if (validCount < 2) {
      avgRate = 0.15
    }
    avgRate = Math.max(0, avgRate)

    const { data: existingStats, error: fetchError } = await supabase
      .from('segment_stats')
      .select('capacity_pct')
      .eq('segment_id', segment_id)
      .eq('work_type', work_type)
      .maybeSingle()

    if (fetchError) throw fetchError

    const currentCapacity = (existingStats?.capacity_pct ?? 20) as number

    let newCapacity = currentCapacity
    let capacityChanged = false

    if (avgRate > 0.25) {
      newCapacity = Math.max(10, currentCapacity - 2)
      capacityChanged = newCapacity !== currentCapacity
    } else if (avgRate < 0.05) {
      newCapacity = Math.min(30, currentCapacity + 2)
      capacityChanged = newCapacity !== currentCapacity
    }

    if (capacityChanged) {
      console.log(`Segment ${segment_id}-${work_type} capacity adjusted from ${currentCapacity}% to ${newCapacity}% based on overrun_rate ${avgRate}`)
    } else {
      console.log(`Segment ${segment_id}-${work_type} capacity unchanged at ${currentCapacity}% based on overrun_rate ${avgRate}`)
    }

    const { error: upsertError } = await supabase
      .from('segment_stats')
      .upsert({
        segment_id,
        work_type,
        historical_overrun_rate: avgRate,
        capacity_pct: newCapacity,
        sample_count: validCount,
        last_updated: new Date().toISOString()
      }, { onConflict: 'segment_id,work_type' })

    if (upsertError) throw upsertError

    return NextResponse.json({
      success: true,
      segment_id,
      work_type,
      avgRate,
      count: validCount,
      capacity_pct: newCapacity
    })

  } catch (e: any) {
    console.error('update-stats error:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}