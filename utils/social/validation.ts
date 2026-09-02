import type { SocialPostInput, SocialProviderName } from '@/types/social'
import { getSocialCapabilities, maxSocialUploadBytes } from '@/utils/social/capabilities'
import { SocialPublishingError } from '@/utils/social/errors'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const STORAGE_PATH_PATTERN = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/

export function assertUuid(value: string, field: string) {
  if (!UUID_PATTERN.test(value)) {
    throw new SocialPublishingError(`${field} inválido.`, 'social_invalid_id', 'validation', 400)
  }
}

export function parseScheduledAt(value: string, timezone: string) {
  if (timezone !== 'America/Sao_Paulo') {
    throw new SocialPublishingError('Fuso horário não suportado nesta fase.', 'social_invalid_timezone', 'validation')
  }
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) {
    throw new SocialPublishingError('Data e horário inválidos.', 'social_invalid_schedule', 'validation')
  }
  if (date.getTime() < Date.now() + 30_000) {
    throw new SocialPublishingError('Escolha um horário futuro.', 'social_schedule_in_past', 'validation')
  }
  return date.toISOString()
}

export function validateSocialPostInput(
  input: SocialPostInput,
  targets: Array<{ provider: SocialProviderName; customCaption?: string | null }>,
) {
  assertUuid(input.projectId, 'Projeto')
  assertUuid(input.idempotencyKey, 'Chave de idempotência')
  if (!input.targets.length) {
    throw new SocialPublishingError('Selecione pelo menos um destino.', 'social_target_required', 'validation')
  }
  if (input.internalTitle && input.internalTitle.length > 160) {
    throw new SocialPublishingError('O título interno deve ter até 160 caracteres.', 'social_title_too_long', 'validation')
  }
  if (input.media.length > 10) {
    throw new SocialPublishingError('Envie no máximo 10 mídias.', 'social_too_many_media', 'validation')
  }
  input.media.forEach((media, index) => {
    if (
      !STORAGE_PATH_PATTERN.test(media.storagePath)
      || !media.storagePath.startsWith(`${input.projectId}/`)
    ) {
      throw new SocialPublishingError('Caminho de mídia inválido.', 'social_invalid_media_path', 'validation')
    }
    if (!Number.isSafeInteger(media.fileSize) || media.fileSize <= 0 || media.fileSize > maxSocialUploadBytes(media.mimeType)) {
      throw new SocialPublishingError('Tamanho de mídia inválido.', 'social_invalid_media_size', 'validation')
    }
    if (media.position !== index) {
      throw new SocialPublishingError('A ordem das mídias é inválida.', 'social_invalid_media_order', 'validation')
    }
    if (!/^[a-f0-9]{64}$/i.test(media.checksum)) {
      throw new SocialPublishingError('Checksum de mídia inválido.', 'social_invalid_checksum', 'validation')
    }
  })

  if (!input.saveAsDraft && targets.some((target) => target.provider === 'instagram') && !input.media.length) {
    throw new SocialPublishingError('O Instagram exige uma mídia.', 'social_instagram_media_required', 'validation')
  }

  targets.forEach(({ provider, customCaption }) => {
    const capabilities = getSocialCapabilities(provider)
    const caption = customCaption ?? input.baseCaption
    if (caption.length > capabilities.maxCaptionLength) {
      throw new SocialPublishingError(
        `A legenda excede o limite do ${provider === 'instagram' ? 'Instagram' : 'Facebook'}.`,
        'social_caption_too_long',
        'validation',
      )
    }
    if (!input.saveAsDraft && !input.media.length && !capabilities.textOnly) {
      throw new SocialPublishingError('O Instagram exige uma mídia.', 'social_instagram_media_required', 'validation')
    }
    if (input.media.length > capabilities.maxMedia) {
      throw new SocialPublishingError('Quantidade de mídias incompatível com o destino.', 'social_media_limit', 'validation')
    }
    input.media.forEach((media) => {
      if (!capabilities.acceptedMimeTypes.includes(media.mimeType)) {
        throw new SocialPublishingError('Formato de mídia incompatível com um destino.', 'social_media_type_unsupported', 'validation')
      }
      const providerLimit = media.mediaType === 'image'
        ? capabilities.maxImageBytes
        : capabilities.maxVideoBytes
      if (media.fileSize > providerLimit) {
        throw new SocialPublishingError('A mídia excede o limite do destino.', 'social_media_too_large', 'validation')
      }
    })
  })

  const timezone = input.timezone || 'America/Sao_Paulo'
  return {
    timezone,
    scheduledAt: input.saveAsDraft
      ? null
      : input.publishNow
        ? new Date().toISOString()
        : parseScheduledAt(input.scheduledAt || '', timezone),
  }
}
