import { parseCsv } from '@/utils/b16-dashboard'
import type { LaunchBiMetrics } from '@/types/launch-bi'

export interface StructuredDashboardConfig {
  dashboardUrl: string
  workerUrl: string
  metaSheet: string
  salesSheet: string
  externalLaunchCode: string
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
  const salesSheet = extractJavascriptString(html, 'SHEET_TAMB')

  if (!workerUrl || !metaSheet || !salesSheet) {
    throw new Error(
      'O dashboard não segue o modelo automático Meta Ads + Tamborete Silver. Peça ao BI para manter as constantes WORKER_URL, SHEET_META e SHEET_TAMB.'
    )
  }
  if (!SAFE_SHEET_NAME.test(metaSheet) || !SAFE_SHEET_NAME.test(salesSheet)) {
    throw new Error('O dashboard informou nomes de fontes fora do padrão permitido.')
  }

  return {
    dashboardUrl,
    workerUrl: validateWorkerUrl(workerUrl),
    metaSheet,
    salesSheet,
    externalLaunchCode: dashboardCode(dashboardUrl),
  }
}

async function fetchSheet(config: StructuredDashboardConfig, sheet: string) {
  const url = new URL(config.workerUrl)
  url.searchParams.set('sheet', sheet)
  url.searchParams.set('cb', Date.now().toString())
  const csv = await fetchBoundedText(url, sheet, MAX_SHEET_RESPONSE_BYTES)
  return parseCsv(csv)
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
  const effectivePeriodEnd = periodEnd || currentDateInSaoPaulo()
  const [metaRows, salesRows] = await Promise.all([
    fetchSheet(config, config.metaSheet),
    fetchSheet(config, config.salesSheet),
  ])

  const metaSpend = metaRows
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
  const investment = roundCurrency(metaSpend)
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
