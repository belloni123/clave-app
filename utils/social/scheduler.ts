import 'server-only'

import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SocialProviderName } from '@/types/social'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireSocialPublishingEnabled } from '@/utils/social/config'
import { safeErrorDetails, SocialPublishingError } from '@/utils/social/errors'
import { getSocialProvider } from '@/utils/social/providers'
import type { ProviderMedia } from '@/utils/social/providers/types'
import { readSocialAccessToken } from '@/utils/social/vault'

interface ClaimedTarget {
  id: string
  post_id: string
  project_id: string
  social_account_id: string
  provider: SocialProviderName
  custom_caption: string | null
  provider_settings: Record<string, unknown>
  attempt_count: number
  remote_container_id: string | null
  worker_id: string
}

interface WorkContext {
  target: ClaimedTarget
  post: { base_caption: string; cancelled_at: string | null }
  account: {
    external_account_id: string
    connection_id: string
    status: string
  }
  connection: {
    source_connection_id: string | null
    token_secret_id: string | null
    status: string
  }
  media: Array<{
    id: string
    storage_path: string
    media_type: 'image' | 'video'
    mime_type: string
    file_size: number
    position: number
    alt_text: string | null
  }>
}

async function loadWork(admin: SupabaseClient, target: ClaimedTarget): Promise<WorkContext> {
  const [postResult, accountResult, mediaResult] = await Promise.all([
    admin
      .from('social_posts')
      .select('base_caption,cancelled_at')
      .eq('id', target.post_id)
      .eq('project_id', target.project_id)
      .single(),
    admin
      .from('social_accounts')
      .select('external_account_id,connection_id,status')
      .eq('id', target.social_account_id)
      .eq('project_id', target.project_id)
      .single(),
    admin
      .from('social_post_media')
      .select('id,storage_path,media_type,mime_type,file_size,position,alt_text')
      .eq('post_id', target.post_id)
      .eq('project_id', target.project_id)
      .order('position'),
  ])
  if (postResult.error) throw postResult.error
  if (accountResult.error) throw accountResult.error
  if (mediaResult.error) throw mediaResult.error
  const { data: connection, error: connectionError } = await admin
    .from('social_connections')
    .select('source_connection_id,token_secret_id,status')
    .eq('id', accountResult.data.connection_id)
    .eq('project_id', target.project_id)
    .single()
  if (connectionError) throw connectionError
  return {
    target,
    post: postResult.data,
    account: accountResult.data,
    connection,
    media: mediaResult.data || [],
  }
}

async function signedMedia(admin: SupabaseClient, work: WorkContext): Promise<ProviderMedia[]> {
  const result: ProviderMedia[] = []
  for (const media of work.media) {
    const { data, error } = await admin.storage
      .from('social-publishing')
      .createSignedUrl(media.storage_path, 60 * 60)
    if (error || !data?.signedUrl) {
      throw new SocialPublishingError(
        'A mídia não está mais disponível para publicação.',
        'social_media_unavailable',
        'permanent',
        422,
      )
    }
    result.push({
      id: media.id,
      mediaType: media.media_type,
      mimeType: media.mime_type,
      signedUrl: data.signedUrl,
      position: media.position,
      altText: media.alt_text,
      fileSize: Number(media.file_size),
    })
  }
  return result
}

async function updateAttempt(
  admin: SupabaseClient,
  attemptId: string,
  values: Record<string, unknown>,
) {
  const { error } = await admin
    .from('social_publish_attempts')
    .update({ ...values, finished_at: new Date().toISOString() })
    .eq('id', attemptId)
  if (error) console.error('Social attempt update failed', { attemptId, message: error.message })
}

async function processTarget(admin: SupabaseClient, claimed: ClaimedTarget) {
  requireSocialPublishingEnabled(claimed.provider)
  const work = await loadWork(admin, claimed)
  if (work.post.cancelled_at) {
    await admin.from('social_post_targets').update({ status: 'cancelled' }).eq('id', claimed.id)
    return { id: claimed.id, status: 'cancelled' as const }
  }
  if (work.account.status !== 'connected' || work.connection.status !== 'connected') {
    throw new SocialPublishingError(
      'A conta precisa ser autorizada novamente.',
      'social_account_unavailable',
      'authorization',
      403,
    )
  }

  const nextAttempt = claimed.attempt_count + 1
  const { data: attempt, error: attemptError } = await admin
    .from('social_publish_attempts')
    .insert({
      post_target_id: claimed.id,
      project_id: claimed.project_id,
      attempt_number: nextAttempt,
      status: 'running',
      metadata: {},
    })
    .select('id')
    .single()
  if (attemptError || !attempt) throw attemptError || new Error('Attempt could not be recorded')
  await admin
    .from('social_post_targets')
    .update({ attempt_count: nextAttempt })
    .eq('id', claimed.id)
    .eq('worker_id', claimed.worker_id)

  try {
    const [accessToken, media] = await Promise.all([
      readSocialAccessToken(
        admin,
        work.connection.source_connection_id,
        work.connection.token_secret_id,
      ),
      signedMedia(admin, work),
    ])
    const provider = getSocialProvider(claimed.provider)
    const result = await provider.publish({
      provider: claimed.provider,
      externalAccountId: work.account.external_account_id,
      accessToken,
      caption: claimed.custom_caption ?? work.post.base_caption,
      media,
      settings: claimed.provider_settings || {},
      remoteContainerId: claimed.remote_container_id,
      checkpoint: async (checkpoint) => {
        const values: Record<string, unknown> = {}
        if (checkpoint.remoteContainerId) values.remote_container_id = checkpoint.remoteContainerId
        if (checkpoint.providerSettings) values.provider_settings = checkpoint.providerSettings
        const { error } = await admin
          .from('social_post_targets')
          .update(values)
          .eq('id', claimed.id)
          .eq('worker_id', claimed.worker_id)
        if (error) throw error
      },
    })

    if (result.status === 'processing') {
      const { error } = await admin
        .from('social_post_targets')
        .update({
          status: 'processing',
          remote_container_id: result.remoteContainerId,
          next_attempt_at: new Date(Date.now() + result.retryAfterSeconds * 1_000).toISOString(),
          locked_at: null,
          locked_until: null,
          worker_id: null,
        })
        .eq('id', claimed.id)
        .eq('worker_id', claimed.worker_id)
      if (error) throw error
      await updateAttempt(admin, attempt.id, { status: 'success', metadata: { checkpoint: 'processing' } })
      return { id: claimed.id, status: 'processing' as const }
    }

    const { error: publishError } = await admin
      .from('social_post_targets')
      .update({
        status: 'published',
        remote_post_id: result.remotePostId,
        remote_url: result.remoteUrl,
        published_at: new Date().toISOString(),
        next_attempt_at: null,
        locked_at: null,
        locked_until: null,
        worker_id: null,
        last_error_code: null,
        last_error_message: null,
        last_error_at: null,
      })
      .eq('id', claimed.id)
      .eq('worker_id', claimed.worker_id)
    if (publishError) throw publishError
    await updateAttempt(admin, attempt.id, { status: 'success' })
    return { id: claimed.id, status: 'published' as const }
  } catch (error) {
    const safe = safeErrorDetails(error)
    const retryable = safe.kind === 'retryable' && nextAttempt < 5
    const targetStatus = safe.kind === 'unknown'
      ? 'unknown'
      : retryable
        ? 'retrying'
        : 'failed'
    const delaySeconds = safe.retryAfterSeconds
      || Math.min(60 * 30, 30 * (2 ** Math.max(0, nextAttempt - 1)))
    await admin
      .from('social_post_targets')
      .update({
        status: targetStatus,
        next_attempt_at: retryable
          ? new Date(Date.now() + delaySeconds * 1_000).toISOString()
          : null,
        locked_at: null,
        locked_until: null,
        worker_id: null,
        last_error_code: safe.code,
        last_error_message: safe.message,
        last_error_at: new Date().toISOString(),
      })
      .eq('id', claimed.id)
      .eq('worker_id', claimed.worker_id)
    await updateAttempt(admin, attempt.id, {
      status: safe.kind === 'unknown'
        ? 'unknown'
        : retryable
          ? 'retryable_error'
          : 'permanent_error',
      http_status: safe.status,
      safe_error_code: safe.code,
      safe_error_message: safe.message,
    })
    return { id: claimed.id, status: targetStatus, error: safe.code }
  }
}

export async function runSocialPublisher(options: { limit?: number; workerId?: string; postId?: string } = {}) {
  requireSocialPublishingEnabled()
  const admin = createAdminClient()
  const workerId = options.workerId || `social-${randomUUID()}`
  const { data, error } = await admin.rpc('claim_social_publish_targets', {
    p_worker_id: workerId,
    p_limit: Math.max(1, Math.min(options.limit || 5, 20)),
    p_lease_seconds: 120,
    p_post_id: options.postId || null,
  })
  if (error) throw error
  const claimed = (data || []) as ClaimedTarget[]
  const results = []
  for (const target of claimed) {
    try {
      results.push(await processTarget(admin, target))
    } catch (error) {
      const safe = safeErrorDetails(error)
      await admin
        .from('social_post_targets')
        .update({
          status: safe.kind === 'unknown' ? 'unknown' : 'failed',
          locked_at: null,
          locked_until: null,
          worker_id: null,
          next_attempt_at: null,
          last_error_code: safe.code,
          last_error_message: safe.message,
          last_error_at: new Date().toISOString(),
        })
        .eq('id', target.id)
        .eq('worker_id', workerId)
      results.push({ id: target.id, status: 'failed' as const, error: safe.code })
    }
  }
  return { workerId, claimed: claimed.length, results }
}
