import { afterEach, describe, expect, it, vi } from 'vitest'
import { SocialPublishingError, safeErrorDetails } from '@/utils/social/errors'
import { metaGet, metaPost } from '@/utils/social/providers/meta'
import { socialFeatureFlags } from '@/utils/social/config'
import { instagramProvider } from '@/utils/social/providers/instagram'
import type { ProviderPublishInput } from '@/utils/social/providers/types'

function json(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('social feature flags and safe Meta errors', () => {
  it('keeps all publishing disabled when flags are absent or ambiguous', () => {
    vi.stubEnv('SOCIAL_PUBLISHING_ENABLED', '')
    vi.stubEnv('SOCIAL_INSTAGRAM_PUBLISHING_ENABLED', '1')
    vi.stubEnv('SOCIAL_FACEBOOK_ENABLED', 'yes')
    expect(socialFeatureFlags()).toEqual({ enabled: false, instagram: false, facebook: false })
  })

  it('enables only explicitly selected providers', () => {
    vi.stubEnv('SOCIAL_PUBLISHING_ENABLED', 'true')
    vi.stubEnv('SOCIAL_INSTAGRAM_PUBLISHING_ENABLED', 'TRUE')
    vi.stubEnv('SOCIAL_FACEBOOK_ENABLED', 'false')
    expect(socialFeatureFlags()).toEqual({ enabled: true, instagram: true, facebook: false })
  })

  it('classifies rate limits as retryable and honors Retry-After', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({
      error: { code: 613, message: 'provider details', is_transient: true },
    }, 429, { 'Retry-After': '90' })))
    const error = await metaGet('me', 'never-log-this-token').catch((reason) => reason)
    expect(error).toBeInstanceOf(SocialPublishingError)
    expect(safeErrorDetails(error)).toMatchObject({ kind: 'retryable', retryAfterSeconds: 90 })
    expect((error as Error).message).not.toContain('never-log-this-token')
    expect((error as Error).message).not.toContain('provider details')
  })

  it('classifies permission failures without exposing provider payloads', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: { code: 190, message: 'raw provider message' } }, 403)))
    const error = await metaGet('me', 'secret').catch((reason) => reason)
    expect(safeErrorDetails(error)).toMatchObject({ kind: 'authorization', code: 'meta_permission_required' })
    expect((error as Error).message).not.toContain('raw provider message')
  })

  it('marks an ambiguous publish network failure as unknown instead of retrying blindly', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network') }))
    const error = await metaPost('page/feed', 'secret', { message: 'post' }, {
      ambiguousOnNetworkFailure: true,
    }).catch((reason) => reason)
    expect(safeErrorDetails(error)).toMatchObject({ kind: 'unknown', code: 'meta_delivery_unknown' })
  })

  it('stops before creating an Instagram container when the official quota is exhausted', async () => {
    const fetchMock = vi.fn(async () => json({ data: [{ quota_usage: 50, config: { quota_total: 50 } }] }))
    vi.stubGlobal('fetch', fetchMock)
    const input: ProviderPublishInput = {
      provider: 'instagram',
      externalAccountId: 'ig-1',
      accessToken: 'secret',
      caption: 'Legenda',
      media: [{ id: 'm1', mediaType: 'image', mimeType: 'image/jpeg', signedUrl: 'https://storage.invalid/a.jpg', position: 0, altText: null, fileSize: 10 }],
      settings: {},
      remoteContainerId: null,
      checkpoint: vi.fn(async () => undefined),
    }
    const error = await instagramProvider.publish(input).catch((reason) => reason)
    expect(safeErrorDetails(error)).toMatchObject({ code: 'instagram_publishing_limit', kind: 'retryable', status: 429 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
