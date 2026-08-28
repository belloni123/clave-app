import { NextRequest, NextResponse } from 'next/server'
import { authorizeInstagramProject } from '@/utils/instagram/access'
import { exchangeInstagramCode, fetchInstagramProfile, syncInstagramConnection } from '@/utils/instagram/server'
import { getPublicAppOrigin } from '@/utils/http/public-app-origin'
import { createAdminClient } from '@/utils/supabase/admin'

const OAUTH_COOKIE = 'clave_instagram_oauth'

interface OAuthState {
  state: string
  projectId: string
  userId: string
  redirectUri: string
  createdAt: number
}

function dashboardRedirect(request: NextRequest, params: Record<string, string>) {
  const url = new URL('/', getPublicAppOrigin(request))
  url.searchParams.set('activeModule', 'instagram')
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
  const response = NextResponse.redirect(url)
  response.cookies.delete(OAUTH_COOKIE)
  return response
}

function readOAuthState(request: NextRequest): OAuthState | null {
  const value = request.cookies.get(OAUTH_COOKIE)?.value
  if (!value) return null
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as OAuthState
    if (!parsed.state || !parsed.projectId || !parsed.userId || !parsed.redirectUri || !parsed.createdAt) {
      return null
    }
    if (Date.now() - parsed.createdAt > 10 * 60 * 1_000) return null
    return parsed
  } catch {
    return null
  }
}

function readRawQueryParam(request: NextRequest, key: string): string | null {
  const query = request.url.split('?', 2)[1]?.split('#', 1)[0]
  if (!query) return null

  for (const part of query.split('&')) {
    const separator = part.indexOf('=')
    const rawKey = separator >= 0 ? part.slice(0, separator) : part
    try {
      if (decodeURIComponent(rawKey) !== key) continue
      const rawValue = separator >= 0 ? part.slice(separator + 1) : ''
      // Unlike URLSearchParams, decodeURIComponent preserves a literal `+`.
      return decodeURIComponent(rawValue)
    } catch {
      return null
    }
  }

  return null
}

export async function GET(request: NextRequest) {
  const returnedState = readRawQueryParam(request, 'state')
  const code = readRawQueryParam(request, 'code')
  const oauthError = request.nextUrl.searchParams.get('error')
  const savedState = readOAuthState(request)

  if (oauthError) return dashboardRedirect(request, { instagram: 'cancelled' })
  if (!savedState || !returnedState || savedState.state !== returnedState || !code) {
    console.error('Instagram OAuth callback rejected', {
      hasCookie: Boolean(savedState),
      hasReturnedState: Boolean(returnedState),
      stateMatches: Boolean(savedState && returnedState && savedState.state === returnedState),
      hasCode: Boolean(code),
      codeLength: code?.length ?? 0,
      codeHasWhitespace: Boolean(code && /\s/.test(code)),
      redirectUri: savedState?.redirectUri ?? null,
    })
    return dashboardRedirect(request, { instagram: 'invalid_state' })
  }

  let stage = 'authorize_project'
  try {
    const { user } = await authorizeInstagramProject(savedState.projectId, {
      requireManager: true,
    })
    if (user.id !== savedState.userId) {
      return dashboardRedirect(request, { instagram: 'invalid_state' })
    }

    stage = 'exchange_code'
    const token = await exchangeInstagramCode(code, savedState.redirectUri)
    stage = 'fetch_profile'
    const profile = await fetchInstagramProfile(token.instagramUserId, token.accessToken)
    if (!profile.username) throw new Error('A conta profissional não pôde ser identificada.')

    stage = 'load_connection'
    const admin = createAdminClient()
    const { data: existing } = await admin
      .from('instagram_connections')
      .select('id, instagram_user_id, token_secret_id')
      .eq('project_id', savedState.projectId)
      .maybeSingle()

    let existingSecretId = existing?.token_secret_id as string | null | undefined
    if (existing && existing.instagram_user_id !== token.instagramUserId) {
      const oldSecretId = existingSecretId
      const { error: deleteError } = await admin
        .from('instagram_connections')
        .delete()
        .eq('id', existing.id)
      if (deleteError) throw new Error('Não foi possível trocar a conta conectada.')
      if (oldSecretId) {
        const { error } = await admin.rpc('delete_instagram_token', { p_secret_id: oldSecretId })
        if (error) console.error('Instagram old Vault secret cleanup failed', error.message)
      }
      existingSecretId = null
    }

    stage = 'save_token'
    const { data: secretId, error: secretError } = await admin.rpc('set_instagram_token', {
      p_secret_id: existingSecretId || null,
      p_token_value: token.accessToken,
    })
    if (secretError || typeof secretId !== 'string') {
      throw new Error('Não foi possível proteger a autorização do Instagram.')
    }

    const payload = {
      project_id: savedState.projectId,
      instagram_user_id: token.instagramUserId,
      username: profile.username,
      name: profile.name || null,
      account_type: profile.account_type || null,
      profile_picture_url: profile.profile_picture_url || null,
      followers_count: profile.followers_count ?? null,
      media_count: profile.media_count ?? null,
      token_secret_id: secretId,
      token_expires_at: token.expiresAt,
      granted_scopes: token.grantedScopes,
      status: 'connected',
      connected_by: user.id,
      connected_at: new Date().toISOString(),
      last_error: null,
    }
    stage = 'save_connection'
    const { data: connection, error: saveError } = await admin
      .from('instagram_connections')
      .upsert(payload, { onConflict: 'project_id' })
      .select('id')
      .single()
    if (saveError || !connection) throw new Error('Não foi possível salvar a conexão.')

    try {
      stage = 'sync_connection'
      await syncInstagramConnection(connection.id, 'oauth')
      return dashboardRedirect(request, { instagram: 'connected' })
    } catch {
      return dashboardRedirect(request, { instagram: 'connected', sync: 'error' })
    }
  } catch (error) {
    console.error('Instagram OAuth callback failed', {
      stage,
      message: error instanceof Error ? error.message : 'unknown',
      redirectUri: savedState.redirectUri,
      codeLength: code.length,
      codeHasWhitespace: /\s/.test(code),
      codeHasPlus: code.includes('+'),
    })
    return dashboardRedirect(request, { instagram: 'error' })
  }
}
