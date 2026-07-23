import type { LaunchBiMetrics, LaunchBiStageMetric } from '@/types/launch-bi'

type CsvRow = Record<string, string>

interface SyncB16DashboardOptions {
  externalLaunchCode: string
  periodStart: string
  periodEnd?: string | null
}

const WORKER_URL = 'https://noisy-brook-b3b8.henrscard.workers.dev'
const REQUEST_TIMEOUT_MS = 20_000

const LAUNCH_CONFIG: Record<string, { productName: string; ticket: number }> = {
  '0726': {
    productName: 'Cromador Pro 2.0',
    ticket: 797,
  },
}

const SHEETS = {
  meta: 'Dados Meta Ads',
  google: 'Dados Google Ads',
  leads: 'Elementor',
  planning: 'Planejamento',
  sales: 'Página1',
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

export function parseCsv(input: string): CsvRow[] {
  const records: string[][] = []
  let record: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]

    if (char === '"') {
      if (quoted && input[index + 1] === '"') {
        field += '"'
        index += 1
      } else {
        quoted = !quoted
      }
      continue
    }

    if (char === ',' && !quoted) {
      record.push(field.trim())
      field = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[index + 1] === '\n') index += 1
      record.push(field.trim())
      field = ''
      if (record.some(Boolean)) records.push(record)
      record = []
      continue
    }

    field += char
  }

  if (field || record.length) {
    record.push(field.trim())
    if (record.some(Boolean)) records.push(record)
  }

  const [headers, ...rows] = records
  if (!headers) return []

  return rows.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header.trim(), values[index] ?? '']))
  )
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

async function fetchSheet(sheet: string, externalLaunchCode: string) {
  const url = new URL(WORKER_URL)
  url.searchParams.set('sheet', sheet)
  url.searchParams.set('lancamento', externalLaunchCode)
  url.searchParams.set('cb', Date.now().toString())

  const response = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Accept: 'text/csv',
      'User-Agent': 'Clave-BI-Sync/1.0',
    },
  })

  if (!response.ok) {
    throw new Error(`O BI respondeu com HTTP ${response.status} na fonte "${sheet}".`)
  }

  const csv = await response.text()
  if (!csv.trim()) throw new Error(`A fonte "${sheet}" retornou vazia.`)
  return parseCsv(csv)
}

function isWithinPeriod(date: string, periodStart: string, periodEnd: string) {
  return date >= periodStart && date <= periodEnd
}

function campaignName(row: CsvRow) {
  return (row['Campaign Name'] || row.Campanha || '').toUpperCase()
}

function metaSpend(row: CsvRow) {
  return parseBrazilianNumber(row['Spend (Cost, Amount Spent)'])
}

function googleSpend(row: CsvRow) {
  return parseBrazilianNumber(row['Cost (Spend, Amount Spent)'] || row.Cost)
}

function buildStageMetrics(
  planningRows: CsvRow[],
  metaRows: CsvRow[],
  googleRows: CsvRow[]
): LaunchBiStageMetric[] {
  const stages = planningRows
    .map((row) => ({
      name: (row.Fase || '').trim(),
      tag: (row['TAG CAMPANHA'] || '').trim().toUpperCase(),
      planned: parseBrazilianNumber(row.Meta),
      spent: 0,
      executionPercent: 0,
    }))
    .filter((stage) => stage.name && stage.tag)

  const addSpend = (row: CsvRow, value: number) => {
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

export async function syncB16Dashboard({
  externalLaunchCode,
  periodStart,
  periodEnd,
}: SyncB16DashboardOptions): Promise<LaunchBiMetrics> {
  const launchConfig = LAUNCH_CONFIG[externalLaunchCode]
  if (!launchConfig) {
    throw new Error('Este lançamento do BI ainda não possui um conector configurado no Clave.')
  }

  const effectivePeriodEnd = periodEnd || currentDateInSaoPaulo()
  const [metaRows, googleRows, leadRows, planningRows, salesRows] = await Promise.all([
    fetchSheet(SHEETS.meta, externalLaunchCode),
    fetchSheet(SHEETS.google, externalLaunchCode),
    fetchSheet(SHEETS.leads, externalLaunchCode),
    fetchSheet(SHEETS.planning, externalLaunchCode),
    fetchSheet(SHEETS.sales, externalLaunchCode),
  ])

  const periodMetaRows = metaRows.filter((row) => {
    const date = (row.Date || '').trim().slice(0, 10)
    return isWithinPeriod(date, periodStart, effectivePeriodEnd)
      && campaignName(row).includes('[CNP]')
  })
  const periodGoogleRows = googleRows.filter((row) => {
    const date = (row['Date (Segment)'] || row.Date || row.Dia || '').trim().slice(0, 10)
    return isWithinPeriod(date, periodStart, effectivePeriodEnd)
  })
  const acquisitionMetaRows = periodMetaRows.filter((row) => {
    const campaign = campaignName(row)
    return campaign.includes('[LEADS]')
  })

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
      || product !== launchConfig.productName
      || !isWithinPeriod(date, periodStart, effectivePeriodEnd)
    ) return

    if (status === 'paid' && !paidOrderRefs.has(orderRef)) {
      paidOrderRefs.add(orderRef)
      settledRevenue += parseBrazilianNumber(row.Faturamento)
    }
    if (status === 'refunded' || status === 'refundeded') refundedOrderRefs.add(orderRef)
    if (status === 'waiting_payment' || status === 'pending') pendingOrderRefs.add(orderRef)
  })

  const salesCount = paidOrderRefs.size
  const grossRevenue = salesCount * launchConfig.ticket
  const netRevenueAfterRefunds = Math.max(salesCount - refundedOrderRefs.size, 0) * launchConfig.ticket
  const organicLeads = periodLeads.length - paidLeads
  const acquisitionInvestment = metaAcquisition + googleTotal
  const sourceDataUpdatedAt = leadRows.find((row) => row.atualizado_em?.trim())?.atualizado_em.trim() || null

  return {
    provider: 'b16_dashboard',
    externalLaunchCode,
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
      productName: launchConfig.productName,
      ticket: launchConfig.ticket,
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
