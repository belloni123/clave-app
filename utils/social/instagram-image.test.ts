import sharp from 'sharp'
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import {
  convertInstagramImageToJpeg,
  ensureInstagramJpeg,
  instagramJpegPath,
  requiresInstagramJpegDerivative,
} from '@/utils/social/instagram-image'

async function transparentPng() {
  return sharp({
    create: {
      width: 20,
      height: 10,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).png().toBuffer()
}

describe('Instagram image compatibility', () => {
  it('uses a deterministic derivative path and only normalizes formats that need it', () => {
    expect(instagramJpegPath('project/upload/photo.png')).toBe('project/upload/photo.instagram.jpg')
    expect(requiresInstagramJpegDerivative('image/png', 100)).toBe(true)
    expect(requiresInstagramJpegDerivative('image/jpeg', 100)).toBe(false)
    expect(requiresInstagramJpegDerivative('image/webp', 100)).toBe(false)
  })

  it('converts a transparent PNG to a white-background JPEG within Meta limits', async () => {
    const jpeg = await convertInstagramImageToJpeg(await transparentPng())
    const metadata = await sharp(jpeg).metadata()
    const pixel = await sharp(jpeg).raw().toBuffer()

    expect(metadata).toMatchObject({ format: 'jpeg', width: 20, height: 10, space: 'srgb' })
    expect(jpeg.byteLength).toBeLessThanOrEqual(8 * 1024 * 1024)
    expect(pixel[0]).toBeGreaterThan(245)
    expect(pixel[1]).toBeGreaterThan(245)
    expect(pixel[2]).toBeGreaterThan(245)
  })

  it('stores the derivative without replacing or deleting the original PNG', async () => {
    const png = await transparentPng()
    const bucket = {
      list: vi.fn(async () => ({ data: [], error: null })),
      download: vi.fn(async () => ({ data: new Blob([png]), error: null })),
      upload: vi.fn(async () => ({ data: { path: 'project/upload/photo.instagram.jpg' }, error: null })),
    }
    const admin = {
      storage: { from: vi.fn(() => bucket) },
    } as unknown as SupabaseClient

    await expect(ensureInstagramJpeg(admin, 'project/upload/photo.png')).resolves
      .toBe('project/upload/photo.instagram.jpg')
    expect(bucket.download).toHaveBeenCalledWith('project/upload/photo.png')
    expect(bucket.upload).toHaveBeenCalledWith(
      'project/upload/photo.instagram.jpg',
      expect.any(Buffer),
      { contentType: 'image/jpeg', cacheControl: '3600', upsert: true },
    )
  })
})
