'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardCopy,
  Clock3,
  Eye,
  Loader2,
  RefreshCw,
  Search,
  ServerCrash,
  ShieldAlert,
  X,
} from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import type {
  AppErrorEvent,
  AppErrorEventCategory,
  AppErrorEventSeverity,
  AppErrorEventStatus,
} from '@/types/app-error-event'
import { createClient } from '@/utils/supabase/client'

const STATUS_LABELS: Record<AppErrorEventStatus, string> = {
  new: 'Novo',
  investigating: 'Em análise',
  resolved: 'Resolvido',
}

const STATUS_STYLES: Record<AppErrorEventStatus, string> = {
  new: 'bg-red-bg text-red-t',
  investigating: 'bg-amber-bg text-amber-t',
  resolved: 'bg-green-bg text-green-t',
}

const SEVERITY_LABELS: Record<AppErrorEventSeverity, string> = {
  warning: 'Atenção',
  error: 'Erro',
  critical: 'Crítico',
}

const SEVERITY_STYLES: Record<AppErrorEventSeverity, string> = {
  warning: 'text-amber-t',
  error: 'text-red-t',
  critical: 'text-red-t font-bold',
}

const CATEGORY_LABELS: Record<AppErrorEventCategory, string> = {
  public_briefing: 'Briefing público',
  expert_application: 'Candidatura',
  briefing_attachment: 'Anexo do briefing',
  client_runtime: 'Navegador',
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function Stat({ label, value, icon: Icon, tone }: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  tone: string
}) {
  return (
    <div className="rounded-lg border border-border-custom bg-surface px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase text-text3">{label}</p>
        <Icon className={`h-4 w-4 ${tone}`} />
      </div>
      <p className="mt-2 text-2xl font-bold text-text-custom">{value}</p>
    </div>
  )
}

export default function MonitoramentoModule() {
  const [supabase] = useState(() => createClient())
  const queryClient = useQueryClient()
  const { profile, projects, showToast } = useAppStore()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | AppErrorEventStatus>('all')
  const [categoryFilter, setCategoryFilter] = useState<'all' | AppErrorEventCategory>('all')
  const [periodFilter, setPeriodFilter] = useState<'24h' | '7d' | '30d' | 'all'>('7d')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [copied, setCopied] = useState(false)
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const canManage = profile?.role === 'admin' || profile?.agency_role === 'admin'

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const { data: events = [], isLoading, error, refetch, isFetching } = useQuery<AppErrorEvent[]>({
    queryKey: ['app_error_events'],
    queryFn: async () => {
      const { data, error: queryError } = await supabase
        .from('app_error_events')
        .select('*')
        .order('occurred_at', { ascending: false })
        .limit(500)
      if (queryError) throw queryError
      return data as AppErrorEvent[]
    },
    enabled: canManage,
    refetchInterval: 60_000,
  })

  const projectNames = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  )
  const selected = events.find((event) => event.id === selectedId) ?? null

  const filteredEvents = useMemo(() => {
    const periodMs = periodFilter === '24h'
      ? 24 * 60 * 60 * 1000
      : periodFilter === '7d'
        ? 7 * 24 * 60 * 60 * 1000
        : periodFilter === '30d'
          ? 30 * 24 * 60 * 60 * 1000
          : null
    const term = search.trim().toLowerCase()

    return events.filter((event) => {
      if (statusFilter !== 'all' && event.status !== statusFilter) return false
      if (categoryFilter !== 'all' && event.category !== categoryFilter) return false
      if (periodMs && currentTime - new Date(event.occurred_at).getTime() > periodMs) return false
      if (!term) return true
      const projectName = event.project_id ? projectNames.get(event.project_id) : ''
      return [
        event.reference_code,
        event.message,
        event.technical_message,
        event.lead_email,
        event.page_path,
        projectName,
      ].some((value) => value?.toLowerCase().includes(term))
    })
  }, [categoryFilter, currentTime, events, periodFilter, projectNames, search, statusFilter])

  const last24Hours = currentTime - 24 * 60 * 60 * 1000
  const stats = {
    open: events.filter((event) => event.status !== 'resolved').length,
    today: events.filter((event) => new Date(event.occurred_at).getTime() >= last24Hours).length,
    critical: events.filter((event) => event.severity === 'critical' && event.status !== 'resolved').length,
    resolved: events.filter((event) => event.status === 'resolved').length,
  }

  const updateMutation = useMutation({
    mutationFn: async (payload: { status: AppErrorEventStatus; adminNotes: string }) => {
      if (!selectedId) throw new Error('Selecione uma ocorrência.')
      const { error: updateError } = await supabase
        .from('app_error_events')
        .update({
          status: payload.status,
          admin_notes: payload.adminNotes.trim(),
        })
        .eq('id', selectedId)
      if (updateError) throw updateError
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app_error_events'] })
      showToast('Ocorrência atualizada')
    },
    onError: (mutationError: Error) => {
      showToast(mutationError.message || 'Não foi possível atualizar a ocorrência.', 'err')
    },
  })

  const openDetails = (event: AppErrorEvent) => {
    setSelectedId(event.id)
    setNotes(event.admin_notes)
    setCopied(false)
  }

  const copyReference = async () => {
    if (!selected) return
    await navigator.clipboard.writeText(selected.reference_code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  if (!canManage) {
    return (
      <div className="rounded-lg border border-border-custom bg-surface p-8 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-text3" />
        <h3 className="mt-3 text-sm font-bold text-text-custom">Acesso administrativo</h3>
        <p className="mt-1 text-xs text-text2">Somente administradores do Clave podem consultar o monitoramento.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Em aberto" value={stats.open} icon={ServerCrash} tone="text-red-t" />
        <Stat label="Últimas 24h" value={stats.today} icon={Clock3} tone="text-blue-t" />
        <Stat label="Críticos" value={stats.critical} icon={AlertTriangle} tone="text-amber-t" />
        <Stat label="Resolvidos" value={stats.resolved} icon={CheckCircle2} tone="text-green-t" />
      </section>

      <section className="rounded-lg border border-border-custom bg-surface">
        <div className="flex flex-col gap-3 border-b border-border-custom p-4 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text3" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar código, lead, projeto ou mensagem"
              className="h-9 w-full rounded-md border border-border2 bg-bg pl-9 pr-3 text-xs text-text-custom outline-none focus:border-blue-custom"
            />
          </div>
          <div className="grid grid-cols-3 gap-2 lg:flex">
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
              className="h-9 min-w-0 rounded-md border border-border2 bg-bg px-2 text-xs text-text-custom"
            >
              <option value="all">Todos os status</option>
              <option value="new">Novos</option>
              <option value="investigating">Em análise</option>
              <option value="resolved">Resolvidos</option>
            </select>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value as typeof categoryFilter)}
              className="h-9 min-w-0 rounded-md border border-border2 bg-bg px-2 text-xs text-text-custom"
            >
              <option value="all">Todas as origens</option>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <select
              value={periodFilter}
              onChange={(event) => setPeriodFilter(event.target.value as typeof periodFilter)}
              className="h-9 min-w-0 rounded-md border border-border2 bg-bg px-2 text-xs text-text-custom"
            >
              <option value="24h">24 horas</option>
              <option value="7d">7 dias</option>
              <option value="30d">30 dias</option>
              <option value="all">Todo o período</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Atualizar ocorrências"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border2 text-text2 transition-colors hover:bg-surface2 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="hidden grid-cols-[145px_130px_1fr_150px_105px_50px] gap-3 border-b border-border-custom bg-surface2/50 px-4 py-2 text-[10px] font-bold uppercase text-text3 lg:grid">
          <span>Ocorrência</span>
          <span>Origem</span>
          <span>Contexto</span>
          <span>Lead</span>
          <span>Status</span>
          <span />
        </div>

        {isLoading ? (
          <div className="flex min-h-48 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-text3" />
          </div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-red-t">Não foi possível carregar as ocorrências.</div>
        ) : filteredEvents.length === 0 ? (
          <div className="p-10 text-center">
            <CheckCircle2 className="mx-auto h-7 w-7 text-green-t" />
            <p className="mt-3 text-sm font-semibold text-text-custom">Nenhuma ocorrência encontrada</p>
            <p className="mt-1 text-xs text-text3">Os filtros atuais não possuem erros registrados.</p>
          </div>
        ) : (
          <div className="divide-y divide-border-custom">
            {filteredEvents.map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={() => openDetails(event)}
                className="grid w-full gap-2 px-4 py-3 text-left transition-colors hover:bg-surface2/50 lg:grid-cols-[145px_130px_1fr_150px_105px_50px] lg:items-center lg:gap-3"
              >
                <div>
                  <p className="font-mono text-xs font-bold text-text-custom">{event.reference_code}</p>
                  <p className="mt-1 text-[10px] text-text3">{formatDate(event.occurred_at)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-text-custom">{CATEGORY_LABELS[event.category]}</p>
                  <p className={`mt-1 text-[10px] ${SEVERITY_STYLES[event.severity]}`}>{SEVERITY_LABELS[event.severity]}</p>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs text-text-custom">{event.message}</p>
                  <p className="mt-1 truncate text-[10px] text-text3">
                    {event.project_id ? projectNames.get(event.project_id) || 'Projeto não identificado' : event.page_path || 'Sem projeto'}
                  </p>
                </div>
                <p className="truncate text-xs text-text2">{event.lead_email || 'Não identificado'}</p>
                <span className={`w-fit rounded px-2 py-1 text-[10px] font-bold ${STATUS_STYLES[event.status]}`}>
                  {STATUS_LABELS[event.status]}
                </span>
                <Eye className="hidden h-4 w-4 text-text3 lg:block" />
              </button>
            ))}
          </div>
        )}
      </section>

      {selected && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-5">
          <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-t-lg border border-border-custom bg-surface shadow-2xl sm:rounded-lg">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border-custom bg-surface p-5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-mono text-sm font-bold text-text-custom">{selected.reference_code}</h3>
                  <span className={`rounded px-2 py-1 text-[10px] font-bold ${STATUS_STYLES[selected.status]}`}>
                    {STATUS_LABELS[selected.status]}
                  </span>
                </div>
                <p className="mt-1 text-xs text-text3">{formatDate(selected.occurred_at)} · {CATEGORY_LABELS[selected.category]}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                title="Fechar detalhes"
                className="flex h-8 w-8 items-center justify-center rounded-md text-text3 hover:bg-surface2"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-5 p-5">
              <div className="grid gap-x-6 sm:grid-cols-2">
                {[
                  ['Projeto', selected.project_id ? projectNames.get(selected.project_id) || 'Não identificado' : 'Sem projeto'],
                  ['Lead', selected.lead_email || 'Não identificado'],
                  ['Página', selected.page_path || 'Não informada'],
                  ['Operação', selected.operation],
                  ['Origem técnica', selected.source === 'server' ? 'Servidor' : 'Navegador'],
                  ['HTTP', selected.http_status ? String(selected.http_status) : 'Não informado'],
                  ['Formulário', selected.form_id || 'Não informado'],
                  ['Resposta', selected.submission_id || 'Não informada'],
                  ['Usuário autenticado', selected.actor_id || 'Sessão pública'],
                  ['Navegador', selected.user_agent || 'Não informado'],
                  ['Fingerprint', selected.fingerprint],
                ].map(([label, value]) => (
                  <div key={label} className="border-b border-border-custom py-3">
                    <p className="text-[10px] font-bold uppercase text-text3">{label}</p>
                    <p className="mt-1 break-words text-sm text-text-custom">{value}</p>
                  </div>
                ))}
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase text-text3">Mensagem operacional</p>
                <p className="mt-2 text-sm leading-6 text-text-custom">{selected.message}</p>
              </div>

              {selected.technical_message && (
                <div>
                  <p className="text-[10px] font-bold uppercase text-text3">Detalhe técnico</p>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border-custom bg-bg p-3 text-xs leading-5 text-text2">
                    {selected.error_name ? `${selected.error_name}: ` : ''}{selected.technical_message}
                  </pre>
                </div>
              )}

              {selected.stack_trace && (
                <div>
                  <p className="text-[10px] font-bold uppercase text-text3">Stack trace</p>
                  <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border-custom bg-bg p-3 font-mono text-[11px] leading-5 text-text2">
                    {selected.stack_trace}
                  </pre>
                </div>
              )}

              {Object.keys(selected.metadata || {}).length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase text-text3">Contexto</p>
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-border-custom bg-bg p-3 text-xs text-text2">
                    {JSON.stringify(selected.metadata, null, 2)}
                  </pre>
                </div>
              )}

              <div>
                <label htmlFor="monitoring-notes" className="text-[10px] font-bold uppercase text-text3">Anotações administrativas</label>
                <textarea
                  id="monitoring-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={4}
                  maxLength={4000}
                  placeholder="Registre a causa, a correção aplicada ou o retorno dado ao lead."
                  className="mt-2 w-full resize-y rounded-md border border-border2 bg-bg p-3 text-sm text-text-custom outline-none focus:border-blue-custom"
                />
              </div>
            </div>

            <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-border-custom bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={copyReference}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border2 px-3 text-xs font-semibold text-text2 hover:bg-surface2"
              >
                {copied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
                {copied ? 'Código copiado' : 'Copiar código'}
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => updateMutation.mutate({ status: 'investigating', adminNotes: notes })}
                  disabled={updateMutation.isPending}
                  className="h-9 flex-1 rounded-md border border-border2 px-3 text-xs font-semibold text-text-custom hover:bg-surface2 disabled:opacity-50 sm:flex-none"
                >
                  Marcar em análise
                </button>
                <button
                  type="button"
                  onClick={() => updateMutation.mutate({ status: 'resolved', adminNotes: notes })}
                  disabled={updateMutation.isPending}
                  className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md bg-green-custom px-3 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 sm:flex-none"
                >
                  {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Resolver
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
