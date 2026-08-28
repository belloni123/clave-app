import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { authorizeInstagramProject, InstagramAccessError } from '@/utils/instagram/access'
import { getPublicAppOrigin } from '@/utils/http/public-app-origin'

const OAUTH_COOKIE = 'clave_instagram_oauth'

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('projectId')?.trim() || ''

  try {
    const { user } = await authorizeInstagramProject(projectId, { requireManager: true })
    const appId = process.env.INSTAGRAM_APP_ID?.trim()
    if (!appId) {
      return NextResponse.redirect(
        new URL('/?activeModule=instagram&instagram=not_configured', getPublicAppOrigin(request)),
      )
    }

    const state = randomBytes(32).toString('base64url')
    const origin = getPublicAppOrigin(request)
    const redirectUri = `${origin}/api/instagram/callback`
    const authorizeUrl = new URL('https://www.instagram.com/oauth/authorize')
    authorizeUrl.searchParams.set('client_id', appId)
    authorizeUrl.searchParams.set('redirect_uri', redirectUri)
    authorizeUrl.searchParams.set('response_type', 'code')
    authorizeUrl.searchParams.set(
      'scope',
      'instagram_business_basic,instagram_business_manage_insights',
    )
    authorizeUrl.searchParams.set('state', state)
    authorizeUrl.searchParams.set('enable_fb_login', '0')
    authorizeUrl.searchParams.set('force_authentication', '1')

    const response = NextResponse.redirect(authorizeUrl)
    response.cookies.set(OAUTH_COOKIE, Buffer.from(JSON.stringify({
      state,
      projectId,
      userId: user.id,
      createdAt: Date.now(),
    })).toString('base64url'), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 10 * 60,
    })
    return response
  } catch (error) {
    const status = error instanceof InstagramAccessError ? error.status : 500
    const message = error instanceof Error ? error.message : 'Não foi possível iniciar a conexão.'
    return NextResponse.json({ error: message }, { status })
  }
}
