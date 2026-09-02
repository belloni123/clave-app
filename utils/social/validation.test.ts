import { describe, expect, it, vi } from 'vitest'
import type { SocialPostInput } from '@/types/social'
import { getSocialCapabilities } from '@/utils/social/capabilities'
import { SocialPublishingError } from '@/utils/social/errors'
import { saoPauloLocalToUtc, toSaoPauloInput } from '@/utils/social/timezone'
import { validateSocialPostInput } from '@/utils/social/validation'

const projectId = '11111111-1111-4111-8111-111111111111'
const accountId = '22222222-2222-4222-8222-222222222222'
const idempotencyKey = '33333333-3333-4333-8333-333333333333'

function input(overrides: Partial<SocialPostInput> = {}): SocialPostInput {
  return {
    projectId,
    internalTitle: 'Campanha',
    baseCaption: 'Legenda',
    scheduledAt: '2030-01-10T15:00:00.000Z',
    timezone: 'America/Sao_Paulo',
    idempotencyKey,
    targets: [{ socialAccountId: accountId }],
    media: [{
      storagePath: `${projectId}/${idempotencyKey}/post.jpg`,
      mediaType: 'image',
      mimeType: 'image/jpeg',
      fileSize: 1024,
      position: 0,
      checksum: 'a'.repeat(64),
    }],
    ...overrides,
  }
}

describe('social publishing validation', () => {
  it('keeps official capabilities provider-specific', () => {
    expect(getSocialCapabilities('instagram')).toMatchObject({ textOnly: false, reels: true, maxMedia: 10 })
    expect(getSocialCapabilities('facebook')).toMatchObject({ textOnly: true, links: true, reels: true })
  })

  it('converts São Paulo wall time without relying on the machine timezone', () => {
    expect(saoPauloLocalToUtc('2030-01-10T12:00')).toBe('2030-01-10T15:00:00.000Z')
    expect(toSaoPauloInput('2030-01-10T15:00:00.000Z')).toBe('2030-01-10T12:00')
  })

  it('rejects text-only Instagram posts', () => {
    expect(() => validateSocialPostInput(input({ media: [] }), [{ provider: 'instagram' }]))
      .toThrowError(SocialPublishingError)
  })

  it('accepts an immediate Facebook text post', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2029-01-01T00:00:00.000Z'))
    const result = validateSocialPostInput(
      input({ media: [], publishNow: true, scheduledAt: null }),
      [{ provider: 'facebook' }],
    )
    expect(result.scheduledAt).toBe('2029-01-01T00:00:00.000Z')
    vi.useRealTimers()
  })

  it('rejects storage paths outside the selected project', () => {
    const invalid = input({
      media: [{ ...input().media[0], storagePath: `44444444-4444-4444-8444-444444444444/${idempotencyKey}/post.jpg` }],
    })
    expect(() => validateSocialPostInput(invalid, [{ provider: 'instagram' }]))
      .toThrowError(/Caminho de mídia inválido/)
  })

  it('accepts a JPEG carousel for Instagram and Facebook together', () => {
    const carousel = input({
      targets: [{ socialAccountId: accountId }, { socialAccountId: '44444444-4444-4444-8444-444444444444' }],
      media: [0, 1, 2].map((position) => ({
        ...input().media[0],
        storagePath: `${projectId}/${idempotencyKey}/post-${position}.jpg`,
        position,
      })),
    })
    expect(validateSocialPostInput(carousel, [
      { provider: 'instagram' },
      { provider: 'facebook', customCaption: 'Texto da Página' },
    ])).toMatchObject({ timezone: 'America/Sao_Paulo' })
  })

  it('rejects PNG for Instagram while allowing it for Facebook', () => {
    const png = input({ media: [{ ...input().media[0], storagePath: `${projectId}/${idempotencyKey}/post.png`, mimeType: 'image/png' }] })
    expect(() => validateSocialPostInput(png, [{ provider: 'instagram' }])).toThrowError(/Formato de mídia incompatível/)
    expect(() => validateSocialPostInput(png, [{ provider: 'facebook' }])).not.toThrow()
  })

  it('rejects a schedule in the past', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'))
    expect(() => validateSocialPostInput(
      input({ scheduledAt: '2029-12-31T23:59:00.000Z' }),
      [{ provider: 'instagram' }],
    )).toThrowError(/horário futuro/)
    vi.useRealTimers()
  })

  it('allows an incomplete Instagram draft without media', () => {
    expect(validateSocialPostInput(
      input({ media: [], saveAsDraft: true, scheduledAt: null }),
      [{ provider: 'instagram' }],
    )).toEqual({ timezone: 'America/Sao_Paulo', scheduledAt: null })
  })
})
