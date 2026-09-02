import type { SocialProviderName } from '@/types/social'
import { facebookProvider } from '@/utils/social/providers/facebook'
import { instagramProvider } from '@/utils/social/providers/instagram'

const PROVIDERS = {
  instagram: instagramProvider,
  facebook: facebookProvider,
} as const

export function getSocialProvider(provider: SocialProviderName) {
  return PROVIDERS[provider]
}
