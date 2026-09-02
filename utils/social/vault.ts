import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { SocialPublishingError } from '@/utils/social/errors'

export async function readSocialAccessToken(
  admin: SupabaseClient,
  sourceConnectionId: string | null,
  tokenSecretId: string | null,
) {
  let secretId = tokenSecretId
  if (!secretId && sourceConnectionId) {
    const { data: source, error } = await admin
      .from('instagram_connections')
      .select('token_secret_id')
      .eq('id', sourceConnectionId)
      .maybeSingle()
    if (error) throw error
    secretId = source?.token_secret_id || null
  }
  if (!secretId) {
    throw new SocialPublishingError(
      'Autorize novamente a conta Meta para publicar.',
      'social_token_missing',
      'authorization',
      403,
    )
  }
  const { data: token, error } = await admin.rpc('get_instagram_token', {
    p_secret_id: secretId,
  })
  if (error || typeof token !== 'string' || !token) {
    throw new SocialPublishingError(
      'A autorização da Meta não pôde ser recuperada.',
      'social_token_unavailable',
      'authorization',
      403,
    )
  }
  return token
}
