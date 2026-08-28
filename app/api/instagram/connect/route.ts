import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { authorizeInstagramProject, InstagramAccessError } from '@/utils/instagram/access'
import { getPublicAppOrigin } from '@/utils/http/public-app-origin'
import {
  encodeInstagramOAuthState,
  INSTAGRAM_OAUTH_COOKIE,
  instagramOAuthCookieOptions,
} from '@/utils/instagram/oauth'

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('projectId')?.trim() || ''

  try {
    const { user } = await authorizeInstagramProject(projectId, { requireManager: true })
    const appId = process.env.META_APP_ID?.trim()
    if (!appId) {
      return NextResponse.redirect(
        new URL('/?activeModule=instagram&instagram=not_configured', getPublicAppOrigin(request)),
      )
    }

    const state = randomBytes(32).toString('base64url')
    const origin = getPublicAppOrigin(request)
    const redirectUri = `${origin}/instagram/conectar`
    const version = process.env.INSTAGRAM_GRAPH_API_VERSION?.trim() || 'v26.0'
    const authorizeUrl = new URL(`https://www.facebook.com/${version}/dialog/oauth`)
    authorizeUrl.searchParams.set('client_id', appId)
    authorizeUrl.searchParams.set('display', 'page')
    authorizeUrl.searchParams.set('redirect_uri', redirectUri)
    authorizeUrl.searchParams.set('response_type', 'token')
    authorizeUrl.searchParams.set('scope', [
      'instagram_basic',
      'instagram_manage_insights',
      'pages_show_list',
      'pages_read_engagement',
      'business_management',
    ].join(','))
    authorizeUrl.searchParams.set('state', state)

    const response = NextResponse.redirect(authorizeUrl)
    response.cookies.set(INSTAGRAM_OAUTH_COOKIE, encodeInstagramOAuthState({
      state,
      projectId,
      userId: user.id,
      redirectUri,
      createdAt: Date.now(),
    }), instagramOAuthCookieOptions())
    return response
  } catch (error) {
    const status = error instanceof InstagramAccessError ? error.status : 500
    const message = error instanceof Error ? error.message : 'Não foi possível iniciar a conexão.'
    return NextResponse.json({ error: message }, { status })
  }
}
