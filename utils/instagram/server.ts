import 'server-only'

import { createAdminClient } from '@/utils/supabase/admin'

const DEFAULT_API_VERSION = 'v23.0'
const ACCOUNT_METRICS = [
  'follower_count',
  'reach',
  'views',
  'profile_views',
  'profile_links_taps',
  'accounts_engaged',
  'total_interactions',
  'likes',
  'comments',
  'shares',
  'saves',
  'replies',
] as const

type SyncTrigger = 'oauth' | 'manual' | 'cron'

interface ConnectionRow {
  id: string
  project_id: string
  instagram_user_id: string
  token_secret_id: string | null
  token_expires_at: string | null
}

interface MetaErrorPayload {
  error?: {
    message?: string
    code?: number
    error_subcode?: number
  }
}

interface InstagramProfilePayload extends MetaErrorPayload {
  id?: string
  user_id?: string
  username?: string
  name?: string
  account_type?: string
  profile_picture_url?: string
  followers_count?: number
  media_count?: number
}

interface InsightValue {
  value?: number | Record<string, unknown>
  end_time?: string
}

interface InsightPayload extends MetaErrorPayload {
  data?: Array<{
    name?: string
    values?: InsightValue[]
    total_value?: {
      value?: number
      breakdowns?: Array<{
        results?: Array<{ dimension_values?: string[]; value?: number }>
      }>
    }
  }>
}

interface MediaPayload extends MetaErrorPayload {
  data?: InstagramMediaPayload[]
  paging?: { next?: string }
}

interface InstagramMediaPayload {
  id: string
  caption?: string
  media_type?: string
  media_product_type?: string
  media_url?: string
  thumbnail_url?: string
  permalink?: string
  timestamp?: string
  like_count?: number
  comments_count?: number
  is_story?: boolean
}

interface DailyRow {
  followers_count: number | null
  follows: number | null
  unfollows: number | null
  reach: number | null
  views: number | null
  profile_views: number | null
  profile_links_taps: number | null
  accounts_engaged: number | null
  total_interactions: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  saves: number | null
  replies: number | null
  raw_metrics: Record<string, unknown>
}

export interface InstagramTokenBundle {
  accessToken: string
  instagramUserId: string
  expiresAt: string
  grantedScopes: string[]
}

export interface InstagramSyncResult {
  syncedAt: string
  accountDaysSynced: number
  mediaSynced: number
}

class InstagramApiError extends Error {
  constructor(message: string, readonly code?: number) {
    super(message)
    this.name = 'InstagramApiError'
  }
}

function apiVersion() {
  return process.env.INSTAGRAM_GRAPH_API_VERSION?.trim() || DEFAULT_API_VERSION
}

function graphBase() {
  return `https://graph.instagram.com/${apiVersion()}`
}

function requiredInstagramConfig() {
  const appId = process.env.INSTAGRAM_APP_ID?.trim()
  const appSecret = process.env.INSTAGRAM_APP_SECRET?.trim()
  if (!appId || !appSecret) {
    throw new Error('A integração do Instagram ainda não foi configurada no servidor.')
  }
  return { appId, appSecret }
}

async function readJson<T extends MetaErrorPayload>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as T
  if (!response.ok || payload.error) {
    const message = payload.error?.message || 'A Meta não conseguiu concluir a solicitação.'
    throw new InstagramApiError(message, payload.error?.code)
  }
  return payload
}

async function graphGet<T extends MetaErrorPayload>(
  path: string,
  accessToken: string,
  params: Record<string, string> = {},
) {
  const url = new URL(`${graphBase()}/${path.replace(/^\//, '')}`)
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  return readJson<T>(response)
}

export async function exchangeInstagramCode(
  code: string,
  redirectUri: string,
): Promise<InstagramTokenBundle> {
  const { appId, appSecret } = requiredInstagramConfig()
  const normalizedCode = code.replace(/#_$/, '')
  const shortResponse = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code: normalizedCode,
    }),
    cache: 'no-store',
  })
  const shortToken = await readJson<MetaErrorPayload & {
    access_token?: string
    user_id?: string | number
    permissions?: string[]
  }>(shortResponse)

  if (!shortToken.access_token || !shortToken.user_id) {
    throw new InstagramApiError('A Meta não retornou as credenciais da conta.')
  }

  const longUrl = new URL('https://graph.instagram.com/access_token')
  longUrl.searchParams.set('grant_type', 'ig_exchange_token')
  longUrl.searchParams.set('client_secret', appSecret)
  longUrl.searchParams.set('access_token', shortToken.access_token)
  const longResponse = await fetch(longUrl, { cache: 'no-store' })
  const longToken = await readJson<MetaErrorPayload & {
    access_token?: string
    expires_in?: number
  }>(longResponse)

  if (!longToken.access_token) {
    throw new InstagramApiError('A Meta não retornou o token de longa duração.')
  }

  const expiresIn = longToken.expires_in || 5_184_000
  return {
    accessToken: longToken.access_token,
    instagramUserId: String(shortToken.user_id),
    expiresAt: new Date(Date.now() + expiresIn * 1_000).toISOString(),
    grantedScopes: shortToken.permissions || [
      'instagram_business_basic',
      'instagram_business_manage_insights',
    ],
  }
}

export async function fetchInstagramProfile(
  instagramUserId: string,
  accessToken: string,
) {
  const richFields = [
    'id',
    'user_id',
    'username',
    'name',
    'account_type',
    'profile_picture_url',
    'followers_count',
    'media_count',
  ].join(',')

  try {
    return await graphGet<InstagramProfilePayload>(instagramUserId, accessToken, {
      fields: richFields,
    })
  } catch {
    return graphGet<InstagramProfilePayload>(instagramUserId, accessToken, {
      fields: 'id,user_id,username,name,profile_picture_url,followers_count,media_count',
    })
  }
}

async function refreshTokenIfNeeded(connection: ConnectionRow, accessToken: string) {
  if (!connection.token_expires_at) return { accessToken, expiresAt: null as string | null }
  const refreshThreshold = Date.now() + 7 * 24 * 60 * 60 * 1_000
  if (new Date(connection.token_expires_at).getTime() > refreshThreshold) {
    return { accessToken, expiresAt: null as string | null }
  }

  const url = new URL('https://graph.instagram.com/refresh_access_token')
  url.searchParams.set('grant_type', 'ig_refresh_token')
  url.searchParams.set('access_token', accessToken)
  const response = await fetch(url, { cache: 'no-store' })
  const payload = await readJson<MetaErrorPayload & { access_token?: string; expires_in?: number }>(response)
  if (!payload.access_token) throw new InstagramApiError('A Meta não renovou a autorização.')
  return {
    accessToken: payload.access_token,
    expiresAt: new Date(Date.now() + (payload.expires_in || 5_184_000) * 1_000).toISOString(),
  }
}

function emptyDailyRow(): DailyRow {
  return {
    followers_count: null,
    follows: null,
    unfollows: null,
    reach: null,
    views: null,
    profile_views: null,
    profile_links_taps: null,
    accounts_engaged: null,
    total_interactions: null,
    likes: null,
    comments: null,
    shares: null,
    saves: null,
    replies: null,
    raw_metrics: {},
  }
}

function metricColumn(metric: string): keyof Omit<DailyRow, 'raw_metrics'> | null {
  const columns: Record<string, keyof Omit<DailyRow, 'raw_metrics'>> = {
    follower_count: 'followers_count',
    reach: 'reach',
    views: 'views',
    profile_views: 'profile_views',
    profile_links_taps: 'profile_links_taps',
    accounts_engaged: 'accounts_engaged',
    total_interactions: 'total_interactions',
    likes: 'likes',
    comments: 'comments',
    shares: 'shares',
    saves: 'saves',
    replies: 'replies',
  }
  return columns[metric] || null
}

function isoDate(value = new Date()) {
  return value.toISOString().slice(0, 10)
}

async function fetchAccountDaily(
  instagramUserId: string,
  accessToken: string,
  followersCount: number | undefined,
) {
  const sinceDate = new Date()
  sinceDate.setUTCDate(sinceDate.getUTCDate() - 89)
  const untilDate = new Date()
  untilDate.setUTCDate(untilDate.getUTCDate() + 1)
  const daily = new Map<string, DailyRow>()

  const results = await Promise.allSettled(
    ACCOUNT_METRICS.map((metric) => {
      const supportsTimeSeries = [
        'follower_count',
        'reach',
        'views',
        'profile_views',
      ].includes(metric)
      return graphGet<InsightPayload>(
        `${instagramUserId}/insights`,
        accessToken,
        supportsTimeSeries
          ? {
              metric,
              period: 'day',
              since: isoDate(sinceDate),
              until: isoDate(untilDate),
            }
          : {
              metric,
              period: 'day',
              metric_type: 'total_value',
              since: isoDate(),
              until: isoDate(untilDate),
            },
      )
    }),
  )

  results.forEach((result, index) => {
    if (result.status !== 'fulfilled') return
    const requestedMetric = ACCOUNT_METRICS[index]
    result.value.data?.forEach((series) => {
      const metric = series.name || requestedMetric
      const column = metricColumn(metric)
      if (!column) return

      series.values?.forEach((entry) => {
        if (!entry.end_time || typeof entry.value !== 'number') return
        const date = entry.end_time.slice(0, 10)
        const row = daily.get(date) || emptyDailyRow()
        row[column] = entry.value
        row.raw_metrics[metric] = entry.value
        daily.set(date, row)
      })

      if (typeof series.total_value?.value === 'number') {
        const date = isoDate()
        const row = daily.get(date) || emptyDailyRow()
        row[column] = series.total_value.value
        row.raw_metrics[metric] = series.total_value
        daily.set(date, row)
      }
    })
  })

  try {
    const followPayload = await graphGet<InsightPayload>(
      `${instagramUserId}/insights`,
      accessToken,
      { metric: 'follows_and_unfollows', period: 'day', metric_type: 'total_value' },
    )
    const date = isoDate()
    const row = daily.get(date) || emptyDailyRow()
    const resultsByType = followPayload.data?.[0]?.total_value?.breakdowns?.[0]?.results || []
    resultsByType.forEach((item) => {
      const type = item.dimension_values?.[0]?.toLowerCase()
      if (type === 'follows') row.follows = item.value ?? null
      if (type === 'unfollows') row.unfollows = item.value ?? null
    })
    row.raw_metrics.follows_and_unfollows = followPayload.data?.[0]?.total_value || null
    daily.set(date, row)
  } catch {
    // Nem todas as contas têm este breakdown disponível.
  }

  const today = isoDate()
  const todayRow = daily.get(today) || emptyDailyRow()
  if (typeof followersCount === 'number') todayRow.followers_count = followersCount
  daily.set(today, todayRow)
  return daily
}

async function fetchMediaCollection(
  instagramUserId: string,
  accessToken: string,
  edge: 'media' | 'stories',
) {
  const payload = await graphGet<MediaPayload>(`${instagramUserId}/${edge}`, accessToken, {
    fields: [
      'id',
      'caption',
      'media_type',
      'media_product_type',
      'media_url',
      'thumbnail_url',
      'permalink',
      'timestamp',
      'like_count',
      'comments_count',
    ].join(','),
    limit: edge === 'media' ? '50' : '25',
  })
  return (payload.data || []).map((media) => ({ ...media, is_story: edge === 'stories' }))
}

function mediaInsightMetrics(media: InstagramMediaPayload) {
  const product = media.media_product_type?.toUpperCase()
  if (media.is_story || product === 'STORY') return 'views,reach,replies'
  if (product === 'REELS') {
    return 'views,reach,total_interactions,likes,comments,shares,saved,ig_reels_avg_watch_time,ig_reels_video_view_total_time'
  }
  return 'views,reach,total_interactions,likes,comments,shares,saved'
}

function insightValue(payload: InsightPayload, ...names: string[]) {
  for (const name of names) {
    const metric = payload.data?.find((item) => item.name === name)
    const total = metric?.total_value?.value
    if (typeof total === 'number') return total
    const values = metric?.values || []
    const latest = values[values.length - 1]?.value
    if (typeof latest === 'number') return latest
  }
  return null
}

async function fetchMediaInsights(media: InstagramMediaPayload, accessToken: string) {
  try {
    return await graphGet<InsightPayload>(`${media.id}/insights`, accessToken, {
      metric: mediaInsightMetrics(media),
    })
  } catch {
    try {
      return await graphGet<InsightPayload>(`${media.id}/insights`, accessToken, { metric: 'reach' })
    } catch {
      return { data: [] } satisfies InsightPayload
    }
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
) {
  const output = new Array<R>(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++
      output[index] = await mapper(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return output
}

function safeSyncError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Falha desconhecida na sincronização.'
  if (/token|oauth|session|permission|access/i.test(message)) {
    return 'A autorização do Instagram expirou ou não possui as permissões necessárias.'
  }
  return message.slice(0, 500)
}

export async function syncInstagramConnection(
  connectionId: string,
  triggerSource: SyncTrigger,
): Promise<InstagramSyncResult> {
  const admin = createAdminClient()
  const { data: connectionData, error: connectionError } = await admin
    .from('instagram_connections')
    .select('id, project_id, instagram_user_id, token_secret_id, token_expires_at')
    .eq('id', connectionId)
    .single()
  if (connectionError || !connectionData) throw new Error('Conexão do Instagram não encontrada.')
  const connection = connectionData as ConnectionRow
  if (!connection.token_secret_id) throw new Error('A conexão não possui uma autorização válida.')

  const { data: run, error: runError } = await admin
    .from('instagram_sync_runs')
    .insert({
      connection_id: connection.id,
      project_id: connection.project_id,
      trigger_source: triggerSource,
      status: 'running',
    })
    .select('id')
    .single()
  if (runError || !run) throw new Error('Não foi possível iniciar a sincronização.')

  await admin
    .from('instagram_connections')
    .update({ status: 'syncing', last_error: null })
    .eq('id', connection.id)

  try {
    const { data: storedToken, error: tokenError } = await admin.rpc('get_instagram_token', {
      p_secret_id: connection.token_secret_id,
    })
    if (tokenError || typeof storedToken !== 'string' || !storedToken) {
      throw new Error('Não foi possível recuperar a autorização protegida.')
    }

    const refreshed = await refreshTokenIfNeeded(connection, storedToken)
    if (refreshed.accessToken !== storedToken) {
      const { error: rotateError } = await admin.rpc('set_instagram_token', {
        p_secret_id: connection.token_secret_id,
        p_token_value: refreshed.accessToken,
      })
      if (rotateError) throw new Error('Não foi possível renovar a autorização protegida.')
    }

    const profile = await fetchInstagramProfile(
      connection.instagram_user_id,
      refreshed.accessToken,
    )
    if (!profile.username) throw new Error('A Meta não retornou o perfil profissional.')

    const daily = await fetchAccountDaily(
      connection.instagram_user_id,
      refreshed.accessToken,
      profile.followers_count,
    )
    const accountRows = Array.from(daily.entries()).map(([metricDate, row]) => ({
      connection_id: connection.id,
      project_id: connection.project_id,
      metric_date: metricDate,
      ...row,
    }))
    if (accountRows.length) {
      const { error } = await admin
        .from('instagram_account_daily')
        .upsert(accountRows, { onConflict: 'connection_id,metric_date' })
      if (error) throw new Error('Não foi possível salvar o histórico da conta.')
    }

    const [mediaResult, storyResult] = await Promise.allSettled([
      fetchMediaCollection(connection.instagram_user_id, refreshed.accessToken, 'media'),
      fetchMediaCollection(connection.instagram_user_id, refreshed.accessToken, 'stories'),
    ])
    const combined = [
      ...(mediaResult.status === 'fulfilled' ? mediaResult.value : []),
      ...(storyResult.status === 'fulfilled' ? storyResult.value : []),
    ]
    const media = Array.from(new Map(combined.map((item) => [item.id, item])).values())
      .filter((item) => item.timestamp)

    if (media.length) {
      const { error } = await admin.from('instagram_media').upsert(
        media.map((item) => ({
          id: item.id,
          connection_id: connection.id,
          project_id: connection.project_id,
          caption: item.caption || null,
          media_type: item.media_type || null,
          media_product_type: item.media_product_type || (item.is_story ? 'STORY' : null),
          media_url: item.media_url || null,
          thumbnail_url: item.thumbnail_url || null,
          permalink: item.permalink || null,
          posted_at: item.timestamp,
          like_count: item.like_count ?? null,
          comments_count: item.comments_count ?? null,
          is_story: Boolean(item.is_story),
          raw_media: item,
        })),
        { onConflict: 'id' },
      )
      if (error) throw new Error('Não foi possível salvar os conteúdos do Instagram.')
    }

    const insightPairs = await mapWithConcurrency(media, 5, async (item) => ({
      item,
      payload: await fetchMediaInsights(item, refreshed.accessToken),
    }))
    const collectedOn = isoDate()
    if (insightPairs.length) {
      const { error } = await admin.from('instagram_media_insights').upsert(
        insightPairs.map(({ item, payload }) => ({
          media_id: item.id,
          connection_id: connection.id,
          project_id: connection.project_id,
          collected_on: collectedOn,
          views: insightValue(payload, 'views', 'video_views'),
          reach: insightValue(payload, 'reach'),
          plays: insightValue(payload, 'plays'),
          total_interactions: insightValue(payload, 'total_interactions'),
          likes: insightValue(payload, 'likes') ?? item.like_count ?? null,
          comments: insightValue(payload, 'comments') ?? item.comments_count ?? null,
          shares: insightValue(payload, 'shares'),
          saves: insightValue(payload, 'saved', 'saves'),
          replies: insightValue(payload, 'replies'),
          average_watch_time_ms: insightValue(payload, 'ig_reels_avg_watch_time'),
          total_watch_time_ms: insightValue(payload, 'ig_reels_video_view_total_time'),
          raw_metrics: payload.data || [],
        })),
        { onConflict: 'media_id,collected_on' },
      )
      if (error) throw new Error('Não foi possível salvar as métricas dos conteúdos.')
    }

    const syncedAt = new Date().toISOString()
    const { error: finishError } = await admin
      .from('instagram_connections')
      .update({
        username: profile.username,
        name: profile.name || null,
        account_type: profile.account_type || null,
        profile_picture_url: profile.profile_picture_url || null,
        followers_count: profile.followers_count ?? null,
        media_count: profile.media_count ?? null,
        token_expires_at: refreshed.expiresAt || connection.token_expires_at,
        status: 'connected',
        last_synced_at: syncedAt,
        last_error: null,
      })
      .eq('id', connection.id)
    if (finishError) throw new Error('Não foi possível finalizar a sincronização.')

    await admin.from('instagram_sync_runs').update({
      status: 'success',
      finished_at: syncedAt,
      account_days_synced: accountRows.length,
      media_synced: media.length,
    }).eq('id', run.id)

    return {
      syncedAt,
      accountDaysSynced: accountRows.length,
      mediaSynced: media.length,
    }
  } catch (error) {
    const message = safeSyncError(error)
    const expired = error instanceof InstagramApiError && [190, 102].includes(error.code || 0)
    await Promise.all([
      admin.from('instagram_connections').update({
        status: expired ? 'expired' : 'error',
        last_error: message,
      }).eq('id', connection.id),
      admin.from('instagram_sync_runs').update({
        status: 'error',
        finished_at: new Date().toISOString(),
        error_message: message,
      }).eq('id', run.id),
    ])
    throw new Error(message)
  }
}
