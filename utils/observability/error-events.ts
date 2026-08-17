import 'server-only'

import { createHash, createHmac, randomBytes } from 'node:crypto'
import type { NextRequest } from 'next/server'
import type { createAdminClient } from '@/utils/supabase/admin'

export type ErrorEventCategory =
  | 'public_briefing'
  | 'expert_application'
  | 'briefing_attachment'
  | 'client_runtime'

export type ErrorEventSeverity = 'warning' | 'error' | 'critical'

type AdminClient = ReturnType<typeof createAdminClient>

interface RecordAppErrorInput {
  admin: AdminClient
  request?: NextRequest
  source?: 'server' | 'browser'
  category: ErrorEventCategory
  operation: string
  message: string
  error?: unknown
  stackTrace?: string | null
  severity?: ErrorEventSeverity
  httpStatus?: number
  projectId?: string | null
  formId?: string | null
  submissionId?: string | null
  actorId?: string | null
  leadEmail?: string | null
  pagePath?: string | null
  userAgent?: string | null
  metadata?: Record<string, unknown>
}

function limit(value: string, max: number) {
  return value.trim().slice(0, max)
}

function redactSecrets(value: string) {
  return value
    .replace(
      /((?:access_token|refresh_token|authorization|password|senha|token)\s*[=:]\s*)[^\s&,;]+/gi,
      '$1[REDACTED]',
    )
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
}

function safeText(value: unknown, max: number) {
  return typeof value === 'string' ? limit(redactSecrets(value), max) : ''
}

function safeEmail(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    ? normalized.slice(0, 254)
    : null
}

function safePagePath(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const parsed = new URL(value, 'https://clave.local')
    return limit(parsed.pathname, 500) || '/'
  } catch {
    return limit(value.split(/[?#]/, 1)[0], 500) || null
  }
}

function safeMetadataValue(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') return safeText(value, 300)
  if (depth >= 2) return null
  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item) => safeMetadataValue(item, depth + 1))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 20)
        .map(([key, item]) => [safeText(key, 80), safeMetadataValue(item, depth + 1)]),
    )
  }
  return null
}

function errorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      name: safeText(error.name || 'Error', 120) || 'Error',
      technicalMessage: safeText(error.message, 4000) || null,
      stackTrace: safeText(error.stack, 12000) || null,
    }
  }
  if (error && typeof error === 'object') {
    const candidate = error as { name?: unknown; message?: unknown; code?: unknown }
    const name = safeText(candidate.name, 120) || 'ApplicationError'
    const message = safeText(candidate.message, 3600)
    const code = safeText(candidate.code, 120)
    return {
      name,
      technicalMessage: limit([message, code ? `Código técnico: ${code}` : ''].filter(Boolean).join(' · '), 4000) || null,
      stackTrace: null,
    }
  }
  return {
    name: 'ApplicationError',
    technicalMessage: safeText(error, 4000) || null,
    stackTrace: null,
  }
}

export function createErrorReference() {
  return `CLV-${randomBytes(6).toString('hex').toUpperCase()}`
}

export function clientAddress(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return request.headers.get('cf-connecting-ip')?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || forwarded
    || 'unknown'
}

export function createErrorRateLimitKey(request: NextRequest) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error('Supabase admin credentials are not configured.')
  return createHmac('sha256', secret)
    .update(`app-error-event:${clientAddress(request)}`)
    .digest('hex')
}

export async function recordAppError(input: RecordAppErrorInput) {
  const referenceCode = createErrorReference()
  const details = errorDetails(input.error)
  const message = safeText(input.message, 1000) || 'Falha não identificada.'
  const operation = safeText(input.operation, 100) || 'unknown_operation'
  const pagePath = safePagePath(input.pagePath ?? input.request?.nextUrl.pathname)
  const userAgent = safeText(
    input.userAgent ?? input.request?.headers.get('user-agent'),
    500,
  ) || null
  const fingerprint = createHash('sha256')
    .update([input.category, operation, details.name, details.technicalMessage || message].join('|'))
    .digest('hex')

  const { error: insertError } = await input.admin.from('app_error_events').insert({
    reference_code: referenceCode,
    source: input.source ?? 'server',
    category: input.category,
    operation,
    severity: input.severity ?? 'error',
    project_id: input.projectId ?? null,
    form_id: input.formId ?? null,
    submission_id: input.submissionId ?? null,
    actor_id: input.actorId ?? null,
    lead_email: safeEmail(input.leadEmail),
    page_path: pagePath,
    user_agent: userAgent,
    http_status: input.httpStatus && input.httpStatus >= 400 && input.httpStatus <= 599
      ? input.httpStatus
      : null,
    error_name: details.name,
    message,
    technical_message: details.technicalMessage,
    stack_trace: safeText(input.stackTrace, 12000) || details.stackTrace,
    fingerprint,
    metadata: safeMetadataValue(input.metadata ?? {}),
  })

  if (insertError) {
    console.error(`[${referenceCode}] Error event persistence failed`, insertError.message)
  }
  console.error(`[${referenceCode}] ${input.category}:${operation}`, input.error ?? message)

  return referenceCode
}
