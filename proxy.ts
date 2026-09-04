import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

const LEGACY_APP_HOSTNAME = 'clave.agenciab16.com.br'
const PRODUCTION_APP_HOSTNAME = 'useclave.com.br'

export async function proxy(request: NextRequest) {
  const forwardedHost = request.headers.get('x-forwarded-host')
  const requestHost = forwardedHost?.split(',')[0]?.trim() || request.headers.get('host')
  const hostname = requestHost?.split(':')[0]?.toLowerCase() || request.nextUrl.hostname

  if (hostname === LEGACY_APP_HOSTNAME) {
    const canonicalUrl = request.nextUrl.clone()
    canonicalUrl.protocol = 'https:'
    canonicalUrl.hostname = PRODUCTION_APP_HOSTNAME
    canonicalUrl.port = ''
    return NextResponse.redirect(canonicalUrl, 308)
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
