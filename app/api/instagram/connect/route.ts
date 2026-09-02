import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import {
  authorizeInstagramProject,
  InstagramAccessError,
  userCanUseInstagramBusinessToken,
} from '@/utils/instagram/access'
import { getPublicAppOrigin } from '@/utils/http/public-app-origin'
import {
  encodeInstagramOAuthState,
  INSTAGRAM_OAUTH_COOKIE,
  instagramOAuthCookieOptions,
} from '@/utils/instagram/oauth'
import {
  MetaAppConfigurationError,
  resolveMetaAppId,
  resolveMetaAppCredentials,
} from '@/utils/instagram/config'
import { socialFeatureFlags } from '@/utils/social/config'

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('projectId')?.trim() || ''
  const requestedMode = request.nextUrl.searchParams.get('mode')
  const purpose = request.nextUrl.searchParams.get('purpose') === 'publishing'
    ? 'publishing'
    : 'analytics'

  try {
    const { user, supabase } = await authorizeInstagramProject(projectId, { requireManager: true })
    const state = randomBytes(32).toString('base64url')
    const origin = getPublicAppOrigin(request)
    const redirectUri = `${origin}/instagram/conectar`
    const systemTokenConfigured = Boolean(process.env.META_SYSTEM_USER_TOKEN?.trim())
    const canUseBusinessToken = systemTokenConfigured
      && await userCanUseInstagramBusinessToken(supabase, user.id)
    if (requestedMode === 'business' && !canUseBusinessToken) {
      throw new InstagramAccessError(
        'Somente administradores da agência podem selecionar contas da BM.',
        403,
      )
    }
    const useBusinessToken = canUseBusinessToken && requestedMode !== 'oauth'
    const appId = useBusinessToken
      ? resolveMetaAppId()
      : resolveMetaAppCredentials().appId
    if (useBusinessToken) {
      const businessConnectUrl = new URL(redirectUri)
      businessConnectUrl.searchParams.set('source', 'business')
      businessConnectUrl.searchParams.set('state', state)
      businessConnectUrl.searchParams.set('projectId', projectId)
      const response = NextResponse.redirect(businessConnectUrl)
      response.cookies.set(INSTAGRAM_OAUTH_COOKIE, encodeInstagramOAuthState({
        state,
        projectId,
        userId: user.id,
        redirectUri,
        source: 'business',
        purpose,
        createdAt: Date.now(),
      }), instagramOAuthCookieOptions())
      return response
    }

    const version = process.env.INSTAGRAM_GRAPH_API_VERSION?.trim() || 'v26.0'
    const authorizeUrl = new URL(`https://www.facebook.com/${version}/dialog/oauth`)
    authorizeUrl.searchParams.set('client_id', appId)
    authorizeUrl.searchParams.set('display', 'page')
    authorizeUrl.searchParams.set('redirect_uri', redirectUri)
    authorizeUrl.searchParams.set('response_type', 'token')
    const publishingFlags = socialFeatureFlags()
    const scopes = [
      'instagram_basic',
      'instagram_manage_insights',
      'pages_show_list',
      'pages_read_engagement',
      ...(purpose === 'publishing'
        ? [
            ...(publishingFlags.instagram ? ['instagram_content_publish'] : []),
            ...(publishingFlags.facebook
              ? [
                  'pages_manage_posts',
                  'pages_manage_engagement',
                ]
              : []),
          ]
        : []),
    ]
    authorizeUrl.searchParams.set('scope', scopes.join(','))
    authorizeUrl.searchParams.set('state', state)

    const response = NextResponse.redirect(authorizeUrl)
    response.cookies.set(INSTAGRAM_OAUTH_COOKIE, encodeInstagramOAuthState({
      state,
      projectId,
      userId: user.id,
      redirectUri,
      source: 'oauth',
      purpose,
      createdAt: Date.now(),
    }), instagramOAuthCookieOptions())
    return response
  } catch (error) {
    if (error instanceof MetaAppConfigurationError) {
      console.error('Instagram Meta app configuration invalid', { code: error.code })
      return NextResponse.redirect(
        new URL('/?activeModule=instagram&instagram=not_configured', getPublicAppOrigin(request)),
      )
    }
    const status = error instanceof InstagramAccessError ? error.status : 500
    const message = error instanceof Error ? error.message : 'Não foi possível iniciar a conexão.'
    return NextResponse.json({ error: message }, { status })
  }
}
