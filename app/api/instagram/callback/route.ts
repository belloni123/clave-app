import { after, NextRequest, NextResponse } from 'next/server'
import {
  authorizeInstagramProject,
  requireInstagramBusinessTokenAccess,
} from '@/utils/instagram/access'
import {
  fetchFacebookGrantedScopes,
  fetchFacebookInstagramAccount,
  fetchFacebookInstagramAccounts,
  exchangeFacebookLongLivedToken,
  inspectFacebookSystemUserToken,
  syncInstagramConnection,
  type FacebookInstagramAccount,
} from '@/utils/instagram/server'
import { getPublicAppOrigin } from '@/utils/http/public-app-origin'
import {
  INSTAGRAM_OAUTH_COOKIE,
  INSTAGRAM_PENDING_COOKIE,
  instagramOAuthCookieOptions,
  readInstagramOAuthState,
  readInstagramPendingAuthorization,
  sealInstagramPendingAuthorization,
  type InstagramOAuthState,
  type InstagramPendingAuthorization,
} from '@/utils/instagram/oauth'
import { createAdminClient } from '@/utils/supabase/admin'
import { socialFeatureFlags } from '@/utils/social/config'

const USER_REQUIRED_SCOPES = [
  'instagram_basic',
  'instagram_manage_insights',
  'pages_show_list',
  'pages_read_engagement',
]

const BUSINESS_REQUIRED_SCOPES = [
  ...USER_REQUIRED_SCOPES,
  'business_management',
]

function publishingRequiredScopes() {
  const flags = socialFeatureFlags()
  return [
    ...(flags.instagram ? ['instagram_content_publish'] : []),
    ...(flags.facebook
      ? ['pages_manage_posts', 'pages_manage_engagement', 'pages_read_user_engagement']
      : []),
  ]
}

interface CallbackBody {
  state?: string
  accessToken?: string
  selectedInstagramUserId?: string
}

function clearOAuthCookies(response: NextResponse) {
  response.cookies.delete(INSTAGRAM_OAUTH_COOKIE)
  response.cookies.delete(INSTAGRAM_PENDING_COOKIE)
  return response
}

function errorResponse(message: string, status = 400, clear = false) {
  const response = NextResponse.json({ error: message }, { status })
  return clear ? clearOAuthCookies(response) : response
}

function tokenExpiration(expiresIn: number) {
  const seconds = Number.isFinite(expiresIn)
    ? Math.max(60, Math.min(expiresIn, 60 * 24 * 60 * 60))
    : 60 * 24 * 60 * 60
  return new Date(Date.now() + seconds * 1_000).toISOString()
}

function scheduleInitialSync(connectionId: string) {
  after(async () => {
    try {
      await syncInstagramConnection(connectionId, 'oauth')
    } catch (error) {
      console.error('Instagram first sync failed', {
        message: error instanceof Error ? error.message : 'unknown',
        connectionId,
      })
    }
  })
}

async function validateOAuthUser(request: NextRequest, returnedState: string | undefined) {
  const savedState = readInstagramOAuthState(request)
  if (!savedState || !returnedState || savedState.state !== returnedState) {
    throw new Error('A autorização expirou ou não pertence a esta sessão.')
  }
  const { user, supabase } = await authorizeInstagramProject(savedState.projectId, {
    requireManager: true,
  })
  if (user.id !== savedState.userId) {
    throw new Error('A autorização não pertence ao usuário conectado.')
  }
  return { savedState, user, supabase }
}

async function saveConnection(
  savedState: InstagramOAuthState,
  userId: string,
  authorization: InstagramPendingAuthorization,
  account: FacebookInstagramAccount,
) {
  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('instagram_connections')
    .select('id, instagram_user_id, token_secret_id')
    .eq('project_id', savedState.projectId)
    .maybeSingle()

  let existingSecretId = existing?.token_secret_id as string | null | undefined
  if (
    savedState.purpose === 'publishing'
    && existing
    && existing.instagram_user_id !== account.instagramUserId
  ) {
    throw new Error('Para preservar o Analytics, autorize a mesma conta do Instagram já conectada.')
  }
  if (existing && existing.instagram_user_id !== account.instagramUserId) {
    const oldSecretId = existingSecretId
    const { error: deleteError } = await admin
      .from('instagram_connections')
      .delete()
      .eq('id', existing.id)
    if (deleteError) throw new Error('Não foi possível trocar a conta conectada.')
    if (oldSecretId) {
      const { error } = await admin.rpc('delete_instagram_token', {
        p_secret_id: oldSecretId,
      })
      if (error) console.error('Instagram old Vault secret cleanup failed', error.message)
    }
    existingSecretId = null
  }

  const { data: secretId, error: secretError } = await admin.rpc('set_instagram_token', {
    p_secret_id: existingSecretId || null,
    p_token_value: authorization.accessToken,
  })
  if (secretError || typeof secretId !== 'string') {
    throw new Error('Não foi possível proteger a autorização do Instagram.')
  }

  const { data: connection, error: saveError } = await admin
    .from('instagram_connections')
    .upsert({
      project_id: savedState.projectId,
      instagram_user_id: account.instagramUserId,
      username: account.username,
      name: account.name,
      account_type: account.accountType,
      profile_picture_url: account.profilePictureUrl,
      followers_count: account.followersCount,
      media_count: account.mediaCount,
      token_secret_id: secretId,
      token_expires_at: authorization.tokenExpiresAt,
      granted_scopes: authorization.grantedScopes,
      status: 'connected',
      connected_by: userId,
      connected_at: new Date().toISOString(),
      last_error: null,
    }, { onConflict: 'project_id' })
    .select('id')
    .single()
  if (saveError || !connection) throw new Error('Não foi possível salvar a conexão.')

  scheduleInitialSync(connection.id)
}

export async function GET(request: NextRequest) {
  const url = new URL('/', getPublicAppOrigin(request))
  url.searchParams.set('activeModule', 'instagram')
  url.searchParams.set('instagram', 'invalid_state')
  return clearOAuthCookies(NextResponse.redirect(url))
}

export async function POST(request: NextRequest) {
  let stage = 'read_body'
  try {
    const body = await request.json() as CallbackBody
    stage = 'validate_state'
    const { savedState, user, supabase } = await validateOAuthUser(request, body.state)
    const source = savedState.source

    if (!body.selectedInstagramUserId && (source === 'business' || body.accessToken)) {
      let authorizationToken: { accessToken: string; expiresIn: number | null }
      let grantedScopes: string[]
      if (source === 'business') {
        await requireInstagramBusinessTokenAccess(supabase, user.id)
        const systemToken = process.env.META_SYSTEM_USER_TOKEN?.trim()
        if (!systemToken) {
          return errorResponse('O acesso central da BM não foi configurado.', 503, true)
        }
        authorizationToken = { accessToken: systemToken, expiresIn: null }
        stage = 'inspect_business_token'
        grantedScopes = await inspectFacebookSystemUserToken(systemToken)
      } else {
        stage = 'exchange_token'
        const longLived = await exchangeFacebookLongLivedToken(body.accessToken as string)
        authorizationToken = longLived
        stage = 'load_permissions'
        grantedScopes = await fetchFacebookGrantedScopes(authorizationToken.accessToken)
      }
      const requiredScopes = source === 'business'
        ? BUSINESS_REQUIRED_SCOPES
        : USER_REQUIRED_SCOPES
      const purposeScopes = savedState.purpose === 'publishing'
        ? publishingRequiredScopes()
        : []
      const missingScopes = [...requiredScopes, ...purposeScopes]
        .filter((scope) => !grantedScopes.includes(scope))
      if (missingScopes.length) {
        return errorResponse(
          `A Meta não liberou as permissões necessárias: ${missingScopes.join(', ')}.`,
          403,
          true,
        )
      }

      stage = 'load_accounts'
      const accounts = await fetchFacebookInstagramAccounts(
        authorizationToken.accessToken,
        source,
      )
      if (!accounts.length) {
        return errorResponse(
          source === 'business'
            ? 'Nenhuma conta profissional disponível para a nossa BM foi encontrada.'
            : 'Nenhuma conta profissional vinculada a uma Página que você administra foi encontrada.',
          404,
          true,
        )
      }

      const authorization: InstagramPendingAuthorization = {
        accessToken: authorizationToken.accessToken,
        tokenExpiresAt: authorizationToken.expiresIn === null
          ? null
          : tokenExpiration(authorizationToken.expiresIn),
        grantedScopes,
        source,
        createdAt: Date.now(),
      }
      if (accounts.length === 1) {
        stage = 'save_connection'
        await saveConnection(savedState, user.id, authorization, accounts[0])
        return clearOAuthCookies(NextResponse.json({
          connected: true,
          projectId: savedState.projectId,
          purpose: savedState.purpose,
        }))
      }

      const response = NextResponse.json({ connected: false, accounts })
      response.cookies.set(
        INSTAGRAM_PENDING_COOKIE,
        sealInstagramPendingAuthorization(authorization),
        instagramOAuthCookieOptions(),
      )
      return response
    }

    if (body.selectedInstagramUserId) {
      stage = 'read_pending_authorization'
      const authorization = readInstagramPendingAuthorization(request)
      if (!authorization) {
        return errorResponse('A escolha da conta expirou. Inicie a conexão novamente.', 400, true)
      }
      if (authorization.source === 'business') {
        await requireInstagramBusinessTokenAccess(supabase, user.id)
      }
      stage = 'validate_selected_account'
      const account = await fetchFacebookInstagramAccount(
        authorization.accessToken,
        body.selectedInstagramUserId,
        authorization.source,
      )
      if (!account) {
        return errorResponse(
          authorization.source === 'business'
            ? 'A conta selecionada não está mais disponível na BM.'
            : 'A conta selecionada não está mais disponível para este usuário.',
          404,
          true,
        )
      }
      stage = 'save_connection'
      await saveConnection(savedState, user.id, authorization, account)
      return clearOAuthCookies(NextResponse.json({
        connected: true,
        projectId: savedState.projectId,
        purpose: savedState.purpose,
      }))
    }

    return errorResponse('A Meta não retornou uma autorização válida.', 400, true)
  } catch (error) {
    console.error('Instagram Facebook callback failed', {
      stage,
      message: error instanceof Error ? error.message : 'unknown',
    })
    return errorResponse(
      error instanceof Error ? error.message : 'Não foi possível conectar o Instagram.',
      500,
      true,
    )
  }
}
