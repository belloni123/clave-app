import 'server-only'

import { createAdminClient } from '@/utils/supabase/admin'

const DEFAULT_API_VERSION = 'v26.0'
const DAILY_TOTAL_METRICS = [
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
const DAILY_REQUIRED_METRICS = [
  'views',
  'profile_links_taps',
  'accounts_engaged',
  'total_interactions',
] as const
const PERIOD_TOTAL_METRICS = [
  'reach',
  ...DAILY_TOTAL_METRICS,
] as const
const INSIGHTS_RANGE_DAYS = 30
const ACCOUNT_HISTORY_DAYS = 90
const RECENT_DAYS_TO_REFRESH = 3
const DAILY_BACKFILL_BATCH_SIZE = 30

type SyncTrigger = 'oauth' | 'manual' | 'cron'

interface ConnectionRow {
  id: string
  project_id: string
  instagram_user_id: string
  token_secret_id: string | null
  token_expires_at: string | null
  status: 'connected' | 'syncing' | 'error' | 'expired'
  updated_at: string
}

interface MetaErrorPayload {
  error?: {
    message?: string
    code?: number
    error_subcode?: number
  }
  error_type?: string
  error_message?: string
  code?: number
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

interface FacebookPagesPayload extends MetaErrorPayload {
  data?: Array<{
    id?: string
    name?: string
    instagram_business_account?: { id?: string }
  }>
}

interface FacebookPermissionsPayload extends MetaErrorPayload {
  data?: Array<{
    permission?: string
    status?: string
  }>
}

interface FacebookTokenPayload extends MetaErrorPayload {
  access_token?: string
  token_type?: string
  expires_in?: number
}

interface FacebookDebugTokenPayload extends MetaErrorPayload {
  data?: {
    app_id?: string
    type?: string
    is_valid?: boolean
    expires_at?: number
    data_access_expires_at?: number
    scopes?: string[]
  }
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

interface StoredDailyRow extends DailyRow {
  metric_date: string
}

interface AccountPeriodRow {
  window_days: 7 | 30 | 90
  window_kind: 'current' | 'previous'
  period_start: string
  period_end: string
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
  follows: number | null
  unfollows: number | null
  raw_metrics: Record<string, unknown>
  collected_at: string
}

interface AccountMetricCapabilities {
  profileViews?: boolean
}

export interface InstagramSyncResult {
  syncedAt: string
  accountDaysSynced: number
  mediaSynced: number
}

export interface FacebookInstagramAccount {
  pageId: string
  pageName: string
  instagramUserId: string
  username: string
  name: string | null
  accountType: string | null
  profilePictureUrl: string | null
  followersCount: number | null
  mediaCount: number | null
}

class InstagramApiError extends Error {
  constructor(message: string, readonly code?: number) {
    super(message)
    this.name = 'InstagramApiError'
  }
}

function isMetaThrottleError(error: unknown) {
  return error instanceof InstagramApiError && [4, 17, 32, 613].includes(error.code || 0)
}

function apiVersion() {
  return process.env.INSTAGRAM_GRAPH_API_VERSION?.trim() || DEFAULT_API_VERSION
}

function graphBase() {
  return `https://graph.facebook.com/${apiVersion()}`
}

async function readJson<T extends MetaErrorPayload>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as T
  if (!response.ok || payload.error || payload.error_message) {
    const message = payload.error?.message
      || payload.error_message
      || 'A Meta não conseguiu concluir a solicitação.'
    throw new InstagramApiError(message, payload.error?.code ?? payload.code)
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
    signal: AbortSignal.timeout(15_000),
  })
  return readJson<T>(response)
}

export async function exchangeFacebookLongLivedToken(accessToken: string) {
  const appId = process.env.META_APP_ID?.trim()
  const appSecret = process.env.INSTAGRAM_APP_SECRET?.trim()
  if (!appId || !appSecret) {
    throw new Error('As credenciais do aplicativo da Meta não foram configuradas.')
  }

  const url = new URL(`${graphBase()}/oauth/access_token`)
  url.searchParams.set('grant_type', 'fb_exchange_token')
  url.searchParams.set('client_id', appId)
  url.searchParams.set('client_secret', appSecret)
  url.searchParams.set('fb_exchange_token', accessToken)
  const response = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
  const payload = await readJson<FacebookTokenPayload>(response)
  if (!payload.access_token) {
    throw new Error('A Meta não retornou uma autorização de longa duração.')
  }
  return {
    accessToken: payload.access_token,
    expiresIn: typeof payload.expires_in === 'number'
      ? payload.expires_in
      : 60 * 24 * 60 * 60,
  }
}

export async function fetchInstagramProfile(
  instagramUserId: string,
  accessToken: string,
) {
  const richFields = [
    'id',
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
      fields: 'id,username,name,profile_picture_url,followers_count,media_count',
    })
  }
}

export async function fetchFacebookGrantedScopes(accessToken: string) {
  const payload = await graphGet<FacebookPermissionsPayload>('me/permissions', accessToken)
  return (payload.data || [])
    .filter((item) => item.status === 'granted' && item.permission)
    .map((item) => item.permission as string)
}

export async function inspectFacebookSystemUserToken(accessToken: string) {
  const appId = process.env.META_APP_ID?.trim()
  const appSecret = process.env.INSTAGRAM_APP_SECRET?.trim()
  if (!appId || !appSecret) {
    throw new Error('As credenciais do aplicativo da Meta não foram configuradas.')
  }

  const payload = await graphGet<FacebookDebugTokenPayload>(
    'debug_token',
    `${appId}|${appSecret}`,
    { input_token: accessToken },
  )
  const token = payload.data
  const nowSeconds = Math.floor(Date.now() / 1_000)
  const expiresAt = token?.expires_at || 0
  const dataAccessExpiresAt = token?.data_access_expires_at || 0
  if (
    !token?.is_valid
    || String(token.app_id) !== appId
    || token.type?.toUpperCase() !== 'SYSTEM_USER'
    || (expiresAt > 0 && expiresAt <= nowSeconds)
    || (dataAccessExpiresAt > 0 && dataAccessExpiresAt <= nowSeconds)
  ) {
    throw new Error('O acesso central da BM é inválido, expirou ou pertence a outro aplicativo.')
  }
  return token.scopes || []
}

async function fetchFacebookBusinessPageCandidates(accessToken: string) {
  const businessId = process.env.META_BUSINESS_ID?.trim()
  if (!businessId) {
    throw new Error('A BM autorizada para o Instagram não foi configurada.')
  }

  const pageParams = {
    fields: 'id,name,instagram_business_account',
    limit: '100',
  }
  const [ownedPages, clientPages] = await Promise.all([
    graphGet<FacebookPagesPayload>(`${businessId}/owned_pages`, accessToken, pageParams),
    graphGet<FacebookPagesPayload>(`${businessId}/client_pages`, accessToken, pageParams),
  ])
  const businessPages = Array.from(new Map(
    [...(ownedPages.data || []), ...(clientPages.data || [])]
      .filter((page) => page.id)
      .map((page) => [page.id as string, page]),
  ).values())
  return businessPages.flatMap((page) => {
    const instagramUserId = page.instagram_business_account?.id
    if (!page.id || !page.name || !instagramUserId) return []
    return [{ pageId: page.id, pageName: page.name, instagramUserId }]
  })
}

async function fetchFacebookUserPageCandidates(accessToken: string) {
  const payload = await graphGet<FacebookPagesPayload>('me/accounts', accessToken, {
    fields: 'id,name,instagram_business_account',
    limit: '100',
  })
  return (payload.data || []).flatMap((page) => {
    const instagramUserId = page.instagram_business_account?.id
    if (!page.id || !page.name || !instagramUserId) return []
    return [{ pageId: page.id, pageName: page.name, instagramUserId }]
  })
}

async function fetchFacebookAllowedPageCandidates(
  accessToken: string,
  source: 'business' | 'oauth',
) {
  if (source === 'business') return fetchFacebookBusinessPageCandidates(accessToken)

  const businessToken = process.env.META_SYSTEM_USER_TOKEN?.trim() || accessToken
  const [userPages, businessPages] = await Promise.all([
    fetchFacebookUserPageCandidates(accessToken),
    fetchFacebookBusinessPageCandidates(businessToken),
  ])
  const allowedInstagramIds = new Set(
    businessPages.map((page) => page.instagramUserId),
  )
  return userPages.filter((page) => allowedInstagramIds.has(page.instagramUserId))
}

async function hydrateFacebookInstagramAccount(
  candidate: { pageId: string; pageName: string; instagramUserId: string },
  accessToken: string,
): Promise<FacebookInstagramAccount | null> {
  try {
    const profile = await fetchInstagramProfile(candidate.instagramUserId, accessToken)
    if (!profile.username) return null
    return {
      ...candidate,
      username: profile.username,
      name: profile.name || null,
      accountType: profile.account_type || null,
      profilePictureUrl: profile.profile_picture_url || null,
      followersCount: profile.followers_count ?? null,
      mediaCount: profile.media_count ?? null,
    }
  } catch {
    return null
  }
}

export async function fetchFacebookInstagramAccounts(
  accessToken: string,
  source: 'business' | 'oauth',
): Promise<FacebookInstagramAccount[]> {
  const candidates = await fetchFacebookAllowedPageCandidates(accessToken, source)
  const accounts = await mapWithConcurrency(
    candidates,
    6,
    (candidate) => hydrateFacebookInstagramAccount(candidate, accessToken),
  )
  return accounts.filter((account): account is FacebookInstagramAccount => Boolean(account))
}

export async function fetchFacebookInstagramAccount(
  accessToken: string,
  instagramUserId: string,
  source: 'business' | 'oauth',
) {
  const candidates = await fetchFacebookAllowedPageCandidates(accessToken, source)
  const candidate = candidates.find((item) => item.instagramUserId === instagramUserId)
  if (!candidate) return null
  return hydrateFacebookInstagramAccount(candidate, accessToken)
}

async function refreshTokenIfNeeded(connection: ConnectionRow, accessToken: string) {
  if (!connection.token_expires_at) return { accessToken, expiresAt: null as string | null }
  if (new Date(connection.token_expires_at).getTime() <= Date.now()) {
    throw new InstagramApiError('A autorização do Instagram expirou. Reconecte a conta.', 190)
  }
  return { accessToken, expiresAt: null as string | null }
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

type AccountMetricColumn = Exclude<keyof DailyRow, 'followers_count' | 'raw_metrics'>

function metricColumn(metric: string): AccountMetricColumn | null {
  const columns: Record<string, AccountMetricColumn> = {
    follower_count: 'follows',
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

function utcStartOfDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

function addUtcDays(value: Date, days: number) {
  const result = new Date(value)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

function unixSeconds(value: Date) {
  return Math.floor(value.getTime() / 1_000).toString()
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined) return null
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

function storedDailyRow(row: StoredDailyRow): DailyRow {
  const rawMetrics = row.raw_metrics && typeof row.raw_metrics === 'object'
    ? row.raw_metrics
    : {}
  return {
    followers_count: numberOrNull(row.followers_count),
    follows: numberOrNull(row.follows),
    unfollows: numberOrNull(row.unfollows),
    reach: numberOrNull(row.reach),
    views: numberOrNull(row.views),
    profile_views: numberOrNull(row.profile_views),
    profile_links_taps: numberOrNull(row.profile_links_taps),
    accounts_engaged: numberOrNull(row.accounts_engaged),
    total_interactions: numberOrNull(row.total_interactions),
    likes: numberOrNull(row.likes),
    comments: numberOrNull(row.comments),
    shares: numberOrNull(row.shares),
    saves: numberOrNull(row.saves),
    replies: numberOrNull(row.replies),
    raw_metrics: { ...rawMetrics },
  }
}

function setDailyMetric(row: DailyRow, column: AccountMetricColumn, value: number) {
  const metrics = row as unknown as Record<AccountMetricColumn, number | null>
  metrics[column] = value
}

function addWarning(warnings: string[], label: string, error: unknown) {
  if (warnings.length >= 25) return
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string' ? error : 'Falha desconhecida.'
  warnings.push(`${label}: ${message.slice(0, 240)}`)
}

function insightChunks(start: Date, end: Date) {
  const chunks: Array<{ start: Date; end: Date }> = []
  let cursor = new Date(start)
  while (cursor.getTime() < end.getTime()) {
    const proposedEnd = addUtcDays(cursor, INSIGHTS_RANGE_DAYS)
    const chunkEnd = proposedEnd.getTime() < end.getTime() ? proposedEnd : new Date(end)
    chunks.push({ start: new Date(cursor), end: chunkEnd })
    cursor = chunkEnd
  }
  return chunks
}

function totalValueParams(metrics: readonly string[], start: Date, end: Date) {
  return {
    metric: metrics.join(','),
    period: 'day',
    metric_type: 'total_value',
    since: unixSeconds(start),
    until: unixSeconds(end),
  }
}

async function fetchTotalValuePayload(
  instagramUserId: string,
  accessToken: string,
  metrics: readonly string[],
  start: Date,
  end: Date,
  label: string,
  warnings: string[],
  capabilities: AccountMetricCapabilities,
) {
  const requestedMetrics = capabilities.profileViews === false
    ? metrics.filter((metric) => metric !== 'profile_views')
    : metrics
  try {
    const payload = await graphGet<InsightPayload>(
      `${instagramUserId}/insights`,
      accessToken,
      totalValueParams(requestedMetrics, start, end),
    )
    if (
      requestedMetrics.includes('profile_views')
      && payload.data?.some((series) => series.name === 'profile_views')
    ) {
      capabilities.profileViews = true
    }
    return payload
  } catch (error) {
    const isProfileViewsCompatibilityError = error instanceof InstagramApiError
      && error.code === 100
      && /profile_views/i.test(error.message)
    if (!requestedMetrics.includes('profile_views') || !isProfileViewsCompatibilityError) throw error
    capabilities.profileViews = false
    addWarning(warnings, `${label}/profile_views`, error)
    return graphGet<InsightPayload>(
      `${instagramUserId}/insights`,
      accessToken,
      totalValueParams(requestedMetrics.filter((metric) => metric !== 'profile_views'), start, end),
    )
  }
}

function applyDailyTotalPayload(row: DailyRow, payload: InsightPayload) {
  const returnedMetrics = new Set<string>()
  payload.data?.forEach((series) => {
    const metric = series.name || ''
    const column = metricColumn(metric)
    const value = series.total_value?.value
    if (!column || typeof value !== 'number') return
    returnedMetrics.add(metric)
    setDailyMetric(row, column, value)
    row.raw_metrics[metric] = series.total_value || value
  })
  return returnedMetrics
}

async function fetchAccountDaily(
  instagramUserId: string,
  accessToken: string,
  followersCount: number | undefined,
  existingRows: StoredDailyRow[],
  warnings: string[],
  capabilities: AccountMetricCapabilities,
) {
  const now = new Date()
  const todayStart = utcStartOfDay(now)
  const historyStart = addUtcDays(todayStart, -(ACCOUNT_HISTORY_DAYS - 1))
  const daily = new Map<string, DailyRow>(
    existingRows.map((row) => [row.metric_date, storedDailyRow(row)]),
  )

  const timeSeriesChunks = insightChunks(historyStart, now)
  await mapWithConcurrency(timeSeriesChunks, 3, async (chunk) => {
    try {
      const payload = await graphGet<InsightPayload>(
        `${instagramUserId}/insights`,
        accessToken,
        {
          metric: 'reach,follower_count',
          period: 'day',
          metric_type: 'time_series',
          since: unixSeconds(chunk.start),
          until: unixSeconds(chunk.end),
        },
      )
      payload.data?.forEach((series) => {
        const metric = series.name || ''
        const column = metricColumn(metric)
        if (!column) return
        series.values?.forEach((entry) => {
          if (!entry.end_time || typeof entry.value !== 'number') return
          const date = entry.end_time.slice(0, 10)
          const row = daily.get(date) || emptyDailyRow()
          setDailyMetric(row, column, entry.value)
          row.raw_metrics[metric] = { value: entry.value, end_time: entry.end_time }
          daily.set(date, row)
        })
      })
    } catch (error) {
      addWarning(warnings, `time_series/${isoDate(chunk.start)}`, error)
    }
  })

  const allDates = Array.from({ length: ACCOUNT_HISTORY_DAYS }, (_, index) => (
    isoDate(addUtcDays(historyStart, index))
  ))
  const recentStart = isoDate(addUtcDays(todayStart, -(RECENT_DAYS_TO_REFRESH - 1)))
  const recentDates = allDates.filter((date) => date >= recentStart)
  const missingBackfillDates = allDates.filter((date) => {
    const marker = daily.get(date)?.raw_metrics._totals_checked_at
    return date < recentStart && typeof marker !== 'string'
  }).reverse().slice(0, DAILY_BACKFILL_BATCH_SIZE)
  const datesToRefresh = [...recentDates, ...missingBackfillDates]
  recentDates.forEach((date) => {
    const row = daily.get(date)
    if (!row) return
    delete row.raw_metrics._totals_checked_at
    delete row.raw_metrics._totals_collected_at
  })
  let throttleError: unknown = null

  await mapWithConcurrency(datesToRefresh, 5, async (date) => {
    if (throttleError) return
    const start = new Date(`${date}T00:00:00.000Z`)
    const nextDay = addUtcDays(start, 1)
    const end = nextDay.getTime() > now.getTime() ? now : nextDay
    try {
      const payload = await fetchTotalValuePayload(
        instagramUserId,
        accessToken,
        DAILY_TOTAL_METRICS,
        start,
        end,
        `daily/${date}`,
        warnings,
        capabilities,
      )
      const row = daily.get(date) || emptyDailyRow()
      const returnedMetrics = applyDailyTotalPayload(row, payload)
      row.raw_metrics._total_metrics_returned = Array.from(returnedMetrics)
      const hasRequiredMetrics = DAILY_REQUIRED_METRICS.every((metric) => (
        returnedMetrics.has(metric)
      ))
      row.raw_metrics._totals_checked_at = now.toISOString()
      if (hasRequiredMetrics) row.raw_metrics._totals_collected_at = now.toISOString()
      else {
        row.raw_metrics._total_metrics_missing = DAILY_REQUIRED_METRICS.filter((metric) => (
          !returnedMetrics.has(metric)
        ))
        addWarning(warnings, `daily/${date}`, 'Resposta sem todas as métricas essenciais.')
      }
      daily.set(date, row)
    } catch (error) {
      if (isMetaThrottleError(error)) throttleError = error
      addWarning(warnings, `daily/${date}`, error)
    }
  })
  if (throttleError) throw throttleError

  const today = isoDate()
  const todayRow = daily.get(today) || emptyDailyRow()
  if (typeof followersCount === 'number') todayRow.followers_count = followersCount
  daily.set(today, todayRow)
  return daily
}

function emptyPeriodMetrics() {
  return {
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
  } satisfies Record<AccountMetricColumn, number | null>
}

function addPeriodMetric(
  metrics: Record<AccountMetricColumn, number | null>,
  column: AccountMetricColumn,
  value: number,
) {
  metrics[column] = (metrics[column] ?? 0) + value
}

async function fetchAccountPeriod(
  instagramUserId: string,
  accessToken: string,
  windowDays: 7 | 30 | 90,
  windowKind: 'current' | 'previous',
  start: Date,
  end: Date,
  periodEnd: string,
  warnings: string[],
  capabilities: AccountMetricCapabilities,
): Promise<AccountPeriodRow> {
  const chunks = insightChunks(start, end)
  const metrics = emptyPeriodMetrics()
  const rawMetrics: Record<string, unknown> = {
    chunks: [],
    reach_semantics: chunks.length > 1 ? 'accumulated_unique_per_chunk' : 'unique',
  }
  const metricChunkCounts: Partial<Record<AccountMetricColumn, number>> = {}
  let completeFollowChunks = 0

  await mapWithConcurrency(chunks, 3, async (chunk) => {
    const label = `${windowKind}_${windowDays}/${isoDate(chunk.start)}`
    const [totalsResult, followsResult] = await Promise.allSettled([
      fetchTotalValuePayload(
        instagramUserId,
        accessToken,
        PERIOD_TOTAL_METRICS,
        chunk.start,
        chunk.end,
        label,
        warnings,
        capabilities,
      ),
      graphGet<InsightPayload>(`${instagramUserId}/insights`, accessToken, {
        metric: 'follows_and_unfollows',
        period: 'day',
        metric_type: 'total_value',
        breakdown: 'follow_type',
        since: unixSeconds(chunk.start),
        until: unixSeconds(chunk.end),
      }),
    ])

    const chunkRaw: Record<string, unknown> = {
      start: isoDate(chunk.start),
      end: isoDate(chunk.end),
    }
    if (totalsResult.status === 'fulfilled') {
      chunkRaw.metrics = totalsResult.value.data || []
      totalsResult.value.data?.forEach((series) => {
        const column = metricColumn(series.name || '')
        const value = series.total_value?.value
        if (!column || typeof value !== 'number') return
        metricChunkCounts[column] = (metricChunkCounts[column] || 0) + 1
        addPeriodMetric(metrics, column, value)
      })
    } else {
      addWarning(warnings, `${label}/totals`, totalsResult.reason)
    }

    if (followsResult.status === 'fulfilled') {
      chunkRaw.follows_and_unfollows = followsResult.value.data || []
      const breakdown = followsResult.value.data?.[0]?.total_value?.breakdowns?.[0]
      if (breakdown) {
        let chunkFollows = 0
        let chunkUnfollows = 0
        let validBreakdown = true
        ;(breakdown.results || []).forEach((item) => {
          const dimension = item.dimension_values?.[0]?.toUpperCase()
          if (typeof item.value !== 'number') {
            validBreakdown = false
            return
          }
          if (dimension === 'FOLLOWER') chunkFollows += item.value
          else if (dimension === 'NON_FOLLOWER') chunkUnfollows += item.value
          else if (item.value !== 0) validBreakdown = false
        })
        if (validBreakdown) {
          completeFollowChunks += 1
          addPeriodMetric(metrics, 'follows', chunkFollows)
          addPeriodMetric(metrics, 'unfollows', chunkUnfollows)
        } else {
          addWarning(warnings, `${label}/follows`, 'Detalhamento retornado com categoria desconhecida.')
        }
      } else {
        addWarning(warnings, `${label}/follows`, 'Resposta sem o detalhamento por tipo.')
      }
    } else {
      addWarning(warnings, `${label}/follows`, followsResult.reason)
    }
    ;(rawMetrics.chunks as unknown[]).push(chunkRaw)
  })

  const periodMetricColumns = Object.keys(metrics)
    .filter((column): column is AccountMetricColumn => !['follows', 'unfollows'].includes(column))
  periodMetricColumns.forEach((column) => {
    if (metricChunkCounts[column] !== chunks.length) metrics[column] = null
  })
  rawMetrics.metric_chunk_counts = metricChunkCounts
  const coreMetricsComplete = (['reach', 'views', 'total_interactions'] as const)
    .every((column) => metricChunkCounts[column] === chunks.length)
  if (!coreMetricsComplete) {
    throw new Error(`A Meta não retornou o período completo de ${windowDays} dias.`)
  }
  if (completeFollowChunks !== chunks.length) {
    metrics.follows = null
    metrics.unfollows = null
    rawMetrics.follows_complete = false
  } else {
    rawMetrics.follows_complete = true
  }

  return {
    window_days: windowDays,
    window_kind: windowKind,
    period_start: isoDate(start),
    period_end: periodEnd,
    ...metrics,
    raw_metrics: rawMetrics,
    collected_at: new Date().toISOString(),
  }
}

async function fetchAccountPeriods(
  instagramUserId: string,
  accessToken: string,
  warnings: string[],
  capabilities: AccountMetricCapabilities,
) {
  const now = new Date()
  const todayStart = utcStartOfDay(now)
  const definitions: Array<{
    days: 7 | 30 | 90
    kind: 'current' | 'previous'
    start: Date
    end: Date
    periodEnd: string
  }> = []

  ;([7, 30, 90] as const).forEach((days) => {
    const currentStart = addUtcDays(todayStart, -(days - 1))
    definitions.push({
      days,
      kind: 'current',
      start: currentStart,
      end: now,
      periodEnd: isoDate(todayStart),
    })
    if (days !== 90) {
      definitions.push({
        days,
        kind: 'previous',
        start: addUtcDays(currentStart, -days),
        end: currentStart,
        periodEnd: isoDate(addUtcDays(currentStart, -1)),
      })
    }
  })

  return mapWithConcurrency(definitions, 1, (definition) => fetchAccountPeriod(
    instagramUserId,
    accessToken,
    definition.days,
    definition.kind,
    definition.start,
    definition.end,
    definition.periodEnd,
    warnings,
    capabilities,
  ))
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
  } catch (error) {
    if (isMetaThrottleError(error)) throw error
    const canRetryWithReachOnly = error instanceof InstagramApiError
      && [10, 100].includes(error.code || 0)
    if (!canRetryWithReachOnly) return { data: [] } satisfies InsightPayload
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
    .select('id, project_id, instagram_user_id, token_secret_id, token_expires_at, status, updated_at')
    .eq('id', connectionId)
    .single()
  if (connectionError || !connectionData) throw new Error('Conexão do Instagram não encontrada.')
  const connection = connectionData as ConnectionRow
  if (!connection.token_secret_id) throw new Error('A conexão não possui uma autorização válida.')

  const syncingIsRecent = connection.status === 'syncing'
    && Date.now() - new Date(connection.updated_at).getTime() < 15 * 60 * 1_000
  if (syncingIsRecent) throw new Error('A conta já está sendo sincronizada.')

  const { data: claimed, error: claimError } = await admin
    .from('instagram_connections')
    .update({ status: 'syncing', last_error: null })
    .eq('id', connection.id)
    .eq('updated_at', connection.updated_at)
    .select('id')
    .maybeSingle()
  if (claimError) throw new Error('Não foi possível bloquear a conexão para sincronização.')
  if (!claimed) throw new Error('A conta já está sendo sincronizada.')

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
  if (runError || !run) {
    await admin
      .from('instagram_connections')
      .update({ status: 'error', last_error: 'Não foi possível iniciar a sincronização.' })
      .eq('id', connection.id)
    throw new Error('Não foi possível iniciar a sincronização.')
  }

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

    const accountHistoryStart = addUtcDays(
      utcStartOfDay(new Date()),
      -(ACCOUNT_HISTORY_DAYS - 1),
    )
    const { data: existingDailyData, error: existingDailyError } = await admin
      .from('instagram_account_daily')
      .select([
        'metric_date',
        'followers_count',
        'follows',
        'unfollows',
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
        'raw_metrics',
      ].join(','))
      .eq('connection_id', connection.id)
      .gte('metric_date', isoDate(accountHistoryStart))
    if (existingDailyError) throw new Error('Não foi possível ler o histórico da conta.')

    const accountMetricWarnings: string[] = []
    const accountMetricCapabilities: AccountMetricCapabilities = {}
    const daily = await fetchAccountDaily(
      connection.instagram_user_id,
      refreshed.accessToken,
      profile.followers_count,
      (existingDailyData || []) as unknown as StoredDailyRow[],
      accountMetricWarnings,
      accountMetricCapabilities,
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

    await admin.from('instagram_sync_runs').update({
      account_days_synced: accountRows.length,
      details: { account_metric_warnings: accountMetricWarnings },
    }).eq('id', run.id)

    const accountPeriods = await fetchAccountPeriods(
      connection.instagram_user_id,
      refreshed.accessToken,
      accountMetricWarnings,
      accountMetricCapabilities,
    )
    const periodRows = accountPeriods.map((row) => ({
      connection_id: connection.id,
      project_id: connection.project_id,
      ...row,
    }))
    if (periodRows.length) {
      const { error } = await admin
        .from('instagram_account_period_totals')
        .upsert(periodRows, { onConflict: 'connection_id,window_days,window_kind' })
      if (error) throw new Error('Não foi possível salvar os totais por período.')
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

    const collectedOn = isoDate()
    const existingInsightResult = media.length
      ? await admin
          .from('instagram_media_insights')
          .select('media_id,views,reach,total_interactions')
          .eq('connection_id', connection.id)
          .eq('collected_on', collectedOn)
          .in('media_id', media.map((item) => item.id))
      : { data: [], error: null }
    if (existingInsightResult.error) {
      throw new Error('Não foi possível verificar as métricas já coletadas hoje.')
    }
    const collectedToday = new Set(
      (existingInsightResult.data || [])
        .filter((item) => (
          item.views !== null
          || item.reach !== null
          || item.total_interactions !== null
        ))
        .map((item) => item.media_id),
    )
    const mediaToRefresh = media.filter((item) => !collectedToday.has(item.id))
    const insightPairs = await mapWithConcurrency(mediaToRefresh, 5, async (item) => ({
      item,
      payload: await fetchMediaInsights(item, refreshed.accessToken),
    }))
    const validInsightPairs = insightPairs.filter(({ payload }) => Boolean(payload.data?.length))
    if (validInsightPairs.length) {
      const { error } = await admin.from('instagram_media_insights').upsert(
        validInsightPairs.map(({ item, payload }) => ({
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

    if (accountMetricWarnings.length) {
      console.warn('[instagram-sync] Coleta parcial de métricas da conta', {
        connectionId: connection.id,
        warnings: accountMetricWarnings,
      })
    }

    await admin.from('instagram_sync_runs').update({
      status: 'success',
      finished_at: syncedAt,
      account_days_synced: accountRows.length,
      media_synced: media.length,
      details: {
        account_periods_synced: periodRows.length,
        account_metric_warnings: accountMetricWarnings,
      },
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
