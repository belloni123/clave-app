import { createHmac } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { parseExpertApplicationPayload } from '@/utils/forms/expert-application'
import { readJsonBody, RequestBodyTooLargeError } from '@/utils/http/read-json-body'
import { recordAppError } from '@/utils/observability/error-events'

export const runtime = 'nodejs'

const MAX_BODY_BYTES = 96_000
const MIN_COMPLETION_TIME_MS = 4_000
const MAX_COMPLETION_TIME_MS = 24 * 60 * 60 * 1000

function jsonError(
  message: string,
  status: number,
  errors?: Record<string, string>,
  reported = false,
) {
  return NextResponse.json({ error: message, errors, reported }, { status })
}

function clientAddress(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return request.headers.get('cf-connecting-ip')?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || forwarded
    || 'unknown'
}

function rateLimitKey(request: NextRequest) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error('Supabase admin credentials are not configured.')
  return createHmac('sha256', secret)
    .update(`expert-application:${clientAddress(request)}`)
    .digest('hex')
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await readJsonBody(request, MAX_BODY_BYTES)
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return jsonError('O envio ultrapassou o tamanho permitido.', 413)
    }
    return jsonError('Não foi possível ler os dados enviados.', 400)
  }

  if (
    body
    && typeof body === 'object'
    && typeof (body as Record<string, unknown>).companyWebsite === 'string'
    && ((body as Record<string, unknown>).companyWebsite as string).trim()
  ) {
    return NextResponse.json({ accepted: true }, { status: 201 })
  }

  const parsed = parseExpertApplicationPayload(body)
  if (!parsed.ok) {
    return jsonError('Revise os campos destacados.', 400, parsed.errors as Record<string, string>)
  }

  const elapsed = Date.now() - new Date(parsed.data.startedAt).getTime()
  if (elapsed < MIN_COMPLETION_TIME_MS || elapsed > MAX_COMPLETION_TIME_MS) {
    return jsonError('Atualize a página e tente enviar novamente.', 400)
  }

  try {
    const admin = createAdminClient()
    const { data: allowed, error: rateError } = await admin.rpc(
      'consume_expert_application_rate_limit',
      { rate_key: rateLimitKey(request), max_attempts: 5 },
    )

    if (rateError) throw rateError
    if (!allowed) {
      return jsonError('Muitas tentativas recentes. Aguarde um pouco antes de tentar novamente.', 429)
    }

    const { error } = await admin.from('expert_applications').insert({
      idempotency_key: parsed.data.idempotencyKey,
      full_name: parsed.data.fullName,
      whatsapp: parsed.data.whatsapp,
      email: parsed.data.email,
      instagram: parsed.data.instagram,
      other_platforms: parsed.data.otherPlatforms,
      niche: parsed.data.niche,
      work_and_pains: parsed.data.workAndPains,
      competitor_reference: parsed.data.competitorReference,
      digital_products: parsed.data.digitalProducts,
      launches_count: Number(parsed.data.launchesCount),
      partnership_experience: parsed.data.partnershipExperience,
      revenue_last_12_months: parsed.data.revenueLast12Months,
      paid_traffic_last_12_months: parsed.data.paidTrafficLast12Months,
      monthly_marketing_budget: parsed.data.monthlyMarketingBudgetValue,
      discovery_and_impressions: parsed.data.discoveryAndImpressions,
      launch_timeline: parsed.data.launchTimeline,
      motivation: parsed.data.motivation,
      partnership_authorized: true,
      lgpd_consent: true,
      consented_at: new Date().toISOString(),
    })

    if (error?.code === '23505') {
      return NextResponse.json({ accepted: true, duplicate: true })
    }
    if (error) throw error

    return NextResponse.json({ accepted: true }, { status: 201 })
  } catch (error) {
    const admin = createAdminClient()
    const referenceCode = await recordAppError({
      admin,
      request,
      category: 'expert_application',
      operation: 'submit_application',
      message: 'Não foi possível concluir o envio de uma candidatura.',
      error,
      httpStatus: 500,
      leadEmail: parsed.data.email,
    })
    return jsonError(
      'Não foi possível enviar sua candidatura. Seus dados continuam nesta página para uma nova tentativa.',
      500,
      undefined,
      Boolean(referenceCode),
    )
  }
}
