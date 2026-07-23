import { parseCsv } from '@/utils/b16-dashboard'
import type { LaunchBiMetrics } from '@/types/launch-bi'

const WORKER_URL = 'https://farol-e-forja-webhook.henrscard.workers.dev'
const REQUEST_TIMEOUT_MS = 45_000
const MAX_SHEET_RESPONSE_BYTES = 8 * 1024 * 1024

const SHEETS = {
  meta: 'meta_ads',
  sales: 'tamborete_silver',
} as const

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

async function readBoundedResponse(response: Response, sheet: string) {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SHEET_RESPONSE_BYTES) {
    throw new Error(`A fonte "${sheet}" excedeu o limite de segurança de 8 MB.`)
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
    if (totalBytes > MAX_SHEET_RESPONSE_BYTES) {
      await reader.cancel()
      throw new Error(`A fonte "${sheet}" excedeu o limite de segurança de 8 MB.`)
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

async function fetchSheet(sheet: string) {
  const url = new URL(WORKER_URL)
  url.searchParams.set('sheet', sheet)
  url.searchParams.set('cb', Date.now().toString())

  let response: Response
  try {
    response = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Accept: 'text/csv',
        'User-Agent': 'Clave-BI-Sync/1.0',
      },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new Error(`A fonte "${sheet}" demorou mais de 45 segundos para responder. Tente atualizar novamente.`)
    }
    throw error
  }

  if (!response.ok) throw new Error(`O BI respondeu com HTTP ${response.status} na fonte "${sheet}".`)
  const csv = await readBoundedResponse(response, sheet)
  if (!csv.trim()) throw new Error(`A fonte "${sheet}" retornou vazia.`)
  return parseCsv(csv)
}

export async function syncFarolEForjaDashboard({
  periodStart,
  periodEnd,
}: {
  periodStart: string
  periodEnd?: string | null
}): Promise<LaunchBiMetrics> {
  const effectivePeriodEnd = periodEnd || currentDateInSaoPaulo()
  const [metaRows, salesRows] = await Promise.all([
    fetchSheet(SHEETS.meta),
    fetchSheet(SHEETS.sales),
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
    provider: 'farol_e_forja_dashboard',
    externalLaunchCode: 'farol-e-forja',
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
      productName: 'Farol e a Forja',
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
