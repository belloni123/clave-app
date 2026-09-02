import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { socialFeatureFlags } from '@/utils/social/config'
import { runSocialPublisher } from '@/utils/social/scheduler'
import { createAdminClient } from '@/utils/supabase/admin'
import { recordAppError } from '@/utils/observability/error-events'

export async function POST(request: NextRequest) {
  const configuredSecret = process.env.SOCIAL_CRON_SECRET?.trim()
  const suppliedSecret = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const authorized = Boolean(configuredSecret && suppliedSecret)
    && Buffer.byteLength(configuredSecret as string) === Buffer.byteLength(suppliedSecret as string)
    && timingSafeEqual(Buffer.from(configuredSecret as string), Buffer.from(suppliedSecret as string))
  if (!authorized) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }
  if (!socialFeatureFlags().enabled) {
    return NextResponse.json({ ok: true, disabled: true, claimed: 0 })
  }
  try {
    const result = await runSocialPublisher({ limit: 5 })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    await recordAppError({
      admin: createAdminClient(),
      request,
      category: 'client_runtime',
      operation: 'social_publish_cron',
      message: 'O executor de publicações sociais falhou antes de concluir o lote.',
      error,
      severity: 'critical',
      httpStatus: 500,
    }).catch((monitoringError) => {
      console.error('Social publishing monitoring failed', {
        message: monitoringError instanceof Error ? monitoringError.message : 'unknown',
      })
    })
    return NextResponse.json({ error: 'Falha no executor de publicações.' }, { status: 500 })
  }
}
