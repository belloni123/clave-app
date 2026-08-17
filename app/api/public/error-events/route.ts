import { NextRequest, NextResponse } from 'next/server'
import { getPublicForm, getSubmissionByToken } from '@/utils/forms/client-briefing-server'
import { readJsonBody, RequestBodyTooLargeError } from '@/utils/http/read-json-body'
import {
  createErrorRateLimitKey,
  recordAppError,
  type ErrorEventCategory,
} from '@/utils/observability/error-events'
import { createAdminClient } from '@/utils/supabase/admin'
import { createClient as createServerClient } from '@/utils/supabase/server'

export const runtime = 'nodejs'

const MAX_BODY_BYTES = 16_000
const CATEGORIES = new Set<ErrorEventCategory>([
  'public_briefing',
  'expert_application',
  'briefing_attachment',
  'client_runtime',
])

interface ErrorReportBody {
  category?: unknown
  operation?: unknown
  message?: unknown
  stackTrace?: unknown
  publicToken?: unknown
  responseToken?: unknown
  leadEmail?: unknown
  pagePath?: unknown
  metadata?: unknown
}

function shortString(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export async function POST(request: NextRequest) {
  let body: ErrorReportBody
  try {
    body = await readJsonBody(request, MAX_BODY_BYTES) as ErrorReportBody
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ accepted: false }, { status: 413 })
    }
    return NextResponse.json({ accepted: false }, { status: 400 })
  }

  const category = shortString(body.category, 50) as ErrorEventCategory
  const operation = shortString(body.operation, 100)
  const message = shortString(body.message, 1000)
  if (!CATEGORIES.has(category) || operation.length < 2 || message.length < 2) {
    return NextResponse.json({ accepted: false }, { status: 400 })
  }

  const admin = createAdminClient()
  try {
    const { data: allowed, error: rateError } = await admin.rpc(
      'consume_app_error_event_rate_limit',
      { rate_key: createErrorRateLimitKey(request), max_attempts: 30 },
    )
    if (rateError) throw rateError
    if (!allowed) return NextResponse.json({ accepted: true }, { status: 202 })

    const publicToken = shortString(body.publicToken, 200)
    const responseToken = shortString(body.responseToken, 300)
    const form = publicToken ? await getPublicForm(admin, publicToken) : null
    const submission = form && responseToken
      ? await getSubmissionByToken(admin, form.id, responseToken)
      : null
    const answers = submission?.answers && typeof submission.answers === 'object'
      ? submission.answers as Record<string, unknown>
      : null
    const knownEmail = shortString(answers?.client_email, 254)
    const serverClient = await createServerClient()
    const { data: { user: authenticatedUser } } = await serverClient.auth.getUser()

    await recordAppError({
      admin,
      request,
      source: 'browser',
      category,
      operation,
      message: 'Uma pessoa encontrou um erro ao usar uma página pública do Clave.',
      error: new Error(message),
      stackTrace: shortString(body.stackTrace, 12000) || null,
      projectId: form?.project_id ?? null,
      formId: form?.id ?? null,
      submissionId: submission?.id ?? null,
      actorId: authenticatedUser?.id ?? null,
      leadEmail: knownEmail
        || shortString(body.leadEmail, 254)
        || authenticatedUser?.email
        || null,
      pagePath: shortString(body.pagePath, 500) || null,
      userAgent: request.headers.get('user-agent'),
      metadata: body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
        ? body.metadata as Record<string, unknown>
        : {},
    })

    return NextResponse.json({ accepted: true }, { status: 201 })
  } catch (error) {
    console.error('Public error report failed', error)
    return NextResponse.json({ accepted: false }, { status: 500 })
  }
}
