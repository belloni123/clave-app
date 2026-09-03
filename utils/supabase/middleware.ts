import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session if needed
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    // The Data API account gate rejects blocked/deleted subjects, including old
    // JWTs. Check before API routes can perform any service-role side effects.
    const { data: profile, error } = await supabase.from('profiles')
      .select('id, blocked_at, deleted_at').eq('id', user.id).maybeSingle()
    if (error || !profile || profile.blocked_at || profile.deleted_at) {
      if (request.nextUrl.pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Acesso indisponível. Contate o administrador.' }, { status: 403 })
      }
      if (!request.nextUrl.pathname.startsWith('/login')) {
        await supabase.auth.signOut()
        const response = NextResponse.redirect(new URL('/login', request.url))
        supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie))
        return response
      }
    }
  }

  return supabaseResponse
}
