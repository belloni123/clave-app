export type SocialProviderName = 'instagram' | 'facebook'
export type SocialMediaType = 'image' | 'video'
export type SocialPostStatus =
  | 'draft'
  | 'scheduled'
  | 'processing'
  | 'partially_published'
  | 'published'
  | 'failed'
  | 'cancelled'

export type SocialTargetStatus =
  | 'draft'
  | 'scheduled'
  | 'claimed'
  | 'uploading'
  | 'processing'
  | 'published'
  | 'retrying'
  | 'failed'
  | 'unknown'
  | 'cancelled'

export interface SocialFeatureFlags {
  enabled: boolean
  instagram: boolean
  facebook: boolean
}

export interface SocialProviderCapabilities {
  provider: SocialProviderName
  textOnly: boolean
  links: boolean
  images: boolean
  videos: boolean
  reels: boolean
  carousels: boolean
  maxMedia: number
  maxCaptionLength: number
  maxImageBytes: number
  maxVideoBytes: number
  acceptedMimeTypes: string[]
  asynchronousVideo: boolean
}

export interface SocialAccountPublic {
  id: string
  provider: SocialProviderName
  externalAccountId: string
  accountType: string
  displayName: string
  username: string | null
  avatarUrl: string | null
  status: 'connected' | 'permission_required' | 'expired' | 'error' | 'disconnected'
  capabilities: SocialProviderCapabilities
}

export interface SocialMediaPublic {
  id: string
  storagePath: string
  mediaType: SocialMediaType
  mimeType: string
  fileSize: number
  width: number | null
  height: number | null
  durationMs: number | null
  position: number
  altText: string | null
  checksum: string
  previewUrl?: string | null
}

export interface SocialTargetPublic {
  id: string
  socialAccountId: string
  provider: SocialProviderName
  customCaption: string | null
  providerSettings: Record<string, unknown>
  status: SocialTargetStatus
  attemptCount: number
  remotePostId: string | null
  remoteUrl: string | null
  lastErrorCode: string | null
  lastErrorMessage: string | null
  publishedAt: string | null
  account?: SocialAccountPublic
}

export interface SocialPostPublic {
  id: string
  projectId: string
  createdBy: string | null
  authorName: string | null
  internalTitle: string | null
  baseCaption: string
  status: SocialPostStatus
  scheduledAt: string | null
  timezone: string
  publishedAt: string | null
  cancelledAt: string | null
  createdAt: string
  updatedAt: string
  targets: SocialTargetPublic[]
  media: SocialMediaPublic[]
}

export interface SocialAccountsResponse {
  flags: SocialFeatureFlags
  connectionStatus: 'ready' | 'reauthorization_required' | 'expired' | 'error' | 'missing'
  authorizationUrl: string | null
  accounts: SocialAccountPublic[]
}

export interface SocialPostInput {
  projectId: string
  internalTitle?: string | null
  baseCaption: string
  scheduledAt?: string | null
  timezone?: string
  publishNow?: boolean
  saveAsDraft?: boolean
  idempotencyKey: string
  targets: Array<{
    socialAccountId: string
    customCaption?: string | null
    providerSettings?: Record<string, unknown>
  }>
  media: Array<{
    storagePath: string
    mediaType: SocialMediaType
    mimeType: string
    fileSize: number
    width?: number | null
    height?: number | null
    durationMs?: number | null
    position: number
    altText?: string | null
    checksum: string
  }>
}
