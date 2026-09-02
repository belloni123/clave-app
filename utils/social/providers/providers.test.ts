import { describe, expect, it, vi } from 'vitest'
import { facebookProvider } from '@/utils/social/providers/facebook'
import { instagramProvider } from '@/utils/social/providers/instagram'
import type { ProviderPublishInput } from '@/utils/social/providers/types'
import { safeErrorDetails } from '@/utils/social/errors'

function json(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function baseInput(overrides: Partial<ProviderPublishInput> = {}): ProviderPublishInput {
  return {
    provider: 'instagram',
    externalAccountId: 'account-1',
    accessToken: 'secret-token',
    caption: 'Legenda',
    media: [{
      id: 'media-1',
      mediaType: 'image',
      mimeType: 'image/jpeg',
      signedUrl: 'https://storage.invalid/media.jpg',
      position: 0,
      altText: null,
      fileSize: 100,
    }],
    settings: {},
    remoteContainerId: null,
    checkpoint: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('Meta provider checkpoints', () => {
  it('does not publish an Instagram container before processing finishes', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ data: [{ quota_usage: 1, config: { quota_total: 50 } }] }))
      .mockResolvedValueOnce(json({ id: 'container-1' }))
      .mockResolvedValueOnce(json({ status_code: 'IN_PROGRESS' }))
    vi.stubGlobal('fetch', fetchMock)
    const input = baseInput()

    await expect(instagramProvider.publish(input)).resolves.toEqual({
      status: 'processing',
      remoteContainerId: 'container-1',
      retryAfterSeconds: 60,
    })
    expect(input.checkpoint).toHaveBeenCalledWith({ remoteContainerId: 'container-1' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('confirms an Instagram media ID after a finished container', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ status_code: 'FINISHED' }))
      .mockResolvedValueOnce(json({ id: 'post-1' }))
      .mockResolvedValueOnce(json({ permalink: 'https://instagram.invalid/p/1' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(instagramProvider.publish(baseInput({ remoteContainerId: 'container-1' }))).resolves.toEqual({
      status: 'published',
      remotePostId: 'post-1',
      remoteUrl: 'https://instagram.invalid/p/1',
    })
  })

  it('keeps a Facebook video processing until the API reports it ready', async () => {
    const checkpoint = vi.fn(async () => undefined)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'page-token' }))
      .mockResolvedValueOnce(json({ id: 'video-1' }))
      .mockResolvedValueOnce(json({ status: { video_status: 'processing' } }))
    vi.stubGlobal('fetch', fetchMock)
    const input = baseInput({
      provider: 'facebook',
      media: [{ ...baseInput().media[0], mediaType: 'video', mimeType: 'video/mp4' }],
      checkpoint,
    })

    await expect(facebookProvider.publish(input)).resolves.toEqual({
      status: 'processing',
      remoteContainerId: 'video-1',
      retryAfterSeconds: 30,
    })
    expect(checkpoint).toHaveBeenCalledWith({ remoteContainerId: 'video-1' })
  })

  it('checkpoints Instagram carousel children and waits instead of duplicating them', async () => {
    const checkpoint = vi.fn(async () => undefined)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ data: [{ quota_usage: 1, config: { quota_total: 50 } }] }))
      .mockResolvedValueOnce(json({ id: 'child-1' }))
      .mockResolvedValueOnce(json({ id: 'child-2' }))
      .mockResolvedValueOnce(json({ status_code: 'FINISHED' }))
      .mockResolvedValueOnce(json({ status_code: 'IN_PROGRESS' }))
    vi.stubGlobal('fetch', fetchMock)
    const first = baseInput().media[0]
    const error = await instagramProvider.publish(baseInput({
      media: [first, { ...first, id: 'media-2', signedUrl: 'https://storage.invalid/media-2.jpg', position: 1 }],
      checkpoint,
    })).catch((reason) => reason)

    expect(checkpoint).toHaveBeenCalledWith({
      providerSettings: { instagramChildren: ['child-1', 'child-2'] },
    })
    expect(safeErrorDetails(error)).toMatchObject({
      code: 'instagram_carousel_processing',
      kind: 'retryable',
      retryAfterSeconds: 60,
    })
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('checkpoints a finished Facebook Reel session before asynchronous confirmation', async () => {
    const checkpoint = vi.fn(async () => undefined)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'page-token' }))
      .mockResolvedValueOnce(json({ video_id: 'reel-1', upload_url: 'https://upload.invalid/reel-1' }))
      .mockResolvedValueOnce(json({ success: true }))
      .mockResolvedValueOnce(json({ success: true }))
      .mockResolvedValueOnce(json({ status: { video_status: 'processing' } }))
    vi.stubGlobal('fetch', fetchMock)
    const input = baseInput({
      provider: 'facebook',
      media: [{ ...baseInput().media[0], mediaType: 'video', mimeType: 'video/mp4' }],
      settings: { facebookFormat: 'reel' },
      checkpoint,
    })

    await expect(facebookProvider.publish(input)).resolves.toMatchObject({
      status: 'processing',
      remoteContainerId: 'reel-1',
    })
    expect(checkpoint).toHaveBeenLastCalledWith({
      remoteContainerId: 'reel-1',
      providerSettings: {
        facebookFormat: 'reel',
        facebookUploadUrl: 'https://upload.invalid/reel-1',
        facebookFinished: true,
      },
    })
  })

  it('creates an Instagram Story without unsupported caption or alt text fields', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ data: [{ quota_usage: 1, config: { quota_total: 100 } }] }))
      .mockResolvedValueOnce(json({ id: 'story-container' }))
      .mockResolvedValueOnce(json({ status_code: 'IN_PROGRESS' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(instagramProvider.publish(baseInput({
      settings: { instagramFormat: 'story' },
      media: [{ ...baseInput().media[0], altText: 'Descrição da imagem' }],
    }))).resolves.toMatchObject({ status: 'processing', remoteContainerId: 'story-container' })

    const request = fetchMock.mock.calls[1]?.[1] as RequestInit
    const body = request.body as URLSearchParams
    expect(body.get('media_type')).toBe('STORIES')
    expect(body.get('image_url')).toBe('https://storage.invalid/media.jpg')
    expect(body.has('caption')).toBe(false)
    expect(body.has('alt_text')).toBe(false)
  })

  it('creates an Instagram Reel without also sharing it to Feed', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ data: [{ quota_usage: 1, config: { quota_total: 100 } }] }))
      .mockResolvedValueOnce(json({ id: 'reel-container' }))
      .mockResolvedValueOnce(json({ status_code: 'IN_PROGRESS' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(instagramProvider.publish(baseInput({
      settings: { instagramFormat: 'reel' },
      media: [{
        ...baseInput().media[0],
        mediaType: 'video',
        mimeType: 'video/mp4',
        signedUrl: 'https://storage.invalid/reel.mp4',
      }],
    }))).resolves.toMatchObject({ status: 'processing', remoteContainerId: 'reel-container' })

    const request = fetchMock.mock.calls[1]?.[1] as RequestInit
    const body = request.body as URLSearchParams
    expect(body.get('media_type')).toBe('REELS')
    expect(body.get('video_url')).toBe('https://storage.invalid/reel.mp4')
    expect(body.get('share_to_feed')).toBe('false')
    expect(body.get('caption')).toBe('Legenda')
  })
})
