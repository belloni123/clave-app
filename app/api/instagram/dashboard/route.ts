import { NextRequest, NextResponse } from 'next/server'
import {
  authorizeInstagramProject,
  InstagramAccessError,
  userCanUseInstagramBusinessToken,
} from '@/utils/instagram/access'
import { createAdminClient } from '@/utils/supabase/admin'
import type {
  InstagramConnectionPublic,
  InstagramDailyMetric,
  InstagramDashboardResponse,
  InstagramMediaMetric,
  InstagramPeriodMetric,
} from '@/types/instagram'

interface ConnectionRow {
  id: string
  project_id: string
  instagram_user_id: string
  username: string
  name: string | null
  account_type: string | null
  profile_picture_url: string | null
  followers_count: number | null
  media_count: number | null
  status: InstagramConnectionPublic['status']
  connected_at: string
  last_synced_at: string | null
  last_error: string | null
}

interface PeriodRow {
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
  collected_at: string
}

const DAILY_SELECT = 'metric_date,followers_count,follows,unfollows,reach,views,profile_views,profile_links_taps,accounts_engaged,total_interactions,likes,comments,shares,saves,replies' as const
const PERIOD_SELECT = 'window_days,window_kind,period_start,period_end,reach,views,profile_views,profile_links_taps,accounts_engaged,total_interactions,likes,comments,shares,saves,replies,follows,unfollows,collected_at' as const
const MEDIA_SELECT = 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,posted_at,like_count,comments_count,is_story' as const
const INSIGHTS_SELECT = 'media_id,collected_on,views,reach,plays,total_interactions,likes,comments,shares,saves,replies,average_watch_time_ms,total_watch_time_ms' as const

function numeric(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const result = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(result) ? result : null
}

function mapPeriod(item: PeriodRow | undefined): InstagramPeriodMetric | null {
  if (!item) return null
  return {
    windowDays: item.window_days,
    periodStart: item.period_start,
    periodEnd: item.period_end,
    reach: numeric(item.reach),
    views: numeric(item.views),
    profileViews: numeric(item.profile_views),
    profileLinksTaps: numeric(item.profile_links_taps),
    accountsEngaged: numeric(item.accounts_engaged),
    totalInteractions: numeric(item.total_interactions),
    likes: numeric(item.likes),
    comments: numeric(item.comments),
    shares: numeric(item.shares),
    saves: numeric(item.saves),
    replies: numeric(item.replies),
    follows: numeric(item.follows),
    unfollows: numeric(item.unfollows),
    collectedAt: item.collected_at,
  }
}

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('projectId')?.trim() || ''
  const requestedDays = Number(request.nextUrl.searchParams.get('days') || 30)
  const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 30

  try {
    const { user, supabase } = await authorizeInstagramProject(projectId)
    const { data: canManage } = await supabase.rpc('user_can_administer_project', {
      proj_id: projectId,
      usr_id: user.id,
    })
    const canUseBusinessAccounts = Boolean(canManage)
      && Boolean(process.env.META_SYSTEM_USER_TOKEN?.trim())
      && await userCanUseInstagramBusinessToken(supabase, user.id)
    const admin = createAdminClient()
    const { data: row, error: connectionError } = await admin
      .from('instagram_connections')
      .select([
        'id',
        'project_id',
        'instagram_user_id',
        'username',
        'name',
        'account_type',
        'profile_picture_url',
        'followers_count',
        'media_count',
        'status',
        'connected_at',
        'last_synced_at',
        'last_error',
      ].join(','))
      .eq('project_id', projectId)
      .maybeSingle()
    if (connectionError) throw connectionError

    if (!row) {
      const empty: InstagramDashboardResponse = {
        connection: null,
        canManage: Boolean(canManage),
        canUseBusinessAccounts,
        days,
        daily: [],
        summary: { current: null, previous: null },
        media: [],
      }
      return NextResponse.json(empty)
    }

    const connectionRow = row as unknown as ConnectionRow
    const connection: InstagramConnectionPublic = {
      id: connectionRow.id,
      projectId: connectionRow.project_id,
      instagramUserId: connectionRow.instagram_user_id,
      username: connectionRow.username,
      name: connectionRow.name,
      accountType: connectionRow.account_type,
      profilePictureUrl: connectionRow.profile_picture_url,
      followersCount: numeric(connectionRow.followers_count),
      mediaCount: numeric(connectionRow.media_count),
      status: connectionRow.status,
      connectedAt: connectionRow.connected_at,
      lastSyncedAt: connectionRow.last_synced_at,
      lastError: connectionRow.last_error,
    }

    const historyStart = new Date()
    historyStart.setUTCDate(historyStart.getUTCDate() - days * 2)
    const mediaStart = new Date()
    mediaStart.setUTCDate(mediaStart.getUTCDate() - days)
    const [dailyResult, periodResult, mediaResult] = await Promise.all([
      admin
        .from('instagram_account_daily')
        .select(DAILY_SELECT)
        .eq('connection_id', connectionRow.id)
        .gte('metric_date', historyStart.toISOString().slice(0, 10))
        .order('metric_date', { ascending: true }),
      admin
        .from('instagram_account_period_totals')
        .select(PERIOD_SELECT)
        .eq('connection_id', connectionRow.id)
        .eq('window_days', days),
      admin
        .from('instagram_media')
        .select(MEDIA_SELECT)
        .eq('connection_id', connectionRow.id)
        .gte('posted_at', mediaStart.toISOString())
        .order('posted_at', { ascending: false })
        .limit(50),
    ])
    if (dailyResult.error) throw dailyResult.error
    if (periodResult.error) throw periodResult.error
    if (mediaResult.error) throw mediaResult.error

    const mediaRows = mediaResult.data || []
    const mediaIds = mediaRows.map((item) => item.id)
    const insightHistoryStart = new Date()
    insightHistoryStart.setUTCDate(insightHistoryStart.getUTCDate() - 14)
    const insightsResult = mediaIds.length
      ? await admin
          .from('instagram_media_insights')
          .select(INSIGHTS_SELECT)
          .in('media_id', mediaIds)
          .gte('collected_on', insightHistoryStart.toISOString().slice(0, 10))
          .order('collected_on', { ascending: false })
      : { data: [], error: null }
    if (insightsResult.error) throw insightsResult.error

    const latestInsight = new Map<string, Record<string, unknown>>()
    ;(insightsResult.data || []).forEach((item) => {
      if (!latestInsight.has(item.media_id)) latestInsight.set(item.media_id, item)
    })

    const daily: InstagramDailyMetric[] = (dailyResult.data || []).map((item) => ({
      date: item.metric_date,
      followers: numeric(item.followers_count),
      follows: numeric(item.follows),
      unfollows: numeric(item.unfollows),
      reach: numeric(item.reach),
      views: numeric(item.views),
      profileViews: numeric(item.profile_views),
      profileLinksTaps: numeric(item.profile_links_taps),
      accountsEngaged: numeric(item.accounts_engaged),
      totalInteractions: numeric(item.total_interactions),
      likes: numeric(item.likes),
      comments: numeric(item.comments),
      shares: numeric(item.shares),
      saves: numeric(item.saves),
      replies: numeric(item.replies),
    }))

    const periodRows = (periodResult.data || []) as unknown as PeriodRow[]
    const summary = {
      current: mapPeriod(periodRows.find((item) => item.window_kind === 'current')),
      previous: mapPeriod(periodRows.find((item) => item.window_kind === 'previous')),
    }

    const media: InstagramMediaMetric[] = mediaRows.map((item) => {
      const insight = latestInsight.get(item.id)
      return {
        id: item.id,
        caption: item.caption,
        mediaType: item.media_type,
        mediaProductType: item.media_product_type,
        mediaUrl: item.media_url,
        thumbnailUrl: item.thumbnail_url,
        permalink: item.permalink,
        postedAt: item.posted_at,
        likeCount: numeric(item.like_count),
        commentsCount: numeric(item.comments_count),
        isStory: Boolean(item.is_story),
        insights: insight ? {
          views: numeric(insight.views),
          reach: numeric(insight.reach),
          plays: numeric(insight.plays),
          totalInteractions: numeric(insight.total_interactions),
          likes: numeric(insight.likes),
          comments: numeric(insight.comments),
          shares: numeric(insight.shares),
          saves: numeric(insight.saves),
          replies: numeric(insight.replies),
          averageWatchTimeMs: numeric(insight.average_watch_time_ms),
          totalWatchTimeMs: numeric(insight.total_watch_time_ms),
        } : null,
      }
    })

    const response: InstagramDashboardResponse = {
      connection,
      canManage: Boolean(canManage),
      canUseBusinessAccounts,
      days,
      daily,
      summary,
      media,
    }
    return NextResponse.json(response)
  } catch (error) {
    const status = error instanceof InstagramAccessError ? error.status : 500
    const message = error instanceof Error ? error.message : 'Não foi possível carregar o Instagram.'
    return NextResponse.json({ error: message }, { status })
  }
}
