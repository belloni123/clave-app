import type { SocialFeatureFlags } from '@/types/social'

export type InstagramConnectionStatus = 'connected' | 'syncing' | 'error' | 'expired'

export interface InstagramConnectionPublic {
  id: string
  projectId: string
  instagramUserId: string
  username: string
  name: string | null
  accountType: string | null
  profilePictureUrl: string | null
  followersCount: number | null
  mediaCount: number | null
  status: InstagramConnectionStatus
  connectedAt: string
  lastSyncedAt: string | null
  lastError: string | null
}

export interface InstagramDailyMetric {
  date: string
  followers: number | null
  follows: number | null
  unfollows: number | null
  reach: number | null
  views: number | null
  profileViews: number | null
  profileLinksTaps: number | null
  accountsEngaged: number | null
  totalInteractions: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  saves: number | null
  replies: number | null
}

export interface InstagramPeriodMetric {
  windowDays: 7 | 30 | 90
  periodStart: string
  periodEnd: string
  reach: number | null
  views: number | null
  profileViews: number | null
  profileLinksTaps: number | null
  accountsEngaged: number | null
  totalInteractions: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  saves: number | null
  replies: number | null
  follows: number | null
  unfollows: number | null
  collectedAt: string
}

export interface InstagramMediaMetric {
  id: string
  caption: string | null
  mediaType: string | null
  mediaProductType: string | null
  mediaUrl: string | null
  thumbnailUrl: string | null
  permalink: string | null
  postedAt: string
  likeCount: number | null
  commentsCount: number | null
  isStory: boolean
  insights: {
    views: number | null
    reach: number | null
    plays: number | null
    totalInteractions: number | null
    likes: number | null
    comments: number | null
    shares: number | null
    saves: number | null
    replies: number | null
    averageWatchTimeMs: number | null
    totalWatchTimeMs: number | null
  } | null
}

export interface InstagramDashboardResponse {
  connection: InstagramConnectionPublic | null
  canManage: boolean
  canUseBusinessAccounts: boolean
  socialPublishing: SocialFeatureFlags
  days: number
  daily: InstagramDailyMetric[]
  summary: {
    current: InstagramPeriodMetric | null
    previous: InstagramPeriodMetric | null
  }
  media: InstagramMediaMetric[]
}

export interface InstagramSyncResponse {
  ok: true
  queued: true
}
