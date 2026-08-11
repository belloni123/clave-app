'use client'

import React, { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  ClipboardCopy,
  ExternalLink,
  FileUser,
  FolderPlus,
  Loader2,
  Search,
  UserRoundCheck,
  X,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { useAppStore } from '@/store/useAppStore'
import type {
  ExpertApplicationRecord,
  ExpertApplicationStatus,
} from '@/types/expert-application'
import {
  APPLICATION_STATUS_LABELS,
  DIGITAL_PRODUCT_OPTIONS,
  OTHER_PLATFORM_OPTIONS,
  PARTNERSHIP_OPTIONS,
  REVENUE_OPTIONS,
  TIMELINE_OPTIONS,
  TRAFFIC_OPTIONS,
  optionLabel,
} from '@/utils/forms/expert-application'

const STATUS_STYLES: Record<ExpertApplicationStatus, string> = {
  new: 'bg-blue-bg text-blue-t',
  reviewing: 'bg-amber-bg text-amber-t',
  qualified: 'bg-green-bg text-green-t',
  disqualified: 'bg-red-bg text-red-t',
  converted: 'bg-purple-bg text-purple-t',
}

const PROJECT_COLORS = ['#BA7517', '#1D9E75', '#185FA5', '#534AB7', '#D85A30', '#888780']

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

function DetailItem({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`border-b border-border-custom py-3 ${wide ? 'sm:col-span-2' : ''}`}>
      <p className="text-[10px] font-bold uppercase text-text3">{label}</p>
      <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-text-custom">{children || '—'}</div>
    </div>
  )
}

export default function CandidaturasModule() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { profile, setActiveProjectId, showToast } = useAppStore()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | ExpertApplicationStatus>('all')
  const [notes, setNotes] = useState('')
  const [copied, setCopied] = useState(false)
  const [projectModalOpen, setProjectModalOpen] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [projectColor, setProjectColor] = useState(PROJECT_COLORS[0])
  const [origin, setOrigin] = useState('')

  React.useEffect(() => {
    const timer = window.setTimeout(() => setOrigin(window.location.origin), 0)
    return () => window.clearTimeout(timer)
  }, [])

  const canManage = profile?.role === 'admin' || profile?.agency_role === 'admin'

  const { data: applications = [], isLoading, error } = useQuery<ExpertApplicationRecord[]>({
    queryKey: ['expert_applications'],
    queryFn: async () => {
      const { data, error: queryError } = await supabase
        .from('expert_applications')
        .select('*')
        .order('created_at', { ascending: false })
      if (queryError) throw queryError
      return data as ExpertApplicationRecord[]
    },
    enabled: canManage,
  })

  const selected = applications.find((application) => application.id === selectedId) ?? null

  React.useEffect(() => {
    if (!selected) return
    const timer = window.setTimeout(() => setNotes(selected.internal_notes || ''), 0)
    return () => window.clearTimeout(timer)
  }, [selected])

  const updateMutation = useMutation({
    mutationFn: async (payload: { status?: ExpertApplicationStatus; internal_notes?: string }) => {
      if (!selectedId) throw new Error('Selecione uma candidatura.')
      const { error: updateError } = await supabase
        .from('expert_applications')
        .update(payload)
        .eq('id', selectedId)
      if (updateError) throw updateError
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expert_applications'] })
      showToast('Candidatura atualizada')
    },
    onError: (mutationError: Error) => showToast(mutationError.message || 'Não foi possível atualizar.', 'err'),
  })

  const convertMutation = useMutation<string, Error>({
    mutationFn: async () => {
      if (!selectedId) throw new Error('Selecione uma candidatura.')
      const { data, error: conversionError } = await supabase.rpc(
        'convert_expert_application_to_project',
        {
          application_id: selectedId,
          project_name: projectName.trim(),
          project_color: projectColor,
        },
      )
      if (conversionError) throw conversionError
      if (typeof data !== 'string') throw new Error('O projeto não foi identificado após a criação.')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expert_applications'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setProjectModalOpen(false)
      showToast('Projeto criado a partir da candidatura')
    },
    onError: (mutationError) => showToast(mutationError.message || 'Não foi possível criar o projeto.', 'err'),
  })

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR')
    return applications.filter((application) => {
      if (statusFilter !== 'all' && application.status !== statusFilter) return false
      if (!term) return true
      return [application.full_name, application.email, application.whatsapp, application.niche]
        .some((value) => value.toLocaleLowerCase('pt-BR').includes(term))
    })
  }, [applications, search, statusFilter])

  const copyPublicLink = async () => {
    await navigator.clipboard.writeText(`${origin}/candidatura`)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  const openProjectModal = () => {
    if (!selected) return
    setProjectName(selected.full_name)
    setProjectColor(PROJECT_COLORS[0])
    setProjectModalOpen(true)
  }

  if (!canManage) {
    return (
      <div className="border border-border2 bg-surface p-8 text-center">
        <FileUser className="mx-auto h-8 w-8 text-text3" />
        <h3 className="mt-3 text-sm font-bold text-text-custom">Acesso administrativo</h3>
        <p className="mt-1 text-xs text-text2">Somente administradores da B16 podem consultar candidaturas.</p>
      </div>
    )
  }

  const newCount = applications.filter((application) => application.status === 'new').length
  const qualifiedCount = applications.filter((application) => application.status === 'qualified').length
  const convertedCount = applications.filter((application) => application.status === 'converted').length

  return (
    <div className="space-y-5">
      <section className="border border-border2 bg-surface">
        <div className="flex flex-col gap-4 border-b border-border-custom p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-text-custom">Candidaturas de Experts</p>
            <p className="mt-0.5 text-[11px] text-text3">Leads interessados em construir uma parceria com a Agência B16.</p>
          </div>
          <button
            type="button"
            onClick={copyPublicLink}
            disabled={!origin}
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md bg-text-custom px-3.5 text-xs font-bold text-surface transition-opacity hover:opacity-85 disabled:opacity-40"
          >
            {copied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
            {copied ? 'Link copiado' : 'Copiar página pública'}
          </button>
        </div>
        <div className="grid grid-cols-2 divide-x divide-border-custom sm:grid-cols-4">
          {[
            ['Total', applications.length],
            ['Novas', newCount],
            ['Qualificadas', qualifiedCount],
            ['Projetos criados', convertedCount],
          ].map(([label, value]) => (
            <div key={label} className="px-4 py-3">
              <p className="text-[10px] font-bold uppercase text-text3">{label}</p>
              <p className="mt-1 text-xl font-bold text-text-custom">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border border-border2 bg-surface">
        <div className="grid gap-3 border-b border-border-custom p-4 sm:grid-cols-[1fr_190px]">
          <label className="relative">
            <span className="sr-only">Buscar candidaturas</span>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text3" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, e-mail, WhatsApp ou nicho" className="h-10 w-full rounded-md border border-border2 bg-surface pl-10 pr-3 text-xs text-text-custom outline-none focus:border-text-custom" />
          </label>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="h-10 rounded-md border border-border2 bg-surface px-3 text-xs text-text-custom outline-none focus:border-text-custom">
            <option value="all">Todos os status</option>
            {Object.entries(APPLICATION_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-xs text-text2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando candidaturas...</div>
        ) : error ? (
          <div className="p-8 text-center text-xs text-red-t">Não foi possível carregar as candidaturas. Confirme se a migração foi aplicada.</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <FileUser className="mx-auto h-7 w-7 text-text3" />
            <p className="mt-2 text-xs text-text2">Nenhuma candidatura encontrada.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead className="bg-surface2/70 text-[10px] uppercase text-text3">
                <tr>
                  <th className="px-4 py-3 font-bold">Expert</th>
                  <th className="px-4 py-3 font-bold">Contato</th>
                  <th className="px-4 py-3 font-bold">Nicho</th>
                  <th className="px-4 py-3 font-bold">Recebida em</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((application) => (
                  <tr key={application.id} onClick={() => setSelectedId(application.id)} className="cursor-pointer border-t border-border-custom text-xs hover:bg-surface2/45">
                    <td className="px-4 py-3 font-semibold text-text-custom">{application.full_name}</td>
                    <td className="px-4 py-3 text-text2"><div>{application.email}</div><div className="mt-0.5">{application.whatsapp}</div></td>
                    <td className="max-w-[260px] truncate px-4 py-3 text-text2">{application.niche}</td>
                    <td className="px-4 py-3 text-text2">{formatDate(application.created_at)}</td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded px-2 py-1 text-[10px] font-bold ${STATUS_STYLES[application.status]}`}>{APPLICATION_STATUS_LABELS[application.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <div className="fixed inset-0 z-[100] flex justify-end bg-black/55" role="dialog" aria-modal="true" aria-labelledby="application-detail-title">
          <div className="h-full w-full max-w-2xl overflow-y-auto bg-surface shadow-2xl">
            <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border-custom bg-surface px-5 py-4">
              <div>
                <p className="text-[10px] font-bold uppercase text-text3">Candidatura</p>
                <h2 id="application-detail-title" className="mt-1 text-lg font-bold text-text-custom">{selected.full_name}</h2>
                <p className="mt-0.5 text-xs text-text2">Recebida em {formatDate(selected.created_at)}</p>
              </div>
              <button type="button" onClick={() => setSelectedId(null)} title="Fechar" className="rounded-md border border-border2 p-2 text-text2 hover:bg-surface2"><X className="h-4 w-4" /></button>
            </header>

            <div className="p-5">
              <div className="flex flex-col gap-3 border-b border-border-custom pb-5 sm:flex-row sm:items-end sm:justify-between">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase text-text3">Status</span>
                  <select
                    value={selected.status}
                    disabled={selected.status === 'converted' || updateMutation.isPending}
                    onChange={(event) => updateMutation.mutate({ status: event.target.value as ExpertApplicationStatus })}
                    className="h-9 rounded-md border border-border2 bg-surface px-3 text-xs text-text-custom disabled:opacity-60"
                  >
                    {Object.entries(APPLICATION_STATUS_LABELS)
                      .filter(([value]) => value !== 'converted' || selected.status === 'converted')
                      .map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                {selected.converted_project_id ? (
                  <button type="button" onClick={() => setActiveProjectId(selected.converted_project_id)} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md bg-green-custom px-3.5 text-xs font-bold text-white hover:opacity-90">
                    <ExternalLink className="h-4 w-4" /> Abrir projeto
                  </button>
                ) : (
                  <button type="button" onClick={openProjectModal} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md bg-text-custom px-3.5 text-xs font-bold text-surface hover:opacity-85">
                    <FolderPlus className="h-4 w-4" /> Criar projeto
                  </button>
                )}
              </div>

              <div className="grid sm:grid-cols-2">
                <DetailItem label="E-mail"><a className="text-blue-t underline" href={`mailto:${selected.email}`}>{selected.email}</a></DetailItem>
                <DetailItem label="WhatsApp"><a className="text-blue-t underline" href={`https://wa.me/55${selected.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">{selected.whatsapp}</a></DetailItem>
                <DetailItem label="Instagram"><a className="text-blue-t underline" href={selected.instagram.startsWith('@') ? `https://instagram.com/${selected.instagram.slice(1)}` : selected.instagram} target="_blank" rel="noopener noreferrer">{selected.instagram}</a></DetailItem>
                <DetailItem label="Outras plataformas">{selected.other_platforms.map((value) => optionLabel(OTHER_PLATFORM_OPTIONS, value)).join(', ')}</DetailItem>
                <DetailItem label="Nicho" wide>{selected.niche}</DetailItem>
                <DetailItem label="Trabalho e dores" wide>{selected.work_and_pains}</DetailItem>
                <DetailItem label="Concorrente ou referência" wide>{selected.competitor_reference}</DetailItem>
                <DetailItem label="Produtos digitais" wide>{selected.digital_products.map((value) => optionLabel(DIGITAL_PRODUCT_OPTIONS, value)).join(', ')}</DetailItem>
                <DetailItem label="Lançamentos realizados">{selected.launches_count}</DetailItem>
                <DetailItem label="Experiência com parcerias">{selected.partnership_experience.map((value) => optionLabel(PARTNERSHIP_OPTIONS, value)).join(', ')}</DetailItem>
                <DetailItem label="Faturamento em 12 meses">{optionLabel(REVENUE_OPTIONS, selected.revenue_last_12_months)}</DetailItem>
                <DetailItem label="Tráfego pago em 12 meses">{optionLabel(TRAFFIC_OPTIONS, selected.paid_traffic_last_12_months)}</DetailItem>
                <DetailItem label="Investimento mensal em marketing">{formatCurrency(selected.monthly_marketing_budget)}</DetailItem>
                <DetailItem label="Prazo para lançar">{optionLabel(TIMELINE_OPTIONS, selected.launch_timeline)}</DetailItem>
                <DetailItem label="Como conheceu a B16" wide>{selected.discovery_and_impressions}</DetailItem>
                <DetailItem label="Motivação" wide>{selected.motivation}</DetailItem>
                <DetailItem label="Consentimento LGPD" wide>Autorizado em {formatDate(selected.consented_at)}</DetailItem>
              </div>

              <div className="mt-6">
                <label htmlFor="application-notes" className="mb-2 block text-xs font-bold text-text-custom">Anotações internas</label>
                <textarea id="application-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={5} className="w-full rounded-md border border-border2 bg-surface px-3 py-2 text-xs text-text-custom outline-none focus:border-text-custom" />
                <div className="mt-2 flex justify-end">
                  <button type="button" onClick={() => updateMutation.mutate({ internal_notes: notes.trim() })} disabled={updateMutation.isPending} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-border2 px-3 text-xs font-bold text-text-custom hover:bg-surface2 disabled:opacity-50">
                    {updateMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Salvar anotações
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {projectModalOpen && selected && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="create-project-title">
          <div className="w-full max-w-md rounded-md border border-border2 bg-surface p-5 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase text-green-t">Candidatura qualificada</p>
                <h3 id="create-project-title" className="mt-1 text-base font-bold text-text-custom">Criar projeto</h3>
              </div>
              <button type="button" onClick={() => setProjectModalOpen(false)} title="Fechar" className="p-1 text-text3 hover:text-text-custom"><X className="h-4 w-4" /></button>
            </div>
            <p className="mt-3 text-xs leading-5 text-text2">A resposta de {selected.full_name} continuará salva e será vinculada ao novo projeto.</p>
            <label className="mt-5 block">
              <span className="mb-1 block text-xs font-semibold text-text2">Nome do projeto</span>
              <input value={projectName} onChange={(event) => setProjectName(event.target.value)} maxLength={80} autoFocus className="h-10 w-full rounded-md border border-border2 bg-surface px-3 text-xs text-text-custom outline-none focus:border-text-custom" />
            </label>
            <fieldset className="mt-4">
              <legend className="text-xs font-semibold text-text2">Cor</legend>
              <div className="mt-2 flex gap-2">
                {PROJECT_COLORS.map((color) => (
                  <button key={color} type="button" onClick={() => setProjectColor(color)} title={`Cor ${color}`} className={`flex h-8 w-8 items-center justify-center rounded-md border-2 ${projectColor === color ? 'border-text-custom' : 'border-transparent'}`} style={{ backgroundColor: color }}>
                    {projectColor === color && <Check className="h-4 w-4 text-white" />}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setProjectModalOpen(false)} className="min-h-9 rounded-md border border-border2 px-3 text-xs font-bold text-text2 hover:bg-surface2">Cancelar</button>
              <button type="button" onClick={() => convertMutation.mutate()} disabled={projectName.trim().length < 2 || convertMutation.isPending} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-green-custom px-3.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-45">
                {convertMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRoundCheck className="h-4 w-4" />}
                Criar e vincular
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
