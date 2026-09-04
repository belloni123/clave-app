import type { NextRequest } from 'next/server'

const PRODUCTION_APP_ORIGIN = 'https://useclave.com.br'

function parseConfiguredOrigin(value: string | undefined) {
  if (!value) return null

  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.origin
  } catch {
    return null
  }
}

export function getPublicAppOrigin(request: NextRequest) {
  const configuredOrigin = parseConfiguredOrigin(process.env.APP_URL)
  if (configuredOrigin) return configuredOrigin

  if (process.env.NODE_ENV === 'production') return PRODUCTION_APP_ORIGIN

  return request.nextUrl.origin
}
