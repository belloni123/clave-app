import type { SocialProviderCapabilities, SocialProviderName } from '@/types/social'

export const SOCIAL_MAX_IMAGE_BYTES = 20 * 1024 * 1024
export const SOCIAL_MAX_VIDEO_BYTES = 500 * 1024 * 1024

const CAPABILITIES: Record<SocialProviderName, SocialProviderCapabilities> = {
  instagram: {
    provider: 'instagram',
    textOnly: false,
    links: false,
    images: true,
    videos: true,
    reels: true,
    carousels: true,
    maxMedia: 10,
    maxCaptionLength: 2_200,
    maxImageBytes: SOCIAL_MAX_IMAGE_BYTES,
    maxVideoBytes: SOCIAL_MAX_VIDEO_BYTES,
    acceptedMimeTypes: ['image/jpeg', 'video/mp4', 'video/quicktime'],
    asynchronousVideo: true,
  },
  facebook: {
    provider: 'facebook',
    textOnly: true,
    links: true,
    images: true,
    videos: true,
    reels: true,
    carousels: true,
    maxMedia: 10,
    maxCaptionLength: 63_206,
    maxImageBytes: SOCIAL_MAX_IMAGE_BYTES,
    maxVideoBytes: SOCIAL_MAX_VIDEO_BYTES,
    acceptedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'],
    asynchronousVideo: true,
  },
}

export function getSocialCapabilities(provider: SocialProviderName) {
  return CAPABILITIES[provider]
}

export function allSocialCapabilities() {
  return Object.values(CAPABILITIES)
}

export function maxSocialUploadBytes(mimeType: string) {
  return mimeType.startsWith('image/') ? SOCIAL_MAX_IMAGE_BYTES : SOCIAL_MAX_VIDEO_BYTES
}
