import { NextResponse, type NextRequest } from 'next/server'
import { getPublicAppOrigin } from '@/utils/http/public-app-origin'
import { updateSession } from '@/utils/supabase/middleware'

const LEGACY_APP_HOSTNAME = 'clave.agenciab16.com.br'
const LEGACY_PUBLIC_HOSTNAME = 'assinaturas.agenciab16.com.br'
const ZECLAVE_PUBLIC_HOSTNAME = 'useclave.com.br'
const ZECLAVE_PUBLIC_LINK = /^\/(?:(?:documentos|entrada)\/[A-Za-z0-9_-]+|formularios\/[A-Za-z0-9_-]{43})\/?$/

function redirectToHostname(request: NextRequest, hostname: string) {
  const url = request.nextUrl.clone()
  url.protocol = 'https:'
  url.hostname = hostname
  url.port = ''
  return NextResponse.redirect(url, {
    status: 307,
    headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' },
  })
}

export async function proxy(request: NextRequest) {
  const forwardedHost = request.headers.get('x-forwarded-host')
  const requestHost = forwardedHost?.split(',')[0]?.trim() || request.headers.get('host')
  const hostname = requestHost?.split(':')[0]?.toLowerCase() || request.nextUrl.hostname

  if (hostname === LEGACY_APP_HOSTNAME) {
    const canonicalHostname = new URL(getPublicAppOrigin(request)).hostname
    if (canonicalHostname !== hostname) return redirectToHostname(request, canonicalHostname)
  }

  if (hostname === LEGACY_PUBLIC_HOSTNAME &&
      (request.method === 'GET' || request.method === 'HEAD') &&
      ZECLAVE_PUBLIC_LINK.test(request.nextUrl.pathname)) {
    return redirectToHostname(request, ZECLAVE_PUBLIC_HOSTNAME)
  }

  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images/SVGs
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
