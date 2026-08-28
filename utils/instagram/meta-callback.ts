import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/utils/supabase/admin'

interface MetaSignedRequestPayload {
  algorithm?: string
  user_id?: string | number
}

function decodeBase64Url(value: string) {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

function instagramAppSecret() {
  const secret = process.env.INSTAGRAM_APP_SECRET?.trim()
  if (!secret) throw new Error('A chave secreta do Instagram não foi configurada.')
  return secret
}

export function verifyMetaSignedRequest(signedRequest: string) {
  const [encodedSignature, encodedPayload, ...extraParts] = signedRequest.split('.')
  if (!encodedSignature || !encodedPayload || extraParts.length > 0) {
    throw new Error('Solicitação assinada inválida.')
  }

  const signature = decodeBase64Url(encodedSignature)
  const expectedSignature = createHmac('sha256', instagramAppSecret())
    .update(encodedPayload)
    .digest()

  if (
    signature.length !== expectedSignature.length
    || !timingSafeEqual(signature, expectedSignature)
  ) {
    throw new Error('Assinatura da Meta inválida.')
  }

  const payload = JSON.parse(decodeBase64Url(encodedPayload).toString('utf8')) as MetaSignedRequestPayload
  if (payload.algorithm?.toUpperCase() !== 'HMAC-SHA256' || !payload.user_id) {
    throw new Error('Conteúdo da solicitação assinada inválido.')
  }

  return { instagramUserId: String(payload.user_id) }
}

export async function readMetaSignedRequest(request: Request) {
  const form = await request.formData()
  const signedRequest = form.get('signed_request')
  if (typeof signedRequest !== 'string' || !signedRequest) {
    throw new Error('A solicitação não contém a assinatura da Meta.')
  }
  return verifyMetaSignedRequest(signedRequest)
}

export async function deleteInstagramDataByUserId(instagramUserId: string) {
  const admin = createAdminClient()
  const { data: connections, error: loadError } = await admin
    .from('instagram_connections')
    .select('id, token_secret_id')
    .eq('instagram_user_id', instagramUserId)

  if (loadError) throw loadError
  if (!connections?.length) return

  for (const connection of connections) {
    if (!connection.token_secret_id) continue
    const { error } = await admin.rpc('delete_instagram_token', {
      p_secret_id: connection.token_secret_id,
    })
    if (error) throw error
  }

  const { error: deleteError } = await admin
    .from('instagram_connections')
    .delete()
    .eq('instagram_user_id', instagramUserId)

  if (deleteError) throw deleteError
}

export function instagramDeletionConfirmationCode(instagramUserId: string) {
  return createHmac('sha256', instagramAppSecret())
    .update(`instagram-data-deletion:${instagramUserId}`)
    .digest('hex')
    .slice(0, 24)
}
