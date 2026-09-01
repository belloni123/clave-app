import 'server-only'

import { SocialPublishingError } from '@/utils/social/errors'

const DEFAULT_VERSION = 'v26.0'

interface MetaErrorBody {
  error?: {
    message?: string
    code?: number
    error_subcode?: number
    error_user_title?: string
    error_user_msg?: string
    is_transient?: boolean
    fbtrace_id?: string
  }
}

export function metaApiVersion() {
  return process.env.INSTAGRAM_GRAPH_API_VERSION?.trim() || DEFAULT_VERSION
}

export function metaGraphUrl(path: string, host = 'graph.facebook.com') {
  return `https://${host}/${metaApiVersion()}/${path.replace(/^\//, '')}`
}

function retryAfter(response: Response) {
  const value = Number(response.headers.get('retry-after'))
  return Number.isFinite(value) && value > 0 ? Math.min(value, 3_600) : undefined
}

function normalizeMetaError(response: Response, payload: MetaErrorBody) {
  const meta = payload.error
  const code = meta?.code
  const transient = Boolean(meta?.is_transient)
    || response.status === 429
    || response.status >= 500
    || [1, 2, 4, 17, 32, 341, 613].includes(code || 0)
  const permission = response.status === 401
    || response.status === 403
    || [10, 190, 200].includes(code || 0)
  const message = meta?.error_user_msg
    || meta?.error_user_title
    || (permission
      ? 'A autorização da Meta não permite concluir esta publicação.'
      : transient
        ? 'A Meta está temporariamente indisponível. A publicação será tentada novamente.'
        : 'A Meta recusou esta publicação. Revise o conteúdo e as permissões.')

  return new SocialPublishingError(
    message,
    permission ? 'meta_permission_required' : code ? `meta_${code}` : `meta_http_${response.status}`,
    permission ? 'authorization' : transient ? 'retryable' : 'permanent',
    permission ? 403 : response.status,
    retryAfter(response),
  )
}

async function readMetaResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as T & MetaErrorBody
  if (!response.ok || payload.error) throw normalizeMetaError(response, payload)
  return payload
}

export async function metaGet<T>(
  path: string,
  accessToken: string,
  params: Record<string, string> = {},
) {
  const url = new URL(metaGraphUrl(path))
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
  let response: Response
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    })
  } catch (error) {
    throw new SocialPublishingError(
      error instanceof Error && error.name === 'TimeoutError'
        ? 'A Meta demorou para responder.'
        : 'Não foi possível acessar a Meta.',
      'meta_network_error',
      'retryable',
      503,
      30,
    )
  }
  return readMetaResponse<T>(response)
}

export async function metaPost<T>(
  path: string,
  accessToken: string,
  params: Record<string, string>,
  options: { ambiguousOnNetworkFailure?: boolean; host?: string } = {},
) {
  const body = new URLSearchParams(params)
  let response: Response
  try {
    response = await fetch(metaGraphUrl(path, options.host), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    throw new SocialPublishingError(
      options.ambiguousOnNetworkFailure
        ? 'A Meta pode ter recebido a publicação, mas não confirmou a resposta.'
        : 'Não foi possível enviar a solicitação para a Meta.',
      options.ambiguousOnNetworkFailure ? 'meta_delivery_unknown' : 'meta_network_error',
      options.ambiguousOnNetworkFailure ? 'unknown' : 'retryable',
      503,
      options.ambiguousOnNetworkFailure ? undefined : 30,
    )
  }
  return readMetaResponse<T>(response)
}

export async function metaPostJson<T>(
  path: string,
  accessToken: string,
  body: Record<string, unknown>,
  options: { ambiguousOnNetworkFailure?: boolean } = {},
) {
  let response: Response
  try {
    response = await fetch(metaGraphUrl(path), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    throw new SocialPublishingError(
      'A Meta pode ter recebido a publicação, mas não confirmou a resposta.',
      options.ambiguousOnNetworkFailure ? 'meta_delivery_unknown' : 'meta_network_error',
      options.ambiguousOnNetworkFailure ? 'unknown' : 'retryable',
      503,
      options.ambiguousOnNetworkFailure ? undefined : 30,
    )
  }
  return readMetaResponse<T>(response)
}
