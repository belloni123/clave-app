import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host')
  let protocol = request.headers.get('x-forwarded-proto') || 'http'
  if (host && !host.includes('localhost') && !host.includes('127.0.0.1') && !host.includes('0.0.0.0')) {
    protocol = 'https'
  }
  const origin = host ? `${protocol}://${host}` : request.nextUrl.origin

  if (!code) {
    return NextResponse.redirect(
      `${origin}/?activeModule=planejador&gcal_sync=error&error_msg=Codigo+de+autorizacao+ausente`
    )
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      `${origin}/?activeModule=planejador&gcal_sync=error&error_msg=Chaves+do+Google+nao+configuradas+no+servidor`
    )
  }

  try {
    const redirectUri = `${origin}/api/auth/google/callback`

    // Trocar o código de autorização pelos tokens
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    const tokenData = await response.json()

    if (!response.ok || tokenData.error) {
      console.error('Erro ao trocar tokens no Google:', tokenData)
      return NextResponse.redirect(
        `${origin}/?activeModule=planejador&gcal_sync=error&error_msg=Erro+ao+obter+credenciais+da+Google`
      )
    }

    // Obter o cliente Supabase autenticado do usuário
    const supabase = await createClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.redirect(
        `${origin}/?activeModule=planejador&gcal_sync=error&error_msg=Usuario+nao+autenticado+no+Supabase`
      )
    }

    // Calcular data de expiração do access_token
    const expiresAt = new Date()
    expiresAt.setSeconds(expiresAt.getSeconds() + (tokenData.expires_in || 3600))

    // Buscar token existente para preservar o refresh_token se necessário
    const { data: existingToken } = await supabase
      .from('user_google_tokens')
      .select('refresh_token')
      .eq('user_id', user.id)
      .maybeSingle()

    const finalRefreshToken = tokenData.refresh_token || existingToken?.refresh_token

    if (!finalRefreshToken) {
      return NextResponse.redirect(
        `${origin}/?activeModule=planejador&gcal_sync=error&error_msg=Falha+ao+obter+refresh_token.+Tente+limpar+as+permissoes+no+Google`
      )
    }

    // Upsert na tabela user_google_tokens
    const { error: dbError } = await supabase.from('user_google_tokens').upsert({
      user_id: user.id,
      access_token: tokenData.access_token,
      refresh_token: finalRefreshToken,
      expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })

    if (dbError) {
      console.error('Erro ao salvar tokens no banco:', dbError)
      return NextResponse.redirect(
        `${origin}/?activeModule=planejador&gcal_sync=error&error_msg=Erro+ao+salvar+credenciais+no+banco`
      )
    }

    return NextResponse.redirect(`${origin}/?activeModule=planejador&gcal_sync=success`)
  } catch (err) {
    console.error('Erro na rota de callback:', err)
    return NextResponse.redirect(`${origin}/?activeModule=planejador&gcal_sync=error`)
  }
}
