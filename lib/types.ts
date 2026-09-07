export interface Profile {
  id: string
  full_name: string | null
  role: string | null
  created_at: string
}

export interface Station {
  id: number
  name: string
  sequence_order: number
}

export interface Segment {
  id: number
  name: string
  from_station_id: number
  to_station_id: number
}

export type TimetableStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'delayed'

export interface TimetableEntry {
  id: number
  train_number: string
  segment_id: number | null
  scheduled_time: string
  status: TimetableStatus
}

export type BlockRequestWorkType = 'track' | 'signal' | 'electrical' | 'other'
export type BlockRequestStatus =
  | 'submitted'
  | 'pending'
  | 'scored'
  | 'approved'
  | 'in_progress'
  | 'executed'
  | 'rejected'
  | 'safety_blocked'
export type SafetyCriticality = 'routine' | 'urgent' | 'safety_critical'
export type Department = 'TMS' | 'TDMS' | 'SMMS'

export interface BlockRequest {
  id: string
  segment_id: number | null
  requested_by: string | null
  work_type: BlockRequestWorkType
  work_description: string | null
  requested_start: string
  requested_duration_mins: number
  safety_criticality: SafetyCriticality
  status: BlockRequestStatus
  priority_score: number | null
  delay_risk: string | null
  ai_explanation: string | null
  department: Department | null
  justification: string | null
  created_at: string
}

export type ExecutionLogStatus = 'in_progress' | 'completed'

export interface PlanOption {
  id: string
  block_request_id: string
  option_label: string
  adjusted_start: string
  adjusted_duration_mins: number | null
  priority_score: number | null
  delay_risk: string | null
  is_recommended: boolean
  explanation: string | null
  what_if_note: string | null
  created_at: string
}

export interface SegmentStats {
  segment_id: number
  work_type: string
  historical_overrun_rate: number
  sample_count: number
  last_updated: string
}

export type ApprovalDecision = 'approved' | 'modified' | 'rejected' | 'deferred' | 'pending'

export interface Approval {
  id: string
  block_request_id: string | null
  officer_id: string | null
  decision: ApprovalDecision | null
  modified_start: string | null
  modified_duration_mins: number | null
  decided_at: string
}

export interface ExecutionLog {
  id: string
  block_request_id: string | null
  before_image_url: string | null
  after_image_url: string | null
  actual_start: string | null
  actual_end: string | null
  geo_lat: number | null
  geo_lng: number | null
  status: ExecutionLogStatus | null
  verified: boolean | null
  created_at: string
}

export interface RetrainingLog {
  id: number
  run_at: string
  mae: number | null
  notes: string | null
}

export interface BlockPlanOption {
  id: string
  block_request_id: string
  adjusted_start: string
  adjusted_duration_mins: number
  priority_score: number | null
  delay_risk: string | null
  explanation: string | null
  is_recommended: boolean | null
  created_at: string
}

export type Tables =
  | { table: 'profiles'; row: Profile }
  | { table: 'stations'; row: Station }
  | { table: 'segments'; row: Segment }
  | { table: 'timetable'; row: TimetableEntry }
  | { table: 'block_requests'; row: BlockRequest }
  | { table: 'approvals'; row: Approval }
  | { table: 'execution_logs'; row: ExecutionLog }
  | { table: 'block_plan_options'; row: PlanOption }
  | { table: 'segment_stats'; row: SegmentStats }
  | { table: 'retraining_log'; row: RetrainingLog }
  | { table: 'block_plan_options'; row: BlockPlanOption }

export type TableName = Tables['table']

export type RowFor<T extends TableName> = Extract<Tables, { table: T }>['row']
