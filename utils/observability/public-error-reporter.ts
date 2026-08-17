'use client'

type ErrorEventCategory =
  | 'public_briefing'
  | 'expert_application'
  | 'briefing_attachment'
  | 'client_runtime'

interface PublicErrorReport {
  category: ErrorEventCategory
  operation: string
  message: string
  stackTrace?: string | null
  publicToken?: string
  responseToken?: string | null
  leadEmail?: string | null
  metadata?: Record<string, string | number | boolean | null>
}

export class PublicRequestError extends Error {
  reported: boolean
  reportable: boolean

  constructor(message: string, status: number, reported?: unknown) {
    super(message)
    this.name = 'PublicRequestError'
    this.reported = reported === true
    this.reportable = status >= 500
  }
}

export function publicRequestError(
  data: unknown,
  fallback: string,
  status: number,
) {
  const payload = data && typeof data === 'object'
    ? data as { error?: unknown; reported?: unknown }
    : {}
  const message = typeof payload.error === 'string' ? payload.error : fallback
  return new PublicRequestError(message, status, payload.reported)
}

export async function reportPublicError(report: PublicErrorReport) {
  try {
    const response = await fetch('/api/public/error-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...report,
        pagePath: window.location.pathname,
      }),
      keepalive: true,
    })
    return response.ok
  } catch {
    return false
  }
}
