import 'server-only'

import { getSocialCapabilities } from '@/utils/social/capabilities'
import { SocialPublishingError } from '@/utils/social/errors'
import { metaGet, metaPost, metaPostJson } from '@/utils/social/providers/meta'
import type {
  ProviderPublishInput,
  ProviderPublishResult,
  SocialProvider,
} from '@/utils/social/providers/types'

interface PageTokenResponse { access_token?: string }
interface IdResponse { id?: string; post_id?: string; video_id?: string; upload_url?: string }
interface PermalinkResponse { permalink_url?: string }
interface VideoStatusResponse {
  status?: {
    video_status?: string
    uploading_phase?: { status?: string }
    processing_phase?: { status?: string }
    publishing_phase?: { status?: string }
  }
}

async function pageToken(pageId: string, sourceToken: string) {
  const payload = await metaGet<PageTokenResponse>(pageId, sourceToken, { fields: 'access_token' })
  if (!payload.access_token) {
    throw new SocialPublishingError(
      'A Página precisa ser autorizada novamente para publicar.',
      'facebook_page_token_missing',
      'authorization',
      403,
    )
  }
  return payload.access_token
}

function publishedId(payload: IdResponse) {
  const id = payload.post_id || payload.id || payload.video_id
  if (!id) {
    throw new SocialPublishingError('O Facebook não confirmou o ID da publicação.', 'facebook_post_id_missing', 'unknown', 502)
  }
  return id
}

async function permalink(id: string, token: string) {
  const payload: PermalinkResponse = await metaGet<PermalinkResponse>(id, token, {
    fields: 'permalink_url',
  }).catch(() => ({}))
  return payload.permalink_url || null
}

async function confirmVideo(videoId: string, token: string): Promise<ProviderPublishResult> {
  const payload = await metaGet<VideoStatusResponse>(videoId, token, { fields: 'status' })
  const phases = [
    payload.status?.video_status,
    payload.status?.uploading_phase?.status,
    payload.status?.processing_phase?.status,
    payload.status?.publishing_phase?.status,
  ].filter((status): status is string => Boolean(status)).map((status) => status.toLowerCase())
  if (phases.some((status) => ['error', 'failed', 'expired'].includes(status))) {
    throw new SocialPublishingError(
      'O Facebook não conseguiu processar o vídeo.',
      'facebook_video_processing_failed',
      'permanent',
      422,
    )
  }
  if (phases.some((status) => ['ready', 'published', 'complete', 'completed'].includes(status))) {
    return { status: 'published', remotePostId: videoId, remoteUrl: await permalink(videoId, token) }
  }
  return { status: 'processing', remoteContainerId: videoId, retryAfterSeconds: 30 }
}

async function publishFacebookReel(input: ProviderPublishInput, token: string) {
  let videoId = input.remoteContainerId
  let settings = input.settings
  if (videoId && settings.facebookFinished === true) {
    return confirmVideo(videoId, token)
  }
  if (!videoId) {
    const start = await metaPost<IdResponse>(`${input.externalAccountId}/video_reels`, token, {
      upload_phase: 'start',
    })
    if (!start.video_id || !start.upload_url) {
      throw new SocialPublishingError('O Facebook não iniciou o upload do Reel.', 'facebook_reel_start_failed', 'retryable', 502)
    }
    videoId = start.video_id
    settings = { ...settings, facebookUploadUrl: start.upload_url }
    await input.checkpoint({ remoteContainerId: videoId, providerSettings: settings })
  }
  const uploadUrl = typeof settings.facebookUploadUrl === 'string' ? settings.facebookUploadUrl : null
  if (!uploadUrl) {
    throw new SocialPublishingError('A sessão de upload do Reel expirou.', 'facebook_reel_upload_missing', 'retryable', 409)
  }
  const media = input.media[0]
  if (!media) throw new SocialPublishingError('Selecione um vídeo.', 'facebook_video_required', 'validation')

  let uploadResponse: Response
  try {
    uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${token}`,
        file_url: media.signedUrl,
      },
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    throw new SocialPublishingError('O upload do Reel não foi confirmado.', 'facebook_reel_upload_unknown', 'unknown', 503)
  }
  if (!uploadResponse.ok) {
    throw new SocialPublishingError('O Facebook recusou o arquivo do Reel.', 'facebook_reel_upload_failed', 'permanent', uploadResponse.status)
  }
  const finish = await metaPost<IdResponse>(
    `${input.externalAccountId}/video_reels`,
    token,
    {
      upload_phase: 'finish',
      video_id: videoId,
      video_state: 'PUBLISHED',
      description: input.caption,
    },
    { ambiguousOnNetworkFailure: true },
  )
  const remotePostId = publishedId({ ...finish, video_id: videoId })
  settings = { ...settings, facebookFinished: true }
  await input.checkpoint({ remoteContainerId: remotePostId, providerSettings: settings })
  return confirmVideo(remotePostId, token)
}

export const facebookProvider: SocialProvider = {
  provider: 'facebook',

  getCapabilities() {
    return getSocialCapabilities('facebook')
  },

  validateDraft(input) {
    if (input.media.length > 10) {
      throw new SocialPublishingError('O Facebook aceita no máximo 10 mídias nesta fase.', 'facebook_media_limit', 'validation')
    }
    if (input.media.some((media) => media.mediaType === 'video') && input.media.length > 1) {
      throw new SocialPublishingError('Vídeo não pode ser combinado com outras mídias no Facebook nesta fase.', 'facebook_video_mix_unsupported', 'validation')
    }
  },

  async publish(input): Promise<ProviderPublishResult> {
    this.validateDraft(input)
    const token = await pageToken(input.externalAccountId, input.accessToken)
    const media = input.media
    if (media.length === 1 && media[0].mediaType === 'video' && input.settings.facebookFormat === 'reel') {
      return publishFacebookReel(input, token)
    }
    if (media.length === 1 && media[0].mediaType === 'video' && input.remoteContainerId) {
      return confirmVideo(input.remoteContainerId, token)
    }

    let payload: IdResponse
    if (!media.length) {
      payload = await metaPost<IdResponse>(
        `${input.externalAccountId}/feed`,
        token,
        {
          message: input.caption,
          ...(typeof input.settings.link === 'string' ? { link: input.settings.link } : {}),
        },
        { ambiguousOnNetworkFailure: true },
      )
    } else if (media.length === 1 && media[0].mediaType === 'image') {
      payload = await metaPost<IdResponse>(
        `${input.externalAccountId}/photos`,
        token,
        { url: media[0].signedUrl, caption: input.caption, published: 'true' },
        { ambiguousOnNetworkFailure: true },
      )
    } else if (media.length === 1) {
      payload = await metaPost<IdResponse>(
        `${input.externalAccountId}/videos`,
        token,
        { file_url: media[0].signedUrl, description: input.caption, published: 'true' },
        { ambiguousOnNetworkFailure: true },
      )
      const videoId = publishedId(payload)
      await input.checkpoint({ remoteContainerId: videoId })
      return confirmVideo(videoId, token)
    } else {
      const attachedMedia = []
      for (const item of media) {
        const photo = await metaPost<IdResponse>(`${input.externalAccountId}/photos`, token, {
          url: item.signedUrl,
          published: 'false',
        })
        attachedMedia.push({ media_fbid: publishedId(photo) })
      }
      payload = await metaPostJson<IdResponse>(
        `${input.externalAccountId}/feed`,
        token,
        { message: input.caption, attached_media: attachedMedia },
        { ambiguousOnNetworkFailure: true },
      )
    }
    const remotePostId = publishedId(payload)
    return { status: 'published', remotePostId, remoteUrl: await permalink(remotePostId, token) }
  },
}
