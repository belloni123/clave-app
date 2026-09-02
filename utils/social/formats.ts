import type {
  FacebookPublishingFormat,
  InstagramPublishingFormat,
  SocialProviderName,
} from '@/types/social'

export const INSTAGRAM_PUBLISHING_FORMATS = ['feed', 'reel', 'story'] as const
export const FACEBOOK_PUBLISHING_FORMATS = ['feed', 'reel'] as const

export function isInstagramPublishingFormat(value: unknown): value is InstagramPublishingFormat {
  return typeof value === 'string'
    && INSTAGRAM_PUBLISHING_FORMATS.includes(value as InstagramPublishingFormat)
}

export function isFacebookPublishingFormat(value: unknown): value is FacebookPublishingFormat {
  return typeof value === 'string'
    && FACEBOOK_PUBLISHING_FORMATS.includes(value as FacebookPublishingFormat)
}

export function getInstagramPublishingFormat(settings: Record<string, unknown>): InstagramPublishingFormat {
  return isInstagramPublishingFormat(settings.instagramFormat) ? settings.instagramFormat : 'feed'
}

export function getFacebookPublishingFormat(settings: Record<string, unknown>): FacebookPublishingFormat {
  return isFacebookPublishingFormat(settings.facebookFormat) ? settings.facebookFormat : 'feed'
}

export function getPublishingFormat(provider: SocialProviderName, settings: Record<string, unknown>) {
  return provider === 'instagram'
    ? getInstagramPublishingFormat(settings)
    : getFacebookPublishingFormat(settings)
}
