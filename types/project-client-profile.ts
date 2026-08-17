export interface ContractProfile {
  fullName: string
  email: string
  phone: string
  cnpj: string
  legalName: string
}

export interface ClientScenario {
  biography: string
  niche: string
  products: string
  launchesCount: string
  totalRevenue: string
  monthlyRevenue: string
  adSpend: string
  instagramFollowers: string
  tiktokFollowers: string
  youtubeFollowers: string
  instagramPosts: string
  instagramAverageLikes: string
  instagramEngagementRate: string
  checkoutPlatforms: string
  teamStructure: string
  partnerStructure: string
  notes: string
}

export interface ProjectClientProfileRecord {
  id: string
  project_id: string
  contract_profile: Partial<ContractProfile>
  baseline_snapshot: Partial<ClientScenario>
  current_snapshot: Partial<ClientScenario>
  updated_by: string | null
  created_at: string
  updated_at: string
}

export const EMPTY_CONTRACT_PROFILE: ContractProfile = {
  fullName: '',
  email: '',
  phone: '',
  cnpj: '',
  legalName: '',
}

export const EMPTY_CLIENT_SCENARIO: ClientScenario = {
  biography: '',
  niche: '',
  products: '',
  launchesCount: '',
  totalRevenue: '',
  monthlyRevenue: '',
  adSpend: '',
  instagramFollowers: '',
  tiktokFollowers: '',
  youtubeFollowers: '',
  instagramPosts: '',
  instagramAverageLikes: '',
  instagramEngagementRate: '',
  checkoutPlatforms: '',
  teamStructure: '',
  partnerStructure: '',
  notes: '',
}

export function normalizeContractProfile(value?: Partial<ContractProfile> | null): ContractProfile {
  return { ...EMPTY_CONTRACT_PROFILE, ...(value || {}) }
}

export function normalizeClientScenario(value?: Partial<ClientScenario> | null): ClientScenario {
  return { ...EMPTY_CLIENT_SCENARIO, ...(value || {}) }
}
