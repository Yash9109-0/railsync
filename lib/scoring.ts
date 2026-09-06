import { createClient } from '@/lib/supabase/server'

type MlPredictResponse = {
  priority_score?: number
  delay_risk?: string
}

type BlockRequestRow = {
  id: string
  segment_id: number | null
  work_type: string
  requested_start: string
  requested_duration_mins: number
  safety_criticality: string
  trains_scheduled_in_window?: number | null
  asset_risk_flag?: number | null
  historical_overrun_rate?: number | null
}

export type ScoreOptions = {
  preview?: boolean
  requested_duration_mins?: number
  trains_scheduled_in_window?: number
}

export type ScoreResult = {
  id: string
  priority_score: number
  delay_risk: string | null
  status: 'scored' | 'preview'
  preview: boolean
}

export class ScoreError extends Error {
  status: number
  body: Record<string, unknown>
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ScoreError'
    this.status = status
    this.body = { error: message }
  }
}

export async function scoreBlockRequest(
  id: string,
  { preview = false, requested_duration_mins, trains_scheduled_in_window }: ScoreOptions = {}
): Promise<ScoreResult> {
  const supabase = createClient()

  const { data: blockRequest, error: fetchError } = await supabase
    .from('block_requests')
    .select('*')
    .eq('id', id)
    .single<BlockRequestRow>()

  if (fetchError || !blockRequest) {
    throw new ScoreError(
      404,
      fetchError?.message ?? 'block_request not found'
    )
  }

  const mlApiUrl = process.env.ML_API_URL
  if (!mlApiUrl) {
    throw new ScoreError(500, 'ML_API_URL is not configured')
  }

  // The model was trained on a `segment` category (e.g. "A-B"), not the raw
  // segment_id. Resolve the human-readable segment name from the segments
  // table, falling back to the id if it can't be looked up.
  let segment = 'unknown'
  if (blockRequest.segment_id != null) {
    const { data: seg } = await supabase
      .from('segments')
      .select('name')
      .eq('id', blockRequest.segment_id)
      .single<{ name: string }>()
    segment = seg?.name ?? String(blockRequest.segment_id)
  }

  // Derive requested_start_hour (0-23) from the requested_start timestamp so
  // it matches the feature the model was trained on.
  let requestedStartHour = 0
  const parsed = Date.parse(blockRequest.requested_start)
  if (!Number.isNaN(parsed)) {
    requestedStartHour = new Date(parsed).getHours()
  }

  const mlResponse = await fetch(`${mlApiUrl}/predict-priority`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      segment,
      requested_start_hour: requestedStartHour,
      requested_duration_mins:
        requested_duration_mins ?? blockRequest.requested_duration_mins,
      work_type: blockRequest.work_type,
      safety_criticality: blockRequest.safety_criticality,
      trains_scheduled_in_window:
        trains_scheduled_in_window ??
        blockRequest.trains_scheduled_in_window ??
        0,
      asset_risk_flag: blockRequest.asset_risk_flag ?? 0,
      historical_overrun_rate: blockRequest.historical_overrun_rate ?? 0,
    }),
    cache: 'no-store',
  })

  if (!mlResponse.ok) {
    const detail = await mlResponse.text()
    throw new ScoreError(
      502,
      `ML API request failed (${mlResponse.status}): ${detail}`
    )
  }

  const mlResult: MlPredictResponse = await mlResponse.json()

  const priorityScore = mlResult.priority_score
  const delayRisk = mlResult.delay_risk ?? null

  if (priorityScore === undefined || priorityScore === null) {
    throw new ScoreError(502, 'ML API did not return a priority_score')
  }

  if (!preview) {
    const { error: updateError } = await supabase
      .from('block_requests')
      .update({
        priority_score: priorityScore,
        delay_risk: delayRisk,
        status: 'scored',
      })
      .eq('id', id)

    if (updateError) {
      throw new ScoreError(500, updateError.message)
    }
  }

  return {
    id,
    priority_score: priorityScore,
    delay_risk: delayRisk,
    status: preview ? 'preview' : 'scored',
    preview,
  }
}
