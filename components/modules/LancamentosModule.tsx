'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/utils/supabase/client'
import { useAppStore } from '@/store/useAppStore'
import BiSyncPanel from '@/components/launches/BiSyncPanel'
import type { LaunchBiSyncResponse } from '@/types/launch-bi'
import { 
  ChevronLeft, Plus, Calendar, DollarSign, Target, Award, BarChart3, 
  Settings, User, Clock, Trash, AlertTriangle, ArrowRight, Save, CheckCircle, Rocket
} from 'lucide-react'

type LaunchTemplate = 'lancamento' | 'evento_pago' | 'pico_perpetuo'

interface Launch {
  id: string
  project_id: string
  nome: string
  template: LaunchTemplate
  criado_por: string
  criado_em: string
  atualizado_por: string | null
  atualizado_em: string | null
  links?: { nome: string; url: string }[]
}

interface Stage {
  nome: string
  pct_verba: number
  dias: number
  inicio: string
  fim: string
}

interface TeamDeadline {
  nome: string
  regra: string
  data: string
}

interface CronogramaData {
  verba_total: number
  data_ancora: string
  qtd_cpls: number
  verba_perpetuo_diaria: number
  etapas: Stage[]
  prazos_equipe: TeamDeadline[]
}

interface Scenario {
  nome: string
  leads_organicos: number
  custo_lead: number
  valor_produto: number
  conversao_pct: number
}

interface EventoPagoFunnel {
  faturamento_desejado: number
  ticket_ingresso: number
  conversao_ingresso_pct: number
  investimento_desejado: number
  ticket_mentoria: number
  comparecimento_pct: number
  conversao_mentoria_pct: number
}

interface ProvisionamentoData {
  cenario_ativo: string
  dados: {
    scenarios?: Scenario[]
    eventoPago?: EventoPagoFunnel
  }
}

interface RealizadoData {
  dados: {
    vendas?: number
    leads_pagos?: number
    leads_organicos?: number
    valor_produto?: number
    anotacoes?: string
    percepcao_cliente?: string
    melhorias?: string
    faltou?: string
  }
}

interface CostItem {
  nome: string
  valor: number
}

interface OfferItem {
  nome: string
  ticket: number
  vendas: number
  comissao_pct: number
  vendas_ads: number
  valor_gasto_ads: number
}

interface PartnerCommission {
  nome: string
  pct: number
}

interface InvestimentosData {
  dados: {
    custos?: CostItem[]
    ofertas?: OfferItem[]
    imposto_pct?: number
    fundo_reserva_pct?: number
    socios?: PartnerCommission[]
  }
}

interface BriefingData {
  mote: string
  publico_alvo: string
  oferta: {
    nome: string
    ticket: number
    formato: string
  }
  materiais_apoio: { nome: string; url: string }[]
  tag?: string
  dores_principais?: string
}

const TEMPLATE_NAMES: Record<LaunchTemplate, string> = {
  lancamento: 'Lançamento (PLF Clássico)',
  evento_pago: 'Evento Pago',
  pico_perpetuo: 'Pico + Perpétuo',
}

export default function LancamentosModule() {
  const queryClient = useQueryClient()
  const supabase = createClient()
  const { activeProjectId, showToast } = useAppStore()

  // State management
  const [selectedLaunchId, setSelectedLaunchId] = useState<string | null>(null)
  const [activeSubTab, setActiveSubTab] = useState<'resumo' | 'briefing' | 'crono' | 'prov' | 'real' | 'inv'>('resumo')
  const [localLinks, setLocalLinks] = useState<{ nome: string; url: string }[] | null>(null)

  // Launch list modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newLaunchName, setNewLaunchName] = useState('')
  const [newLaunchTemplate, setNewLaunchTemplate] = useState<LaunchTemplate>('lancamento')
  const [newLaunchAnchorDate, setNewLaunchAnchorDate] = useState(new Date().toISOString().slice(0, 10))

  // 1. QUERY: CARREGAR LISTA DE LANÇAMENTOS DO PROJETO
  const { data: launches = [], isLoading: loadingLaunches } = useQuery<Launch[]>({
    queryKey: ['launches', activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return []
      const { data, error } = await supabase
        .from('lancamentos')
        .select('*')
        .eq('project_id', activeProjectId)
      if (error) {
        showToast('Erro ao carregar lançamentos', 'err')
        throw error
      }
      return data as Launch[]
    },
    enabled: !!activeProjectId,
  })

  const selectedLaunchIdForActiveProject = launches.some((launch) => launch.id === selectedLaunchId)
    ? selectedLaunchId
    : null

  // 2. QUERY: CARREGAR DADOS DO LANÇAMENTO SELECIONADO
  const { data: activeLaunchData, isLoading: loadingActiveLaunch } = useQuery<{
    launch: Launch
    cronograma: CronogramaData
    provisionamento: ProvisionamentoData
    realizado: RealizadoData
    investimentos: InvestimentosData
    briefing: BriefingData
  } | null>({
    queryKey: ['launch_detail', activeProjectId, selectedLaunchIdForActiveProject],
    queryFn: async () => {
      if (!selectedLaunchIdForActiveProject || !activeProjectId) return null

      // Fetch all tables in parallel
      const [lRes, cRes, pRes, rRes, iRes, bRes] = await Promise.all([
        supabase
          .from('lancamentos')
          .select('*')
          .eq('id', selectedLaunchIdForActiveProject)
          .eq('project_id', activeProjectId)
          .single(),
        supabase.from('lancamentos_cronograma').select('*').eq('lancamento_id', selectedLaunchIdForActiveProject).maybeSingle(),
        supabase.from('lancamentos_provisionamento').select('*').eq('lancamento_id', selectedLaunchIdForActiveProject).maybeSingle(),
        supabase.from('lancamentos_realizado').select('*').eq('lancamento_id', selectedLaunchIdForActiveProject).maybeSingle(),
        supabase.from('lancamentos_investimentos').select('*').eq('lancamento_id', selectedLaunchIdForActiveProject).maybeSingle(),
        supabase.from('briefings').select('*').eq('lancamento_id', selectedLaunchIdForActiveProject).eq('is_atual', true).maybeSingle(),
      ])

      if (lRes.error) throw lRes.error

      // Handle default/empty rows
      const cronograma = cRes.data || {
        verba_total: 10000,
        data_ancora: new Date().toISOString().slice(0, 10),
        qtd_cpls: 3,
        verba_perpetuo_diaria: 0,
        etapas: [],
        prazos_equipe: [],
      }

      const provisionamento = pRes.data || {
        cenario_ativo: 'Médio',
        dados: {
          scenarios: [
            { nome: 'Baixo', leads_organicos: 100, custo_lead: 4, valor_produto: 997, conversao_pct: 1 },
            { nome: 'Médio', leads_organicos: 200, custo_lead: 3, valor_produto: 997, conversao_pct: 2 },
            { nome: 'Alto', leads_organicos: 400, custo_lead: 2.2, valor_produto: 997, conversao_pct: 4 },
          ],
          eventoPago: {
            faturamento_desejado: 20000,
            ticket_ingresso: 197,
            conversao_ingresso_pct: 5,
            investimento_desejado: 10000,
            ticket_mentoria: 2000,
            comparecimento_pct: 50,
            conversao_mentoria_pct: 10,
          }
        }
      }

      const realizado = rRes.data || {
        dados: {
          vendas: 0,
          leads_pagos: 0,
          leads_organicos: 0,
          valor_produto: 997,
          anotacoes: '',
          melhorias: '',
          faltou: '',
        }
      }

      const investimentos = iRes.data || {
        dados: {
          custos: [{ nome: 'Copywriter', valor: 2000 }, { nome: 'Designer', valor: 1000 }],
          ofertas: [{ nome: 'Produto Principal', ticket: 997, vendas: 0, comissao_pct: 10, vendas_ads: 0, valor_gasto_ads: 0 }],
          imposto_pct: 6,
          fundo_reserva_pct: 10,
          socios: [{ nome: 'Sócio A', pct: 50 }, { nome: 'Sócio B', pct: 50 }],
        }
      }

      const briefing = bRes.data || {
        mote: '',
        publico_alvo: '',
        oferta: { nome: '', ticket: 997, formato: 'Curso Online' },
        materiais_apoio: [],
        tag: '',
        dores_principais: '',
      }

      return {
        launch: { ...lRes.data, links: (lRes.data as any).links || [] } as Launch,
        cronograma: cronograma as CronogramaData,
        provisionamento: provisionamento as ProvisionamentoData,
        realizado: realizado as RealizadoData,
        investimentos: investimentos as InvestimentosData,
        briefing: { ...briefing, tag: briefing.tag || '', dores_principais: briefing.dores_principais || '' } as BriefingData,
      }
    },
    enabled: !!selectedLaunchIdForActiveProject && !!activeProjectId,
  })

  const {
    data: biIntegrationResponse,
    isLoading: loadingBiIntegration,
  } = useQuery<LaunchBiSyncResponse>({
    queryKey: ['launch_bi_integration', activeProjectId, selectedLaunchIdForActiveProject],
    queryFn: async () => {
      if (!selectedLaunchIdForActiveProject || !activeProjectId) return { integration: null, canManage: false }
      const query = new URLSearchParams({ projectId: activeProjectId })
      const response = await fetch(`/api/lancamentos/${selectedLaunchIdForActiveProject}/bi-sync?${query}`, {
        cache: 'no-store',
      })
      if (!response.ok) throw new Error('Não foi possível carregar a integração do BI.')
      return response.json()
    },
    enabled: !!selectedLaunchIdForActiveProject && !!activeProjectId,
    retry: false,
  })

  const biIntegration = biIntegrationResponse?.integration
  const biMetrics = biIntegration?.last_snapshot

  // Sync links when activeLaunchData changes
  useEffect(() => {
    if (activeLaunchData?.launch) {
      setLocalLinks(activeLaunchData.launch.links || [])
    }
  }, [activeLaunchData])

  // Reset local links when selectedLaunchId changes
  useEffect(() => {
    setLocalLinks(null)
  }, [selectedLaunchId])

  // 3. MUTATIONS
  const createLaunchMutation = useMutation({
    mutationFn: async (vars: { nome: string; template: LaunchTemplate; dataAncora: string }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !activeProjectId) return

      // Insert Launch parent
      const { data: lData, error: lError } = await supabase
        .from('lancamentos')
        .insert({
          project_id: activeProjectId,
          nome: vars.nome,
          template: vars.template,
          criado_por: user.id,
        })
        .select()
        .single()

      if (lError) throw lError

      // Calculate default cronograma stages based on template
      const stages: Stage[] = calculateDefaultStages(vars.template, vars.dataAncora, 10000, 3)
      const deadlines = calculateDeadlines(vars.dataAncora, stages)

      // Insert Launch cronograma
      const { error: cError } = await supabase
        .from('lancamentos_cronograma')
        .insert({
          lancamento_id: lData.id,
          verba_total: 10000,
          data_ancora: vars.dataAncora,
          qtd_cpls: 3,
          etapas: stages,
          prazos_equipe: deadlines,
        })

      if (cError) throw cError

      // Insert default briefing
      await supabase
        .from('briefings')
        .insert({
          lancamento_id: lData.id,
          project_id: activeProjectId,
          mote: `Briefing do ${vars.nome}`,
          criado_por: user.id,
        })

      return lData.id
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['launches', activeProjectId] })
      setIsCreateOpen(false)
      setNewLaunchName('')
      if (id) {
        setSelectedLaunchId(id)
        setActiveSubTab('crono')
      }
      showToast('Lançamento criado com sucesso!')
    },
    onError: (err) => {
      showToast('Erro ao criar lançamento: ' + err.message, 'err')
    }
  })

  const saveLaunchPartMutation = useMutation({
    mutationFn: async (vars: { table: string; data: any }) => {
      if (!selectedLaunchId) return
      const { error } = await supabase
        .from(vars.table)
        .upsert({
          lancamento_id: selectedLaunchId,
          ...vars.data,
          atualizado_em: new Date().toISOString()
        })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['launch_detail', activeProjectId, selectedLaunchIdForActiveProject] })
      showToast('Alterações salvas com sucesso!')
    },
    onError: (err) => {
      showToast('Erro ao salvar: ' + err.message, 'err')
    }
  })

  const saveBriefingMutation = useMutation({
    mutationFn: async (briefingData: any) => {
      if (!selectedLaunchId || !activeProjectId) return
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Find if a briefing already exists
      const { data: existing } = await supabase
        .from('briefings')
        .select('*')
        .eq('lancamento_id', selectedLaunchId)
        .eq('is_atual', true)
        .maybeSingle()

      if (existing) {
        // Update
        const { error } = await supabase
          .from('briefings')
          .update({
            ...briefingData,
            atualizado_por: user.id,
            atualizado_em: new Date().toISOString()
          })
          .eq('id', existing.id)
        if (error) throw error
      } else {
        // Insert
        const { error } = await supabase
          .from('briefings')
          .insert({
            lancamento_id: selectedLaunchId,
            project_id: activeProjectId,
            ...briefingData,
            criado_por: user.id
          })
        if (error) throw error
      }

      // Espelhamento do Ticket da Oferta
      const newTicket = Number(briefingData.oferta?.ticket)
      if (!isNaN(newTicket) && newTicket > 0) {
        // 1. Atualizar Provisionamento
        const { data: pData } = await supabase
          .from('lancamentos_provisionamento')
          .select('*')
          .eq('lancamento_id', selectedLaunchId)
          .maybeSingle()

        if (pData) {
          const updatedDados = { ...pData.dados }
          if (updatedDados.scenarios) {
            updatedDados.scenarios = updatedDados.scenarios.map((sc: any) => ({
              ...sc,
              valor_produto: newTicket
            }))
          }
          if (updatedDados.eventoPago) {
            updatedDados.eventoPago = {
              ...updatedDados.eventoPago,
              ticket_ingresso: newTicket
            }
          }
          await supabase
            .from('lancamentos_provisionamento')
            .update({ dados: updatedDados, atualizado_em: new Date().toISOString() })
            .eq('lancamento_id', selectedLaunchId)
        }

        // 2. Atualizar Investimentos / PIL
        const { data: iData } = await supabase
          .from('lancamentos_investimentos')
          .select('*')
          .eq('lancamento_id', selectedLaunchId)
          .maybeSingle()

        if (iData) {
          const updatedDados = { ...iData.dados }
          if (updatedDados.ofertas && updatedDados.ofertas.length > 0) {
            updatedDados.ofertas = updatedDados.ofertas.map((o: any, idx: number) => {
              if (idx === 0) {
                return { ...o, ticket: newTicket }
              }
              return o
            })
          }
          await supabase
            .from('lancamentos_investimentos')
            .update({ dados: updatedDados, atualizado_em: new Date().toISOString() })
            .eq('lancamento_id', selectedLaunchId)
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['launch_detail', activeProjectId, selectedLaunchIdForActiveProject] })
      showToast('Briefing salvo com sucesso!')
    },
    onError: (err) => {
      showToast('Erro ao salvar briefing: ' + err.message, 'err')
    }
  })

  const saveLaunchLinksMutation = useMutation({
    mutationFn: async (links: { nome: string; url: string }[]) => {
      if (!selectedLaunchId) return
      const { error } = await supabase
        .from('lancamentos')
        .update({
          links,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', selectedLaunchId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['launch_detail', activeProjectId, selectedLaunchIdForActiveProject] })
      showToast('Links atualizados com sucesso!')
    },
    onError: (err) => {
      showToast('Erro ao salvar links: ' + err.message, 'err')
    }
  })

  const syncBiMutation = useMutation({
    mutationFn: async (config: {
      dashboardUrl: string
      periodStart: string
      periodEnd: null
    }) => {
      if (!selectedLaunchIdForActiveProject || !activeProjectId) throw new Error('Selecione um lançamento antes de sincronizar.')
      const controller = new AbortController()
      const timeoutId = window.setTimeout(() => controller.abort(), 30_000)

      try {
        const response = await fetch(`/api/lancamentos/${selectedLaunchIdForActiveProject}/bi-sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...config, projectId: activeProjectId }),
          signal: controller.signal,
        })
        const contentType = response.headers.get('content-type') || ''
        const payload = contentType.includes('application/json')
          ? await response.json()
          : null
        if (!response.ok) {
          throw new Error(payload?.error || 'Não foi possível sincronizar o BI agora. Recarregue a página e tente novamente.')
        }
        if (!payload) throw new Error('O servidor respondeu sem dados da integração do BI.')
        return payload as LaunchBiSyncResponse
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new Error('A sincronização do BI demorou demais. Recarregue a página e tente novamente.')
        }
        throw error
      } finally {
        window.clearTimeout(timeoutId)
      }
    },
    onSuccess: (payload) => {
      queryClient.setQueryData<LaunchBiSyncResponse>(
        ['launch_bi_integration', activeProjectId, selectedLaunchIdForActiveProject],
        payload
      )
      queryClient.invalidateQueries({ queryKey: ['launch_detail', activeProjectId, selectedLaunchIdForActiveProject] })
      showToast('Dados do BI atualizados com sucesso!')
    },
    onError: (error) => {
      queryClient.invalidateQueries({ queryKey: ['launch_bi_integration', activeProjectId, selectedLaunchIdForActiveProject] })
      showToast(error instanceof Error ? error.message : 'Erro ao sincronizar o BI.', 'err')
    },
  })

  const deleteLaunchMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('lancamentos')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['launches', activeProjectId] })
      setSelectedLaunchId(null)
      showToast('Lançamento excluído com sucesso')
    },
    onError: (err) => {
      showToast('Erro ao excluir: ' + err.message, 'err')
    }
  })

  // Date and stage helpers
  const adjustDate = (baseStr: string, days: number): string => {
    const d = new Date(baseStr)
    d.setDate(d.getDate() + days)
    return d.toISOString().slice(0, 10)
  }

  const calculateDefaultStages = (template: LaunchTemplate, anchor: string, verba: number, cpls: number): Stage[] => {
    if (template === 'evento_pago') {
      return [
        { nome: 'Vendas de Ingressos', pct_verba: 80, dias: 21, inicio: adjustDate(anchor, -22), fim: adjustDate(anchor, -2) },
        { nome: 'Aquecimento', pct_verba: 2.5, dias: 7, inicio: adjustDate(anchor, -8), fim: adjustDate(anchor, -2) },
        { nome: 'Lembrete', pct_verba: 2.5, dias: 3, inicio: adjustDate(anchor, -4), fim: adjustDate(anchor, -2) },
        { nome: 'Inscrições abertas', pct_verba: 15, dias: 7, inicio: adjustDate(anchor, 1), fim: adjustDate(anchor, 7) },
      ]
    }

    const defaultStages = [
      { nome: 'Captação', pct_verba: 70, dias: 21, inicio: adjustDate(anchor, -22), fim: adjustDate(anchor, -2) },
      { nome: 'Aquecimento', pct_verba: 5, dias: 7, inicio: adjustDate(anchor, -8), fim: adjustDate(anchor, -2) },
      { nome: 'Lembrete', pct_verba: 5, dias: 3, inicio: adjustDate(anchor, -4), fim: adjustDate(anchor, -2) },
      { nome: 'CPLs', pct_verba: 0, dias: cpls, inicio: anchor, fim: adjustDate(anchor, cpls - 1) },
      { nome: 'Inscrições abertas / Carrinho', pct_verba: 20, dias: 7, inicio: adjustDate(anchor, cpls), fim: adjustDate(anchor, cpls + 6) },
    ]

    if (template === 'pico_perpetuo') {
      defaultStages.push({
        nome: 'Perpétuo',
        pct_verba: 0,
        dias: 9999, // Ongoing/open
        inicio: adjustDate(anchor, cpls + 7),
        fim: 'Sem data de fim',
      })
    }

    return defaultStages
  }

  const calculateDeadlines = (anchor: string, stages: Stage[]): TeamDeadline[] => {
    // Strategy (briefing ready): 19 days before Captação starts
    const captacao = stages.find(s => s.nome.includes('Captação') || s.nome.includes('Ingressos'))
    const captacaoInicio = captacao ? captacao.inicio : anchor
    const dataEstrategia = adjustDate(captacaoInicio, -19)

    // LP / Creative ready: 7 days before Captação starts
    const dataCriativos = adjustDate(captacaoInicio, -7)

    // Carrinho / Open sales
    const carrinho = stages.find(s => s.nome.includes('Inscrições') || s.nome.includes('Carrinho'))
    const carrinhoInicio = carrinho ? carrinho.inicio : anchor
    const dataLpVendas = adjustDate(carrinhoInicio, -7)

    return [
      { nome: 'Estratégia (Briefing pronto)', regra: '19 dias antes da Captação', data: dataEstrategia },
      { nome: 'Produção (Início)', regra: '3 dias após a estratégia', data: adjustDate(dataEstrategia, 3) },
      { nome: 'Criativos + LP de Captura prontos', regra: '7 dias antes da Captação', data: dataCriativos },
      { nome: 'LP de Vendas pronta', regra: '7 dias antes do Carrinho abrir', data: dataLpVendas },
      { nome: 'Equipe pronta p/ Aquecimento', regra: '7 dias após Criativos prontos', data: adjustDate(dataCriativos, 7) },
      { nome: 'Equipe pronta p/ Lembrete', regra: '7 dias após Aquecimento', data: adjustDate(dataCriativos, 14) },
      { nome: 'Equipe pronta p/ CPLs', regra: '7 dias após Lembrete', data: adjustDate(dataCriativos, 21) },
      { nome: 'Equipe pronta p/ Inscrições abertas', regra: '7 dias antes do Carrinho abrir', data: dataLpVendas },
    ]
  }

  // Handle forms updates locally
  const handleSaveCronograma = (updatedCrono: Partial<CronogramaData>) => {
    const finalCrono = { ...activeLaunchData?.cronograma, ...updatedCrono } as CronogramaData
    
    // Auto recalculate stages dates if data_ancora changes
    if (updatedCrono.data_ancora || updatedCrono.qtd_cpls !== undefined) {
      const anchor = updatedCrono.data_ancora || finalCrono.data_ancora
      const cpls = updatedCrono.qtd_cpls !== undefined ? updatedCrono.qtd_cpls : finalCrono.qtd_cpls
      const verba = finalCrono.verba_total
      const template = activeLaunchData?.launch.template || 'lancamento'
      
      finalCrono.etapas = calculateDefaultStages(template, anchor, verba, cpls)
      finalCrono.prazos_equipe = calculateDeadlines(anchor, finalCrono.etapas)
    }

    saveLaunchPartMutation.mutate({
      table: 'lancamentos_cronograma',
      data: finalCrono,
    })
  }

  // Calculations for DRE/Lucro/ROI
  const healthStatus = useMemo(() => {
    if (!activeLaunchData) return 'Vermelho'
    const real = activeLaunchData.realizado.dados
    const prov = activeLaunchData.provisionamento.dados
    const template = activeLaunchData.launch.template
    const syncedSales = biMetrics?.sales.count
    const syncedRevenue = biMetrics?.sales.grossRevenue

    const actualSales = syncedSales ?? (Number(real.vendas) || 0)
    if (actualSales <= 0) return 'Vermelho'

    // Calculate ROAS
    const verba = biMetrics?.investment.total ?? activeLaunchData.cronograma.verba_total
    const realFaturamento = syncedRevenue
      ?? actualSales * (Number(real.valor_produto) || 997)
    const realRoas = verba > 0 ? realFaturamento / verba : 0

    if (template === 'evento_pago') {
      // Evento pago threshold comparison
      const targetFaturamento = prov.eventoPago?.faturamento_desejado || 10000
      if (realFaturamento >= targetFaturamento) return 'Verde'
      if (realFaturamento >= targetFaturamento * 0.6) return 'Amarelo'
      return 'Vermelho'
    } else {
      // PLF Scenario comparison
      const scenarios = prov.scenarios || []
      const sMedio = scenarios.find(s => s.nome === 'Médio')
      const sBaixo = scenarios.find(s => s.nome === 'Baixo')

      const roasMedio = sMedio ? ((sMedio.leads_organicos + (verba / sMedio.custo_lead)) * sMedio.conversao_pct / 100 * sMedio.valor_produto) / verba : 1.5
      const roasBaixo = sBaixo ? ((sBaixo.leads_organicos + (verba / sBaixo.custo_lead)) * sBaixo.conversao_pct / 100 * sBaixo.valor_produto) / verba : 0.8

      if (realRoas >= roasMedio) return 'Verde'
      if (realRoas >= roasBaixo) return 'Amarelo'
      return 'Vermelho'
    }
  }, [activeLaunchData, biMetrics])

  const nextAndHistoryLaunches = useMemo(() => {
    const next: Launch[] = []
    const history: Launch[] = []
    
    launches.forEach(l => {
      // Normal separation: if template closes Carrinho, checks date
      history.push(l) // In this native portfolio we'll list all, sorting by created date
    })
    
    return launches
  }, [launches])

  if (!activeProjectId) {
    return <div className="text-center py-10 text-xs text-text3">Selecione um projeto para gerenciar os lançamentos.</div>
  }

  if (loadingLaunches) {
    return <div className="text-center py-10 text-xs text-text3">Carregando lançamentos...</div>
  }

  return (
    <div className="space-y-6">
      {/* 1. PORTFOLIO LANDING SCREEN (If no launch selected) */}
      {!selectedLaunchIdForActiveProject ? (
        <div className="space-y-4 animate-[fadeUp_0.15s_ease_both]">
          <div className="flex justify-between items-center bg-surface border border-border-custom rounded-xl p-4 shadow-sm">
            <div>
              <h3 className="text-xs font-bold text-text-custom">Portfólio de Lançamentos</h3>
              <p className="text-[10px] text-text3 mt-0.5">Planeje múltiplos lançamentos e acompanhe seus resultados estratégicos.</p>
            </div>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="px-3 py-1.5 bg-purple-custom text-white hover:opacity-90 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Novo Lançamento</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {launches.length === 0 ? (
              <div className="col-span-full bg-surface border border-border-custom rounded-xl p-10 text-center text-xs text-text3">
                Nenhum lançamento planejado para este projeto. Clique em "+ Novo Lançamento" para iniciar.
              </div>
            ) : (
              launches.map((l) => (
                <div
                  key={l.id}
                  onClick={() => {
                    setSelectedLaunchId(l.id)
                    setActiveSubTab('resumo')
                  }}
                  className="bg-surface border border-border-custom hover:border-purple-custom/30 rounded-xl p-5 hover:shadow-md cursor-pointer transition-all duration-150 flex flex-col justify-between h-44"
                >
                  <div className="space-y-1.5">
                    <span className="px-2 py-0.5 rounded bg-surface2 border border-border-custom text-[9px] font-bold text-text2 uppercase">
                      {TEMPLATE_NAMES[l.template]}
                    </span>
                    <h4 className="text-xs font-bold text-text-custom truncate">{l.nome}</h4>
                    <p className="text-[10px] text-text3">
                      Criado em {new Date(l.criado_em).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  
                  <div className="flex items-center justify-between pt-4 border-t border-border-custom">
                    <span className="text-[10px] text-text2 font-semibold">Configurar Lançamento</span>
                    <ArrowRight className="w-3.5 h-3.5 text-text3" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        /* 2. LAUNCH DETAILS VIEW */
        <div className="space-y-6 animate-[fadeUp_0.15s_ease_both]">
          {loadingActiveLaunch || !activeLaunchData ? (
            <div className="text-center py-10 text-xs text-text3">Carregando detalhes do lançamento...</div>
          ) : (
            <>
              {/* Top Navigation Backbar */}
              <div className="flex justify-between items-center bg-surface border border-border-custom rounded-xl p-3.5 shadow-sm">
                <button
                  onClick={() => setSelectedLaunchId(null)}
                  className="flex items-center gap-1.5 text-xs text-text2 hover:text-text-custom cursor-pointer font-medium"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Voltar ao Portfólio</span>
                </button>
                <div className="flex items-center gap-3">
                  <h3 className="text-xs font-extrabold text-text-custom uppercase tracking-wider">
                    {activeLaunchData.launch.nome}
                  </h3>
                  <span className="px-2 py-0.5 rounded bg-surface2 border border-border-custom text-[9px] font-bold text-text3">
                    {TEMPLATE_NAMES[activeLaunchData.launch.template].toUpperCase()}
                  </span>
                  <button
                    onClick={() => {
                      if (confirm('Aviso: Excluir este lançamento apagará todos os dados de Cronograma, Provisionamento, Realizado e P&L vinculados. Deseja prosseguir?')) {
                        deleteLaunchMutation.mutate(activeLaunchData.launch.id)
                      }
                    }}
                    className="p-1 text-red-t hover:bg-red-bg rounded-md text-[10px] font-semibold transition-colors cursor-pointer"
                  >
                    Excluir
                  </button>
                </div>
              </div>

              {/* Subtabs Menu */}
              <div className="flex gap-1 border-b border-border-custom flex-wrap mb-4">
                {([
                  { id: 'resumo', name: 'Resumo' },
                  { id: 'briefing', name: 'Briefing Estratégico' },
                  { id: 'crono', name: 'Verba & Cronograma' },
                  { id: 'prov', name: 'Provisionamento' },
                  { id: 'real', name: 'Dados Realizados' },
                  { id: 'inv', name: 'P&L e Comissões' },
                ] as const).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveSubTab(tab.id)}
                    className={`px-4 py-2 text-xs font-semibold cursor-pointer border-b-2 bg-transparent transition-colors duration-150 ${
                      activeSubTab === tab.id
                        ? 'border-purple-custom text-text-custom'
                        : 'border-transparent text-text2 hover:text-text-custom'
                    }`}
                  >
                    {tab.name}
                  </button>
                ))}
              </div>

              {/* TAB 1: RESUMO */}
              {activeSubTab === 'resumo' && (() => {
                const verbaProvisionada = activeLaunchData.cronograma.verba_total
                const verba = biMetrics?.investment.total ?? verbaProvisionada
                const realizadoVal = activeLaunchData.realizado.dados
                const totalVendas = biMetrics?.sales.count ?? (Number(realizadoVal.vendas) || 0)
                const valorProd = Number(realizadoVal.valor_produto) || 997
                const faturamentoReal = biMetrics?.sales.grossRevenue ?? totalVendas * valorProd
                
                const totalCustos = (activeLaunchData.investimentos.dados.custos || []).reduce((acc, c) => acc + c.valor, 0)
                const impostoPct = activeLaunchData.investimentos.dados.imposto_pct || 6
                const impostoReal = faturamentoReal * (impostoPct / 100)
                
                // Offers Net calculation
                const liquidRevenue = (activeLaunchData.investimentos.dados.ofertas || []).reduce((acc, o) => {
                  const gross = o.ticket * o.vendas
                  return acc + (gross - (gross * (o.comissao_pct / 100)))
                }, 0)

                const netProfit = liquidRevenue > 0
                  ? liquidRevenue - totalCustos - impostoReal
                  : faturamentoReal - verba - totalCustos - impostoReal

                const roas = verba > 0 ? faturamentoReal / verba : 0

                const template = activeLaunchData.launch.template
                const provVal = activeLaunchData.provisionamento
                const cronoVal = activeLaunchData.cronograma
                const activeCenarioNome = provVal.cenario_ativo || 'Médio'
                
                let faturamentoProvisionado = 0
                let verbaInvestidaProvisionada = cronoVal.verba_total
                let roasPrevisto = 0

                if (template !== 'evento_pago') {
                  const scenarios = provVal.dados.scenarios || []
                  const activeScenario = scenarios.find(s => s.nome === activeCenarioNome) || scenarios[1] || scenarios[0]
                  if (activeScenario) {
                    const verbaForCalc = cronoVal.verba_total
                    const leadsTrafego = activeScenario.custo_lead > 0 ? verbaForCalc / activeScenario.custo_lead : 0
                    const totalLeads = leadsTrafego + (activeScenario.leads_organicos || 0)
                    const compradores = totalLeads * (activeScenario.conversao_pct / 100)
                    faturamentoProvisionado = compradores * activeScenario.valor_produto
                    roasPrevisto = verbaForCalc > 0 ? faturamentoProvisionado / verbaForCalc : 0
                  }
                } else {
                  // Evento pago
                  const ev = provVal.dados.eventoPago || {
                    faturamento_desejado: 20000,
                    ticket_ingresso: 197,
                    conversao_ingresso_pct: 5,
                    investimento_desejado: 10000,
                    ticket_mentoria: 2000,
                    comparecimento_pct: 50,
                    conversao_mentoria_pct: 10,
                  }
                  const ingressosVendas = ev.ticket_ingresso > 0 ? ev.faturamento_desejado / ev.ticket_ingresso : 0
                  const mentoriaLeads = ingressosVendas * (ev.comparecimento_pct / 100)
                  const mentoriaVendas = mentoriaLeads * (ev.conversao_mentoria_pct / 100)
                  const faturamentoMentoria = mentoriaVendas * ev.ticket_mentoria

                  faturamentoProvisionado = ev.faturamento_desejado + faturamentoMentoria
                  verbaInvestidaProvisionada = ev.investimento_desejado
                  roasPrevisto = verbaInvestidaProvisionada > 0 ? faturamentoProvisionado / verbaInvestidaProvisionada : 0
                }

                const healthColors = {
                  Verde: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                  Amarelo: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                  Vermelho: 'bg-red-500/10 text-red-400 border-red-500/20',
                }

                const getProgress = (inicioStr: string, fimStr: string) => {
                  try {
                    const start = new Date(inicioStr).getTime()
                    if (isNaN(start)) return 0
                    if (!fimStr || fimStr === 'Sem data de fim') {
                      return new Date().getTime() >= start ? 100 : 0
                    }
                    const end = new Date(fimStr).getTime()
                    if (isNaN(end)) return 0
                    const now = new Date().getTime()
                    if (now >= end) return 100
                    if (now <= start) return 0
                    return Math.round(((now - start) / (end - start)) * 100)
                  } catch {
                    return 0
                  }
                }

                const handleSaveLinks = () => {
                  if (localLinks) {
                    saveLaunchLinksMutation.mutate(localLinks)
                  }
                }

                const defaultDashboardUrl = activeLaunchData.launch.links?.find((link) => {
                  const linkReference = `${link.nome} ${link.url}`.toLowerCase()
                  return linkReference.includes('dashboard') || linkReference.includes('dados') || linkReference.includes('bi')
                })?.url || ''

                return (
                  <div className="space-y-6 animate-[fadeUp_0.15s_ease_both]">
                    {/* Header summary KPIs */}
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                      <div className="bg-surface border border-border-custom rounded-xl p-3 flex flex-col justify-between shadow-sm">
                        <span className="text-[8px] font-bold text-text3 uppercase tracking-wider">Saúde</span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold border w-fit mt-2 ${healthColors[healthStatus]}`}>
                          {healthStatus}
                        </span>
                      </div>
                      <div className="bg-surface border border-border-custom rounded-xl p-3 flex flex-col justify-between shadow-sm">
                        <span className="text-[8px] font-bold text-text3 uppercase tracking-wider">Faturamento Realizado</span>
                        <span className="text-[13px] font-bold text-text-custom mt-2 truncate">
                          R$ {faturamentoReal.toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <div className="bg-surface border border-border-custom rounded-xl p-3 flex flex-col justify-between shadow-sm">
                        <span className="text-[8px] font-bold text-text3 uppercase tracking-wider">Faturamento Provisionado</span>
                        <span className="text-[13px] font-bold text-text-custom mt-2 truncate">
                          R$ {faturamentoProvisionado.toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <div className="bg-surface border border-border-custom rounded-xl p-3 flex flex-col justify-between shadow-sm">
                        <span className="text-[8px] font-bold text-text3 uppercase tracking-wider">Resultado Líquido</span>
                        <span className={`text-[13px] font-bold mt-2 truncate ${netProfit >= 0 ? 'text-green-t font-extrabold' : 'text-red-t font-extrabold'}`}>
                          R$ {netProfit.toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <div className="bg-surface border border-border-custom rounded-xl p-3 flex flex-col justify-between shadow-sm">
                        <span className="text-[8px] font-bold text-text3 uppercase tracking-wider">
                          Verba Investida{biMetrics ? ' · BI' : ''}
                        </span>
                        <span className="text-[13px] font-bold text-text-custom mt-2 truncate">
                          R$ {verba.toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <div className="bg-surface border border-border-custom rounded-xl p-3 flex flex-col justify-between shadow-sm">
                        <span className="text-[8px] font-bold text-text3 uppercase tracking-wider">Verba planejada · Clave</span>
                        <span className="text-[13px] font-bold text-text-custom mt-2 truncate">
                          R$ {verbaInvestidaProvisionada.toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <div className="bg-surface border border-border-custom rounded-xl p-3 flex flex-col justify-between shadow-sm">
                        <span className="text-[8px] font-bold text-text3 uppercase tracking-wider">ROAS Real</span>
                        <span className="text-[13px] font-bold text-purple-custom mt-2">{roas.toFixed(2)}x</span>
                      </div>
                      <div className="bg-surface border border-border-custom rounded-xl p-3 flex flex-col justify-between shadow-sm">
                        <span className="text-[8px] font-bold text-text3 uppercase tracking-wider">ROAS Estimado</span>
                        <span className="text-[13px] font-bold text-purple-custom mt-2">{roasPrevisto.toFixed(2)}x</span>
                      </div>
                    </div>

                    <BiSyncPanel
                      key={`${selectedLaunchIdForActiveProject}-${biIntegration?.atualizado_em || 'new'}`}
                      integration={biIntegration}
                      defaultDashboardUrl={defaultDashboardUrl}
                      isLoading={loadingBiIntegration}
                      isSyncing={syncBiMutation.isPending}
                      canManage={biIntegrationResponse?.canManage ?? false}
                      onSync={(config) => syncBiMutation.mutate(config)}
                    />

                    {/* Timeline representation */}
                    <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4">
                      <h4 className="text-xs font-bold text-text-custom">Linha do tempo das etapas</h4>
                      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 pt-2">
                        {activeLaunchData.cronograma.etapas.slice(0, 5).map((e, idx) => {
                          const progress = getProgress(e.inicio, e.fim)
                          return (
                            <div key={idx} className="p-3 bg-surface2/40 border border-border-custom rounded-lg space-y-1 flex flex-col justify-between">
                              <div>
                                <span className="text-[9px] font-bold text-text3 uppercase block">Etapa {idx+1}</span>
                                <span className="text-xs font-bold text-text-custom block truncate">{e.nome}</span>
                                <span className="text-[10px] text-text2 block">{e.pct_verba}% verba ({e.dias} dias)</span>
                                <span className="text-[10px] text-text3 block font-mono text-[9px] truncate">
                                  {new Date(e.inicio).toLocaleDateString('pt-BR')} - {new Date(e.fim).toLocaleDateString('pt-BR')}
                                </span>
                              </div>
                              <div className="pt-2">
                                <div className="w-full bg-border2 rounded-full h-1.5 overflow-hidden">
                                  <div 
                                    className="bg-purple-custom h-1.5 rounded-full transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                  />
                                </div>
                                <span className="text-[8px] text-text3 font-semibold mt-1 block text-right">
                                  {progress}% concluído
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* LINKS ÚTEIS */}
                    <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4">
                      <div className="flex justify-between items-center border-b border-border-custom pb-2">
                        <div>
                          <h4 className="text-xs font-bold text-text-custom">Links Úteis</h4>
                          <p className="text-[10px] text-text3 mt-0.5">Gerencie os links de suporte e acompanhamento deste lançamento (planilhas, dashs, etc.).</p>
                        </div>
                        <button
                          onClick={() => setLocalLinks([...(localLinks || []), { nome: 'Novo Link', url: '' }])}
                          className="px-2 py-1 bg-surface border border-border-custom hover:bg-surface2 text-text-custom text-[10px] font-semibold rounded cursor-pointer transition-colors"
                        >
                          + Novo Link
                        </button>
                      </div>

                      {(localLinks || []).length === 0 ? (
                        <div className="text-center py-6 text-[10px] text-text3 italic">Nenhum link adicionado ainda.</div>
                      ) : (
                        <div className="space-y-3">
                          {(localLinks || []).map((lk, idx) => (
                            <div key={idx} className="flex items-center gap-3">
                              <input
                                type="text"
                                placeholder="Nome do Link"
                                className="flex-1 px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none text-xs"
                                value={lk.nome}
                                onChange={(e) => {
                                  const copy = [...(localLinks || [])]
                                  copy[idx] = { ...copy[idx], nome: e.target.value }
                                  setLocalLinks(copy)
                                }}
                              />
                              <input
                                type="text"
                                placeholder="https://..."
                                className="flex-2 px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none text-xs font-mono"
                                value={lk.url}
                                onChange={(e) => {
                                  const copy = [...(localLinks || [])]
                                  copy[idx] = { ...copy[idx], url: e.target.value }
                                  setLocalLinks(copy)
                                }}
                              />
                              {lk.url && (
                                <a
                                  href={lk.url.startsWith('http') ? lk.url : `https://${lk.url}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="px-2.5 py-1.5 bg-surface border border-border-custom hover:bg-surface2 text-text-custom text-[10px] font-semibold rounded text-center transition-colors"
                                >
                                  Acessar
                                </a>
                              )}
                              <button
                                onClick={() => {
                                  const copy = (localLinks || []).filter((_, i) => i !== idx)
                                  setLocalLinks(copy)
                                }}
                                className="p-1.5 border border-border-custom hover:border-red-500/30 rounded-lg text-text3 hover:text-red-400 hover:bg-red-500/5 transition-colors cursor-pointer"
                              >
                                <Trash className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}

                          <button
                            onClick={handleSaveLinks}
                            disabled={saveLaunchLinksMutation.isPending}
                            className="w-full py-2 bg-purple-custom text-white hover:opacity-90 disabled:opacity-50 rounded-lg text-[10px] font-bold cursor-pointer transition-colors shadow-sm"
                          >
                            {saveLaunchLinksMutation.isPending ? 'Salvando...' : 'Salvar Links'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* TAB 2: BRIEFING */}
              {activeSubTab === 'briefing' && (
                <BriefingTab
                  briefing={activeLaunchData.briefing}
                  onSave={(data) => saveBriefingMutation.mutate(data)}
                />
              )}

              {/* TAB 3: CRONOGRAMA */}
              {activeSubTab === 'crono' && (
                <CronogramaTab
                  crono={activeLaunchData.cronograma}
                  onSave={handleSaveCronograma}
                />
              )}

              {/* TAB 4: PROVISIONAMENTO */}
              {activeSubTab === 'prov' && (
                <ProvisionamentoTab
                  provisionamento={activeLaunchData.provisionamento}
                  verba={activeLaunchData.cronograma.verba_total}
                  template={activeLaunchData.launch.template}
                  briefingTicket={activeLaunchData.briefing.oferta?.ticket || 997}
                  onSave={(data) => {
                    saveLaunchPartMutation.mutate({
                      table: 'lancamentos_provisionamento',
                      data
                    })
                  }}
                />
              )}

              {/* TAB 5: REALIZADO */}
              {activeSubTab === 'real' && (
                <RealizadoTab
                  real={activeLaunchData.realizado.dados}
                  verba={biMetrics?.investment.total ?? activeLaunchData.cronograma.verba_total}
                  provisionamento={activeLaunchData.provisionamento}
                  template={activeLaunchData.launch.template}
                  onSave={(data) => {
                    saveLaunchPartMutation.mutate({
                      table: 'lancamentos_realizado',
                      data: { dados: data }
                    })
                  }}
                />
              )}

              {/* TAB 6: INVESTIMENTOS */}
              {activeSubTab === 'inv' && (
                <InvestimentosTab
                  investimentos={activeLaunchData.investimentos.dados}
                  faturamentoReal={biMetrics?.sales.grossRevenue
                    ?? (Number(activeLaunchData.realizado.dados.vendas) || 0)
                      * (Number(activeLaunchData.realizado.dados.valor_produto) || 997)}
                  briefingTicket={activeLaunchData.briefing.oferta?.ticket || 997}
                  onSave={(data) => {
                    saveLaunchPartMutation.mutate({
                      table: 'lancamentos_investimentos',
                      data: { dados: data }
                    })
                  }}
                />
              )}
            </>
          )}
        </div>
      )}

      {/* CREATE LAUNCH DIALOG */}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-[2px] animate-fadeIn">
          <div className="bg-surface border border-border-custom rounded-xl p-6 shadow-2xl max-w-sm w-full space-y-4">
            <div className="flex justify-between items-center border-b border-border-custom pb-3">
              <h3 className="text-sm font-bold text-text-custom flex items-center gap-2">
                <Rocket className="w-4 h-4 text-purple-custom" />
                <span>Novo Lançamento</span>
              </h3>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-text2 uppercase block">Nome do Lançamento</label>
                <input
                  type="text"
                  placeholder="ex: Lançamento Semente V2"
                  className="px-3 py-2 border border-border2 rounded bg-surface text-text-custom outline-none"
                  value={newLaunchName}
                  onChange={(e) => setNewLaunchName(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-text2 uppercase block">Template do Cronograma</label>
                <select
                  className="px-3 py-2 border border-border2 rounded bg-surface2 text-text-custom outline-none cursor-pointer"
                  value={newLaunchTemplate}
                  onChange={(e) => setNewLaunchTemplate(e.target.value as LaunchTemplate)}
                >
                  <option value="lancamento">Lançamento Clássico (PLF)</option>
                  <option value="evento_pago">Evento Pago</option>
                  <option value="pico_perpetuo">Pico + Perpétuo</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-text2 uppercase block">Data 1º CPL / Data-âncora</label>
                <input
                  type="date"
                  className="px-3 py-2 border border-border2 rounded bg-surface text-text-custom outline-none"
                  value={newLaunchAnchorDate}
                  onChange={(e) => setNewLaunchAnchorDate(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-border-custom">
              <button
                onClick={() => setIsCreateOpen(false)}
                className="px-4 py-2 border border-border2 hover:bg-surface2 rounded-lg text-xs font-semibold cursor-pointer text-text-custom"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (!newLaunchName.trim()) {
                    showToast('Informe o nome do lançamento', 'err')
                    return
                  }
                  createLaunchMutation.mutate({
                    nome: newLaunchName,
                    template: newLaunchTemplate,
                    dataAncora: newLaunchAnchorDate,
                  })
                }}
                className="px-4 py-2 bg-purple-custom text-white hover:opacity-90 rounded-lg text-xs font-semibold cursor-pointer shadow-sm"
              >
                Criar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ==========================================
// SUB-TAB COMPONENTS (React hooks isolation)
// ==========================================

interface BriefingTabProps {
  briefing: BriefingData
  onSave: (data: { mote: string; publico_alvo: string; dores_principais?: string; tag?: string; oferta: any }) => void
}

function BriefingTab({ briefing, onSave }: BriefingTabProps) {
  const [bMote, setBMote] = useState(briefing.mote || '')
  const [bPublico, setBPublico] = useState(briefing.publico_alvo || '')
  const [bDores, setBDores] = useState(briefing.dores_principais || '')
  const [bOfertaNome, setBOfertaNome] = useState(briefing.oferta?.nome || '')
  const [bOfertaTicket, setBOfertaTicket] = useState(briefing.oferta?.ticket || 997)
  const [bTag, setBTag] = useState(briefing.tag || '')

  const handleSaveBriefing = () => {
    onSave({
      mote: bMote,
      publico_alvo: bPublico,
      dores_principais: bDores,
      tag: bTag,
      oferta: { nome: bOfertaNome, ticket: Number(bOfertaTicket), formato: 'Curso Online' }
    })
  }

  return (
    <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4 max-w-2xl text-xs animate-[fadeUp_0.15s_ease_both]">
      <h4 className="text-xs font-bold text-text-custom border-b border-border-custom pb-2">
        Briefing Estratégico do Lançamento
      </h4>

      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2 flex flex-col gap-1">
            <label className="text-[10px] font-bold text-text2 uppercase block">Mote / Tema Central</label>
            <input
              type="text"
              className="px-3 py-2 border border-border2 rounded bg-surface text-text-custom outline-none text-xs"
              value={bMote}
              onChange={(e) => setBMote(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-text2 uppercase block">Tag do Lançamento</label>
            <input
              type="text"
              placeholder="ex: semente-v2"
              className="px-3 py-2 border border-border2 rounded bg-surface text-text-custom outline-none text-xs font-mono"
              value={bTag}
              onChange={(e) => setBTag(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-text2 uppercase block">Público-Alvo</label>
          <textarea
            rows={4}
            className="px-3 py-2 border border-border2 rounded bg-surface text-text-custom outline-none h-32 text-xs resize-y"
            value={bPublico}
            onChange={(e) => setBPublico(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-text2 uppercase block">Dores Principais</label>
          <textarea
            rows={4}
            className="px-3 py-2 border border-border2 rounded bg-surface text-text-custom outline-none h-32 text-xs resize-y"
            value={bDores}
            onChange={(e) => setBDores(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-text2 uppercase block">Nome da Oferta Principal</label>
            <input
              type="text"
              className="px-3 py-2 border border-border2 rounded bg-surface text-text-custom outline-none text-xs"
              value={bOfertaNome}
              onChange={(e) => setBOfertaNome(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-text2 uppercase block">Ticket da Oferta (R$)</label>
            <input
              type="number"
              className="px-3 py-2 border border-border2 rounded bg-surface text-text-custom outline-none text-xs font-bold"
              value={bOfertaTicket}
              onChange={(e) => setBOfertaTicket(Number(e.target.value))}
            />
          </div>
        </div>

        <button
          onClick={handleSaveBriefing}
          className="w-full py-2 bg-purple-custom text-white hover:opacity-90 rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-sm"
        >
          Salvar Briefing
        </button>
      </div>
    </div>
  )
}

interface CronogramaTabProps {
  crono: CronogramaData
  onSave: (data: { verba_total: number; data_ancora: string; qtd_cpls: number }) => void
}

function CronogramaTab({ crono, onSave }: CronogramaTabProps) {
  const [verba, setVerba] = useState(crono.verba_total)
  const [anchor, setAnchor] = useState(crono.data_ancora)
  const [cpls, setCpls] = useState(crono.qtd_cpls)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs animate-[fadeUp_0.15s_ease_both]">
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4">
          <h4 className="text-xs font-bold text-text-custom border-b border-border-custom pb-2">
            Parâmetros de Cronograma e Verba
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-text2 uppercase tracking-wider">Verba Total (Pico)</label>
              <input
                type="number"
                className="px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                value={verba}
                onChange={(e) => setVerba(Number(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-text2 uppercase tracking-wider">Data do 1º CPL (Âncora)</label>
              <input
                type="date"
                className="px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                value={anchor}
                onChange={(e) => setAnchor(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-text2 uppercase tracking-wider">Quantidade de CPLs</label>
              <input
                type="number"
                className="px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                value={cpls}
                onChange={(e) => setCpls(Number(e.target.value))}
              />
            </div>
          </div>

          <button
            onClick={() => onSave({ verba_total: verba, data_ancora: anchor, qtd_cpls: cpls })}
            className="px-4 py-2 bg-purple-custom text-white hover:opacity-90 rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-sm"
          >
            Calcular Prazos e Etapas
          </button>
        </div>

        {/* Display Stages calculated */}
        <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4">
          <h4 className="text-xs font-bold text-text-custom border-b border-border-custom pb-2">
            Etapas do Cronograma
          </h4>
          <div className="divide-y divide-border-custom">
            {crono.etapas.map((e, idx) => (
              <div key={idx} className="flex justify-between items-center py-2.5">
                <div>
                  <span className="font-bold text-text-custom text-xs">{e.nome}</span>
                  <span className="text-[10px] text-text3 block mt-0.5 font-mono">
                    {e.inicio !== 'Sem data de fim' ? `${new Date(e.inicio).toLocaleDateString('pt-BR')} até ${new Date(e.fim).toLocaleDateString('pt-BR')}` : e.fim}
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-bold text-text-custom text-xs">{e.pct_verba}% da verba</span>
                  <span className="text-[10px] text-text3 block mt-0.5">
                    R$ {((crono.verba_total * e.pct_verba) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right column: Deadlines table */}
      <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4">
        <h4 className="text-xs font-bold text-text-custom border-b border-border-custom pb-2">
          Prazos Internos da Equipe
        </h4>
        <div className="space-y-3">
          {crono.prazos_equipe.map((p, idx) => (
            <div key={idx} className="p-2.5 bg-surface2/50 border border-border-custom rounded-lg space-y-0.5">
              <span className="text-[10px] text-text3 uppercase font-bold tracking-wider">{p.regra}</span>
              <span className="text-xs font-bold text-text-custom block">{p.nome}</span>
              <span className="text-[11px] text-purple-custom font-bold font-mono">
                Prazo: {new Date(p.data).toLocaleDateString('pt-BR')}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

interface RealizadoTabProps {
  real: RealizadoData['dados']
  verba: number
  provisionamento: ProvisionamentoData
  template: string
  onSave: (data: any) => void
}

function RealizadoTab({ real, verba, provisionamento, template, onSave }: RealizadoTabProps) {
  const [vendas, setVendas] = useState(real.vendas || 0)
  const [leadsPagos, setLeadsPagos] = useState(real.leads_pagos || 0)
  const [leadsOrg, setLeadsOrg] = useState(real.leads_organicos || 0)
  const [valProd, setValProd] = useState(real.valor_produto || 997)
  
  const [notes, setNotes] = useState(real.anotacoes || '')
  const [clientPerception, setClientPerception] = useState(real.percepcao_cliente || '')
  const [better, setBetter] = useState(real.melhorias || '')
  const [missing, setMissing] = useState(real.faltou || '')

  const handleSaveRealizado = () => {
    onSave({
      vendas: Number(vendas),
      leads_pagos: Number(leadsPagos),
      leads_organicos: Number(leadsOrg),
      valor_produto: Number(valProd),
      anotacoes: notes,
      percepcao_cliente: clientPerception,
      melhorias: better,
      faltou: missing,
    })
  }

  // Realized calculations
  const totalLeads = Number(leadsPagos) + Number(leadsOrg)
  const faturamento = Number(vendas) * Number(valProd)
  const cpl = Number(leadsPagos) > 0 ? verba / Number(leadsPagos) : 0
  const conv = totalLeads > 0 ? (Number(vendas) / totalLeads) * 100 : 0
  const roas = verba > 0 ? faturamento / verba : 0

  // Provisioned calculations based on active scenario
  const activeCenarioNome = provisionamento.cenario_ativo || 'Médio'
  let provFaturamento = 0
  let provRoas = 0

  if (template !== 'evento_pago') {
    const scenarios = provisionamento.dados.scenarios || []
    const activeScenario = scenarios.find(s => s.nome === activeCenarioNome) || scenarios[1] || scenarios[0]
    if (activeScenario) {
      const leadsTrafego = activeScenario.custo_lead > 0 ? verba / activeScenario.custo_lead : 0
      const totalLeadsProv = leadsTrafego + (activeScenario.leads_organicos || 0)
      const compradores = totalLeadsProv * (activeScenario.conversao_pct / 100)
      provFaturamento = compradores * activeScenario.valor_produto
      provRoas = verba > 0 ? provFaturamento / verba : 0
    }
  } else {
    const ev = provisionamento.dados.eventoPago || {
      faturamento_desejado: 20000,
      ticket_ingresso: 197,
      conversao_ingresso_pct: 5,
      investimento_desejado: 10000,
      ticket_mentoria: 2000,
      comparecimento_pct: 50,
      conversao_mentoria_pct: 10,
    }
    const ingressosVendas = ev.ticket_ingresso > 0 ? ev.faturamento_desejado / ev.ticket_ingresso : 0
    const mentoriaLeads = ingressosVendas * (ev.comparecimento_pct / 100)
    const mentoriaVendas = mentoriaLeads * (ev.conversao_mentoria_pct / 100)
    const faturamentoMentoria = mentoriaVendas * ev.ticket_mentoria

    provFaturamento = ev.faturamento_desejado + faturamentoMentoria
    provRoas = ev.investimento_desejado > 0 ? provFaturamento / ev.investimento_desejado : 0
  }

  // Banner status
  let bannerText = ""
  let bannerColor = ""
  if (faturamento > provFaturamento) {
    bannerText = "Superou o provisionado"
    bannerColor = "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
  } else if (faturamento === provFaturamento && faturamento > 0) {
    bannerText = "Bateu exatamente o provisionado"
    bannerColor = "bg-amber-500/10 text-amber-400 border border-amber-500/20"
  } else {
    bannerText = "Ficou abaixo do provisionado"
    bannerColor = "bg-red-500/10 text-red-400 border border-red-500/20"
  }

  const formatDiff = (realVal: number, provVal: number, isPercent = false, isCurrency = false) => {
    const diff = realVal - provVal
    const sign = diff > 0 ? '+' : ''
    const color = diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-t font-extrabold' : 'text-text3'
    
    if (isCurrency) {
      return (
        <span className={`font-bold ${color}`}>
          {sign} R$ {diff.toLocaleString('pt-BR')}
        </span>
      )
    }
    if (isPercent) {
      return (
        <span className={`font-bold ${color}`}>
          {sign} {diff.toFixed(1)}%
        </span>
      )
    }
    return (
      <span className={`font-bold ${color}`}>
        {sign} {diff.toFixed(2)}x
      </span>
    )
  }

  return (
    <div className="space-y-4 animate-[fadeUp_0.15s_ease_both]">
      {/* Auto-calculated status banner */}
      <div className={`p-4 rounded-xl flex items-center justify-between font-bold text-xs ${bannerColor}`}>
        <span className="uppercase tracking-wider">Status do Lançamento:</span>
        <span className="text-sm font-extrabold">{bannerText}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs">
        <div className="lg:col-span-2 bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4">
          <h4 className="text-xs font-bold text-text-custom border-b border-border-custom pb-2">
            Registro de Métricas Alcançadas
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] text-text3 uppercase font-bold">N° de Vendas</span>
              <input
                type="number"
                className="px-2 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                value={vendas === 0 ? '' : vendas}
                onChange={(e) => setVendas(Number(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] text-text3 uppercase font-bold">Leads Pagos</span>
              <input
                type="number"
                className="px-2 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                value={leadsPagos === 0 ? '' : leadsPagos}
                onChange={(e) => setLeadsPagos(Number(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] text-text3 uppercase font-bold">Leads Orgânicos</span>
              <input
                type="number"
                className="px-2 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                value={leadsOrg === 0 ? '' : leadsOrg}
                onChange={(e) => setLeadsOrg(Number(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] text-text3 uppercase font-bold">Ticket Médio (R$)</span>
              <input
                type="number"
                className="px-2 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                value={valProd === 0 ? '' : valProd}
                onChange={(e) => setValProd(Number(e.target.value))}
              />
            </div>
          </div>

          {/* Text debriefing inputs */}
          <div className="space-y-3 pt-3 border-t border-border-custom">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-text2 uppercase block">Percepção Geral</label>
              <textarea
                className="px-3 py-2 border border-border2 rounded bg-surface text-text-custom outline-none h-14"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-text2 uppercase block">Percepção do Cliente</label>
              <textarea
                className="px-3 py-2 border border-border2 rounded bg-surface text-text-custom outline-none h-14"
                value={clientPerception}
                onChange={(e) => setClientPerception(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-text2 uppercase block">O que melhorar no próximo?</label>
              <textarea
                className="px-3 py-2 border border-border2 rounded bg-surface text-text-custom outline-none h-14"
                value={better}
                onChange={(e) => setBetter(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-text2 uppercase block">O que faltou executar?</label>
              <textarea
                className="px-3 py-2 border border-border2 rounded bg-surface text-text-custom outline-none h-14"
                value={missing}
                onChange={(e) => setMissing(e.target.value)}
              />
            </div>
          </div>

          <button
            onClick={handleSaveRealizado}
            className="w-full py-2 bg-purple-custom text-white hover:opacity-90 rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-sm"
          >
            Salvar Realizado
          </button>
        </div>

        {/* Side panel comparison */}
        <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4">
          <h4 className="text-xs font-bold text-text-custom border-b border-border-custom pb-2">
            Comparativo de Resultados
          </h4>
          
          {/* Comparative Table */}
          <div className="overflow-x-auto pt-1">
            <table className="w-full text-left border-collapse text-[10px]">
              <thead>
                <tr className="border-b border-border-custom text-text3 font-bold uppercase">
                  <th className="py-2">Métrica</th>
                  <th className="py-2">Prov. ({activeCenarioNome})</th>
                  <th className="py-2 font-bold text-text2">Realizado</th>
                  <th className="py-2 text-right">Desvio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-custom/50">
                <tr>
                  <td className="py-2.5 font-bold text-text-custom">Faturamento</td>
                  <td className="py-2.5 text-text2">R$ {provFaturamento.toLocaleString('pt-BR')}</td>
                  <td className="py-2.5 font-bold text-text-custom">R$ {faturamento.toLocaleString('pt-BR')}</td>
                  <td className="py-2.5 text-right">{formatDiff(faturamento, provFaturamento, false, true)}</td>
                </tr>
                <tr>
                  <td className="py-2.5 font-bold text-text-custom">ROAS</td>
                  <td className="py-2.5 text-text2">{provRoas.toFixed(2)}x</td>
                  <td className="py-2.5 font-bold text-text-custom">{roas.toFixed(2)}x</td>
                  <td className="py-2.5 text-right">{formatDiff(roas, provRoas, false, false)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="space-y-3 text-[11px] text-text3 pt-4 border-t border-border-custom">
            <div className="flex justify-between py-1 border-b border-border-custom">
              <span>Total Leads:</span>
              <span className="font-bold text-text-custom">{Math.round(totalLeads)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-border-custom">
              <span>CPL Real:</span>
              <span className="font-bold text-text-custom">R$ {cpl.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span>Conversão Real:</span>
              <span className="font-bold text-text-custom">{conv.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface ProvisionamentoTabProps {
  provisionamento: ProvisionamentoData
  verba: number
  template: string
  briefingTicket: number
  onSave: (data: any) => void
}

function ProvisionamentoTab({ provisionamento, verba, template, briefingTicket, onSave }: ProvisionamentoTabProps) {
  const [cenarioAtivo, setCenarioAtivo] = useState(provisionamento.cenario_ativo || 'Médio')
  const [scenarios, setScenarios] = useState<Scenario[]>(provisionamento.dados.scenarios || [])
  const [ev, setEv] = useState<EventoPagoFunnel>(provisionamento.dados.eventoPago || {
    faturamento_desejado: 20000,
    ticket_ingresso: briefingTicket || 197,
    conversao_ingresso_pct: 5,
    investimento_desejado: 10000,
    ticket_mentoria: 2000,
    comparecimento_pct: 50,
    conversao_mentoria_pct: 10,
  })

  // Synchronize with briefingTicket when it changes
  useEffect(() => {
    if (briefingTicket) {
      setEv(prev => ({ ...prev, ticket_ingresso: briefingTicket }))
    }
  }, [briefingTicket])

  const handleScenarioChange = (idx: number, field: keyof Scenario, val: any) => {
    const copy = [...scenarios]
    copy[idx] = { ...copy[idx], [field]: val === '' ? 0 : Number(val) }
    setScenarios(copy)
  }

  const handleEvChange = (field: keyof EventoPagoFunnel, val: any) => {
    setEv({ ...ev, [field]: val === '' ? 0 : Number(val) })
  }

  const handleSave = () => {
    onSave({
      cenario_ativo: cenarioAtivo,
      dados: {
        scenarios: scenarios.map(sc => ({ ...sc, valor_produto: briefingTicket })),
        eventoPago: { ...ev, ticket_ingresso: briefingTicket }
      }
    })
  }

  if (template !== 'evento_pago') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs animate-[fadeUp_0.15s_ease_both]">
        <div className="lg:col-span-2 bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex justify-between items-center border-b border-border-custom pb-2">
            <h4 className="text-xs font-bold text-text-custom">Simulação de Cenários de Lançamento</h4>
            <span className="text-[10px] text-text3">Verba Total: R$ {verba.toLocaleString('pt-BR')}</span>
          </div>

          <div className="space-y-4">
            {scenarios.map((sc, idx) => {
              const leadsTrafego = sc.custo_lead > 0 ? verba / sc.custo_lead : 0
              const totalLeads = leadsTrafego + sc.leads_organicos
              const compradores = totalLeads * (sc.conversao_pct / 100)
              const faturamento = compradores * briefingTicket
              const roas = verba > 0 ? faturamento / verba : 0

              return (
                <div key={idx} className="p-4 bg-surface2/50 border border-border-custom rounded-xl space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="flex items-center gap-2 font-bold text-text-custom text-xs cursor-pointer">
                      <input
                        type="radio"
                        name="cenario_ativo"
                        className="accent-purple-custom"
                        checked={cenarioAtivo === sc.nome}
                        onChange={() => setCenarioAtivo(sc.nome)}
                      />
                      <span>Cenário: {sc.nome}</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[9px] text-text3 uppercase font-bold">Custo por Lead (CPL)</span>
                      <input
                        type="number"
                        className="px-2 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                        value={sc.custo_lead}
                        onChange={(e) => handleScenarioChange(idx, 'custo_lead', e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[9px] text-text3 uppercase font-bold">Leads Orgânicos</span>
                      <input
                        type="number"
                        className="px-2 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                        value={sc.leads_organicos}
                        onChange={(e) => handleScenarioChange(idx, 'leads_organicos', e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[9px] text-text3 uppercase font-bold">Valor do Curso (R$)</span>
                      <input
                        type="number"
                        className="px-2 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none opacity-60 cursor-not-allowed font-bold"
                        value={briefingTicket}
                        disabled
                      />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[9px] text-text3 uppercase font-bold">Conversão (%)</span>
                      <input
                        type="number"
                        step="0.1"
                        className="px-2 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                        value={sc.conversao_pct}
                        onChange={(e) => handleScenarioChange(idx, 'conversao_pct', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-border-custom text-[11px] text-text3">
                    <div>Total Leads: <strong className="text-text-custom">{Math.round(totalLeads)}</strong></div>
                    <div>Compradores: <strong className="text-text-custom">{Math.round(compradores)}</strong></div>
                    <div>Faturamento: <strong className="text-emerald-400">R$ {Math.round(faturamento).toLocaleString('pt-BR')}</strong></div>
                    <div>ROAS Previsto: <strong className="text-purple-custom">{roas.toFixed(2)}x</strong></div>
                  </div>
                </div>
              )
            })}

            <button
              onClick={handleSave}
              className="w-full py-2 bg-purple-custom text-white hover:opacity-90 rounded-lg text-xs font-semibold cursor-pointer transition-colors mt-2 shadow-sm"
            >
              Salvar Simulações
            </button>
          </div>
        </div>

        {/* Side references */}
        <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4 h-fit">
          <h4 className="text-xs font-bold text-text-custom border-b border-border-custom pb-2">Referência de Conversão</h4>
          <div className="space-y-2 text-[11px]">
            <div className="flex justify-between py-1 border-b border-border-custom"><span className="text-text2">Normal / Legal</span><span className="font-bold text-zinc-400">1.0%</span></div>
            <div className="flex justify-between py-1 border-b border-border-custom"><span className="text-text2">Boa</span><span className="font-bold text-blue-400">2.0%</span></div>
            <div className="flex justify-between py-1 border-b border-border-custom"><span className="text-text2">Foda</span><span className="font-bold text-purple-400">5.0%</span></div>
            <div className="flex justify-between py-1 border-b border-border-custom"><span className="text-text2">Explodiu</span><span className="font-bold text-emerald-400">10.0%</span></div>
          </div>
        </div>
      </div>
    )
  }

  // Calculations for Evento Pago
  const ingressosVendas = briefingTicket > 0 ? ev.faturamento_desejado / briefingTicket : 0
  const ingressosLeads = ev.conversao_ingresso_pct > 0 ? ingressosVendas / (ev.conversao_ingresso_pct / 100) : 0
  const cplResultante = ingressosLeads > 0 ? ev.investimento_desejado / ingressosLeads : 0

  const mentoriaLeads = ingressosVendas * (ev.comparecimento_pct / 100)
  const mentoriaVendas = mentoriaLeads * (ev.conversao_mentoria_pct / 100)
  const faturamentoMentoria = mentoriaVendas * ev.ticket_mentoria

  return (
    <div className="space-y-6 text-xs animate-[fadeUp_0.15s_ease_both]">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Subfunnel 1 */}
        <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4">
          <h4 className="text-xs font-bold text-text-custom border-b border-border-custom pb-2">
            Sub-Funil 1: Ingresso / Imersão
          </h4>
          <div className="space-y-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-text3 font-bold uppercase">Quanto quer faturar (R$)</span>
              <input
                type="number"
                className="px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                value={ev.faturamento_desejado}
                onChange={(e) => handleEvChange('faturamento_desejado', e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-text3 font-bold uppercase">Ticket do Ingresso (R$)</span>
              <input
                type="number"
                className="px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none opacity-60 cursor-not-allowed font-bold"
                value={briefingTicket}
                disabled
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-text3 font-bold uppercase">Conversão em vendas (%)</span>
              <input
                type="number"
                className="px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                value={ev.conversao_ingresso_pct}
                onChange={(e) => handleEvChange('conversao_ingresso_pct', e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-text3 font-bold uppercase">Quanto quer investir (R$)</span>
              <input
                type="number"
                className="px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                value={ev.investimento_desejado}
                onChange={(e) => handleEvChange('investimento_desejado', e.target.value)}
              />
            </div>

            <div className="p-3 bg-surface2/50 border border-border-custom rounded-lg space-y-1 text-[11px] text-text3">
              <div>Vendas necessárias: <strong className="text-text-custom">{Math.round(ingressosVendas)}</strong></div>
              <div>Leads necessários: <strong className="text-text-custom">{Math.round(ingressosLeads)}</strong></div>
              <div>CPL Resultante máximo: <strong className="text-emerald-400">R$ {cplResultante.toFixed(2)}</strong></div>
            </div>
          </div>
        </div>

        {/* Subfunnel 2 */}
        <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4">
          <h4 className="text-xs font-bold text-text-custom border-b border-border-custom pb-2">
            Sub-Funil 2: Mentoria / Upsell
          </h4>
          <div className="space-y-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-text3 font-bold uppercase">Ticket da Mentoria (R$)</span>
              <input
                type="number"
                className="px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                value={ev.ticket_mentoria}
                onChange={(e) => handleEvChange('ticket_mentoria', e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-text3 font-bold uppercase">Taxa de Comparecimento ao vivo (%)</span>
              <input
                type="number"
                className="px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                value={ev.comparecimento_pct}
                onChange={(e) => handleEvChange('comparecimento_pct', e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-text3 font-bold uppercase">Taxa de Conversão Mentoria (%)</span>
              <input
                type="number"
                className="px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                value={ev.conversao_mentoria_pct}
                onChange={(e) => handleEvChange('conversao_mentoria_pct', e.target.value)}
              />
            </div>

            <div className="p-3 bg-surface2/50 border border-border-custom rounded-lg space-y-1 text-[11px] text-text3">
              <div>Leads ao vivo: <strong className="text-text-custom">{Math.round(mentoriaLeads)}</strong></div>
              <div>Vendas Mentoria: <strong className="text-text-custom">{Math.round(mentoriaVendas)}</strong></div>
              <div>Faturamento Mentoria: <strong className="text-emerald-400">R$ {Math.round(faturamentoMentoria).toLocaleString('pt-BR')}</strong></div>
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={handleSave}
        className="w-full py-2 bg-purple-custom text-white hover:opacity-90 rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-sm"
      >
        Salvar Simulações
      </button>
    </div>
  )
}

interface InvestimentosTabProps {
  investimentos: InvestimentosData['dados']
  faturamentoReal: number
  briefingTicket: number
  onSave: (data: InvestimentosData['dados']) => void
}

function InvestimentosTab({ investimentos, faturamentoReal, briefingTicket, onSave }: InvestimentosTabProps) {
  const [custos, setCustos] = useState<CostItem[]>(investimentos.custos || [])
  const [ofertas, setOfertas] = useState<OfferItem[]>(investimentos.ofertas || [])
  const [socios, setSocios] = useState<PartnerCommission[]>(investimentos.socios || [])
  const [impostoPct, setImpostoPct] = useState(investimentos.imposto_pct || 6)
  const [fundoPct, setFundoPct] = useState(investimentos.fundo_reserva_pct || 10)

  const handleAddCost = () => {
    setCustos([...custos, { nome: 'Novo custo', valor: 500 }])
  }

  const handleRemoveCost = (idx: number) => {
    setCustos(custos.filter((_, i) => i !== idx))
  }

  const handleCostChange = (idx: number, field: keyof CostItem, val: any) => {
    const copy = [...custos]
    copy[idx] = { ...copy[idx], [field]: field === 'valor' ? Number(val) : val }
    setCustos(copy)
  }

  const handleAddOffer = () => {
    setOfertas([...ofertas, { nome: 'Novo produto', ticket: 997, vendas: 0, comissao_pct: 10, vendas_ads: 0, valor_gasto_ads: 0 }])
  }

  const handleRemoveOffer = (idx: number) => {
    setOfertas(ofertas.filter((_, i) => i !== idx))
  }

  const handleOfferChange = (idx: number, field: keyof OfferItem, val: any) => {
    const copy = [...ofertas]
    copy[idx] = { ...copy[idx], [field]: field === 'nome' ? val : Number(val) }
    setOfertas(copy)
  }

  const handleAddPartner = () => {
    setSocios([...socios, { nome: 'Novo Sócio', pct: 50 }])
  }

  const handleRemovePartner = (idx: number) => {
    setSocios(socios.filter((_, i) => i !== idx))
  }

  const handlePartnerChange = (idx: number, field: keyof PartnerCommission, val: any) => {
    const copy = [...socios]
    copy[idx] = { ...copy[idx], [field]: field === 'nome' ? val : Number(val) }
    setSocios(copy)
  }

  const handleSave = () => {
    const updatedOfertas = ofertas.map((o, idx) => 
      idx === 0 ? { ...o, ticket: briefingTicket } : o
    )
    onSave({
      custos,
      ofertas: updatedOfertas,
      socios,
      imposto_pct: impostoPct,
      fundo_reserva_pct: fundoPct
    })
  }

  // Math P&L calculations
  const totalCustos = custos.reduce((acc, c) => acc + c.valor, 0)
  
  const totalOffersGross = ofertas.reduce((acc, o, idx) => {
    const t = idx === 0 ? briefingTicket : o.ticket
    return acc + (t * o.vendas)
  }, 0)
  const totalOffersNet = ofertas.reduce((acc, o, idx) => {
    const t = idx === 0 ? briefingTicket : o.ticket
    const gross = t * o.vendas
    return acc + (gross - (gross * (o.comissao_pct / 100)))
  }, 0)

  const impostoReal = totalOffersGross * (impostoPct / 100)
  const netProfit = totalOffersNet - totalCustos - impostoReal

  const fundoAmount = netProfit > 0 ? netProfit * (fundoPct / 100) : 0
  const remainderProfit = netProfit > 0 ? netProfit - fundoAmount : 0

  return (
    <div className="space-y-6 text-xs animate-[fadeUp_0.15s_ease_both]">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Custos Card */}
        <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex justify-between items-center border-b border-border-custom pb-2">
            <h4 className="text-xs font-bold text-text-custom">Detalhamento de Custos Operacionais</h4>
            <button
              onClick={handleAddCost}
              className="px-2 py-1 bg-surface border border-border-custom hover:bg-surface2 text-text-custom text-[10px] font-semibold rounded cursor-pointer"
            >
              + Novo Custo
            </button>
          </div>
          <div className="space-y-2">
            {custos.map((c, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <input
                  type="text"
                  className="flex-1 px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                  value={c.nome}
                  onChange={(e) => handleCostChange(idx, 'nome', e.target.value)}
                />
                <div className="relative w-28">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text3 text-[9px] font-bold">R$</span>
                  <input
                    type="number"
                    className="w-full pl-7 pr-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none text-right font-bold"
                    value={c.valor}
                    onChange={(e) => handleCostChange(idx, 'valor', e.target.value)}
                  />
                </div>
                <button
                  onClick={() => handleRemoveCost(idx)}
                  className="p-1.5 border border-border-custom hover:border-red-500/30 rounded-lg text-text3 hover:text-red-400 hover:bg-red-500/5 transition-colors cursor-pointer"
                >
                  <Trash className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <div className="flex justify-between py-2 border-t border-border-custom font-bold text-text-custom pt-3">
              <span>Soma dos custos:</span>
              <span>R$ {totalCustos.toLocaleString('pt-BR')}</span>
            </div>
          </div>
        </div>

        {/* Receitas / Ofertas Card */}
        <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex justify-between items-center border-b border-border-custom pb-2">
            <h4 className="text-xs font-bold text-text-custom">Receitas por Ofertas</h4>
            <button
              onClick={handleAddOffer}
              className="px-2 py-1 bg-surface border border-border-custom hover:bg-surface2 text-text-custom text-[10px] font-semibold rounded cursor-pointer"
            >
              + Nova Oferta
            </button>
          </div>
          <div className="space-y-3">
            {ofertas.map((o, idx) => (
              <div key={idx} className="p-3 bg-surface2/50 border border-border-custom rounded-lg space-y-2">
                <div className="flex justify-between items-center">
                  <input
                    type="text"
                    className="font-bold text-text-custom bg-transparent outline-none border-b border-transparent focus:border-border2"
                    value={o.nome}
                    onChange={(e) => handleOfferChange(idx, 'nome', e.target.value)}
                  />
                  <button
                    onClick={() => handleRemoveOffer(idx)}
                    className="text-text3 hover:text-red-400 cursor-pointer"
                  >
                    Remover
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] text-text3 font-bold uppercase">Ticket (R$)</span>
                    {idx === 0 ? (
                      <input
                        type="number"
                        className="px-2 py-1 border border-border2 rounded bg-surface text-text-custom outline-none opacity-60 cursor-not-allowed font-bold"
                        value={briefingTicket}
                        disabled
                      />
                    ) : (
                      <input
                        type="number"
                        className="px-2 py-1 border border-border2 rounded bg-surface text-text-custom outline-none"
                        value={o.ticket}
                        onChange={(e) => handleOfferChange(idx, 'ticket', e.target.value)}
                      />
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] text-text3 font-bold uppercase">N° Vendas</span>
                    <input
                      type="number"
                      className="px-2 py-1 border border-border2 rounded bg-surface text-text-custom outline-none"
                      value={o.vendas}
                      onChange={(e) => handleOfferChange(idx, 'vendas', e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] text-text3 font-bold uppercase">Comissão (%)</span>
                    <input
                      type="number"
                      className="px-2 py-1 border border-border2 rounded bg-surface text-text-custom outline-none"
                      value={o.comissao_pct}
                      onChange={(e) => handleOfferChange(idx, 'comissao_pct', e.target.value)}
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-[10px] text-text3 pt-1">
                  <div>Bruto: R$ {(o.ticket * o.vendas).toLocaleString('pt-BR')}</div>
                  <div className="text-right">Líquido: R$ {(o.ticket * o.vendas - (o.ticket * o.vendas * o.comissao_pct / 100)).toLocaleString('pt-BR')}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* DRE Summary & Comissões */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4">
          <h4 className="text-xs font-bold text-text-custom border-b border-border-custom pb-2">Resultado Líquido Geral</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2 text-[11px] text-text3">
              <div className="flex justify-between py-1 border-b border-border-custom"><span>Receita Líquida Total:</span><span className="font-bold text-text-custom">R$ {totalOffersNet.toLocaleString('pt-BR')}</span></div>
              <div className="flex justify-between py-1 border-b border-border-custom"><span>Custos Operacionais:</span><span className="font-bold text-text-custom">R$ {totalCustos.toLocaleString('pt-BR')}</span></div>
              <div className="flex justify-between items-center py-1 border-b border-border-custom">
                <span>Impostos (%):</span>
                <input
                  type="number"
                  className="w-14 px-1.5 py-0.5 border border-border2 rounded bg-surface text-text-custom text-right outline-none"
                  value={impostoPct}
                  onChange={(e) => setImpostoPct(Number(e.target.value))}
                />
              </div>
              <div className="flex justify-between py-1 font-bold text-emerald-400 text-xs"><span>Resultado Líquido:</span><span>R$ {netProfit.toLocaleString('pt-BR')}</span></div>
            </div>

            <div className="p-3.5 bg-surface2/50 border border-border-custom rounded-xl flex flex-col justify-between">
              <div>
                <span className="text-[10px] text-text3 font-bold uppercase">Reserva do Fundo de Lançamento</span>
                <div className="flex items-center gap-2 mt-1.5">
                  <input
                    type="number"
                    className="w-16 px-2 py-1 border border-border2 rounded bg-surface text-text-custom font-bold outline-none"
                    value={fundoPct}
                    onChange={(e) => setFundoPct(Number(e.target.value))}
                  />
                  <span className="font-bold text-text-custom">%</span>
                </div>
              </div>
              <div className="text-[11px] text-text3 pt-3 border-t border-border-custom">
                Valor retido: <strong className="text-purple-custom">R$ {fundoAmount.toLocaleString('pt-BR')}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Partner Split */}
        <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex justify-between items-center border-b border-border-custom pb-2">
            <h4 className="text-xs font-bold text-text-custom">Divisão de Lucro (Sócios)</h4>
            <div className="flex gap-2">
              <button
                onClick={handleAddPartner}
                className="px-2 py-0.5 bg-surface border border-border-custom hover:bg-surface2 text-text-custom text-[10px] font-semibold rounded cursor-pointer"
              >
                + Sócio
              </button>
            </div>
          </div>
          <div className="space-y-3">
            {socios.map((s, idx) => {
              const socioProfit = remainderProfit * (s.pct / 100)
              return (
                <div key={idx} className="flex items-center gap-3">
                  <input
                    type="text"
                    className="flex-1 px-2.5 py-1 border border-border2 rounded bg-surface text-text-custom outline-none"
                    value={s.nome}
                    onChange={(e) => handlePartnerChange(idx, 'nome', e.target.value)}
                  />
                  <div className="relative w-20">
                    <input
                      type="number"
                      className="w-full pr-6 pl-2.5 py-1 border border-border2 rounded bg-surface text-text-custom outline-none text-right font-bold"
                      value={s.pct}
                      onChange={(e) => handlePartnerChange(idx, 'pct', e.target.value)}
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text3 font-bold">%</span>
                  </div>
                  <button
                    onClick={() => handleRemovePartner(idx)}
                    className="text-text3 hover:text-red-400 cursor-pointer"
                  >
                    X
                  </button>
                </div>
              )
            })}
            
            <div className="p-3 bg-surface2/50 border border-border-custom rounded-lg text-[10px] text-text3 divide-y divide-border-custom space-y-1.5">
              {socios.map((s, idx) => (
                <div key={idx} className="flex justify-between py-1">
                  <span>{s.nome}:</span>
                  <span className="font-bold text-text-custom">R$ {(remainderProfit * s.pct / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={handleSave}
        className="w-full py-2.5 bg-purple-custom text-white hover:opacity-90 rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-sm"
      >
        Salvar Investimentos
      </button>
    </div>
  )
}
