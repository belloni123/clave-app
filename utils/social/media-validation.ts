import 'server-only'

import { createRequire } from 'node:module'
import sharp from 'sharp'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { MediaInfo } from 'mediainfo.js'
import type { SocialPostInput } from '@/types/social'
import { SocialPublishingError } from '@/utils/social/errors'

const nodeRequire = createRequire(import.meta.url)
const mediaInfoFactory = (nodeRequire('mediainfo.js') as typeof import('mediainfo.js')).default
let mediaInfoWasmPath: string | null = null

type InputMedia = SocialPostInput['media'][number]

function getMediaInfoWasmPath() {
  const wasmSpecifier = ['mediainfo.js', 'MediaInfoModule.wasm'].join('/')
  mediaInfoWasmPath ||= nodeRequire.resolve(wasmSpecifier)
  return mediaInfoWasmPath
}

async function signedObjectUrl(admin: SupabaseClient, path: string) {
  const { data, error } = await admin.storage
    .from('social-publishing')
    .createSignedUrl(path, 5 * 60)
  if (error || !data?.signedUrl) {
    throw new SocialPublishingError(
      'A mídia não está disponível para validação.',
      'social_media_unavailable',
      'validation',
      422,
    )
  }
  return data.signedUrl
}

async function inspectImage(admin: SupabaseClient, media: InputMedia): Promise<InputMedia> {
  const url = await signedObjectUrl(admin, media.storagePath)
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) {
    throw new SocialPublishingError('Não foi possível ler a imagem enviada.', 'social_image_read_failed', 'validation', 422)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.byteLength !== media.fileSize) {
    throw new SocialPublishingError('O tamanho real da imagem é diferente do informado.', 'social_media_size_mismatch', 'validation')
  }
  const metadata = await sharp(bytes, { failOn: 'warning' }).metadata()
  const actualMime = metadata.format === 'jpeg'
    ? 'image/jpeg'
    : metadata.format === 'png'
      ? 'image/png'
      : metadata.format === 'webp'
        ? 'image/webp'
        : null
  if (!actualMime || actualMime !== media.mimeType || !metadata.width || !metadata.height) {
    throw new SocialPublishingError('O conteúdo real da imagem não corresponde ao formato informado.', 'social_media_content_mismatch', 'validation')
  }
  return { ...media, width: metadata.width, height: metadata.height, durationMs: null }
}

async function inspectVideo(admin: SupabaseClient, media: InputMedia): Promise<InputMedia> {
  const url = await signedObjectUrl(admin, media.storagePath)
  let mediaInfo: MediaInfo<'object'> | undefined
  try {
    mediaInfo = await mediaInfoFactory({
      chunkSize: 512 * 1024,
      format: 'object',
      locateFile: getMediaInfoWasmPath,
    })
    const result = await mediaInfo.analyzeData(media.fileSize, async (size: number, offset: number) => {
      const end = Math.min(media.fileSize - 1, offset + size - 1)
      const response = await fetch(url, {
        headers: { Range: `bytes=${offset}-${end}` },
        signal: AbortSignal.timeout(20_000),
      })
      const completeSmallFile = response.status === 200 && offset === 0 && media.fileSize <= size
      const contentRange = response.headers.get('content-range') || ''
      if (!completeSmallFile && (response.status !== 206 || !contentRange.startsWith(`bytes ${offset}-`))) {
        throw new Error('Storage did not honor the requested byte range')
      }
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.byteLength === 0 || bytes.byteLength > size) {
        throw new Error('Storage returned an invalid byte range')
      }
      return bytes
    })
    const tracks = result.media?.track || []
    const general = tracks.find((track) => track['@type'] === 'General')
    const video = tracks.find((track) => track['@type'] === 'Video')
    const duration = Number(video?.Duration ?? general?.Duration)
    const format = [general?.Format, general?.Format_Extensions, general?.InternetMediaType]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    if (!video?.Width || !video.Height || !Number.isFinite(duration) || duration <= 0 || !/(mpeg-4|quicktime|mp4|mov)/.test(format)) {
      throw new SocialPublishingError('O conteúdo do vídeo não é compatível.', 'social_video_invalid_content', 'validation')
    }
    return {
      ...media,
      width: video.Width,
      height: video.Height,
      durationMs: Math.round(duration * 1_000),
    }
  } catch (error) {
    if (error instanceof SocialPublishingError) throw error
    throw new SocialPublishingError(
      'Não foi possível validar o vídeo enviado.',
      'social_video_probe_failed',
      'validation',
      422,
    )
  } finally {
    mediaInfo?.close()
  }
}

export async function verifyUploadedMedia(
  admin: SupabaseClient,
  input: SocialPostInput,
): Promise<InputMedia[]> {
  const verified: InputMedia[] = []
  for (const media of input.media) {
    const parts = media.storagePath.split('/')
    const folder = parts.slice(0, -1).join('/')
    const name = parts.at(-1) as string
    const { data, error } = await admin.storage
      .from('social-publishing')
      .list(folder, { search: name, limit: 2 })
    if (error) throw error
    const uploaded = data?.find((item) => item.name === name)
    const storedSize = Number(uploaded?.metadata?.size)
    const storedMime = String(uploaded?.metadata?.mimetype || '')
    if (!uploaded || !Number.isFinite(storedSize) || storedSize !== media.fileSize) {
      throw new SocialPublishingError('A mídia não foi confirmada no armazenamento.', 'social_media_not_uploaded', 'validation')
    }
    if (storedMime && storedMime !== media.mimeType) {
      throw new SocialPublishingError('O tipo real da mídia não corresponde ao arquivo informado.', 'social_media_mime_mismatch', 'validation')
    }
    verified.push(media.mediaType === 'image'
      ? await inspectImage(admin, media)
      : await inspectVideo(admin, media))
  }
  return verified
}
