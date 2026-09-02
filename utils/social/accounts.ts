import 'server-only'

import { createAdminClient } from '@/utils/supabase/admin'
import { socialFeatureFlags } from '@/utils/social/config'
import { getSocialCapabilities } from '@/utils/social/capabilities'
import { metaGet } from '@/utils/social/providers/meta'
import { readSocialAccessToken } from '@/utils/social/vault'
import type { SocialAccountPublic, SocialAccountsResponse } from '@/types/social'

interface InstagramConnectionRow {
  id: string
  project_id: string
  instagram_user_id: string
  username: string
  name: string | null
  account_type: string | null
  profile_picture_url: string | null
  token_secret_id: string | null
  token_expires_at: string | null
  granted_scopes: string[]
  status: string
  connected_by: string | null
}

interface PagePayload {
  data?: Array<{
    id?: string
    name?: string
    tasks?: string[]
    picture?: { data?: { url?: string } }
    instagram_business_account?: { id?: string }
  }>
}

interface SocialAccountRow {
  id: string
  provider: 'instagram' | 'facebook'
  external_account_id: string
  account_type: string
  display_name: string
  username: string | null
  avatar_url: string | null
  status: SocialAccountPublic['status']
}

function publicAccount(row: SocialAccountRow): SocialAccountPublic {
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

function requiredScopes() {
  const flags = socialFeatureFlags()
  return [
    ...(flags.instagram ? ['instagram_content_publish'] : []),
    ...(flags.facebook
      ? [
          'pages_manage_posts',
          'pages_manage_engagement',
          'pages_read_user_engagement',
          'publish_video',
        ]
      : []),
  ]
}

export async function discoverSocialAccounts(projectId: string): Promise<SocialAccountsResponse> {
  const flags = socialFeatureFlags()
  const enabledProviders = [
    ...(flags.instagram ? ['instagram' as const] : []),
    ...(flags.facebook ? ['facebook' as const] : []),
  ]
  if (!enabledProviders.length) {
    return {
      flags,
      connectionStatus: 'missing',
      authorizationUrl: null,
      accounts: [],
    }
  }
  const admin = createAdminClient()
  const { data: sourceData, error: sourceError } = await admin
    .from('instagram_connections')
    .select('id,project_id,instagram_user_id,username,name,account_type,profile_picture_url,token_secret_id,token_expires_at,granted_scopes,status,connected_by')
    .eq('project_id', projectId)
    .maybeSingle()
  if (sourceError) throw sourceError
  const source = sourceData as InstagramConnectionRow | null
  if (!source) {
    return {
      flags,
      connectionStatus: 'missing',
      authorizationUrl: null,
      accounts: [],
    }
  }

  const missingScopes = requiredScopes().filter((scope) => !source.granted_scopes.includes(scope))
  const sourceExpired = source.status === 'expired'
    || (source.token_expires_at ? new Date(source.token_expires_at).getTime() <= Date.now() : false)
  const socialStatus = sourceExpired
    ? 'expired'
    : missingScopes.length
      ? 'reauthorization_required'
      : source.status === 'error'
        ? 'error'
        : 'connected'

  const { data: connection, error: connectionError } = await admin
    .from('social_connections')
    .upsert({
      project_id: projectId,
      provider: 'meta',
      source_connection_id: source.id,
      display_name: source.name || source.username,
      token_secret_id: null,
      token_expires_at: source.token_expires_at,
      granted_scopes: source.granted_scopes,
      status: socialStatus,
      connected_by: source.connected_by,
      last_error: missingScopes.length ? `missing_scopes:${missingScopes.join(',')}` : null,
    }, { onConflict: 'project_id,provider' })
    .select('id')
    .single()
  if (connectionError || !connection) throw connectionError || new Error('Social connection unavailable')

  const ready = socialStatus === 'connected'
  const accountsToUpsert: Array<Record<string, unknown>> = []
  const discoveredProviders = new Set<'instagram' | 'facebook'>()
  if (flags.instagram) {
    discoveredProviders.add('instagram')
    accountsToUpsert.push({
      project_id: projectId,
      connection_id: connection.id,
      provider: 'instagram',
      external_account_id: source.instagram_user_id,
      account_type: source.account_type || 'professional',
      display_name: source.name || source.username,
      username: source.username,
      avatar_url: source.profile_picture_url,
      status: ready ? 'connected' : sourceExpired ? 'expired' : 'permission_required',
      capabilities: getSocialCapabilities('instagram'),
      metadata: {},
    })
  }

  if (flags.facebook && !sourceExpired) {
    try {
      const token = await readSocialAccessToken(admin, source.id, null)
      const pages = await metaGet<PagePayload>('me/accounts', token, {
        fields: 'id,name,tasks,picture{url},instagram_business_account',
        limit: '100',
      })
      discoveredProviders.add('facebook')
      for (const page of pages.data || []) {
        if (!page.id || !page.name) continue
        const tasks = page.tasks || []
        const canCreate = tasks.length === 0 || tasks.some((task) => (
          task === 'CREATE_CONTENT'
          || task === 'PROFILE_PLUS_CREATE_CONTENT'
          || task === 'PROFILE_PLUS_FULL_CONTROL'
          || task === 'PROFILE_PLUS_MANAGE'
        ))
        accountsToUpsert.push({
          project_id: projectId,
          connection_id: connection.id,
          provider: 'facebook',
          external_account_id: page.id,
          account_type: 'page',
          display_name: page.name,
          username: null,
          avatar_url: page.picture?.data?.url || null,
          status: ready && canCreate ? 'connected' : 'permission_required',
          capabilities: getSocialCapabilities('facebook'),
          metadata: {
            tasks,
            instagramBusinessAccountId: page.instagram_business_account?.id || null,
          },
        })
      }
    } catch (error) {
      console.error('Social Page discovery failed', {
        projectId,
        message: error instanceof Error ? error.message : 'unknown',
      })
    }
  }

  for (const provider of discoveredProviders) {
    const { error } = await admin
      .from('social_accounts')
      .update({ status: 'disconnected' })
      .eq('project_id', projectId)
      .eq('provider', provider)
    if (error) throw error
  }

  if (accountsToUpsert.length) {
    const { error } = await admin
      .from('social_accounts')
      .upsert(accountsToUpsert, { onConflict: 'project_id,provider,external_account_id' })
    if (error) throw error
  }

  const { data: accountRows, error: accountError } = await admin
    .from('social_accounts')
    .select('id,provider,external_account_id,account_type,display_name,username,avatar_url,status')
    .eq('project_id', projectId)
    .in('provider', enabledProviders)
    .order('provider')
    .order('display_name')
  if (accountError) throw accountError

  return {
    flags,
    connectionStatus: sourceExpired
      ? 'expired'
      : missingScopes.length
        ? 'reauthorization_required'
        : source.status === 'error'
          ? 'error'
          : 'ready',
    authorizationUrl: `/api/instagram/connect?projectId=${encodeURIComponent(projectId)}&mode=oauth&purpose=publishing`,
    accounts: ((accountRows || []) as SocialAccountRow[]).map(publicAccount),
  }
}
