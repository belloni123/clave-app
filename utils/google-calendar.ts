import { createClient } from '@/utils/supabase/server'

/**
 * Obtém um access_token válido da API do Google para o usuário.
 * Se o token atual estiver expirado, ele realiza a renovação silenciosa usando o refresh_token.
 */
export async function getGoogleAccessToken(userId: string): Promise<string | null> {
  const supabase = await createClient()

  // Buscar tokens do usuário no banco
  const { data: tokens, error } = await supabase
    .from('user_google_tokens')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !tokens) {
    return null
  }

  const expiresAt = new Date(tokens.expires_at)
  const now = new Date()
  // Buffer de 1 minuto para evitar expiração durante a chamada
  now.setMinutes(now.getMinutes() + 1)

  if (expiresAt > now) {
    return tokens.access_token
  }

  // Token expirou ou está prestes a expirar. Solicitar renovação
  console.log(`Renovando access_token da Google para o usuário ${userId}...`)
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    console.error('Erro: Chaves do Google não configuradas no arquivo .env do servidor.')
    return null
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokens.refresh_token,
        grant_type: 'refresh_token',
      }),
    })

    const refreshData = await response.json()

    if (!response.ok || refreshData.error) {
      console.error('Erro do Google ao renovar o token:', refreshData)
      return null
    }

    const newExpiresAt = new Date()
    newExpiresAt.setSeconds(newExpiresAt.getSeconds() + (refreshData.expires_in || 3600))

    // Salvar o novo access_token e a nova expiração no banco
    const { error: updateError } = await supabase
      .from('user_google_tokens')
      .update({
        access_token: refreshData.access_token,
        expires_at: newExpiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)

    if (updateError) {
      console.error('Erro ao salvar novo access_token no banco:', updateError)
    }

    return refreshData.access_token
  } catch (err) {
    console.error('Exceção ao tentar renovar token Google:', err)
    return null
  }
}
