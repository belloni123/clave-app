export type AppErrorEventStatus = 'new' | 'investigating' | 'resolved'
export type AppErrorEventSeverity = 'warning' | 'error' | 'critical'
export type AppErrorEventSource = 'server' | 'browser'
export type AppErrorEventCategory =
  | 'public_briefing'
  | 'expert_application'
  | 'briefing_attachment'
  | 'client_runtime'

export interface AppErrorEvent {
  id: string
  reference_code: string
  status: AppErrorEventStatus
  severity: AppErrorEventSeverity
  source: AppErrorEventSource
  category: AppErrorEventCategory
  operation: string
  project_id: string | null
  form_id: string | null
  submission_id: string | null
  actor_id: string | null
  lead_email: string | null
  page_path: string | null
  user_agent: string | null
  http_status: number | null
  error_name: string | null
  message: string
  technical_message: string | null
  stack_trace: string | null
  fingerprint: string
  metadata: Record<string, unknown>
  occurred_at: string
  resolved_at: string | null
  resolved_by: string | null
  admin_notes: string
  created_at: string
  updated_at: string
}
