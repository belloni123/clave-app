import 'server-only'

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import sharp from 'sharp'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SocialPostInput } from '@/types/social'
import { SocialPublishingError } from '@/utils/social/errors'

const execFileAsync = promisify(execFile)

type InputMedia = SocialPostInput['media'][number]

interface ProbePayload {
  streams?: Array<{
    codec_type?: string
    width?: number
    height?: number
  }>
  format?: {
    duration?: string
    format_name?: string
  }
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
  let stdout: string
  try {
    const result = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration,format_name:stream=codec_type,width,height',
      '-of', 'json',
      url,
    ], { timeout: 30_000, maxBuffer: 1024 * 1024 })
    stdout = result.stdout
  } catch {
    throw new SocialPublishingError(
      'Não foi possível validar o vídeo enviado.',
      'social_video_probe_failed',
      'validation',
      422,
    )
  }
  let payload: ProbePayload
  try {
    payload = JSON.parse(stdout) as ProbePayload
  } catch {
    throw new SocialPublishingError('O contêiner do vídeo é inválido.', 'social_video_invalid_container', 'validation')
  }
  const stream = payload.streams?.find((item) => item.codec_type === 'video')
  const duration = Number(payload.format?.duration)
  const format = payload.format?.format_name || ''
  if (!stream?.width || !stream.height || !Number.isFinite(duration) || duration <= 0 || !/(^|,)mov(,|$)|(^|,)mp4(,|$)/.test(format)) {
    throw new SocialPublishingError('O conteúdo do vídeo não é compatível.', 'social_video_invalid_content', 'validation')
  }
  return {
    ...media,
    width: stream.width,
    height: stream.height,
    durationMs: Math.round(duration * 1_000),
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
