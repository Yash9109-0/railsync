import { createClient } from '@/lib/supabase/server'

type BlockRequestRow = any

class ScoreError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type ScoreOptions = {
  preview?: boolean
  requested_duration_mins?: number
  trains_scheduled_in_window?: number
}

type ScoreResult = {
  priority_score: number
  delay_risk: string
}

export async function scoreBlockRequest(id: string, { preview = false, requested_duration_mins, trains_scheduled_in_window }: ScoreOptions = {}): Promise<ScoreResult> {
  const supabase = await createClient()

  const { data: blockRequest, error } = await supabase.from('block_requests').select('*').eq('id', id).single<BlockRequestRow>()
  if (error || !blockRequest) throw new ScoreError(404, 'block_request not found')

  const mlApiUrl = process.env.ML_API_URL
  if (!mlApiUrl) throw new ScoreError(500, 'ML_API_URL is not configured')

  let segment = 'unknown'
  if (blockRequest.segment_id != null) {
    const { data: seg } = await supabase.from('segments').select('name').eq('id', blockRequest.segment_id).single<{ name: string }>()
    segment = seg?.name ?? String(blockRequest.segment_id)
  }

  let requestedStartHour = 0
  const parsed = Date.parse(blockRequest.requested_start)
  if (!Number.isNaN(parsed)) requestedStartHour = new Date(parsed).getHours()

  const mlResponse = await fetch(`${mlApiUrl}/predict-priority`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      segment,
      requested_start_hour: requestedStartHour,
      requested_duration_mins: requested_duration_mins ?? blockRequest.requested_duration_mins,
      work_type: blockRequest.work_type,
      safety_criticality: blockRequest.safety_criticality,
      trains_scheduled_in_window: trains_scheduled_in_window ?? blockRequest.trains_scheduled_in_window ?? 0,
      asset_risk_flag: blockRequest.asset_risk_flag ?? 0,
      historical_overrun_rate: blockRequest.historical_overrun_rate ?? 0,
      text_urgency_score: 50.0
    }),
    cache: 'no-store'
  })

  if (!mlResponse.ok) {
    const detail = await mlResponse.text()
    throw new ScoreError(502, `ML API failed: ${detail}`)
  }

  const mlResult = await mlResponse.json() as { priority_score: number; delay_risk: string }

  if (!preview) {
    await supabase.from('block_requests').update({
      priority_score: mlResult.priority_score,
      delay_risk: mlResult.delay_risk
    }).eq('id', id)
  }

  return mlResult
}

export { ScoreError }