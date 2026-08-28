import { NextRequest, NextResponse } from 'next/server'
import { authorizeInstagramProject } from '@/utils/instagram/access'
import {
  fetchFacebookGrantedScopes,
  fetchFacebookInstagramAccounts,
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

const REQUIRED_SCOPES = [
  'instagram_basic',
  'instagram_manage_insights',
  'pages_show_list',
  'pages_read_engagement',
  'business_management',
]

interface CallbackBody {
  state?: string
  accessToken?: string
  selectedInstagramUserId?: string
  expiresIn?: number
  isLongLived?: boolean
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

function tokenExpiration(body: CallbackBody) {
  const fallbackSeconds = body.isLongLived ? 60 * 24 * 60 * 60 : 60 * 60
  const seconds = Number.isFinite(body.expiresIn)
    ? Math.max(60, Math.min(Number(body.expiresIn), 60 * 24 * 60 * 60))
    : fallbackSeconds
  return new Date(Date.now() + seconds * 1_000).toISOString()
}

async function validateOAuthUser(request: NextRequest, returnedState: string | undefined) {
  const savedState = readInstagramOAuthState(request)
  if (!savedState || !returnedState || savedState.state !== returnedState) {
    throw new Error('A autorização expirou ou não pertence a esta sessão.')
  }
  const { user } = await authorizeInstagramProject(savedState.projectId, {
    requireManager: true,
  })
  if (user.id !== savedState.userId) {
    throw new Error('A autorização não pertence ao usuário conectado.')
  }
  return { savedState, user }
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

  try {
    await syncInstagramConnection(connection.id, 'oauth')
    return { syncError: false }
  } catch (error) {
    console.error('Instagram first sync failed', {
      message: error instanceof Error ? error.message : 'unknown',
      connectionId: connection.id,
    })
    return { syncError: true }
  }
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
    const { savedState, user } = await validateOAuthUser(request, body.state)

    if (body.accessToken) {
      stage = 'load_permissions'
      const grantedScopes = await fetchFacebookGrantedScopes(body.accessToken)
      const missingScopes = REQUIRED_SCOPES.filter((scope) => !grantedScopes.includes(scope))
      if (missingScopes.length) {
        return errorResponse(
          `A Meta não liberou as permissões necessárias: ${missingScopes.join(', ')}.`,
          403,
          true,
        )
      }

      stage = 'load_accounts'
      const accounts = await fetchFacebookInstagramAccounts(body.accessToken)
      if (!accounts.length) {
        return errorResponse(
          'Nenhuma conta profissional vinculada a uma Página da nossa BM foi encontrada.',
          404,
          true,
        )
      }

      const authorization: InstagramPendingAuthorization = {
        accessToken: body.accessToken,
        tokenExpiresAt: tokenExpiration(body),
        grantedScopes,
        createdAt: Date.now(),
      }
      if (accounts.length === 1) {
        stage = 'save_connection'
        const result = await saveConnection(savedState, user.id, authorization, accounts[0])
        return clearOAuthCookies(NextResponse.json({
          connected: true,
          syncError: result.syncError,
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
      stage = 'validate_selected_account'
      const accounts = await fetchFacebookInstagramAccounts(authorization.accessToken)
      const account = accounts.find(
        (item) => item.instagramUserId === body.selectedInstagramUserId,
      )
      if (!account) {
        return errorResponse('A conta selecionada não está mais disponível na BM.', 404, true)
      }
      stage = 'save_connection'
      const result = await saveConnection(savedState, user.id, authorization, account)
      return clearOAuthCookies(NextResponse.json({
        connected: true,
        syncError: result.syncError,
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
