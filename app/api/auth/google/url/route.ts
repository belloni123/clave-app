import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    return NextResponse.json(
      { error: 'GOOGLE_CLIENT_ID não está configurado no servidor.' },
      { status: 500 }
    )
  }

  // Determinar o redirect_uri baseado no host da requisição (local ou produção)
  const origin = request.nextUrl.origin
  const redirectUri = `${origin}/api/auth/google/callback`

  const url =
    `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent('https://www.googleapis.com/auth/calendar.events')}` +
    `&access_type=offline` +
    `&prompt=consent`

  return NextResponse.json({ url })
}
