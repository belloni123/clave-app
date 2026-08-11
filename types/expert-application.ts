export type OtherPlatform = 'youtube' | 'facebook' | 'linkedin' | 'tiktok'

export type DigitalProduct =
  | 'none'
  | 'ebook'
  | 'masterclass'
  | 'course'
  | 'community'
  | 'consulting'
  | 'mentoring'
  | 'in_person_event'

export type PartnershipExperience =
  | 'freelancers'
  | 'agency'
  | 'partnership'
  | 'starting_now'
  | 'worked_alone'

export type RevenueRange =
  | 'none'
  | 'up_to_100k'
  | '101k_300k'
  | '301k_600k'
  | '601k_1m'
  | '1m_3m'
  | '3m_10m'
  | 'above_10m'

export type TrafficInvestmentRange =
  | 'none'
  | 'up_to_10k'
  | '10k_50k'
  | '50k_100k'
  | '100k_500k'
  | 'above_500k'

export type LaunchTimeline = 'asap' | 'three_months' | 'three_to_six_months' | 'unknown'

export type ExpertApplicationStatus =
  | 'new'
  | 'reviewing'
  | 'qualified'
  | 'disqualified'
  | 'converted'

export interface ExpertApplicationAnswers {
  fullName: string
  whatsapp: string
  email: string
  instagram: string
  otherPlatforms: OtherPlatform[]
  niche: string
  workAndPains: string
  competitorReference: string
  digitalProducts: DigitalProduct[]
  launchesCount: string
  partnershipExperience: PartnershipExperience[]
  revenueLast12Months: RevenueRange | ''
  paidTrafficLast12Months: TrafficInvestmentRange | ''
  monthlyMarketingBudget: string
  discoveryAndImpressions: string
  launchTimeline: LaunchTimeline | ''
  motivation: string
  lgpdConsent: boolean
}

export interface ExpertApplicationRecord {
  id: string
  full_name: string
  whatsapp: string
  email: string
  instagram: string
  other_platforms: OtherPlatform[]
  niche: string
  work_and_pains: string
  competitor_reference: string
  digital_products: DigitalProduct[]
  launches_count: number
  partnership_experience: PartnershipExperience[]
  revenue_last_12_months: RevenueRange
  paid_traffic_last_12_months: TrafficInvestmentRange
  monthly_marketing_budget: number
  discovery_and_impressions: string
  launch_timeline: LaunchTimeline
  motivation: string
  partnership_authorized: boolean
  lgpd_consent: boolean
  consented_at: string
  status: ExpertApplicationStatus
  internal_notes: string | null
  converted_project_id: string | null
  converted_at: string | null
  created_at: string
  updated_at: string
}

export interface ExpertApplicationPayload extends ExpertApplicationAnswers {
  authorization: 'yes'
  idempotencyKey: string
  startedAt: string
  companyWebsite: string
}

export const EMPTY_EXPERT_APPLICATION: ExpertApplicationAnswers = {
  fullName: '',
  whatsapp: '',
  email: '',
  instagram: '',
  otherPlatforms: [],
  niche: '',
  workAndPains: '',
  competitorReference: '',
  digitalProducts: [],
  launchesCount: '',
  partnershipExperience: [],
  revenueLast12Months: '',
  paidTrafficLast12Months: '',
  monthlyMarketingBudget: '',
  discoveryAndImpressions: '',
  launchTimeline: '',
  motivation: '',
  lgpdConsent: false,
}
