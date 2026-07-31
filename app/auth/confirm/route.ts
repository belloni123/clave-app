import { NextRequest, NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'

const SUPPORTED_TYPES = new Set<EmailOtpType>(['invite', 'recovery'])

function loginRedirect(request: NextRequest, error: string) {
  const url = new URL('/login', request.url)
  url.searchParams.set('error', error)
  return NextResponse.redirect(url)
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get('token_hash')
  const rawType = request.nextUrl.searchParams.get('type')
  const requestedNext = request.nextUrl.searchParams.get('next') ?? '/'
  const next = requestedNext.startsWith('/') && !requestedNext.startsWith('//')
    ? requestedNext
    : '/'

  if (!tokenHash || !rawType || !SUPPORTED_TYPES.has(rawType as EmailOtpType)) {
    return loginRedirect(request, 'link-invalido')
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: rawType as EmailOtpType,
  })

  if (error) {
    console.error('Auth confirmation failed', error.message)
    return loginRedirect(request, 'link-expirado')
  }

  return NextResponse.redirect(new URL(next, request.url))
}
