'use client'

import React, { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  History,
  Loader2,
  Save,
  TrendingUp,
  UserRound,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { useAppStore } from '@/store/useAppStore'
import {
  normalizeClientScenario,
  normalizeContractProfile,
  type ClientScenario,
  type ContractProfile,
  type ProjectClientProfileRecord,
} from '@/types/project-client-profile'

type ClientTab = 'profile' | 'baseline' | 'current'

interface FieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'email' | 'tel' | 'number'
  multiline?: boolean
  rows?: number
  help?: string
  placeholder?: string
  step?: string
}

const TABS: Array<{
  id: ClientTab
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}> = [
  {
    id: 'profile',
    label: 'Perfil do cliente',
    description: 'Dados de contrato',
    icon: UserRound,
  },
  {
    id: 'baseline',
    label: 'Cenário de entrada',
    description: 'O marco zero',
    icon: History,
  },
  {
    id: 'current',
    label: 'Cenário atual',
    description: 'Evolução acompanhada',
    icon: TrendingUp,
  },
]

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 13)
  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{0,2})(\d{0,4})(\d{0,4}).*/, '($1) $2-$3')
      .replace(/[() -]+$/, '')
  }
  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{0,2})(\d{0,5})(\d{0,4}).*/, '($1) $2-$3')
      .replace(/[() -]+$/, '')
  }
  return digits
    .replace(/^(\d{0,2})(\d{0,2})(\d{0,5})(\d{0,4}).*/, '+$1 ($2) $3-$4')
    .replace(/[() +\-]+$/, '')
}

function formatCnpj(value: string) {
  return value
    .replace(/\D/g, '')
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

function toNumber(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatCompactNumber(value: string) {
  const parsed = toNumber(value)
  if (parsed === null || value === '') return '—'
  return new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(parsed)
}

function formatCurrency(value: string) {
  const parsed = toNumber(value)
  if (parsed === null || value === '') return '—'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(parsed)
}

function Field({
  id,
  label,
  value,
  onChange,
  type = 'text',
  multiline = false,
  rows = 4,
  help,
  placeholder,
  step,
}: FieldProps) {
  const inputClass = 'w-full rounded-md border border-border2 bg-surface px-3 py-2.5 text-xs text-text-custom outline-none transition-colors placeholder:text-text3 focus:border-purple-custom focus:ring-2 focus:ring-purple-custom/15'
  return (
    <label htmlFor={id} className="block min-w-0">
      <span className="block text-[11px] font-semibold text-text-custom">{label}</span>
      {help && <span className="mt-1 block text-[10px] leading-4 text-text3">{help}</span>}
      {multiline ? (
        <textarea
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={rows}
          placeholder={placeholder}
          className={`${inputClass} mt-2 resize-y`}
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          min={type === 'number' ? '0' : undefined}
          step={type === 'number' ? step || '1' : undefined}
          inputMode={type === 'number' ? 'decimal' : undefined}
          placeholder={placeholder}
          className={`${inputClass} mt-2`}
        />
      )}
    </label>
  )
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="border-t border-border-custom py-6 first:border-t-0 first:pt-0">
      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
        <div>
          <h3 className="text-xs font-bold text-text-custom">{title}</h3>
          <p className="mt-1 text-[11px] leading-5 text-text3">{description}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">{children}</div>
      </div>
    </section>
  )
}

function ComparisonMetric({
  label,
  baseline,
  current,
  formatter,
}: {
  label: string
  baseline: string
  current: string
  formatter: (value: string) => string
}) {
  const baselineValue = toNumber(baseline)
  const currentValue = toNumber(current)
  const delta = baselineValue !== null && currentValue !== null
    ? currentValue - baselineValue
    : null

  return (
    <article className="min-w-0 border border-border-custom bg-surface px-4 py-3">
      <p className="text-[10px] font-bold uppercase text-text3">{label}</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[9px] uppercase text-text3">Entrada</p>
          <p className="mt-1 truncate text-sm font-semibold text-text2">{formatter(baseline)}</p>
        </div>
        <div>
          <p className="text-[9px] uppercase text-text3">Atual</p>
          <p className="mt-1 truncate text-sm font-bold text-text-custom">{formatter(current)}</p>
        </div>
      </div>
      <p className={`mt-3 text-[10px] font-semibold ${delta === null ? 'text-text3' : delta >= 0 ? 'text-green-t' : 'text-red-t'}`}>
        {delta === null ? 'Preencha os dois cenários' : `${delta >= 0 ? '+' : ''}${formatter(String(delta))} desde a entrada`}
      </p>
    </article>
  )
}

export default function ClienteModule() {
  const supabase = useMemo(() => createClient(), [])
  const { activeProjectId, projects } = useAppStore()

  const activeProject = projects.find((project) => project.id === activeProjectId)

  const { data, isLoading, error } = useQuery<ProjectClientProfileRecord | null>({
    queryKey: ['project_client_profile', activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return null
      const { data: record, error: readError } = await supabase
        .from('project_client_profiles')
        .select('*')
        .eq('project_id', activeProjectId)
        .maybeSingle()
      if (readError) throw readError
      return record as ProjectClientProfileRecord | null
    },
    enabled: Boolean(activeProjectId),
  })

  if (!activeProjectId) {
    return <div className="py-16 text-center text-xs text-text3">Selecione um projeto para consultar o cliente.</div>
  }

  if (isLoading) {
    return <div className="flex items-center justify-center gap-2 py-16 text-xs text-text3"><Loader2 className="h-4 w-4 animate-spin" /> Carregando perfil...</div>
  }

  if (error) {
    return <div className="py-16 text-center text-xs text-red-t">Não foi possível carregar o perfil deste projeto.</div>
  }

  return (
    <ClientProfileEditor
      key={activeProjectId}
      activeProjectId={activeProjectId}
      projectName={activeProject?.name || 'Projeto'}
      initialData={data || null}
    />
  )
}

function ClientProfileEditor({
  activeProjectId,
  projectName,
  initialData,
}: {
  activeProjectId: string
  projectName: string
  initialData: ProjectClientProfileRecord | null
}) {
  const supabase = useMemo(() => createClient(), [])
  const queryClient = useQueryClient()
  const { profile, showToast } = useAppStore()
  const [activeTab, setActiveTab] = useState<ClientTab>('profile')
  const [contract, setContract] = useState<ContractProfile>(() => normalizeContractProfile(initialData?.contract_profile))
  const [baseline, setBaseline] = useState<ClientScenario>(() => normalizeClientScenario(initialData?.baseline_snapshot))
  const [current, setCurrent] = useState<ClientScenario>(() => normalizeClientScenario(initialData?.current_snapshot))

  const savedState = useMemo(() => JSON.stringify({
    contract: normalizeContractProfile(initialData?.contract_profile),
    baseline: normalizeClientScenario(initialData?.baseline_snapshot),
    current: normalizeClientScenario(initialData?.current_snapshot),
  }), [initialData])
  const localState = JSON.stringify({ contract, baseline, current })
  const hasChanges = localState !== savedState

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.id) throw new Error('Usuário indisponível.')
      const { data: saved, error: saveError } = await supabase
        .from('project_client_profiles')
        .upsert({
          project_id: activeProjectId,
          contract_profile: contract,
          baseline_snapshot: baseline,
          current_snapshot: current,
          updated_by: profile.id,
        }, { onConflict: 'project_id' })
        .select('*')
        .single()
      if (saveError) throw saveError
      return saved as ProjectClientProfileRecord
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(['project_client_profile', activeProjectId], saved)
      showToast('Informações do cliente salvas')
    },
    onError: () => showToast('Não foi possível salvar as informações do cliente', 'err'),
  })

  const setContractField = (field: keyof ContractProfile, value: string) => {
    setContract((previous) => ({ ...previous, [field]: value }))
  }
  const setBaselineField = (field: keyof ClientScenario, value: string) => {
    setBaseline((previous) => ({ ...previous, [field]: value }))
  }
  const setCurrentField = (field: keyof ClientScenario, value: string) => {
    setCurrent((previous) => ({ ...previous, [field]: value }))
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-border-custom pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase text-purple-t">{projectName}</p>
          <h2 className="mt-1 text-lg font-bold text-text-custom">Cliente & Evolução</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-text3">Centralize dados contratuais e compare o marco de entrada com o momento atual, sem duplicar os históricos de Lançamentos.</p>
        </div>
        <div className="flex items-center gap-3">
          {initialData?.updated_at && <span className="hidden text-[10px] text-text3 md:inline">Atualizado em {new Date(initialData.updated_at).toLocaleString('pt-BR')}</span>}
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={!hasChanges || saveMutation.isPending}
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md bg-text-custom px-4 text-xs font-semibold text-surface transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar alterações
          </button>
        </div>
      </header>

      <nav className="grid border-b border-border-custom sm:grid-cols-3" aria-label="Seções do cliente">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const selected = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-current={selected ? 'page' : undefined}
              className={`flex min-h-14 items-center gap-3 border-b-2 px-3 text-left transition-colors ${selected ? 'border-purple-custom text-text-custom' : 'border-transparent text-text3 hover:bg-surface2/40 hover:text-text-custom'}`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold">{tab.label}</span>
                <span className="mt-0.5 block truncate text-[10px] font-normal text-text3">{tab.description}</span>
              </span>
            </button>
          )
        })}
      </nav>

      {activeTab === 'profile' && (
        <div className="animate-[fadeUp_0.15s_ease_both]">
          <div className="mb-6 flex items-start gap-3 border-l-2 border-blue-custom bg-blue-bg/45 px-4 py-3 text-[11px] leading-5 text-blue-t">
            <Building2 className="mt-0.5 h-4 w-4 shrink-0" />
            Os campos compatíveis enviados pelo briefing público aparecem aqui automaticamente. Informações já preenchidas pela equipe são preservadas.
          </div>
          <FormSection title="Dados de contrato" description="Informações cadastrais do cliente, expert ou empresa responsável pelo projeto.">
            <Field id="client-full-name" label="Nome" value={contract.fullName} onChange={(value) => setContractField('fullName', value)} placeholder="Nome do cliente ou expert" />
            <Field id="client-email" label="E-mail" type="email" value={contract.email} onChange={(value) => setContractField('email', value)} placeholder="nome@empresa.com.br" />
            <Field id="client-phone" label="Telefone" type="tel" value={contract.phone} onChange={(value) => setContractField('phone', formatPhone(value))} placeholder="(00) 00000-0000" />
            <Field id="client-cnpj" label="CNPJ" value={contract.cnpj} onChange={(value) => setContractField('cnpj', formatCnpj(value))} placeholder="00.000.000/0000-00" />
            <div className="sm:col-span-2">
              <Field id="client-legal-name" label="Razão social" value={contract.legalName} onChange={(value) => setContractField('legalName', value)} placeholder="Razão social registrada" />
            </div>
          </FormSection>
        </div>
      )}

      {activeTab === 'baseline' && (
        <ScenarioFields scenario={baseline} onChange={setBaselineField} mode="baseline" />
      )}

      {activeTab === 'current' && (
        <div className="space-y-7 animate-[fadeUp_0.15s_ease_both]">
          <section>
            <div className="mb-3">
              <h3 className="text-xs font-bold text-text-custom">Antes e agora</h3>
              <p className="mt-1 text-[11px] text-text3">Comparação direta com o cenário registrado na entrada.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <ComparisonMetric label="Faturamento mensal" baseline={baseline.monthlyRevenue} current={current.monthlyRevenue} formatter={formatCurrency} />
              <ComparisonMetric label="Instagram" baseline={baseline.instagramFollowers} current={current.instagramFollowers} formatter={formatCompactNumber} />
              <ComparisonMetric label="TikTok" baseline={baseline.tiktokFollowers} current={current.tiktokFollowers} formatter={formatCompactNumber} />
              <ComparisonMetric label="YouTube" baseline={baseline.youtubeFollowers} current={current.youtubeFollowers} formatter={formatCompactNumber} />
            </div>
          </section>
          <ScenarioFields scenario={current} onChange={setCurrentField} mode="current" />
        </div>
      )}
    </div>
  )
}

function ScenarioFields({
  scenario,
  onChange,
  mode,
}: {
  scenario: ClientScenario
  onChange: (field: keyof ClientScenario, value: string) => void
  mode: 'baseline' | 'current'
}) {
  const isCurrent = mode === 'current'
  return (
    <div className="animate-[fadeUp_0.15s_ease_both]">
      {isCurrent && (
        <FormSection title="Biografia" description="Narrativa atualizada do cliente ou expert para consulta da equipe.">
          <div className="sm:col-span-2">
            <Field id="current-biography" label="Biografia" value={scenario.biography} onChange={(value) => onChange('biography', value)} multiline rows={7} placeholder="Conte a trajetória, autoridade, marcos e momento atual do cliente." />
          </div>
        </FormSection>
      )}

      <FormSection title="Negócio" description={isCurrent ? 'Posicionamento e portfólio no momento atual.' : 'Como o negócio chegou à B16.'}>
        <Field id={`${mode}-niche`} label="Nicho de atuação" value={scenario.niche} onChange={(value) => onChange('niche', value)} placeholder="Ex.: educação, música, saúde" />
        <Field id={`${mode}-products`} label="Lista de produtos" value={scenario.products} onChange={(value) => onChange('products', value)} multiline rows={5} help="Use uma linha para cada produto ou serviço." placeholder={'Produto 1\nProduto 2'} />
      </FormSection>

      <FormSection title="Resultados" description={isCurrent ? 'Números consolidados até a atualização mais recente.' : 'Resultados acumulados antes do início do trabalho.'}>
        <Field id={`${mode}-launches`} label="Quantidade de lançamentos" type="number" value={scenario.launchesCount} onChange={(value) => onChange('launchesCount', value)} help="O detalhamento permanece no módulo Lançamentos." />
        <Field id={`${mode}-total-revenue`} label="Faturamento total até aqui (R$)" type="number" step="0.01" value={scenario.totalRevenue} onChange={(value) => onChange('totalRevenue', value)} />
        <Field id={`${mode}-monthly-revenue`} label="Média de faturamento mensal (R$)" type="number" step="0.01" value={scenario.monthlyRevenue} onChange={(value) => onChange('monthlyRevenue', value)} />
        <Field id={`${mode}-ad-spend`} label="Investimento acumulado em tráfego (R$)" type="number" step="0.01" value={scenario.adSpend} onChange={(value) => onChange('adSpend', value)} />
      </FormSection>

      <FormSection title="Audiência" description="Tamanho e sinais de engajamento das principais redes.">
        <Field id={`${mode}-instagram-followers`} label="Seguidores no Instagram" type="number" value={scenario.instagramFollowers} onChange={(value) => onChange('instagramFollowers', value)} />
        <Field id={`${mode}-tiktok-followers`} label="Seguidores no TikTok" type="number" value={scenario.tiktokFollowers} onChange={(value) => onChange('tiktokFollowers', value)} />
        <Field id={`${mode}-youtube-followers`} label="Inscritos no YouTube" type="number" value={scenario.youtubeFollowers} onChange={(value) => onChange('youtubeFollowers', value)} />
        <Field id={`${mode}-instagram-posts`} label="Publicações no Instagram" type="number" value={scenario.instagramPosts} onChange={(value) => onChange('instagramPosts', value)} />
        <Field id={`${mode}-instagram-likes`} label="Média de curtidas no Instagram" type="number" value={scenario.instagramAverageLikes} onChange={(value) => onChange('instagramAverageLikes', value)} />
        <Field id={`${mode}-instagram-engagement`} label="Taxa de engajamento no Instagram (%)" type="number" step="0.01" value={scenario.instagramEngagementRate} onChange={(value) => onChange('instagramEngagementRate', value)} />
      </FormSection>

      <FormSection title="Estrutura operacional" description={isCurrent ? 'Ferramentas, equipe e relações que sustentam a operação hoje.' : 'Estrutura que existia antes da entrada na B16.'}>
        <Field id={`${mode}-checkout`} label="Checkout e plataformas" value={scenario.checkoutPlatforms} onChange={(value) => onChange('checkoutPlatforms', value)} multiline rows={4} placeholder="Hotmart, Kiwify, Eduzz..." />
        <Field id={`${mode}-team`} label="Equipe" value={scenario.teamStructure} onChange={(value) => onChange('teamStructure', value)} multiline rows={4} placeholder="Quem fazia parte e quais funções exercia?" />
        <Field id={`${mode}-partners`} label="Sócios e parcerias" value={scenario.partnerStructure} onChange={(value) => onChange('partnerStructure', value)} multiline rows={4} placeholder="Sócios atuais ou anteriores e responsabilidades." />
        <Field id={`${mode}-notes`} label="Observações" value={scenario.notes} onChange={(value) => onChange('notes', value)} multiline rows={4} placeholder="Contexto adicional importante para a equipe." />
      </FormSection>
    </div>
  )
}
