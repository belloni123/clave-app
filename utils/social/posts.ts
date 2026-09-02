import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  SocialAccountPublic,
  SocialMediaPublic,
  SocialPostInput,
  SocialPostPublic,
  SocialProviderName,
  SocialTargetPublic,
} from '@/types/social'
import { getSocialCapabilities } from '@/utils/social/capabilities'
import { SocialPublishingError } from '@/utils/social/errors'
import { assertUuid, validateSocialPostInput } from '@/utils/social/validation'

async function verifyUploadedMedia(
  admin: SupabaseClient,
  input: SocialPostInput,
  options: { prepareInstagram?: boolean } = {},
) {
  const mediaValidation = await import('@/utils/social/media-validation')
  return mediaValidation.verifyUploadedMedia(admin, input, options)
}

interface PostRow {
  id: string
  project_id: string
  created_by: string | null
  internal_title: string | null
  base_caption: string
  status: SocialPostPublic['status']
  scheduled_at: string | null
  timezone: string
  published_at: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
}

interface AccountRow {
  id: string
  provider: SocialProviderName
  external_account_id: string
  account_type: string
  display_name: string
  username: string | null
  avatar_url: string | null
  status: SocialAccountPublic['status']
}

interface TargetRow {
  id: string
  social_account_id: string
  provider: SocialProviderName
  custom_caption: string | null
  provider_settings: Record<string, unknown>
  status: SocialTargetPublic['status']
  attempt_count: number
  remote_post_id: string | null
  remote_url: string | null
  last_error_code: string | null
  last_error_message: string | null
  published_at: string | null
}

interface MediaRow {
  id: string
  storage_path: string
  media_type: SocialMediaPublic['mediaType']
  mime_type: string
  file_size: number
  width: number | null
  height: number | null
  duration_ms: number | null
  position: number
  alt_text: string | null
  checksum: string
}

function assertPostInputShape(input: SocialPostInput) {
  if (
    !input
    || typeof input.projectId !== 'string'
    || typeof input.idempotencyKey !== 'string'
    || typeof input.baseCaption !== 'string'
    || !Array.isArray(input.targets)
    || !Array.isArray(input.media)
    || input.targets.some((target) => !target || typeof target.socialAccountId !== 'string')
    || input.media.some((media) => (
      !media
      || typeof media.storagePath !== 'string'
      || typeof media.mimeType !== 'string'
      || !['image', 'video'].includes(media.mediaType)
    ))
  ) {
    throw new SocialPublishingError('Dados da publicação inválidos.', 'social_invalid_payload', 'validation')
  }
}

function socialAccountIds(input: SocialPostInput) {
  assertPostInputShape(input)
  if (!input.targets.length) {
    throw new SocialPublishingError('Selecione pelo menos um destino.', 'social_target_required', 'validation')
  }
  const accountIds = [...new Set(input.targets.map((target) => target.socialAccountId))]
  if (accountIds.length !== input.targets.length) {
    throw new SocialPublishingError('Um destino foi selecionado mais de uma vez.', 'social_duplicate_target', 'validation')
  }
  accountIds.forEach((id) => assertUuid(id, 'Destino'))
  return accountIds
}

function mapAccount(row: AccountRow): SocialAccountPublic {
  return {
    id: row.id,
    provider: row.provider,
    externalAccountId: row.external_account_id,
    accountType: row.account_type,
    displayName: row.display_name,
    username: row.username,
    avatarUrl: row.avatar_url,
    status: row.status,
    capabilities: getSocialCapabilities(row.provider),
  }
}

function mapMedia(row: MediaRow): SocialMediaPublic {
  return {
    id: row.id,
    storagePath: row.storage_path,
    mediaType: row.media_type,
    mimeType: row.mime_type,
    fileSize: Number(row.file_size),
    width: row.width,
    height: row.height,
    durationMs: row.duration_ms,
    position: row.position,
    altText: row.alt_text,
    checksum: row.checksum,
  }
}

async function loadPostRelations(admin: SupabaseClient, postIds: string[]) {
  if (!postIds.length) return { targets: [], media: [], accounts: [] }
  const [targetsResult, mediaResult] = await Promise.all([
    admin
      .from('social_post_targets')
      .select('id,post_id,social_account_id,provider,custom_caption,provider_settings,status,attempt_count,remote_post_id,remote_url,last_error_code,last_error_message,published_at')
      .in('post_id', postIds)
      .order('created_at'),
    admin
      .from('social_post_media')
      .select('id,post_id,storage_path,media_type,mime_type,file_size,width,height,duration_ms,position,alt_text,checksum')
      .in('post_id', postIds)
      .order('position'),
  ])
  if (targetsResult.error) throw targetsResult.error
  if (mediaResult.error) throw mediaResult.error
  const accountIds = [...new Set((targetsResult.data || []).map((target) => target.social_account_id))]
  const accountsResult = accountIds.length
    ? await admin
        .from('social_accounts')
        .select('id,provider,external_account_id,account_type,display_name,username,avatar_url,status')
        .in('id', accountIds)
    : { data: [], error: null }
  if (accountsResult.error) throw accountsResult.error
  return {
    targets: targetsResult.data || [],
    media: mediaResult.data || [],
    accounts: accountsResult.data || [],
  }
}

export async function getSocialPosts(
  admin: SupabaseClient,
  projectId: string,
  options: { postId?: string; status?: string; provider?: string; search?: string } = {},
) {
  let query = admin
    .from('social_posts')
    .select('id,project_id,created_by,internal_title,base_caption,status,scheduled_at,timezone,published_at,cancelled_at,created_at,updated_at')
    .eq('project_id', projectId)
    .order('scheduled_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(options.postId ? 1 : 100)
  if (options.postId) query = query.eq('id', options.postId)
  if (options.status) query = query.eq('status', options.status)
  if (options.search) {
    const sanitized = options.search.replace(/[%_,()]/g, '').slice(0, 80)
    if (sanitized) query = query.or(`internal_title.ilike.%${sanitized}%,base_caption.ilike.%${sanitized}%`)
  }
  const { data, error } = await query
  if (error) throw error
  const posts = (data || []) as PostRow[]
  const authorIds = [...new Set(posts.flatMap((post) => post.created_by ? [post.created_by] : []))]
  const authorResult = authorIds.length
    ? await admin.from('profiles').select('id,nome,email').in('id', authorIds)
    : { data: [], error: null }
  if (authorResult.error) throw authorResult.error
  const authorById = new Map((authorResult.data || []).map((profile) => [
    profile.id,
    profile.nome?.trim() || profile.email?.trim() || 'Usuário CLAVE',
  ]))
  const relations = await loadPostRelations(admin, posts.map((post) => post.id))
  const accountById = new Map(
    (relations.accounts as AccountRow[]).map((account) => [account.id, mapAccount(account)]),
  )

  return posts.map((post): SocialPostPublic => {
    const targets = (relations.targets as Array<TargetRow & { post_id: string }>)
      .filter((target) => target.post_id === post.id)
      .filter((target) => !options.provider || target.provider === options.provider)
      .map((target) => ({
        id: target.id,
        socialAccountId: target.social_account_id,
        provider: target.provider,
        customCaption: target.custom_caption,
        providerSettings: target.provider_settings || {},
        status: target.status,
        attemptCount: target.attempt_count,
        remotePostId: target.remote_post_id,
        remoteUrl: target.remote_url,
        lastErrorCode: target.last_error_code,
        lastErrorMessage: target.last_error_message,
        publishedAt: target.published_at,
        account: accountById.get(target.social_account_id),
      }))
    return {
      id: post.id,
      projectId: post.project_id,
      createdBy: post.created_by,
      authorName: post.created_by ? authorById.get(post.created_by) || 'Usuário CLAVE' : null,
      internalTitle: post.internal_title,
      baseCaption: post.base_caption,
      status: post.status,
      scheduledAt: post.scheduled_at,
      timezone: post.timezone,
      publishedAt: post.published_at,
      cancelledAt: post.cancelled_at,
      createdAt: post.created_at,
      updatedAt: post.updated_at,
      targets,
      media: (relations.media as Array<MediaRow & { post_id: string }>)
        .filter((media) => media.post_id === post.id)
        .map(mapMedia),
    }
  }).filter((post) => !options.provider || post.targets.length > 0)
}

export async function addSocialMediaPreviews(
  admin: SupabaseClient,
  posts: SocialPostPublic[],
) {
  const paths = [...new Set(posts.flatMap((post) => post.media.map((media) => media.storagePath)))]
  if (!paths.length) return posts
  const signedByPath = new Map<string, string>()
  for (let index = 0; index < paths.length; index += 20) {
    const batch = paths.slice(index, index + 20)
    const { data, error } = await admin.storage
      .from('social-publishing')
      .createSignedUrls(batch, 10 * 60)
    if (error) throw error
    ;(data || []).forEach((item) => {
      if (item.path && item.signedUrl) signedByPath.set(item.path, item.signedUrl)
    })
  }
  return posts.map((post) => ({
    ...post,
    media: post.media.map((media) => ({
      ...media,
      previewUrl: signedByPath.get(media.storagePath) || null,
    })),
  }))
}

export async function createSocialPost(
  admin: SupabaseClient,
  userId: string,
  input: SocialPostInput,
) {
  const accountIds = socialAccountIds(input)
  const { data: accounts, error } = await admin
    .from('social_accounts')
    .select('id,provider,status')
    .eq('project_id', input.projectId)
    .in('id', accountIds)
  if (error) throw error
  if (!accounts || accounts.length !== accountIds.length || accounts.some((account) => account.status !== 'connected')) {
    throw new SocialPublishingError('Um destino não está disponível para publicação.', 'social_target_unavailable', 'validation')
  }
  const inputByAccount = new Map(input.targets.map((target) => [target.socialAccountId, target]))
  const schedule = validateSocialPostInput(input, accounts.map((account) => ({
    provider: account.provider as SocialProviderName,
    customCaption: inputByAccount.get(account.id)?.customCaption,
    providerSettings: inputByAccount.get(account.id)?.providerSettings,
  })))
  const verifiedMedia = await verifyUploadedMedia(admin, input, {
    prepareInstagram: accounts.some((account) => account.provider === 'instagram'),
  })

  const { data: postId, error: createError } = await admin.rpc('create_social_post', {
    p_project_id: input.projectId,
    p_created_by: userId,
    p_internal_title: input.internalTitle || null,
    p_base_caption: input.baseCaption,
    p_scheduled_at: schedule.scheduledAt,
    p_timezone: schedule.timezone,
    p_idempotency_key: input.idempotencyKey,
    p_is_draft: Boolean(input.saveAsDraft),
    p_targets: input.targets.map((target) => ({
      social_account_id: target.socialAccountId,
      custom_caption: target.customCaption || null,
      provider_settings: target.providerSettings || {},
    })),
    p_media: verifiedMedia.map((media) => ({
      storage_path: media.storagePath,
      media_type: media.mediaType,
      mime_type: media.mimeType,
      file_size: media.fileSize,
      width: media.width || null,
      height: media.height || null,
      duration_ms: media.durationMs || null,
      position: media.position,
      alt_text: media.altText || null,
      checksum: media.checksum,
      metadata: {},
    })),
  })
  if (createError || typeof postId !== 'string') throw createError || new Error('Social post was not created')
  const [post] = await getSocialPosts(admin, input.projectId, { postId })
  return post
}

export async function updateSocialPost(
  admin: SupabaseClient,
  postId: string,
  input: SocialPostInput,
) {
  const accountIds = socialAccountIds(input)
  const { data: accounts, error } = await admin
    .from('social_accounts')
    .select('id,provider,status')
    .eq('project_id', input.projectId)
    .in('id', accountIds)
  if (error) throw error
  if (!accounts || accounts.length !== accountIds.length || accounts.some((account) => account.status !== 'connected')) {
    throw new SocialPublishingError('Um destino não está disponível para publicação.', 'social_target_unavailable', 'validation')
  }
  const inputByAccount = new Map(input.targets.map((target) => [target.socialAccountId, target]))
  const schedule = validateSocialPostInput(input, accounts.map((account) => ({
    provider: account.provider as SocialProviderName,
    customCaption: inputByAccount.get(account.id)?.customCaption,
    providerSettings: inputByAccount.get(account.id)?.providerSettings,
  })))
  const verifiedMedia = await verifyUploadedMedia(admin, input, {
    prepareInstagram: accounts.some((account) => account.provider === 'instagram'),
  })
  const { error: updateError } = await admin.rpc('update_social_post', {
    p_post_id: postId,
    p_project_id: input.projectId,
    p_internal_title: input.internalTitle || null,
    p_base_caption: input.baseCaption,
    p_scheduled_at: schedule.scheduledAt,
    p_timezone: schedule.timezone,
    p_is_draft: Boolean(input.saveAsDraft),
    p_targets: input.targets.map((target) => ({
      social_account_id: target.socialAccountId,
      custom_caption: target.customCaption || null,
      provider_settings: target.providerSettings || {},
    })),
    p_media: verifiedMedia.map((media) => ({
      storage_path: media.storagePath,
      media_type: media.mediaType,
      mime_type: media.mimeType,
      file_size: media.fileSize,
      width: media.width || null,
      height: media.height || null,
      duration_ms: media.durationMs || null,
      position: media.position,
      alt_text: media.altText || null,
      checksum: media.checksum,
      metadata: {},
    })),
  })
  if (updateError) {
    if (/no longer|already started/i.test(updateError.message)) {
      throw new SocialPublishingError('A publicação já começou e não pode mais ser editada.', 'social_edit_too_late', 'validation', 409)
    }
    throw updateError
  }
  const [post] = await getSocialPosts(admin, input.projectId, { postId })
  return post
}

export async function cancelSocialPost(admin: SupabaseClient, projectId: string, postId: string) {
  const { data: targets, error: loadError } = await admin
    .from('social_post_targets')
    .select('id,status')
    .eq('project_id', projectId)
    .eq('post_id', postId)
  if (loadError) throw loadError
  if (!targets?.length) throw new SocialPublishingError('Publicação não encontrada.', 'social_post_not_found', 'validation', 404)
  const cancellable = targets.filter((target) => !['published', 'cancelled'].includes(target.status)).map((target) => target.id)
  if (cancellable.length) {
    const { error } = await admin
      .from('social_post_targets')
      .update({
        status: 'cancelled',
        locked_at: null,
        locked_until: null,
        worker_id: null,
        next_attempt_at: null,
      })
      .in('id', cancellable)
    if (error) throw error
  }
  const [post] = await getSocialPosts(admin, projectId, { postId })
  return post
}

export async function retrySocialTarget(
  admin: SupabaseClient,
  projectId: string,
  targetId: string,
) {
  const { data: target, error: loadError } = await admin
    .from('social_post_targets')
    .select('id,status,post_id')
    .eq('project_id', projectId)
    .eq('id', targetId)
    .maybeSingle()
  if (loadError) throw loadError
  if (!target) throw new SocialPublishingError('Destino não encontrado.', 'social_target_not_found', 'validation', 404)
  if (target.status !== 'failed') {
    throw new SocialPublishingError(
      target.status === 'unknown'
        ? 'Verifique manualmente o destino antes de tentar novamente.'
        : 'Este destino não pode ser reenviado agora.',
      'social_retry_unsafe',
      'validation',
      409,
    )
  }
  const { error } = await admin
    .from('social_post_targets')
    .update({
      status: 'retrying',
      next_attempt_at: new Date().toISOString(),
      locked_at: null,
      locked_until: null,
      worker_id: null,
      last_error_code: null,
      last_error_message: null,
    })
    .eq('id', target.id)
  if (error) throw error
  return target.post_id as string
}
