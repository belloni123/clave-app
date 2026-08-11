export type BriefingServiceType = 'launch' | 'marketing' | 'visual_identity'

export type BriefingAnswer = string | string[]

export type BriefingAnswers = Record<string, BriefingAnswer>

export type BriefingSubmissionStatus =
  | 'draft'
  | 'received'
  | 'reviewing'
  | 'waiting'
  | 'completed'

export interface ProjectFormAttachment {
  id: string
  question_id: string
  storage_path?: string
  original_name: string
  mime_type: string
  size_bytes: number
  created_at: string
}

export interface PublicProjectFormPayload {
  form: {
    title: string
    projectName: string
    version: number
  }
  response: {
    token: string | null
    status: BriefingSubmissionStatus | null
    answers: BriefingAnswers
    currentStep: number
    attachments: ProjectFormAttachment[]
    submittedAt: string | null
  }
}

export interface ProjectFormSubmission {
  id: string
  form_id: string
  project_id: string
  status: BriefingSubmissionStatus
  service_type: BriefingServiceType | null
  answers: BriefingAnswers
  current_step: number
  internal_notes: string
  strategic_summary: string | null
  mapped_fields: string[]
  skipped_fields: string[]
  last_saved_at: string
  submitted_at: string | null
  created_at: string
  updated_at: string
}
