'use client'

import { useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  Link2,
  LockKeyhole,
  RefreshCw,
} from 'lucide-react'
import type { LaunchBiIntegration } from '@/types/launch-bi'

interface BiSyncConfig {
  dashboardUrl: string
  periodStart: string
  periodEnd: null
}

interface BiSyncPanelProps {
  integration: LaunchBiIntegration | null | undefined
  defaultDashboardUrl: string
  isLoading: boolean
  isSyncing: boolean
  canManage: boolean
  onSync: (config: BiSyncConfig) => void
}

const DEFAULT_PERIOD_START = `${new Date().toISOString().slice(0, 7)}-01`
const STALE_AFTER_MS = 24 * 60 * 60 * 1000

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  })
}

function formatSyncDate(value: string | null) {
  if (!value) return 'Ainda não sincronizado'
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function isSyncStale(value: string | null | undefined) {
  if (!value) return false
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) && Date.now() - timestamp > STALE_AFTER_MS
}

function isHttpsDashboardUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}

function isB16DashboardUrl(value: string) {
  try {
    const url = new URL(value)
    return isHttpsDashboardUrl(value)
      && url.hostname === 'suporteb16-collab.github.io'
      && (url.pathname === '/dashboard-b16-cnp0426' || url.pathname.startsWith('/dashboard-b16-cnp0426/'))
  } catch {
    return false
  }
}

function supportsAutomaticDiscovery(value: string) {
  try {
    const url = new URL(value)
    return isHttpsDashboardUrl(value)
      && url.hostname === 'suporteb16-collab.github.io'
  } catch {
    return false
  }
}

export default function BiSyncPanel({
  integration,
  defaultDashboardUrl,
  isLoading,
  isSyncing,
  canManage,
  onSync,
}: BiSyncPanelProps) {
  const [dashboardUrl, setDashboardUrl] = useState(
    integration?.dashboard_url || defaultDashboardUrl
  )
  const [periodStart, setPeriodStart] = useState(
    integration?.period_start || DEFAULT_PERIOD_START
  )

  const metrics = integration?.last_snapshot
  const stale = isSyncStale(integration?.last_synced_at)
  const hasValidDashboardUrl = isHttpsDashboardUrl(dashboardUrl)
  const canSync = canManage && !isLoading && hasValidDashboardUrl && !isSyncing
  const isB16Dashboard = isB16DashboardUrl(dashboardUrl)
  const supportsAutomaticSync = supportsAutomaticDiscovery(dashboardUrl)
  const isExternalDashboard = dashboardUrl.trim().length > 0 && !supportsAutomaticSync
  const hasLeadMetrics = Boolean(metrics && (metrics.provider === 'b16_dashboard' || metrics.leads.total > 0))
  const connectorLabel = isB16Dashboard
    ? 'CNP 2 - 2026 · 0726'
    : supportsAutomaticSync ? 'Detecção automática do BI' : 'Link externo por lançamento'

  return (
    <section className="bg-surface border border-border-custom rounded-xl shadow-sm overflow-hidden">
      <div className="flex flex-col gap-3 px-5 py-4 border-b border-border-custom sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 shrink-0 rounded-lg bg-blue-bg text-blue-t flex items-center justify-center">
            <Database className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-xs font-bold text-text-custom">Dados do BI</h4>
              {integration?.status === 'connected' && (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-green-t">
                  <CheckCircle2 className="w-3 h-3" /> {isExternalDashboard ? 'Dashboard salvo' : 'Conectado'}
                </span>
              )}
              {integration?.status === 'error' && (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-red-t">
                  <AlertCircle className="w-3 h-3" /> Erro
                </span>
              )}
              {stale && (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-t">
                  <Clock3 className="w-3 h-3" /> Desatualizado
                </span>
              )}
              {!isLoading && !canManage && (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-text3">
                  <LockKeyhole className="w-3 h-3" /> Somente leitura
                </span>
              )}
            </div>
            <p className="text-[10px] text-text3 truncate">
              {isExternalDashboard ? 'Dashboard externo deste lançamento' : connectorLabel} · {isLoading
                ? 'Carregando integração...'
                : isExternalDashboard ? (integration ? 'Link salvo' : 'Aguardando salvar') : formatSyncDate(integration?.last_synced_at ?? null)}
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={!canSync}
          title={!isLoading && !canManage ? 'Somente editores e administradores podem sincronizar o BI' : undefined}
          onClick={() => onSync({
            dashboardUrl: dashboardUrl.trim(),
            periodStart,
            periodEnd: null,
          })}
          className="h-8 px-3 inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-custom text-white text-[10px] font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Atualizando...' : supportsAutomaticSync ? (integration ? 'Atualizar dados' : 'Conectar e atualizar') : 'Salvar dashboard'}
        </button>
      </div>

      <div className="px-5 py-4 space-y-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_150px_190px]">
          <label className="min-w-0">
            <span className="text-[9px] text-text3 uppercase font-bold block mb-1">URL do dashboard</span>
            <div className="h-9 flex items-center gap-2 px-3 border border-border2 rounded-lg bg-surface">
              <Link2 className="w-3.5 h-3.5 text-text3 shrink-0" />
              <input
                type="url"
                value={dashboardUrl}
                onChange={(event) => setDashboardUrl(event.target.value)}
                readOnly={!canManage}
                placeholder="https://seu-dashboard.com/..."
                className="w-full min-w-0 bg-transparent text-[11px] text-text-custom font-mono outline-none read-only:cursor-not-allowed"
              />
              {hasValidDashboardUrl && (
                <a
                  href={dashboardUrl}
                  target="_blank"
                  rel="noreferrer"
                  title="Abrir dashboard"
                  className="text-text3 hover:text-text-custom shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </label>

          <label>
            <span className="text-[9px] text-text3 uppercase font-bold block mb-1">Início do período</span>
            <input
              type="date"
              value={periodStart}
              onChange={(event) => setPeriodStart(event.target.value)}
              disabled={!canManage}
              className="w-full h-9 px-3 border border-border2 rounded-lg bg-surface text-[11px] text-text-custom outline-none disabled:cursor-not-allowed disabled:opacity-70"
            />
          </label>

          <div>
            <span className="text-[9px] text-text3 uppercase font-bold block mb-1">Integração</span>
            <div className="h-9 px-3 border border-border-custom rounded-lg bg-surface2/60 flex items-center text-[11px] font-bold text-text2">
              {connectorLabel}
            </div>
          </div>
        </div>

        {integration?.last_error && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-bg text-red-t text-[10px]">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{integration.last_error}</span>
          </div>
        )}

        {!isLoading && !integration && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-blue-bg text-blue-t text-[10px]">
            <Database className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>Este lançamento ainda não possui um dashboard conectado. Informe a URL específica dele para iniciar a configuração.</span>
          </div>
        )}

        {!isLoading && isExternalDashboard && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-blue-bg text-blue-t text-[10px]">
            <Link2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>Este dashboard está vinculado somente a este lançamento. A leitura automática será liberada quando houver um conector compatível com a fonte dele.</span>
          </div>
        )}

        {stale && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-bg text-amber-t text-[10px]">
            <Clock3 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>Os dados do BI não são atualizados há mais de 24 horas.</span>
          </div>
        )}

        {isLoading && (
          <div className="h-24 flex items-center justify-center text-[10px] text-text3">
            Carregando integração...
          </div>
        )}

        {!isLoading && metrics && (
          <>
            <div className="grid grid-cols-2 border-y border-border-custom md:grid-cols-3 lg:grid-cols-6">
              {[
                ['Investimento real', formatCurrency(metrics.investment.total)],
                [hasLeadMetrics ? 'Leads totais' : 'CAC', hasLeadMetrics
                  ? metrics.leads.total.toLocaleString('pt-BR')
                  : formatCurrency(metrics.sales.count > 0 ? metrics.investment.total / metrics.sales.count : 0)],
                ['Vendas', metrics.sales.count.toLocaleString('pt-BR')],
                ['Faturamento', formatCurrency(metrics.sales.grossRevenue)],
                [hasLeadMetrics ? 'CPL' : 'Fonte de vendas', hasLeadMetrics
                  ? formatCurrency(metrics.cpl) : 'Tamborete Silver'],
                ['ROAS', `${metrics.roas.toFixed(2)}x`],
              ].map(([label, value], index) => (
                <div
                  key={label}
                  className={`px-3 py-3 min-w-0 ${index > 0 ? 'border-l border-border-custom' : ''}`}
                >
                  <span className="block text-[8px] uppercase font-bold text-text3 truncate">{label}</span>
                  <span className="block mt-1 text-[13px] font-bold text-text-custom truncate">{value}</span>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left border-collapse text-[10px]">
                <thead>
                  <tr className="text-[8px] uppercase font-bold text-text3 border-b border-border-custom">
                    <th className="py-2 pr-3">Etapa</th>
                    <th className="py-2 px-3 text-right">Planejado no Dash</th>
                    <th className="py-2 px-3 text-right">Investido no Dash</th>
                    <th className="py-2 pl-3 text-right">Execução</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-custom/60">
                  {metrics.investment.byStage.map((stage) => (
                    <tr key={stage.tag}>
                      <td className="py-2.5 pr-3">
                        <span className="font-bold text-text-custom">{stage.name}</span>
                        <span className="ml-2 font-mono text-[8px] text-text3">[{stage.tag}]</span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-text2">{formatCurrency(stage.planned)}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-text-custom">{formatCurrency(stage.spent)}</td>
                      <td className="py-2.5 pl-3 text-right">
                        <span className={`font-bold ${stage.executionPercent >= 100 ? 'text-red-t' : stage.executionPercent >= 75 ? 'text-amber-t' : 'text-green-t'}`}>
                          {stage.executionPercent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border-custom font-bold text-text-custom">
                    <td className="py-2.5 pr-3">Total do Dash</td>
                    <td className="py-2.5 px-3 text-right">{formatCurrency(metrics.investment.planned)}</td>
                    <td className="py-2.5 px-3 text-right">{formatCurrency(metrics.investment.total)}</td>
                    <td className="py-2.5 pl-3 text-right">
                      {metrics.investment.planned > 0
                        ? `${((metrics.investment.total / metrics.investment.planned) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
                        : '0%'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex flex-col gap-1 text-[9px] text-text3 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Período: {new Date(`${metrics.periodStart}T12:00:00`).toLocaleDateString('pt-BR')} a {new Date(`${metrics.periodEnd}T12:00:00`).toLocaleDateString('pt-BR')}
              </span>
              {metrics.sourceDataUpdatedAt && <span>Fonte atualizada em {metrics.sourceDataUpdatedAt}</span>}
            </div>
          </>
        )}

        {!isLoading && !metrics && !integration?.last_error && (
          <div className="h-20 flex flex-col items-center justify-center gap-1 text-text3">
            <Database className="w-4 h-4" />
            <span className="text-[10px]">Sem dados sincronizados</span>
          </div>
        )}
      </div>
    </section>
  )
}
