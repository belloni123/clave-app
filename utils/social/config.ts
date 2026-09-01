import 'server-only'

import type { SocialFeatureFlags } from '@/types/social'

function enabled(value: string | undefined) {
  return value?.trim().toLowerCase() === 'true'
}

export function socialFeatureFlags(): SocialFeatureFlags {
  const global = enabled(process.env.SOCIAL_PUBLISHING_ENABLED)
  return {
    enabled: global,
    instagram: global && enabled(process.env.SOCIAL_INSTAGRAM_PUBLISHING_ENABLED),
    facebook: global && enabled(process.env.SOCIAL_FACEBOOK_ENABLED),
  }
}

export function requireSocialPublishingEnabled(provider?: 'instagram' | 'facebook') {
  const flags = socialFeatureFlags()
  if (!flags.enabled || (provider && !flags[provider])) {
    throw new SocialFeatureDisabledError()
  }
  return flags
}

export class SocialFeatureDisabledError extends Error {
  readonly status = 404

  constructor() {
    super('A publicação social não está habilitada neste ambiente.')
    this.name = 'SocialFeatureDisabledError'
  }
}
