import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

interface WhatIfRequest {
  block_request_id: string
  scenario: 'delay_2h' | 'reduce_1h'
  base_start?: string
  base_duration_mins?: number
}

interface PlanOption {
  id: string
  label: string
  start_time: string
  duration_hours: number
  track_affected: string
  trains_impacted: number
  time_saved_vs_baseline_minutes: number
  priority_score: number
  delay_risk: 'Low' | 'Medium' | 'High'
  is_recommended: boolean
}

export async function POST(request: Request) {
  try {
    const body: WhatIfRequest = await request.json()
    const { block_request_id, scenario, base_start, base_duration_mins } = body

    if (!block_request_id || !scenario) {
      return NextResponse.json({ error: 'block_request_id and scenario are required' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { data: blockRequest, error } = await supabase
      .from('block_requests')
      .select('*, segments(name)')
      .eq('id', block_request_id)
      .single()

    if (error || !blockRequest) {
      return NextResponse.json({ error: 'Block request not found' }, { status: 404 })
    }

    const segmentName = blockRequest.segments?.name ?? 'Unknown Segment'
    const originalStart = base_start ? new Date(base_start) : new Date(blockRequest.requested_start)
    const originalDuration = base_duration_mins ?? blockRequest.requested_duration_mins ?? 120

    const applyScenario = (date: Date, mins: number) => {
      const newDate = new Date(date)
      if (scenario === 'delay_2h') {
        newDate.setHours(newDate.getHours() + 2)
      } else if (scenario === 'reduce_1h') {
        mins = Math.max(30, mins - 60)
      }
      return { newDate, newDuration: mins }
    }

    const { newDate: baselineDate, newDuration: baselineDuration } = applyScenario(originalStart, originalDuration)
    const { newDate: weekendDate, newDuration: weekendDuration } = applyScenario(
      shiftToWeekend(originalStart),
      originalDuration,
    )
    const { newDate: nightDate, newDuration: nightDuration } = applyScenario(
      shiftToNightWindow(originalStart),
      originalDuration,
    )

    const baselinePriority = calculatePriority(blockRequest, baselineDate, baselineDuration, segmentName)
    const weekendPriority = calculatePriority(blockRequest, weekendDate, weekendDuration, segmentName)
    const nightPriority = calculatePriority(blockRequest, nightDate, nightDuration, segmentName)

    const baselineRisk = getRiskLabel(baselinePriority)
    const weekendRisk = getRiskLabel(weekendPriority)
    const nightRisk = getRiskLabel(nightPriority)

    const timeSavedWeekend = Math.round((baselinePriority - weekendPriority) * 2.5)
    const timeSavedNight = Math.round((baselinePriority - nightPriority) * 2.5)

    const options: PlanOption[] = [
      {
        id: `opt-a-${Date.now()}`,
        label: 'Option A: Baseline',
        start_time: baselineDate.toISOString(),
        duration_hours: Math.round(baselineDuration / 60 * 10) / 10,
        track_affected: segmentName,
        trains_impacted: estimateTrainsImpacted(baselineDate, baselineDuration),
        time_saved_vs_baseline_minutes: 0,
        priority_score: baselinePriority,
        delay_risk: baselineRisk,
        is_recommended: baselinePriority >= weekendPriority && baselinePriority >= nightPriority,
      },
      {
        id: `opt-b-${Date.now()}`,
        label: 'Option B: Weekend Shift',
        start_time: weekendDate.toISOString(),
        duration_hours: Math.round(weekendDuration / 60 * 10) / 10,
        track_affected: segmentName,
        trains_impacted: estimateTrainsImpacted(weekendDate, weekendDuration),
        time_saved_vs_baseline_minutes: timeSavedWeekend,
        priority_score: weekendPriority,
        delay_risk: weekendRisk,
        is_recommended: weekendPriority >= baselinePriority && weekendPriority >= nightPriority,
      },
      {
        id: `opt-c-${Date.now()}`,
        label: 'Option C: Night Window',
        start_time: nightDate.toISOString(),
        duration_hours: Math.round(nightDuration / 60 * 10) / 10,
        track_affected: segmentName,
        trains_impacted: estimateTrainsImpacted(nightDate, nightDuration),
        time_saved_vs_baseline_minutes: timeSavedNight,
        priority_score: nightPriority,
        delay_risk: nightRisk,
        is_recommended: nightPriority >= baselinePriority && nightPriority >= weekendPriority,
      },
    ]

    const priorityDeltas = {
      delay_2h: {
        baseline: Math.round(baselinePriority - blockRequest.priority_score),
        weekend: Math.round(weekendPriority - blockRequest.priority_score),
        night: Math.round(nightPriority - blockRequest.priority_score),
      },
      reduce_1h: {
        baseline: Math.round(baselinePriority - blockRequest.priority_score),
        weekend: Math.round(weekendPriority - blockRequest.priority_score),
        night: Math.round(nightPriority - blockRequest.priority_score),
      },
    }

    return NextResponse.json({
      success: true,
      block_request_id,
      scenario,
      options,
      priority_deltas: priorityDeltas[scenario],
      original_priority: blockRequest.priority_score,
    })
  } catch (error) {
    console.error('What-if API error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}

function shiftToWeekend(date: Date): Date {
  const newDate = new Date(date)
  const day = newDate.getDay()
  const daysUntilSaturday = (6 - day + 7) % 7
  if (daysUntilSaturday === 0) {
    newDate.setDate(newDate.getDate() + 7)
  } else {
    newDate.setDate(newDate.getDate() + daysUntilSaturday)
  }
  newDate.setHours(9, 0, 0, 0)
  return newDate
}

function shiftToNightWindow(date: Date): Date {
  const newDate = new Date(date)
  newDate.setHours(0, 0, 0, 0)
  return newDate
}

function calculatePriority(
  request: any,
  start: Date,
  durationMins: number,
  segmentName: string,
): number {
  let score = 50

  const hour = start.getHours()
  if (hour >= 22 || hour < 6) score -= 15
  else if (hour >= 6 && hour < 9) score += 10
  else if (hour >= 16 && hour < 19) score += 15

  if (durationMins > 240) score += 10
  else if (durationMins > 120) score += 5

  const criticality = request.safety_criticality?.toLowerCase()
  if (criticality === 'safety_critical' || criticality === 'critical') score += 20
  else if (criticality === 'urgent' || criticality === 'high') score += 10

  const workType = request.work_type?.toLowerCase()
  if (workType === 'signal') score += 8
  else if (workType === 'electrical') score += 5

  const dayOfWeek = start.getDay()
  if (dayOfWeek === 0 || dayOfWeek === 6) score -= 10

  return Math.max(1, Math.min(100, Math.round(score)))
}

function getRiskLabel(priority: number): 'Low' | 'Medium' | 'High' {
  if (priority >= 70) return 'High'
  if (priority >= 40) return 'Medium'
  return 'Low'
}

function estimateTrainsImpacted(start: Date, durationMins: number): number {
  const hour = start.getHours()
  const isPeak = (hour >= 6 && hour < 9) || (hour >= 16 && hour < 19)
  const isNight = hour >= 22 || hour < 6
  const dayOfWeek = start.getDay()
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

  let base = 8
  if (isPeak) base = 18
  else if (isNight) base = 3
  if (isWeekend) base = Math.round(base * 0.6)

  const durationFactor = durationMins / 60
  return Math.round(base * Math.max(0.5, durationFactor))
}