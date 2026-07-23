import { parseCsv } from '@/utils/b16-dashboard'
import type { LaunchBiMetrics } from '@/types/launch-bi'

export interface StructuredDashboardConfig {
  dashboardUrl: string
  workerUrl: string
  mode: 'simple' | 'full'
  metaSheet: string
  salesSheet: string
  externalLaunchCode: string
  googleSheet?: string
  leadsSheet?: string
  planningSheet?: string
  productName?: string
  ticket?: number
  campaignTag?: string
}

const TRUSTED_DASHBOARD_HOST = 'suporteb16-collab.github.io'
const TRUSTED_WORKER_SUFFIX = '.workers.dev'
const REQUEST_TIMEOUT_MS = 20_000
const MAX_DASHBOARD_RESPONSE_BYTES = 2 * 1024 * 1024
const MAX_SHEET_RESPONSE_BYTES = 8 * 1024 * 1024
const SAFE_SHEET_NAME = /^[\p{L}\p{N}_ .&-]{1,80}$/u

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function parseBrazilianNumber(value: unknown) {
  let normalized = String(value ?? '').trim().replace(/[^0-9,.-]/g, '')
  if (!normalized) return 0

  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.')
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(',', '.')
  }

  return Number.parseFloat(normalized) || 0
}

function currentDateInSaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? ''

  return `${part('year')}-${part('month')}-${part('day')}`
}

function isWithinPeriod(date: string, periodStart: string, periodEnd: string) {
  return date >= periodStart && date <= periodEnd
}

function extractJavascriptString(html: string, name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = html.match(
    new RegExp(`(?:const|let|var)\\s+${escapedName}\\s*=\\s*(['"])(.*?)\\1\\s*;`)
  )
  return match?.[2]?.trim() || null
}

function extractJavascriptNumber(html: string, name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = html.match(
    new RegExp(`(?:const|let|var)\\s+${escapedName}\\s*=\\s*([0-9]+(?:\\.[0-9]+)?)\\s*;`)
  )
  return match?.[1] ? Number.parseFloat(match[1]) : null
}

function dashboardCode(value: string) {
  const pathname = new URL(value).pathname
  const code = pathname
    .split('/')
    .filter(Boolean)
    .join('-')
    .replace(/[^A-Za-z0-9_-]/g, '-')
    .slice(0, 32)

  return code.length >= 2 ? code : 'auto-dashboard'
}

function validateWorkerUrl(value: string) {
  let workerUrl: URL
  try {
    workerUrl = new URL(value)
  } catch {
    throw new Error('O dashboard informou uma fonte de dados inválida.')
  }

  if (
    workerUrl.protocol !== 'https:'
    || workerUrl.username
    || workerUrl.password
    || !workerUrl.hostname.endsWith(TRUSTED_WORKER_SUFFIX)
  ) {
    throw new Error('A fonte automática precisa ser um Worker HTTPS público do BI.')
  }

  return workerUrl.toString()
}

export function supportsDashboardDiscovery(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && url.hostname === TRUSTED_DASHBOARD_HOST
  } catch {
    return false
  }
}

async function readBoundedResponse(response: Response, label: string, maxBytes: number) {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error(`A fonte "${label}" excedeu o limite de segurança.`)
  }

  if (!response.body) return ''

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue

    totalBytes += value.byteLength
    if (totalBytes > maxBytes) {
      await reader.cancel()
      throw new Error(`A fonte "${label}" excedeu o limite de segurança.`)
    }
    chunks.push(value)
  }

  const body = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }

  return new TextDecoder().decode(body)
}

async function fetchBoundedText(url: URL, label: string, maxBytes: number) {
  let response: Response
  try {
    response = await fetch(url, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Accept: label === 'dashboard' ? 'text/html' : 'text/csv',
        'User-Agent': 'Clave-BI-Sync/1.0',
      },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new Error(`A fonte "${label}" demorou mais de 20 segundos para responder.`)
    }
    throw error
  }

  if (!response.ok) {
    throw new Error(`O BI respondeu com HTTP ${response.status} na fonte "${label}".`)
  }

  const text = await readBoundedResponse(response, label, maxBytes)
  if (!text.trim()) throw new Error(`A fonte "${label}" retornou vazia.`)
  return text
}

export async function discoverStructuredDashboard(
  dashboardUrl: string
): Promise<StructuredDashboardConfig> {
  if (!supportsDashboardDiscovery(dashboardUrl)) {
    throw new Error('A detecção automática está disponível nos dashboards públicos da B16.')
  }

  const html = await fetchBoundedText(
    new URL(dashboardUrl),
    'dashboard',
    MAX_DASHBOARD_RESPONSE_BYTES
  )
  const workerUrl = extractJavascriptString(html, 'WORKER_URL')
  const metaSheet = extractJavascriptString(html, 'SHEET_META')
  const simpleSalesSheet = extractJavascriptString(html, 'SHEET_TAMB')
  const fullSalesSheet = extractJavascriptString(html, 'SHEET_KIWIFY')
  const leadsSheet = extractJavascriptString(html, 'SHEET_WP')
  const planningSheet = extractJavascriptString(html, 'SHEET_PLAN')
  const googleSheet = extractJavascriptString(html, 'SHEET_GOOGLE')
  const activeLaunchCode = extractJavascriptString(html, 'LANCAMENTO_ATIVO')
  const productName = extractJavascriptString(html, 'PRODUTO_EXATO')
  const campaignTag = extractJavascriptString(html, 'CNP_TAG')
  const ticket = extractJavascriptNumber(html, 'TICKET')

  const hasFullContract = Boolean(
    workerUrl
    && metaSheet
    && fullSalesSheet
    && leadsSheet
    && planningSheet
    && googleSheet
    && activeLaunchCode
    && productName
    && ticket
    && campaignTag
  )
  const hasSimpleContract = Boolean(workerUrl && metaSheet && simpleSalesSheet)

  if (!hasFullContract && !hasSimpleContract) {
    throw new Error(
      'O dashboard não segue o modelo automático da B16. Peça ao BI para publicar o contrato completo do Cromador Pro ou, no mínimo, WORKER_URL, SHEET_META e SHEET_TAMB.'
    )
  }

  const sheetNames = hasFullContract
    ? [metaSheet, fullSalesSheet, leadsSheet, planningSheet, googleSheet]
    : [metaSheet, simpleSalesSheet]
  if (sheetNames.some((sheet) => !sheet || !SAFE_SHEET_NAME.test(sheet))) {
    throw new Error('O dashboard informou nomes de fontes fora do padrão permitido.')
  }
  if (hasFullContract && (!ticket || ticket <= 0)) {
    throw new Error('O dashboard completo informou um ticket inválido.')
  }

  const resolvedWorkerUrl = workerUrl as string
  const resolvedMetaSheet = metaSheet as string
  const resolvedSalesSheet = (hasFullContract ? fullSalesSheet : simpleSalesSheet) as string
  const resolvedExternalLaunchCode = hasFullContract
    ? activeLaunchCode as string
    : dashboardCode(dashboardUrl)

  return {
    dashboardUrl,
    workerUrl: validateWorkerUrl(resolvedWorkerUrl),
    mode: hasFullContract ? 'full' : 'simple',
    metaSheet: resolvedMetaSheet,
    salesSheet: resolvedSalesSheet,
    externalLaunchCode: resolvedExternalLaunchCode,
    googleSheet: hasFullContract ? googleSheet as string : undefined,
    leadsSheet: hasFullContract ? leadsSheet as string : undefined,
    planningSheet: hasFullContract ? planningSheet as string : undefined,
    productName: hasFullContract ? productName as string : undefined,
    ticket: hasFullContract ? ticket as number : undefined,
    campaignTag: hasFullContract ? campaignTag as string : undefined,
  }
}

async function fetchSheet(config: StructuredDashboardConfig, sheet: string) {
  const url = new URL(config.workerUrl)
  url.searchParams.set('sheet', sheet)
  if (config.mode === 'full') {
    url.searchParams.set('lancamento', config.externalLaunchCode)
  }
  url.searchParams.set('cb', Date.now().toString())
  const csv = await fetchBoundedText(url, sheet, MAX_SHEET_RESPONSE_BYTES)
  return parseCsv(csv)
}

function campaignName(row: Record<string, string>) {
  return (row['Campaign Name'] || row.Campanha || '').toUpperCase()
}

function metaSpend(row: Record<string, string>) {
  return parseBrazilianNumber(row['Spend (Cost, Amount Spent)'])
}

function googleSpend(row: Record<string, string>) {
  return parseBrazilianNumber(row['Cost (Spend, Amount Spent)'] || row.Cost)
}

function buildStageMetrics(
  planningRows: Record<string, string>[],
  metaRows: Record<string, string>[],
  googleRows: Record<string, string>[]
) {
  const stages = planningRows
    .map((row) => ({
      name: (row.Fase || '').trim(),
      tag: (row['TAG CAMPANHA'] || '').trim().toUpperCase(),
      planned: parseBrazilianNumber(row.Meta),
      spent: 0,
      executionPercent: 0,
    }))
    .filter((stage) => stage.name && stage.tag)

  const addSpend = (row: Record<string, string>, value: number) => {
    const campaign = campaignName(row)
    const stage = stages.find((candidate) => campaign.includes(`[${candidate.tag}]`))
    if (stage) stage.spent += value
  }

  metaRows.forEach((row) => addSpend(row, metaSpend(row)))
  googleRows.forEach((row) => addSpend(row, googleSpend(row)))

  return stages.map((stage) => ({
    ...stage,
    spent: roundCurrency(stage.spent),
    executionPercent: stage.planned > 0
      ? Math.round((stage.spent / stage.planned) * 10_000) / 100
      : 0,
  }))
}

async function syncFullDashboard({
  config,
  periodStart,
  periodEnd,
}: {
  config: StructuredDashboardConfig
  periodStart: string
  periodEnd?: string | null
}): Promise<LaunchBiMetrics> {
  if (
    !config.googleSheet
    || !config.leadsSheet
    || !config.planningSheet
    || !config.productName
    || !config.ticket
    || !config.campaignTag
  ) {
    throw new Error('O dashboard completo está sem configuração suficiente para sincronizar.')
  }

  const effectivePeriodEnd = periodEnd || currentDateInSaoPaulo()
  const [metaRows, googleRows, leadRows, planningRows, salesRows] = await Promise.all([
    fetchSheet(config, config.metaSheet),
    fetchSheet(config, config.googleSheet),
    fetchSheet(config, config.leadsSheet),
    fetchSheet(config, config.planningSheet),
    fetchSheet(config, config.salesSheet),
  ])
  const campaignTag = config.campaignTag.toUpperCase()

  const periodMetaRows = metaRows.filter((row) => {
    const date = (row.Date || '').trim().slice(0, 10)
    return isWithinPeriod(date, periodStart, effectivePeriodEnd)
      && campaignName(row).includes(campaignTag)
  })
  const periodGoogleRows = googleRows.filter((row) => {
    const date = (row['Date (Segment)'] || row.Date || row.Dia || '').trim().slice(0, 10)
    return isWithinPeriod(date, periodStart, effectivePeriodEnd)
  })
  const acquisitionMetaRows = periodMetaRows.filter((row) => campaignName(row).includes('[LEADS]'))

  const stages = buildStageMetrics(planningRows, periodMetaRows, periodGoogleRows)
  const metaTotal = periodMetaRows.reduce((sum, row) => sum + metaSpend(row), 0)
  const metaAcquisition = acquisitionMetaRows.reduce((sum, row) => sum + metaSpend(row), 0)
  const googleTotal = periodGoogleRows.reduce((sum, row) => sum + googleSpend(row), 0)
  const totalInvestment = metaTotal + googleTotal
  const classifiedInvestment = stages.reduce((sum, stage) => sum + stage.spent, 0)
  const unclassifiedInvestment = roundCurrency(totalInvestment - classifiedInvestment)
  if (unclassifiedInvestment > 0.01) {
    stages.push({
      name: 'Sem etapa',
      tag: 'OUTROS',
      planned: 0,
      spent: unclassifiedInvestment,
      executionPercent: 0,
    })
  }
  const totalPlanned = stages.reduce((sum, stage) => sum + stage.planned, 0)
  const remarketing = stages.find((stage) => stage.tag === 'RMKT')?.spent ?? 0

  const periodLeads = leadRows.filter((row) => {
    const date = (row['Created At'] || '').trim().slice(0, 10)
    const name = (row['Nome*'] || row.Nome || '').trim()
    return Boolean(name) && isWithinPeriod(date, periodStart, effectivePeriodEnd)
  })

  let paidLeads = 0
  let metaLeads = 0
  let googleLeads = 0
  let untrackedLeads = 0

  periodLeads.forEach((row) => {
    const source = (row.utm_source || '').toLowerCase().trim()
    const medium = (row.utm_medium || '').toLowerCase().trim()
    if (source === 'quente' || source === 'frio' || source.includes('googleads')) paidLeads += 1

    if (medium.includes('[feed/stories]')) metaLeads += 1
    else if (medium === 'youtube') googleLeads += 1
    else if (medium !== 'organico') untrackedLeads += 1
  })

  const paidOrderRefs = new Set<string>()
  const refundedOrderRefs = new Set<string>()
  const pendingOrderRefs = new Set<string>()
  let settledRevenue = 0

  salesRows.forEach((row) => {
    const date = (row['Data Criacao'] || '').trim().slice(0, 10)
    const product = (row.Product_product_name || '').trim()
    const orderRef = (row.order_ref || '').trim()
    const status = (row.order_status || '').trim().toLowerCase()

    if (
      !orderRef
      || product !== config.productName
      || !isWithinPeriod(date, periodStart, effectivePeriodEnd)
    ) return

    if ((status === 'paid' || status === 'paided') && !paidOrderRefs.has(orderRef)) {
      paidOrderRefs.add(orderRef)
      settledRevenue += parseBrazilianNumber(row.Faturamento)
    }
    if (status === 'refunded' || status === 'refundeded') refundedOrderRefs.add(orderRef)
    if (status === 'waiting_payment' || status === 'pending') pendingOrderRefs.add(orderRef)
  })

  const salesCount = paidOrderRefs.size
  const grossRevenue = salesCount * config.ticket
  const netRevenueAfterRefunds = Math.max(salesCount - refundedOrderRefs.size, 0) * config.ticket
  const organicLeads = periodLeads.length - paidLeads
  const acquisitionInvestment = metaAcquisition + googleTotal
  const sourceDataUpdatedAt = leadRows.find((row) => row.atualizado_em?.trim())?.atualizado_em.trim() || null

  return {
    provider: 'auto_dashboard',
    externalLaunchCode: config.externalLaunchCode,
    periodStart,
    periodEnd: effectivePeriodEnd,
    syncedAt: new Date().toISOString(),
    sourceDataUpdatedAt,
    investment: {
      meta: roundCurrency(metaTotal),
      google: roundCurrency(googleTotal),
      acquisition: roundCurrency(acquisitionInvestment),
      total: roundCurrency(totalInvestment),
      planned: roundCurrency(totalPlanned),
      remarketing: roundCurrency(remarketing),
      byStage: stages,
    },
    leads: {
      total: periodLeads.length,
      paid: paidLeads,
      organic: organicLeads,
      meta: metaLeads,
      google: googleLeads,
      untracked: untrackedLeads,
    },
    sales: {
      count: salesCount,
      refunded: refundedOrderRefs.size,
      pending: pendingOrderRefs.size,
      productName: config.productName,
      ticket: config.ticket,
      grossRevenue: roundCurrency(grossRevenue),
      netRevenueAfterRefunds: roundCurrency(netRevenueAfterRefunds),
      settledRevenue: roundCurrency(settledRevenue),
    },
    cpl: paidLeads > 0 ? roundCurrency(acquisitionInvestment / paidLeads) : 0,
    conversionRate: periodLeads.length > 0
      ? Math.round((salesCount / periodLeads.length) * 10_000) / 100
      : 0,
    roas: totalInvestment > 0 ? Math.round((grossRevenue / totalInvestment) * 100) / 100 : 0,
    remarketingRoas: remarketing > 0 ? Math.round((grossRevenue / remarketing) * 100) / 100 : 0,
  }
}

async function syncSimpleDashboard({
  config,
  periodStart,
  periodEnd,
}: {
  config: StructuredDashboardConfig
  periodStart: string
  periodEnd?: string | null
}): Promise<LaunchBiMetrics> {
  const effectivePeriodEnd = periodEnd || currentDateInSaoPaulo()
  const [metaRows, salesRows] = await Promise.all([
    fetchSheet(config, config.metaSheet),
    fetchSheet(config, config.salesSheet),
  ])

  const metaSpendTotal = metaRows
    .filter((row) => isWithinPeriod((row.Date || '').trim().slice(0, 10), periodStart, effectivePeriodEnd))
    .reduce((sum, row) => sum + parseBrazilianNumber(row['Spend (Cost, Amount Spent)']), 0)

  const paidOrderIds = new Set<string>()
  let grossRevenue = 0
  salesRows.forEach((row) => {
    const date = (row.data_transacao || '').trim().slice(0, 10)
    const status = (row.status_transacao || '').trim().toUpperCase()
    const orderId = (row.id_transacao || '').trim()
    if (!orderId || !isWithinPeriod(date, periodStart, effectivePeriodEnd)) return
    if ((status === 'APPROVED' || status === 'COMPLETE') && !paidOrderIds.has(orderId)) {
      paidOrderIds.add(orderId)
      grossRevenue += parseBrazilianNumber(row.valor_transacao)
    }
  })

  const salesCount = paidOrderIds.size
  const investment = roundCurrency(metaSpendTotal)
  const revenue = roundCurrency(grossRevenue)
  const averageTicket = salesCount > 0 ? roundCurrency(revenue / salesCount) : 0

  return {
    provider: 'auto_dashboard',
    externalLaunchCode: config.externalLaunchCode,
    periodStart,
    periodEnd: effectivePeriodEnd,
    syncedAt: new Date().toISOString(),
    sourceDataUpdatedAt: null,
    investment: {
      meta: investment,
      google: 0,
      acquisition: investment,
      total: investment,
      planned: 0,
      remarketing: 0,
      byStage: [{
        name: 'Meta Ads',
        tag: 'META',
        planned: 0,
        spent: investment,
        executionPercent: 0,
      }],
    },
    leads: { total: 0, paid: 0, organic: 0, meta: 0, google: 0, untracked: 0 },
    sales: {
      count: salesCount,
      refunded: 0,
      pending: 0,
      productName: config.externalLaunchCode,
      ticket: averageTicket,
      grossRevenue: revenue,
      netRevenueAfterRefunds: revenue,
      settledRevenue: revenue,
    },
    cpl: 0,
    conversionRate: 0,
    roas: investment > 0 ? Math.round((revenue / investment) * 100) / 100 : 0,
    remarketingRoas: 0,
  }
}

export async function syncStructuredDashboard({
  config,
  periodStart,
  periodEnd,
}: {
  config: StructuredDashboardConfig
  periodStart: string
  periodEnd?: string | null
}): Promise<LaunchBiMetrics> {
  return config.mode === 'full'
    ? syncFullDashboard({ config, periodStart, periodEnd })
    : syncSimpleDashboard({ config, periodStart, periodEnd })
}
