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

export type BlockRequestWorkType = 'routine' | 'maintenance' | 'emergency'
export type BlockRequestStatus = 'submitted' | 'pending' | 'scored' | 'approved' | 'rejected' | 'in_progress' | 'completed' | 'cancelled'
export type SafetyCriticality = 'routine' | 'critical' | 'high' | 'medium' | 'low'

export interface BlockRequest {
  id: string
  segment_id: number | null
  requested_by: string | null
  work_type: BlockRequestWorkType
  requested_start: string
  requested_duration_mins: number
  safety_criticality: SafetyCriticality
  status: BlockRequestStatus
  priority_score: number | null
  delay_risk: string | null
  ai_explanation: string | null
  created_at: string
}

export type ApprovalDecision = 'approved' | 'rejected' | 'deferred' | 'pending'

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
  created_at: string
}

export interface RetrainingLog {
  id: number
  run_at: string
  mae: number | null
  notes: string | null
}

export type Tables =
  | { table: 'profiles'; row: Profile }
  | { table: 'stations'; row: Station }
  | { table: 'segments'; row: Segment }
  | { table: 'timetable'; row: TimetableEntry }
  | { table: 'block_requests'; row: BlockRequest }
  | { table: 'approvals'; row: Approval }
  | { table: 'execution_logs'; row: ExecutionLog }
  | { table: 'retraining_log'; row: RetrainingLog }

export type TableName = Tables['table']

export type RowFor<T extends TableName> = Extract<Tables, { table: T }>['row']
