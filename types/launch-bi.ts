export interface LaunchBiStageMetric {
  name: string
  tag: string
  planned: number
  spent: number
  executionPercent: number
}

export interface LaunchBiMetrics {
  provider: 'b16_dashboard' | 'farol_e_forja_dashboard'
  externalLaunchCode: string
  periodStart: string
  periodEnd: string
  syncedAt: string
  sourceDataUpdatedAt: string | null
  investment: {
    meta: number
    google: number
    acquisition: number
    total: number
    planned: number
    remarketing: number
    byStage: LaunchBiStageMetric[]
  }
  leads: {
    total: number
    paid: number
    organic: number
    meta: number
    google: number
    untracked: number
  }
  sales: {
    count: number
    refunded: number
    pending: number
    productName: string
    ticket: number
    grossRevenue: number
    netRevenueAfterRefunds: number
    settledRevenue: number
  }
  cpl: number
  conversionRate: number
  roas: number
  remarketingRoas: number
}

export interface LaunchBiIntegration {
  id: string
  lancamento_id: string
  project_id: string
  provider: 'b16_dashboard' | 'farol_e_forja_dashboard' | 'external_dashboard'
  dashboard_url: string
  external_launch_code: string
  period_start: string
  period_end: string | null
  status: 'connected' | 'error'
  last_synced_at: string | null
  last_error: string | null
  last_snapshot: LaunchBiMetrics | null
  criado_em: string
  atualizado_em: string
}

export interface LaunchBiSyncResponse {
  integration: LaunchBiIntegration | null
  canManage: boolean
}
