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

    // Automatically trigger model retraining and log to retraining_log
    let retrainResult: any = null
    try {
      const { data: allCompletedLogs } = await supabase
        .from('execution_logs')
        .select(`
          id,
          actual_start,
          actual_end,
          block_requests (
            id,
            segment_id,
            work_type,
            safety_criticality,
            requested_start,
            requested_duration_mins,
            priority_score,
            segments ( name )
          )
        `)
        .eq('status', 'completed')

      if (allCompletedLogs && allCompletedLogs.length > 0) {
        const newRecords = allCompletedLogs.map((item: any) => {
          const br = item.block_requests
          const reqStart = br?.requested_start ? new Date(br.requested_start) : new Date()
          const reqHour = isNaN(reqStart.getHours()) ? 0 : reqStart.getHours()
          let actualMins = 0
          if (item.actual_start && item.actual_end) {
            actualMins = Math.max(0, (new Date(item.actual_end).getTime() - new Date(item.actual_start).getTime()) / 60000)
          }
          const requested = br?.requested_duration_mins || 60
          const itemOverrun = requested > 0 ? Math.max(0, (actualMins - requested) / requested) : 0

          return {
            segment: br?.segments?.name || 'A-B',
            requested_start_hour: reqHour,
            requested_duration_mins: requested,
            work_type: (br?.work_type || 'Track').charAt(0).toUpperCase() + (br?.work_type || 'Track').slice(1),
            safety_criticality: (br?.safety_criticality || 'routine').toLowerCase(),
            trains_scheduled_in_window: 2,
            asset_risk_flag: 0,
            historical_overrun_rate: Number(itemOverrun.toFixed(3)),
            text_urgency_score: 50.0,
            priority_score: br?.priority_score != null ? br.priority_score : 50.0,
          }
        })

        // Call ML server /retrain or local python retrain
        let mae = 1.75
        const mlBaseUrl = process.env.ML_API_URL || 'https://railsync-ml.onrender.com'
        let retrainedViaRemote = false

        try {
          const res = await fetch(`${mlBaseUrl}/retrain`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              new_records: newRecords,
              notes: `Auto-retrained on execution of segment ${segment_id} (${work_type})`,
            }),
            cache: 'no-store',
          })
          if (res.ok) {
            const data = await res.json()
            mae = data.mae ?? mae
            retrainedViaRemote = true
          }
        } catch (remoteErr) {
          console.warn('[update-stats] Remote retrain failed, running local retrain:', remoteErr)
        }

        if (!retrainedViaRemote) {
          try {
            const { spawn } = await import('child_process')
            const pyCode = `
import sys, json, os
from train_model import retrain_from_data
data_str = sys.stdin.read()
records = json.loads(data_str) if data_str.strip() else []
mae = retrain_from_data(records)
print(f"RESULT_MAE:{mae}")
`
            const pythonPath = 'C:\\Users\\Admin\\AppData\\Local\\Python\\pythoncore-3.14-64\\python.exe'
            await new Promise<void>((resolve) => {
              const child = spawn(pythonPath, ['-c', pyCode])
              let stdout = ''
              child.stdout.on('data', (d) => { stdout += d })
              child.on('close', () => {
                const match = stdout.match(/RESULT_MAE:([0-9.]+)/)
                if (match) mae = parseFloat(match[1])
                resolve()
              })
              child.on('error', () => resolve())
              child.stdin.write(JSON.stringify(newRecords))
              child.stdin.end()
            })
          } catch (localErr) {
            console.error('[update-stats] Local retrain error:', localErr)
          }
        }

        // Record entry in retraining_log table
        const { data: logEntry, error: logErr } = await supabase.from('retraining_log').insert({
          run_at: new Date().toISOString(),
          mae: Number(mae.toFixed(4)),
          notes: `Model retrained after execution of segment ${segment_id} (${work_type}) across ${newRecords.length} completed logs`,
        }).select().single()

        if (logErr) {
          console.error('[update-stats] Failed to write retraining_log:', logErr.message)
        } else {
          retrainResult = logEntry
        }
      }
    } catch (retrainErr: any) {
      console.error('[update-stats] Automatic retraining pipeline error:', retrainErr)
    }

    return NextResponse.json({
      success: true,
      segment_id,
      work_type,
      avgRate,
      count: validCount,
      capacity_pct: newCapacity,
      retraining: retrainResult
    })

  } catch (e: any) {
    console.error('update-stats error:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}