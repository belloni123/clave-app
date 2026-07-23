import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { syncB16Dashboard } from '@/utils/b16-dashboard'

interface SyncRequestBody {
  dashboardUrl?: string
  externalLaunchCode?: string
  periodStart?: string
  periodEnd?: string | null
}

const ALLOWED_DASHBOARD_HOST = 'suporteb16-collab.github.io'
const ALLOWED_DASHBOARD_PATH = '/dashboard-b16-cnp0426'
const SUPPORTED_LAUNCH_CODE = '0726'
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

function normalizeDashboardUrl(value: string) {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error('Informe uma URL válida para o dashboard.')
  }

  if (
    url.protocol !== 'https:'
    || url.hostname !== ALLOWED_DASHBOARD_HOST
    || !url.pathname.startsWith(ALLOWED_DASHBOARD_PATH)
  ) {
    throw new Error('Esta primeira versão aceita apenas o dashboard B16 da Mundial Cromo.')
  }

  url.hash = ''
  return url.toString()
}

function validateDate(value: string | null | undefined, label: string, optional = false) {
  if (!value && optional) return null
  if (!value || !ISO_DATE_PATTERN.test(value)) {
    throw new Error(`${label} deve estar no formato AAAA-MM-DD.`)
  }
  return value
}

async function getAuthorizedLaunch(launchId: string) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) return { error: errorResponse('Não autorizado.', 401) }

  const { data: launch, error: launchError } = await supabase
    .from('lancamentos')
    .select('id, project_id')
    .eq('id', launchId)
    .maybeSingle()

  if (launchError) return { error: errorResponse('Não foi possível validar o lançamento.', 500) }
  if (!launch) return { error: errorResponse('Lançamento não encontrado ou sem acesso.', 404) }

  return { supabase, user, launch }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ launchId: string }> }
) {
  const { launchId } = await params
  const context = await getAuthorizedLaunch(launchId)
  if ('error' in context) return context.error

  const { data, error } = await context.supabase
    .from('launch_bi_integrations')
    .select('*')
    .eq('lancamento_id', launchId)
    .maybeSingle()

  if (error) return errorResponse('Não foi possível carregar a integração do BI.', 500)
  return NextResponse.json({ integration: data ?? null })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ launchId: string }> }
) {
  const { launchId } = await params
  const context = await getAuthorizedLaunch(launchId)
  if ('error' in context) return context.error

  let body: SyncRequestBody
  try {
    body = await request.json()
  } catch {
    return errorResponse('Corpo da requisição inválido.', 400)
  }

  let dashboardUrl: string
  let periodStart: string
  let periodEnd: string | null
  try {
    dashboardUrl = normalizeDashboardUrl(body.dashboardUrl || '')
    periodStart = validateDate(body.periodStart, 'A data inicial') as string
    periodEnd = validateDate(body.periodEnd, 'A data final', true)
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Configuração inválida.', 400)
  }

  const externalLaunchCode = (body.externalLaunchCode || '').trim()
  if (externalLaunchCode !== SUPPORTED_LAUNCH_CODE) {
    return errorResponse('Use o lançamento CNP 2 - 2026 (código 0726).', 400)
  }
  if (periodEnd && periodEnd < periodStart) {
    return errorResponse('A data final não pode ser anterior à data inicial.', 400)
  }

  const { supabase, user, launch } = context
  const { data: existingIntegration, error: existingError } = await supabase
    .from('launch_bi_integrations')
    .select('id')
    .eq('lancamento_id', launchId)
    .maybeSingle()

  if (existingError) return errorResponse('Não foi possível preparar a integração do BI.', 500)

  const integrationPayload = {
    lancamento_id: launchId,
    project_id: launch.project_id,
    provider: 'b16_dashboard',
    dashboard_url: dashboardUrl,
    external_launch_code: externalLaunchCode,
    period_start: periodStart,
    period_end: periodEnd,
    atualizado_em: new Date().toISOString(),
  }

  const integrationResult = existingIntegration
    ? await supabase
        .from('launch_bi_integrations')
        .update(integrationPayload)
        .eq('id', existingIntegration.id)
        .select('*')
        .single()
    : await supabase
        .from('launch_bi_integrations')
        .insert({ ...integrationPayload, criado_por: user.id })
        .select('*')
        .single()

  if (integrationResult.error || !integrationResult.data) {
    return errorResponse('Não foi possível salvar a configuração do BI.', 500)
  }

  const integration = integrationResult.data

  try {
    const metrics = await syncB16Dashboard({
      externalLaunchCode,
      periodStart,
      periodEnd,
    })

    const { data: existingRealized, error: realizedReadError } = await supabase
      .from('lancamentos_realizado')
      .select('dados')
      .eq('lancamento_id', launchId)
      .maybeSingle()

    if (realizedReadError) throw new Error('Não foi possível ler os dados realizados atuais.')

    const realizedData = {
      ...(existingRealized?.dados || {}),
      vendas: metrics.sales.count,
      leads_pagos: metrics.leads.paid,
      leads_organicos: metrics.leads.organic,
      valor_produto: metrics.sales.ticket,
      bi_sync: {
        provider: metrics.provider,
        external_launch_code: metrics.externalLaunchCode,
        synced_at: metrics.syncedAt,
        period_start: metrics.periodStart,
        period_end: metrics.periodEnd,
      },
    }

    const [snapshotResult, realizedResult] = await Promise.all([
      supabase.from('launch_bi_snapshots').insert({
        integration_id: integration.id,
        lancamento_id: launchId,
        project_id: launch.project_id,
        period_start: metrics.periodStart,
        period_end: metrics.periodEnd,
        metrics,
        source_updated_at: metrics.sourceDataUpdatedAt,
        synced_by: user.id,
      }),
      supabase.from('lancamentos_realizado').upsert({
        lancamento_id: launchId,
        dados: realizedData,
        atualizado_em: metrics.syncedAt,
      }),
    ])

    if (snapshotResult.error) throw new Error('Não foi possível registrar o histórico da sincronização.')
    if (realizedResult.error) throw new Error('Não foi possível atualizar os dados realizados.')

    const { data: updatedIntegration, error: updateError } = await supabase
      .from('launch_bi_integrations')
      .update({
        status: 'connected',
        last_synced_at: metrics.syncedAt,
        last_error: null,
        last_snapshot: metrics,
        atualizado_em: metrics.syncedAt,
      })
      .eq('id', integration.id)
      .select('*')
      .single()

    if (updateError || !updatedIntegration) {
      throw new Error('Os dados chegaram, mas o estado da integração não pôde ser atualizado.')
    }

    return NextResponse.json({ integration: updatedIntegration })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha inesperada ao consultar o BI.'
    await supabase
      .from('launch_bi_integrations')
      .update({
        status: 'error',
        last_error: message,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', integration.id)

    return errorResponse(message, 502)
  }
}
