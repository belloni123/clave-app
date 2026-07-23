import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { syncB16Dashboard } from '@/utils/b16-dashboard'
import { syncFarolEForjaDashboard } from '@/utils/farol-e-forja-dashboard'

interface SyncRequestBody {
  dashboardUrl?: string
  externalLaunchCode?: string
  periodStart?: string
  periodEnd?: string | null
  projectId?: string
}

const B16_DASHBOARD_HOST = 'suporteb16-collab.github.io'
const B16_DASHBOARD_PATH = '/dashboard-b16-cnp0426'
const FAROL_E_FORJA_DASHBOARD_PATH = '/farol-e-forja'
const SUPPORTED_LAUNCH_CODE = '0726'
const EXTERNAL_DASHBOARD_CODE = 'external'
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

  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Informe uma URL HTTPS pública e sem credenciais.')
  }

  url.hash = ''
  const isB16Dashboard = url.hostname === B16_DASHBOARD_HOST
    && (url.pathname === B16_DASHBOARD_PATH || url.pathname.startsWith(`${B16_DASHBOARD_PATH}/`))
  const isFarolEForjaDashboard = url.hostname === B16_DASHBOARD_HOST
    && (url.pathname === FAROL_E_FORJA_DASHBOARD_PATH || url.pathname.startsWith(`${FAROL_E_FORJA_DASHBOARD_PATH}/`))

  return {
    dashboardUrl: url.toString(),
    provider: isB16Dashboard
      ? 'b16_dashboard' as const
      : isFarolEForjaDashboard ? 'farol_e_forja_dashboard' as const : 'external_dashboard' as const,
    externalLaunchCode: isB16Dashboard
      ? SUPPORTED_LAUNCH_CODE
      : isFarolEForjaDashboard ? 'farol-e-forja' : EXTERNAL_DASHBOARD_CODE,
  }
}

function validateDate(value: string | null | undefined, label: string, optional = false) {
  if (!value && optional) return null
  if (!value || !ISO_DATE_PATTERN.test(value)) {
    throw new Error(`${label} deve estar no formato AAAA-MM-DD.`)
  }
  return value
}

async function getAuthorizedLaunch(launchId: string, expectedProjectId?: string | null) {
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
  if (expectedProjectId && launch.project_id !== expectedProjectId) {
    return { error: errorResponse('Este lançamento não pertence ao projeto ativo.', 404) }
  }

  const [profileResult, projectResult, projectAccessResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('role, agency_id, agency_role')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('projects')
      .select('user_id, agency_id')
      .eq('id', launch.project_id)
      .maybeSingle(),
    supabase
      .from('project_users')
      .select('permission_level, ativo')
      .eq('project_id', launch.project_id)
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  const profile = profileResult.data
  const project = projectResult.data
  const projectAccess = projectAccessResult.data
  const isSystemAdmin = profile?.role === 'admin'
  const isAgencyManager = Boolean(
    profile?.agency_id
    && profile.agency_id === project?.agency_id
    && (profile.agency_role === 'admin' || profile.agency_role === 'gestor')
  )
  const isProjectOwner = project?.user_id === user.id
  const hasProjectEditAccess = Boolean(
    projectAccess?.ativo
    && (projectAccess.permission_level === 'editor' || projectAccess.permission_level === 'admin')
  )

  return {
    supabase,
    user,
    launch,
    canManage: isSystemAdmin || isAgencyManager || isProjectOwner || hasProjectEditAccess,
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ launchId: string }> }
) {
  const { launchId } = await params
  const context = await getAuthorizedLaunch(
    launchId,
    request.nextUrl.searchParams.get('projectId')
  )
  if ('error' in context) return context.error

  const { data, error } = await context.supabase
    .from('launch_bi_integrations')
    .select('*')
    .eq('lancamento_id', launchId)
    .eq('project_id', context.launch.project_id)
    .maybeSingle()

  if (error) return errorResponse('Não foi possível carregar a integração do BI.', 500)
  return NextResponse.json({ integration: data ?? null, canManage: context.canManage })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ launchId: string }> }
) {
  const { launchId } = await params
  let body: SyncRequestBody
  try {
    body = await request.json()
  } catch {
    return errorResponse('Corpo da requisição inválido.', 400)
  }

  const context = await getAuthorizedLaunch(launchId, body.projectId?.trim())
  if ('error' in context) return context.error
  if (!context.canManage) {
    return errorResponse('Seu acesso a este projeto é somente para visualização.', 403)
  }

  let dashboardConfig: ReturnType<typeof normalizeDashboardUrl>
  let periodStart: string
  let periodEnd: string | null
  try {
    dashboardConfig = normalizeDashboardUrl(body.dashboardUrl || '')
    periodStart = validateDate(body.periodStart, 'A data inicial') as string
    periodEnd = validateDate(body.periodEnd, 'A data final', true)
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Configuração inválida.', 400)
  }

  const requestedLaunchCode = (body.externalLaunchCode || '').trim()
  if (
    dashboardConfig.provider === 'b16_dashboard'
    && requestedLaunchCode
    && requestedLaunchCode !== SUPPORTED_LAUNCH_CODE
  ) {
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
    .eq('project_id', launch.project_id)
    .maybeSingle()

  if (existingError) return errorResponse('Não foi possível preparar a integração do BI.', 500)

  const integrationPayload = {
    lancamento_id: launchId,
    project_id: launch.project_id,
    provider: dashboardConfig.provider,
    dashboard_url: dashboardConfig.dashboardUrl,
    external_launch_code: dashboardConfig.externalLaunchCode,
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

  // External dashboards are saved per launch, but never parsed with the CNP2 connector.
  if (dashboardConfig.provider === 'external_dashboard') {
    const { data: externalIntegration, error: externalUpdateError } = await supabase
      .from('launch_bi_integrations')
      .update({
        status: 'connected',
        last_synced_at: null,
        last_error: null,
        last_snapshot: null,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', integration.id)
      .select('*')
      .single()

    if (externalUpdateError || !externalIntegration) {
      return errorResponse('O dashboard foi salvo, mas seu estado não pôde ser atualizado.', 500)
    }

    return NextResponse.json({ integration: externalIntegration, canManage: true })
  }

  try {
    const metrics = dashboardConfig.provider === 'b16_dashboard'
      ? await syncB16Dashboard({ externalLaunchCode: dashboardConfig.externalLaunchCode, periodStart, periodEnd })
      : await syncFarolEForjaDashboard({ periodStart, periodEnd })

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

    return NextResponse.json({ integration: updatedIntegration, canManage: true })
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
