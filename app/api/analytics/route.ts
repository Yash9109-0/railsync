import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Best-effort row shapes: the DB stores runtime columns beyond lib/types
// (e.g. block_requests.trains_scheduled_in_window, block_plan_options.option_label),
// so each type carries a string index signature for those extras.
type BlockRequestRow = {
  id: string
  status: string
  requested_duration_mins: number | null
  segment_id: number | null
  trains_scheduled_in_window?: number | null
  [key: string]: unknown
}

type ApprovalRow = {
  id: string
  block_request_id: string | null
  decision: string | null
  modified_duration_mins: number | null
  decided_at: string
  [key: string]: unknown
}

type BlockPlanOptionRow = {
  id: string
  block_request_id: string
  adjusted_duration_mins: number | null
  option_label?: string | null
  is_recommended?: boolean | null
  [key: string]: unknown
}

// Approval decisions that mean a request was actually approved/approved-as-modified
// (vs deferred/rejected/pending).
const APPROVED_DECISIONS = new Set(['approved', 'modified'])

// The "Option A — As Requested" plan option is the as-requested baseline. Its
// option_label holds this human-readable marker; match it case-insensitively and
// tolerate dash/casing variants.
const BASELINE_LABEL_MARKERS = ['as requested', 'option a'] as const

// trains_scheduled_in_window is a runtime column that may be absent from the
// block_request row. The spec calls for a sensible default when unknown.
const DEFAULT_TRAINS_IN_WINDOW = 3

function isBaselineOption(option: BlockPlanOptionRow): boolean {
  const label = (option.option_label ?? '').toLowerCase()
  return BASELINE_LABEL_MARKERS.some((marker) => label.includes(marker))
}

// "the actually approved requested_duration_mins currently on the block_request".
// The approval flow overwrites block_request.requested_duration_mins with the
// approved (possibly reduced) value, so it is the source of truth; the chosen
// approval's modified_duration_mins is only a fallback for malformed rows.
function resolveApprovedDuration(
  request: BlockRequestRow,
  chosenApproval?: ApprovalRow,
): number {
  if (request.requested_duration_mins != null) {
    return Number(request.requested_duration_mins)
  }
  if (chosenApproval?.modified_duration_mins != null) {
    return Number(chosenApproval.modified_duration_mins)
  }
  return 0
}

function trainsInWindow(request: BlockRequestRow): number {
  const value = request.trains_scheduled_in_window
  if (value != null && Number.isFinite(Number(value)) && Number(value) > 0) {
    return Number(value)
  }
  return DEFAULT_TRAINS_IN_WINDOW
}

function emptyResult(totalApproved: number) {
  return {
    estimated_passenger_delay_reduction_mins: 0,
    track_asset_availability_gain_pct: 0,
    total_approved: totalApproved,
    total_time_saved_mins: 0,
  }
}

export async function GET() {
  try {
    const supabase = createClient()

    const { data: approvedRequests, error: requestsError } = await supabase
      .from('block_requests')
      .select('*')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })

    if (requestsError) {
      return NextResponse.json(
        { error: requestsError.message },
        { status: 500 },
      )
    }

    const requests = (approvedRequests as BlockRequestRow[] | null) ?? []

    // Join partners in application code (robust to foreign-key inference).
    const requestIds = requests.map((r) => r.id)
    if (requestIds.length === 0) {
      return NextResponse.json(emptyResult(0))
    }

    const { data: approvalRows, error: approvalsError } = await supabase
      .from('approvals')
      .select('*')
      .in('block_request_id', requestIds)
    if (approvalsError) {
      return NextResponse.json({ error: approvalsError.message }, { status: 500 })
    }

    const { data: optionRows, error: optionsError } = await supabase
      .from('block_plan_options')
      .select('*')
      .in('block_request_id', requestIds)
    if (optionsError) {
      return NextResponse.json({ error: optionsError.message }, { status: 500 })
    }

    // approvals -> block_request_id
    const approvalsByRequest = new Map<string, ApprovalRow[]>()
    for (const approval of (approvalRows as ApprovalRow[] | null) ?? []) {
      const id = approval.block_request_id ?? ''
      approvalsByRequest.set(id, [...(approvalsByRequest.get(id) ?? []), approval])
    }

    // block_plan_options -> block_request_id
    const optionsByRequest = new Map<string, BlockPlanOptionRow[]>()
    for (const option of (optionRows as BlockPlanOptionRow[] | null) ?? []) {
      const id = option.block_request_id
      optionsByRequest.set(id, [...(optionsByRequest.get(id) ?? []), option])
    }

    // Pick the chosen approval: the most recent approved/modified decision.
    const chosenApprovalFor = (requestId: string): ApprovalRow | undefined =>
      (approvalsByRequest.get(requestId) ?? [])
        .filter((a) => APPROVED_DECISIONS.has(a.decision ?? ''))
        .sort((a, b) => Date.parse(b.decided_at) - Date.parse(a.decided_at))[0]

    let totalTimeSavedMins = 0
    let totalRequestedDurationMins = 0
    let estimatedPassengerDelayReductionMins = 0

    for (const request of requests) {
      const chosenApproval = chosenApprovalFor(request.id)
      const optionRowsForRequest = optionsByRequest.get(request.id) ?? []

      // Baseline = "Option A — As Requested" plan option (fallback to first option).
      const baseline =
        optionRowsForRequest.find(isBaselineOption) ?? optionRowsForRequest[0]

      const approvedDuration = resolveApprovedDuration(request, chosenApproval)
      totalRequestedDurationMins += approvedDuration

      if (baseline && baseline.adjusted_duration_mins != null) {
        const timeSavedMins =
          Number(baseline.adjusted_duration_mins) - approvedDuration

        totalTimeSavedMins += timeSavedMins
        // ESTIMATED metric: trains_scheduled_in_window is a proxy for exposure
        // to passenger services during the block window (defaults to 3).
        estimatedPassengerDelayReductionMins +=
          timeSavedMins * trainsInWindow(request)
      }
    }

    const trackAssetAvailabilityGainPct =
      totalRequestedDurationMins > 0
        ? (totalTimeSavedMins / totalRequestedDurationMins) * 100
        : 0

    return NextResponse.json({
      estimated_passenger_delay_reduction_mins: estimatedPassengerDelayReductionMins,
      track_asset_availability_gain_pct: trackAssetAvailabilityGainPct,
      total_approved: requests.length,
      total_time_saved_mins: totalTimeSavedMins,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An unexpected error occurred' },
      { status: 500 },
    )
  }
}
