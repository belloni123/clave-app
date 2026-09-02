import 'server-only'

import sharp from 'sharp'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SocialPublishingError } from '@/utils/social/errors'

export const INSTAGRAM_MAX_JPEG_BYTES = 8 * 1024 * 1024
const INSTAGRAM_MAX_INPUT_PIXELS = 32_000_000

export function instagramJpegPath(originalPath: string) {
  const extensionIndex = originalPath.lastIndexOf('.')
  const base = extensionIndex > originalPath.lastIndexOf('/')
    ? originalPath.slice(0, extensionIndex)
    : originalPath
  return `${base}.instagram.jpg`
}

export function requiresInstagramJpegDerivative(mimeType: string, fileSize: number) {
  return mimeType === 'image/png'
    || (mimeType === 'image/jpeg' && fileSize > INSTAGRAM_MAX_JPEG_BYTES)
}

async function encodeJpeg(bytes: Buffer, quality: number) {
  return sharp(bytes, {
    failOn: 'warning',
    limitInputPixels: INSTAGRAM_MAX_INPUT_PIXELS,
  })
    .rotate()
    .flatten({ background: '#ffffff' })
    .resize({
      width: 1_440,
      height: 2_560,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .toColourspace('srgb')
    .jpeg({ quality, progressive: true, chromaSubsampling: '4:4:4' })
    .toBuffer()
}

export async function convertInstagramImageToJpeg(bytes: Buffer) {
  try {
    for (const quality of [92, 82, 72]) {
      const converted = await encodeJpeg(bytes, quality)
      if (converted.byteLength <= INSTAGRAM_MAX_JPEG_BYTES) return converted
    }
  } catch {
    throw new SocialPublishingError(
      'Não foi possível preparar a imagem para o Instagram.',
      'social_instagram_image_conversion_failed',
      'validation',
      422,
    )
  }
  throw new SocialPublishingError(
    'A imagem convertida excede o limite de 8 MB do Instagram.',
    'social_instagram_image_too_large',
    'validation',
    422,
  )
}

async function objectExists(admin: SupabaseClient, path: string) {
  const parts = path.split('/')
  const name = parts.pop() as string
  const folder = parts.join('/')
  const { data, error } = await admin.storage
    .from('social-publishing')
    .list(folder, { search: name, limit: 1 })
  if (error) throw error
  return Boolean(data?.some((item) => item.name === name))
}

export async function ensureInstagramJpeg(
  admin: SupabaseClient,
  originalPath: string,
  sourceBytes?: Buffer,
) {
  const derivativePath = instagramJpegPath(originalPath)
  if (await objectExists(admin, derivativePath)) return derivativePath

  let bytes = sourceBytes
  if (!bytes) {
    const { data, error } = await admin.storage
      .from('social-publishing')
      .download(originalPath)
    if (error || !data) {
      throw new SocialPublishingError(
        'A imagem original não está disponível para conversão.',
        'social_instagram_image_unavailable',
        'permanent',
        422,
      )
    }
    bytes = Buffer.from(await data.arrayBuffer())
  }

  const jpeg = await convertInstagramImageToJpeg(bytes)
  const { error: uploadError } = await admin.storage
    .from('social-publishing')
    .upload(derivativePath, jpeg, {
      contentType: 'image/jpeg',
      cacheControl: '3600',
      upsert: true,
    })
  if (uploadError) throw uploadError
  return derivativePath
}
