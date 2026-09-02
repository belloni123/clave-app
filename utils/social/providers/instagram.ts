import 'server-only'

import { getSocialCapabilities } from '@/utils/social/capabilities'
import { SocialPublishingError } from '@/utils/social/errors'
import { getInstagramPublishingFormat } from '@/utils/social/formats'
import { metaGet, metaPost } from '@/utils/social/providers/meta'
import type {
  ProviderPublishInput,
  ProviderPublishResult,
  SocialProvider,
} from '@/utils/social/providers/types'

interface IdResponse { id?: string }
interface ContainerResponse { status_code?: string; status?: string }
interface MediaResponse { permalink?: string }
interface PublishingLimitResponse {
  data?: Array<{
    quota_usage?: number
    config?: { quota_total?: number }
  }>
}

function requireId(payload: IdResponse, code: string) {
  if (!payload.id) {
    throw new SocialPublishingError('A Meta não retornou o identificador esperado.', code, 'unknown', 502)
  }
  return payload.id
}

async function containerStatus(containerId: string, token: string) {
  return metaGet<ContainerResponse>(containerId, token, { fields: 'status_code,status' })
}

async function assertPublishingQuota(input: ProviderPublishInput) {
  const payload = await metaGet<PublishingLimitResponse>(
    `${input.externalAccountId}/content_publishing_limit`,
    input.accessToken,
    { fields: 'quota_usage,config' },
  )
  const limit = payload.data?.[0]
  if (
    typeof limit?.quota_usage === 'number'
    && typeof limit.config?.quota_total === 'number'
    && limit.quota_usage >= limit.config.quota_total
  ) {
    throw new SocialPublishingError(
      'O limite de publicações do Instagram nas últimas 24 horas foi atingido.',
      'instagram_publishing_limit',
      'retryable',
      429,
      3_600,
    )
  }
}

function assertContainerCanContinue(payload: ContainerResponse) {
  if (payload.status_code === 'ERROR' || payload.status_code === 'EXPIRED') {
    throw new SocialPublishingError(
      payload.status || 'A Meta não conseguiu processar a mídia.',
      `instagram_container_${payload.status_code.toLowerCase()}`,
      'permanent',
      422,
    )
  }
}

async function createMediaContainer(input: ProviderPublishInput) {
  const publishingFormat = getInstagramPublishingFormat(input.settings)
  if (input.media.length > 1) {
    let children = Array.isArray(input.settings.instagramChildren)
      ? input.settings.instagramChildren.filter((value): value is string => typeof value === 'string')
      : []
    if (children.length !== input.media.length) {
      children = []
      for (const media of input.media) {
        const payload = await metaPost<IdResponse>(`${input.externalAccountId}/media`, input.accessToken, {
          ...(media.mediaType === 'video'
            ? { video_url: media.signedUrl, media_type: 'VIDEO' }
            : { image_url: media.signedUrl, ...(media.altText ? { alt_text: media.altText } : {}) }),
          is_carousel_item: 'true',
        })
        children.push(requireId(payload, 'instagram_child_container_missing'))
      }
      await input.checkpoint({
        providerSettings: { ...input.settings, instagramChildren: children },
      })
    }
    const childStatuses = await Promise.all(
      children.map((child) => containerStatus(child, input.accessToken)),
    )
    childStatuses.forEach(assertContainerCanContinue)
    if (childStatuses.some((status) => status.status_code !== 'FINISHED')) {
      throw new SocialPublishingError(
        'O Instagram ainda está processando o carrossel.',
        'instagram_carousel_processing',
        'retryable',
        202,
        60,
      )
    }
    const parent = await metaPost<IdResponse>(`${input.externalAccountId}/media`, input.accessToken, {
      media_type: 'CAROUSEL',
      children: children.join(','),
      caption: input.caption,
    })
    return requireId(parent, 'instagram_carousel_container_missing')
  }

  const media = input.media[0]
  if (!media) {
    throw new SocialPublishingError('O Instagram exige uma mídia.', 'instagram_media_required', 'validation')
  }
  const isVideo = media.mediaType === 'video'
  const isStory = publishingFormat === 'story'
  const mediaType = isStory ? 'STORIES' : publishingFormat === 'reel' ? 'REELS' : 'VIDEO'
  const payload = await metaPost<IdResponse>(`${input.externalAccountId}/media`, input.accessToken, {
    ...(isVideo
      ? { video_url: media.signedUrl, media_type: mediaType }
      : { image_url: media.signedUrl, ...(isStory ? { media_type: 'STORIES' } : {}), ...(!isStory && media.altText ? { alt_text: media.altText } : {}) }),
    ...(!isStory ? { caption: input.caption } : {}),
    ...(publishingFormat === 'reel' ? { share_to_feed: 'false' } : {}),
  })
  return requireId(payload, 'instagram_container_missing')
}

export const instagramProvider: SocialProvider = {
  provider: 'instagram',

  getCapabilities() {
    return getSocialCapabilities('instagram')
  },

  validateDraft(input) {
    const format = getInstagramPublishingFormat(input.settings)
    if (!input.media.length) {
      throw new SocialPublishingError('O Instagram exige uma mídia.', 'instagram_media_required', 'validation')
    }
    if (input.media.length > 10) {
      throw new SocialPublishingError('O Instagram aceita no máximo 10 mídias.', 'instagram_media_limit', 'validation')
    }
    if (format === 'reel' && (input.media.length !== 1 || input.media[0]?.mediaType !== 'video')) {
      throw new SocialPublishingError('Reels do Instagram exigem um único vídeo.', 'instagram_reel_video_required', 'validation')
    }
    if (format === 'story' && input.media.length !== 1) {
      throw new SocialPublishingError('Stories do Instagram aceitam uma única imagem ou vídeo.', 'instagram_story_single_media_required', 'validation')
    }
  },

  async publish(input): Promise<ProviderPublishResult> {
    this.validateDraft(input)
    let containerId = input.remoteContainerId
    if (!containerId) {
      await assertPublishingQuota(input)
      containerId = await createMediaContainer(input)
      await input.checkpoint({ remoteContainerId: containerId })
    }

    const status = await containerStatus(containerId, input.accessToken)
    assertContainerCanContinue(status)
    if (!['FINISHED', 'PUBLISHED'].includes(status.status_code || '')) {
      return { status: 'processing', remoteContainerId: containerId, retryAfterSeconds: 60 }
    }
    if (status.status_code === 'PUBLISHED') {
      throw new SocialPublishingError(
        'O container já foi publicado, mas o ID remoto precisa ser verificado.',
        'instagram_published_id_unknown',
        'unknown',
        409,
      )
    }

    const published = await metaPost<IdResponse>(
      `${input.externalAccountId}/media_publish`,
      input.accessToken,
      { creation_id: containerId },
      { ambiguousOnNetworkFailure: true },
    )
    const remotePostId = requireId(published, 'instagram_remote_post_missing')
    const remote = await metaGet<MediaResponse>(remotePostId, input.accessToken, {
      fields: 'permalink',
    }).catch(() => ({ permalink: undefined }))
    return { status: 'published', remotePostId, remoteUrl: remote.permalink || null }
  },
}
