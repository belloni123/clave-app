'use client'

import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/utils/supabase/client'
import { useAppStore } from '@/store/useAppStore'
import { ChevronLeft, Check } from 'lucide-react'

type LaunchType = 'val' | 'ep' | 'pv'

const LAUNCH_CHECKLISTS: Record<LaunchType, { g: string; i: string[] }[]> = {
  val: [
    {
      g: 'Produto',
      i: [
        'Criar produto no Hotmart',
        'Subir aula de boas-vindas',
        'Subir aula 1',
        'Configurar e-mail automação 1',
        'Configurar e-mail automação 2',
        'Criar página de captura',
        'Criar página de confirmação',
        'Configurar pixel',
      ],
    },
    {
      g: 'Anúncios',
      i: ['Campanha de captura', 'Criar anúncios (mín. 3)', 'Monitorar CPL', 'Campanha de remarketing'],
    },
    {
      g: 'Lançamento',
      i: ['Definir data da live', 'Preparar roteiro', 'E-mail de convite', 'Realizar a live', 'Sequência pós-live', 'Fechar carrinho'],
    },
  ],
  ep: [
    {
      g: 'Estrutura',
      i: ['Criar produto na plataforma', 'Página de captura', 'Página de vendas', 'Configurar pixel'],
    },
    {
      g: 'Comunicação',
      i: ['E-mail boas-vindas', 'Sequência de aquecimento', 'Lembrete 1 dia antes', 'Lembrete 1h antes', 'Sequência pós-evento'],
    },
    {
      g: 'Anúncios',
      i: ['Campanha público frio', 'Campanha lookalike', 'Remarketing', 'Monitorar CPL'],
    },
    {
      g: 'Evento',
      i: ['Preparar roteiro', 'Preparar slides', 'Testar plataforma', 'Realizar evento', 'Executar fechamento'],
    },
  ],
  pv: [
    {
      g: 'Planejamento',
      i: ['Definir mote e tema', 'Definir ofertas', 'Definir datas', 'Definir orçamento'],
    },
    {
      g: 'Estrutura',
      i: ['Atualizar página de vendas', 'Configurar cupons', 'Abandono de carrinho', 'Configurar pixel'],
    },
    {
      g: 'Aquecimento',
      i: ['Campanha de aquecimento', 'Conteúdo diário', 'E-mails de aquecimento'],
    },
    {
      g: 'Abertura',
      i: ['Anúncio de abertura', 'E-mail de abertura', 'Contagem regressiva'],
    },
    {
      g: 'Fechamento',
      i: ['E-mails de urgência', 'Remarketing agressivo', 'Live de fechamento', 'Fechar carrinho'],
    },
  ],
}

const LAUNCH_NAMES: Record<LaunchType, string> = {
  val: 'Validação + perpétuo',
  ep: 'Evento pago',
  pv: 'Pico de vendas',
}

export default function LancamentosModule() {
  const queryClient = useQueryClient()
  const supabase = createClient()
  const { activeProjectId, showToast } = useAppStore()

  const [activeLaunch, setActiveLaunch] = useState<LaunchType | null>(null)
  const [activeSubTab, setActiveSubTab] = useState<'checklist' | 'defs' | 'nums' | 'deb'>('checklist')

  // Local state elements for numbers and definitions to avoid lag on typing
  const [mote, setMote] = useState('')
  const [dataIni, setDataIni] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [preco, setPreco] = useState(0)
  const [meta, setMeta] = useState(0)

  const [leads, setLeads] = useState(0)
  const [vendas, setVendas] = useState(0)
  const [receita, setReceita] = useState(0)
  const [investido, setInvestido] = useState(0)

  const [debGeral, setDebGeral] = useState('')
  const [debErros, setDebErros] = useState('')
  const [debMelhorias, setDebMelhorias] = useState('')

  // 1. CARREGAR CHECKLISTS
  const { data: dbChecklists } = useQuery({
    queryKey: ['launch_checklists', activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return {}
      const { data, error } = await supabase
        .from('launch_checklists')
        .select('type, state')
        .eq('project_id', activeProjectId)

      if (error) {
        showToast('Erro ao carregar checklists', 'err')
        return {}
      }

      const map: Record<string, Record<string, boolean>> = {}
      data.forEach((item) => {
        map[item.type] = item.state as Record<string, boolean>
      })
      return map
    },
    enabled: !!activeProjectId,
  })

  // 2. CARREGAR OUTROS DADOS (Definições, Números, Debriefing)
  const { data: textFields } = useQuery({
    queryKey: ['launch_text_fields', activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return {}
      const { data, error } = await supabase
        .from('text_fields')
        .select('key, value')
        .eq('project_id', activeProjectId)
        .or('key.like.val-%,key.like.ep-%,key.like.pv-%')

      if (error) {
        showToast('Erro ao carregar dados dos lançamentos', 'err')
        return {}
      }

      const map: Record<string, string> = {}
      data.forEach((item) => {
        map[item.key] = item.value
      })
      return map
    },
    enabled: !!activeProjectId,
  })

  // Atualizar states locais quando os dados da query carregarem ou trocar de launch ativo
  useEffect(() => {
    if (textFields && activeLaunch) {
      const getVal = (key: string, fallback: string | number) => {
        const raw = textFields[`${activeLaunch}-${key}`]
        if (raw === undefined) return fallback
        return typeof fallback === 'number' ? +raw : raw
      }

      const timer = setTimeout(() => {
        setMote(getVal('mote', '') as string)
        setDataIni(getVal('dataIni', '') as string)
        setDataFim(getVal('dataFim', '') as string)
        setPreco(getVal('preco', 0) as number)
        setMeta(getVal('meta', 0) as number)
        setLeads(getVal('leads', 0) as number)
        setVendas(getVal('vendas', 0) as number)
        setReceita(getVal('receita', 0) as number)
        setInvestido(getVal('investido', 0) as number)
        setDebGeral(getVal('debGeral', '') as string)
        setDebErros(getVal('debErros', '') as string)
        setDebMelhorias(getVal('debMelhorias', '') as string)
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [textFields, activeLaunch])

  // 3. MUTATIONS
  const saveChecklistMutation = useMutation({
    mutationFn: async ({ type, state }: { type: LaunchType; state: Record<string, boolean> }) => {
      if (!activeProjectId) return

      const { data: existing } = await supabase
        .from('launch_checklists')
        .select('id')
        .eq('project_id', activeProjectId)
        .eq('type', type)
        .maybeSingle()

      if (existing) {
        const { error } = await supabase
          .from('launch_checklists')
          .update({ state })
          .eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('launch_checklists')
          .insert({ project_id: activeProjectId, type, state })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['launch_checklists', activeProjectId] })
    },
  })

  const saveTextFieldMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      if (!activeProjectId) return

      const { data: existing } = await supabase
        .from('text_fields')
        .select('id')
        .eq('project_id', activeProjectId)
        .eq('key', key)
        .maybeSingle()

      if (existing) {
        const { error } = await supabase
          .from('text_fields')
          .update({ value })
          .eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('text_fields')
          .insert({ project_id: activeProjectId, key, value })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['launch_text_fields', activeProjectId] })
    },
  })

  const handleToggleCheck = (type: LaunchType, key: string) => {
    const currentState = dbChecklists?.[type] || {}
    const updatedState = { ...currentState, [key]: !currentState[key] }
    saveChecklistMutation.mutate({ type, state: updatedState })
  }

  const handleSaveText = (subKey: string, val: string | number) => {
    if (!activeLaunch) return
    const key = `${activeLaunch}-${subKey}`
    saveTextFieldMutation.mutate({ key, value: String(val) })
  }

  // Estatísticas de Checklist por tipo de lançamento
  const getCheckStats = (type: LaunchType) => {
    const list = LAUNCH_CHECKLISTS[type]
    const state = dbChecklists?.[type] || {}
    let total = 0
    let checked = 0

    list.forEach((g) => {
      g.i.forEach((item, idx) => {
        total++
        const key = `${g.g}_${idx}`
        if (state[key]) checked++
      })
    })

    const pct = total > 0 ? Math.round((checked / total) * 100) : 0
    return { total, checked, pct }
  }

  // Métricas financeiras calculadas
  const roas = investido > 0 ? (receita / investido).toFixed(2) + 'x' : '—'
  const cpa = vendas > 0 ? Math.round(investido / vendas) : 0
  const cpl = leads > 0 ? (investido / leads).toFixed(2) : '0.00'
  const lucro = receita - investido
  const conv = leads > 0 ? ((vendas / leads) * 100).toFixed(1) + '%' : '—'

  return (
    <div className="space-y-6">
      {/* 1. VIEW: SELEÇÃO DE LANÇAMENTOS (HOME) */}
      {!activeLaunch ? (
        <div className="space-y-4 animate-[fadeUp_0.15s_ease_both]">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(['val', 'ep', 'pv'] as LaunchType[]).map((type) => {
              const { pct, checked, total } = getCheckStats(type)
              const colors = {
                val: 'bg-green-bg/30 text-green-t hover:border-green-custom/30',
                ep: 'bg-purple-bg/35 text-purple-t hover:border-purple-custom/30',
                pv: 'bg-coral-bg/30 text-coral-t hover:border-coral-custom/30',
              }
              const progressColors = {
                val: 'bg-green-custom',
                ep: 'bg-purple-custom',
                pv: 'bg-coral-custom',
              }
              return (
                <div
                  key={type}
                  onClick={() => {
                    setActiveLaunch(type)
                    setActiveSubTab('checklist')
                  }}
                  className={`bg-surface border border-border-custom hover:shadow-md rounded-xl p-5 cursor-pointer transition-all duration-150 flex flex-col justify-between h-40 ${colors[type]}`}
                >
                  <div>
                    <h4 className="text-sm font-bold text-text-custom">{LAUNCH_NAMES[type]}</h4>
                    <p className="text-[11px] text-text2 mt-1">
                      {type === 'val' && 'Valide a oferta e a copy com tráfego menor'}
                      {type === 'ep' && 'Lançamento clássico com lives e aquecimento'}
                      {type === 'pv' && 'Oferta sazonal ou cupom de pico para a lista'}
                    </p>
                  </div>

                  <div className="space-y-1 mt-4">
                    <div className="flex justify-between text-[10px] font-semibold text-text2">
                      <span>{pct}% concluído</span>
                      <span>
                        {checked}/{total}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-surface2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${progressColors[type]}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        /* 2. VIEW: DETALHES DO LANÇAMENTO */
        <div className="space-y-6 animate-[fadeUp_0.15s_ease_both]">
          {/* Header de retorno */}
          <div className="flex justify-between items-center bg-surface border border-border-custom rounded-xl p-3.5 shadow-sm">
            <button
              onClick={() => setActiveLaunch(null)}
              className="flex items-center gap-1.5 text-xs text-text2 hover:text-text-custom cursor-pointer font-medium"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Voltar para lançamentos</span>
            </button>
            <h3 className="text-xs font-bold text-text-custom">
              {LAUNCH_NAMES[activeLaunch].toUpperCase()}
            </h3>
          </div>

          {/* Subtabs de Navegação */}
          <div className="flex gap-1 border-b border-border-custom flex-wrap mb-4">
            {([
              { id: 'checklist', name: 'Checklist' },
              { id: 'defs', name: 'Definições' },
              { id: 'nums', name: 'Números' },
              { id: 'deb', name: 'Debriefing' },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={`px-4 py-2 text-xs font-semibold cursor-pointer border-b-2 bg-transparent transition-colors duration-150 ${
                  activeSubTab === tab.id
                    ? 'border-text-custom text-text-custom'
                    : 'border-transparent text-text2 hover:text-text-custom'
                }`}
              >
                {tab.name}
              </button>
            ))}
          </div>

          {/* TAB CONTENT: CHECKLIST */}
          {activeSubTab === 'checklist' && (
            <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b border-border-custom pb-3">
                <span className="text-xs font-bold text-text-custom">Checklist de Operação</span>
                <span className="text-[11px] text-text3 font-medium">
                  {getCheckStats(activeLaunch).checked} de {getCheckStats(activeLaunch).total}{' '}
                  itens concluídos ({getCheckStats(activeLaunch).pct}%)
                </span>
              </div>

              <div className="space-y-4">
                {LAUNCH_CHECKLISTS[activeLaunch].map((group) => (
                  <div key={group.g} className="space-y-2">
                    <h5 className="text-[10px] font-bold text-text3 uppercase tracking-wider">
                      {group.g}
                    </h5>
                    <div className="space-y-1.5">
                      {group.i.map((item, idx) => {
                        const key = `${group.g}_${idx}`
                        const isChecked = !!dbChecklists?.[activeLaunch]?.[key]
                        return (
                          <div
                            key={idx}
                            onClick={() => handleToggleCheck(activeLaunch, key)}
                            className="flex items-start gap-3 py-2 px-2.5 hover:bg-surface2 rounded-md cursor-pointer transition-colors border border-transparent hover:border-border-custom"
                          >
                            <div
                              className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                                isChecked
                                  ? 'bg-green-custom border-green-custom text-white'
                                  : 'border-border2 bg-transparent'
                              }`}
                            >
                              {isChecked && <Check className="w-3 h-3" />}
                            </div>
                            <span
                              className={`text-xs text-text-custom leading-tight ${
                                isChecked ? 'line-through text-text3' : ''
                              }`}
                            >
                              {item}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB CONTENT: DEFINIÇÕES */}
          {activeSubTab === 'defs' && (
            <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4">
              <h4 className="text-xs font-bold text-text-custom border-b border-border-custom pb-2">
                Definições Estratégicas
              </h4>

              <div className="space-y-4 text-xs">
                <div>
                  <label className="text-[10px] font-bold text-text2 mb-1 block">Mote / Tema do Lançamento</label>
                  <input
                    className="w-full px-3 py-2 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                    value={mote}
                    onChange={(e) => setMote(e.target.value)}
                    onBlur={() => handleSaveText('mote', mote)}
                    placeholder="Ex: A Virada Digital - Black Friday"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-text2 mb-1 block">Data Inicial</label>
                    <input
                      type="date"
                      className="w-full px-3 py-2 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                      value={dataIni}
                      onChange={(e) => setDataIni(e.target.value)}
                      onBlur={() => handleSaveText('dataIni', dataIni)}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-text2 mb-1 block">Data Final</label>
                    <input
                      type="date"
                      className="w-full px-3 py-2 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                      value={dataFim}
                      onChange={(e) => setDataFim(e.target.value)}
                      onBlur={() => handleSaveText('dataFim', dataFim)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-text2 mb-1 block">Ticket Médio (R$)</label>
                    <input
                      type="number"
                      className="w-full px-3 py-2 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                      value={preco}
                      onChange={(e) => setPreco(+e.target.value)}
                      onBlur={() => handleSaveText('preco', preco)}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-text2 mb-1 block">Meta de Vendas</label>
                    <input
                      type="number"
                      className="w-full px-3 py-2 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                      value={meta}
                      onChange={(e) => setMeta(+e.target.value)}
                      onBlur={() => handleSaveText('meta', meta)}
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB CONTENT: NÚMEROS */}
          {activeSubTab === 'nums' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Inputs Form */}
              <div className="md:col-span-2 bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4">
                <h4 className="text-xs font-bold text-text-custom border-b border-border-custom pb-2">
                  Registro de Leads & Vendas
                </h4>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-text2 mb-1 block">Total de Leads Captados</label>
                    <input
                      type="number"
                      className="w-full px-3 py-2 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                      value={leads}
                      onChange={(e) => setLeads(+e.target.value)}
                      onBlur={() => handleSaveText('leads', leads)}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-text2 mb-1 block">Investido em Tráfego (R$)</label>
                    <input
                      type="number"
                      className="w-full px-3 py-2 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                      value={investido}
                      onChange={(e) => setInvestido(+e.target.value)}
                      onBlur={() => handleSaveText('investido', investido)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-text2 mb-1 block">Total de Vendas Realizadas</label>
                    <input
                      type="number"
                      className="w-full px-3 py-2 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                      value={vendas}
                      onChange={(e) => setVendas(+e.target.value)}
                      onBlur={() => handleSaveText('vendas', vendas)}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-text2 mb-1 block">Receita Bruta Gerada (R$)</label>
                    <input
                      type="number"
                      className="w-full px-3 py-2 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                      value={receita}
                      onChange={(e) => setReceita(+e.target.value)}
                      onBlur={() => handleSaveText('receita', receita)}
                    />
                  </div>
                </div>
              </div>

              {/* Calculated results */}
              <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-3.5">
                <h4 className="text-xs font-bold text-text-custom border-b border-border-custom pb-2">
                  Resultados Calculados
                </h4>

                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between py-1 border-b border-border-custom">
                    <span className="text-text2">ROAS</span>
                    <span className="text-text-custom font-semibold">{roas}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border-custom">
                    <span className="text-text2">Lucro</span>
                    <span className={`font-semibold ${lucro >= 0 ? 'text-green-custom' : 'text-red-t'}`}>
                      R$ {Math.round(lucro).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border-custom">
                    <span className="text-text2">CPA</span>
                    <span className="text-text-custom">
                      {cpa > 0 ? `R$ ${cpa.toLocaleString('pt-BR')}` : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border-custom">
                    <span className="text-text2">CPL</span>
                    <span className="text-text-custom">R$ {cpl}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border-custom">
                    <span className="text-text2">Taxa de Conversão</span>
                    <span className="text-text-custom">{conv}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB CONTENT: DEBRIEFING */}
          {activeSubTab === 'deb' && (
            <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4">
              <h4 className="text-xs font-bold text-text-custom border-b border-border-custom pb-2">
                Debriefing Pós-Lançamento
              </h4>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-text-custom mb-1.5 block">
                    Percepção Geral / Resultados
                  </label>
                  <textarea
                    className="w-full p-3 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom h-20"
                    value={debGeral}
                    onChange={(e) => setDebGeral(e.target.value)}
                    onBlur={() => handleSaveText('debGeral', debGeral)}
                    placeholder="Qual a sua percepção geral do evento?"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-text-custom mb-1.5 block">
                    O que deu errado? (Erros a evitar)
                  </label>
                  <textarea
                    className="w-full p-3 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom h-20"
                    value={debErros}
                    onChange={(e) => setDebErros(e.target.value)}
                    onBlur={() => handleSaveText('debErros', debErros)}
                    placeholder="Problemas técnicos, falhas na copy, atrasos..."
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-text-custom mb-1.5 block">
                    O que deu certo? (Melhorias e acertos)
                  </label>
                  <textarea
                    className="w-full p-3 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom h-20"
                    value={debMelhorias}
                    onChange={(e) => setDebMelhorias(e.target.value)}
                    onBlur={() => handleSaveText('debMelhorias', debMelhorias)}
                    placeholder="Pontos fortes que devem ser mantidos e escalados..."
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
