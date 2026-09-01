import type {
  SocialMediaType,
  SocialProviderCapabilities,
  SocialProviderName,
} from '@/types/social'

export interface ProviderMedia {
  id: string
  mediaType: SocialMediaType
  mimeType: string
  signedUrl: string
  position: number
  altText: string | null
  fileSize: number
}

export interface ProviderPublishInput {
  provider: SocialProviderName
  externalAccountId: string
  accessToken: string
  caption: string
  media: ProviderMedia[]
  settings: Record<string, unknown>
  remoteContainerId: string | null
  checkpoint: (value: {
    remoteContainerId?: string
    providerSettings?: Record<string, unknown>
  }) => Promise<void>
}

export type ProviderPublishResult =
  | {
      status: 'processing'
      remoteContainerId: string
      retryAfterSeconds: number
    }
  | {
      status: 'published'
      remotePostId: string
      remoteUrl: string | null
    }

export interface SocialProvider {
  provider: SocialProviderName
  getCapabilities(): SocialProviderCapabilities
  validateDraft(input: ProviderPublishInput): void
  publish(input: ProviderPublishInput): Promise<ProviderPublishResult>
}
