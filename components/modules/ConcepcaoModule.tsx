'use client'

import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/utils/supabase/client'
import { useAppStore } from '@/store/useAppStore'
import { Plus, Trash } from 'lucide-react'

// PERGUNTAS DA MATRIZ DO PERPÉTUO
const PERGS = [
  'Meu produto atua em mercado com baixa regulamentação',
  'O mercado tem alta tração diante do público',
  'O mercado possui dinâmica forte de mudanças',
  'Meu produto irá trabalhar um Macro Nicho',
  'O mercado ancora para clímax produtos como o meu',
  'Meu produto tem muito lastro no assunto',
  'Eu possuo muito testro no assunto',
  'Meu mercado já é muito concorrido',
  'O mercado tem muita consciência do assunto',
  'Meu produto tem muita pesquisa nos buscadores',
  'Eu possuo muito lastro no assunto',
  'Eu possuo alto grau de diferenciação',
  'Meu produto desperta desejo natural forte',
  'Consigo conseguir depoimentos com facilidade',
  'Meu produto tem muita urgência natural',
  'Meu produto tem alto grau de tangibilidade',
  'Meu produto promove resultado rápido',
  'Tenho muita credibilidade no assunto',
  'Meu produto ancora para outros produtos',
]

// Índices onde a resposta VERDADEIRA soma pontos
const ST = [0, 1, 2, 3, 4, 5, 6, 9, 11, 12, 13, 14, 15, 16, 17, 18]
// Índices onde a resposta FALSA soma pontos
const SF = [7, 8, 10]

interface Competitor {
  n: string // nome
  s: string // site
  i: string // instagram
}

export default function ConcepcaoModule() {
  const queryClient = useQueryClient()
  const supabase = createClient()
  const { activeProjectId, showToast } = useAppStore()
  const [activeSubTab, setActiveSubTab] = useState<'matriz' | 'preco' | 'bench'>('matriz')

  // Local state for pricing and competitors to avoid saving on every keypress
  const [localPricing, setLocalPricing] = useState<Record<string, number> | null>(null)
  const [localCompetitors, setLocalCompetitors] = useState<Competitor[] | null>(null)

  // Clear local states when switching projects so they reload for the new project
  useEffect(() => {
    const timer = setTimeout(() => {
      setLocalPricing(null)
      setLocalCompetitors(null)
    }, 0)
    return () => clearTimeout(timer)
  }, [activeProjectId])

  // ==========================================
  // 1. SUB-TAB: MATRIZ DO PERPÉTUO LOGIC
  // ==========================================
  const { data: matrixData } = useQuery({
    queryKey: ['matrix_answers', activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return new Array(19).fill(null)
      const { data, error } = await supabase
        .from('matrix_answers')
        .select('*')
        .eq('project_id', activeProjectId)
        .maybeSingle()

      if (error) {
        showToast('Erro ao carregar a matriz', 'err')
        return new Array(19).fill(null)
      }
      return data ? (data.answers as (boolean | null)[]) : new Array(19).fill(null)
    },
    enabled: !!activeProjectId,
  })

  const saveMatrixMutation = useMutation({
    mutationFn: async (answers: (boolean | null)[]) => {
      if (!activeProjectId) return
      // Verifica se já existe um registro
      const { data: existing } = await supabase
        .from('matrix_answers')
        .select('id')
        .eq('project_id', activeProjectId)
        .maybeSingle()

      if (existing) {
        const { error } = await supabase
          .from('matrix_answers')
          .update({ answers })
          .eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('matrix_answers')
          .insert({ project_id: activeProjectId, answers })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matrix_answers', activeProjectId] })
      showToast('Respostas da matriz salvas')
    },
    onError: () => {
      showToast('Erro ao salvar respostas da matriz', 'err')
    },
  })

  const setMatrixAnswer = (index: number, val: boolean) => {
    if (!matrixData) return
    const newAnswers = [...matrixData]
    newAnswers[index] = val
    saveMatrixMutation.mutate(newAnswers)
  }

  const resetMatrix = () => {
    if (confirm('Deseja limpar todas as respostas da Matriz do Perpétuo?')) {
      saveMatrixMutation.mutate(new Array(19).fill(null))
    }
  }

  // Estatísticas da matriz
  const answeredCount = matrixData ? matrixData.filter((x) => x !== null).length : 0
  const matrixCompleted = answeredCount === 19

  const calculateMatrixScore = () => {
    if (!matrixData) return { score: 0, strength: 0, weakness: 0, text: '' }
    let score = 0
    let strength = 0
    let weakness = 0

    PERGS.forEach((_, idx) => {
      const ans = matrixData[idx]
      if (ans === null) return
      const isStrong = (ST.includes(idx) && ans === true) || (SF.includes(idx) && ans === false)
      if (isStrong) {
        score++
        strength++
      } else {
        weakness++
      }
    })

    let text = ''
    if (score >= 15) {
      text =
        'Produto com posicionamento muito forte. Alta diferenciação e credibilidade indicam grande potencial de tração.'
    } else if (score >= 10) {
      text =
        'Bom potencial. Alguns pontos de melhoria — trabalhe na diferenciação e prova social antes de escalar.'
    } else if (score >= 6) {
      text = 'Produto em desenvolvimento. Fortaleça os pontos fracos antes de investir pesado em mídia paga.'
    } else {
      text =
        'Produto com desafios significativos. Reveja o posicionamento e proposta de valor antes de avançar.'
    }

    return { score, strength, weakness, text }
  }

  const { strength, weakness, text: diagnosticText } = calculateMatrixScore()

  // ==========================================
  // 2. SUB-TAB: SIMULADOR DE PRECIFICAÇÃO
  // ==========================================
  const { data: pricingData } = useQuery({
    queryKey: ['pricing_scenarios', activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return null
      const { data, error } = await supabase
        .from('pricing_scenarios')
        .select('*')
        .eq('project_id', activeProjectId)
        .maybeSingle()

      if (error) {
        showToast('Erro ao carregar precificação', 'err')
        return null
      }
      return data
        ? data.data
        : {
            // Valores padrão do simulador
            preco: 497,
            vendasDia: 10,
            cpa: 80,
            gateway: 7.0,
            reembolso: 3.0,
            imposto: 15.0,
            outrosVar: 2.0, // MMQ/Plataforma
            hospedagem: 100,
            outrosFixos: 200,
            proLabore: 15000,
            funcionarios: 6000,
            integracoes: 300,
            emailMkt: 500,
            crm: 300,
            escritorio: 0,
            loopRetirada: 30,
            loopInvestimento: 10,
            loopOutros: 2,
          }
    },
    enabled: !!activeProjectId,
  })

  const savePricingMutation = useMutation({
    mutationFn: async (data: Record<string, number>) => {
      if (!activeProjectId) return
      const { data: existing } = await supabase
        .from('pricing_scenarios')
        .select('id')
        .eq('project_id', activeProjectId)
        .maybeSingle()

      if (existing) {
        const { error } = await supabase
          .from('pricing_scenarios')
          .update({ data })
          .eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('pricing_scenarios')
          .insert({ project_id: activeProjectId, data })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pricing_scenarios', activeProjectId] })
    },
  })

  const handleLocalPricingChange = (key: string, val: number) => {
    const base = localPricing || pricingData
    if (!base) return
    setLocalPricing({ ...base, [key]: val })
  }

  const handlePricingBlur = () => {
    const dataToSave = localPricing || pricingData
    if (!dataToSave) return
    savePricingMutation.mutate(dataToSave)
  }

  // Cálculos financeiros baseados no estado local (para responsividade instantânea)
  const calcFin = () => {
    const data = localPricing || pricingData
    if (!data) return null

    const p = data.preco || 0
    const q = data.vendasDia || 0
    const cpa = data.cpa || 0

    const gw = (data.gateway || 0) / 100
    const re = (data.reembolso || 0) / 100
    const imp = (data.imposto || 0) / 100
    const mmq = (data.outrosVar || 0) / 100

    const host = data.hospedagem || 0
    const plat = data.outrosFixos || 0

    const fPro = data.proLabore || 0
    const fFunc = data.funcionarios || 0
    const fInt = data.integracoes || 0
    const fEml = data.emailMkt || 0
    const fCrm = data.crm || 0
    const fEsc = data.escritorio || 0

    const lm = (data.loopRetirada || 0) / 100
    const lpP = (data.loopInvestimento || 0) / 100
    const la = (data.loopOutros || 0) / 100

    const v = q * 365
    const rec = p * v
    const cac = cpa * v

    const cuGw = rec * gw
    const cuRe = rec * re
    const cuImp = rec * imp
    const cuMmq = rec * mmq
    const cuHost = (host + plat) * 12
    const totVar = cac + cuGw + cuRe + cuImp + cuMmq + cuHost

    const fixMes = fPro + fFunc + fInt + fEml + fCrm + fEsc
    const fixAno = fixMes * 12
    const lucroOp = rec - totVar - fixAno

    const loopM = Math.max(0, lucroOp) * lm
    const loopP = Math.max(0, lucroOp) * lpP
    const loopA = Math.max(0, lucroOp) * la
    const totLoop = loopM + loopP + loopA
    const saldo = lucroOp - totLoop

    const varU = p * (gw + re + imp + mmq) + (host + plat) * 12 / Math.max(v, 1)
    const fixU = fixAno / Math.max(v, 1)
    const lucroU = p - cpa - varU - fixU

    const formatCurrency = (val: number) =>
      `R$ ${Math.round(val).toLocaleString('pt-BR')}`

    const formatPct = (val: number) => `${val.toFixed(1)}%`

    return {
      rec,
      cac,
      cuGw,
      cuRe,
      cuImp,
      fixAno,
      lucroOp,
      totLoop,
      saldo,
      varU,
      fixU,
      lucroU,
      loopM,
      loopP,
      loopA,
      totVar,
      v,
      formatCurrency,
      formatPct,
    }
  }

  const f = calcFin()

  // ==========================================
  // 3. SUB-TAB: BENCHMARKING LOGIC
  // ==========================================
  const { data: competitors } = useQuery({
    queryKey: ['benchmarking', activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return []
      const { data, error } = await supabase
        .from('text_fields')
        .select('*')
        .eq('project_id', activeProjectId)
        .eq('key', 'benchmarking')
        .maybeSingle()

      if (error) {
        showToast('Erro ao carregar benchmarking', 'err')
        return []
      }
      return data ? (JSON.parse(data.value) as Competitor[]) : []
    },
    enabled: !!activeProjectId,
  })

  const saveCompetitorsMutation = useMutation({
    mutationFn: async (list: Competitor[]) => {
      if (!activeProjectId) return
      const serialized = JSON.stringify(list)

      const { data: existing } = await supabase
        .from('text_fields')
        .select('id')
        .eq('project_id', activeProjectId)
        .eq('key', 'benchmarking')
        .maybeSingle()

      if (existing) {
        const { error } = await supabase
          .from('text_fields')
          .update({ value: serialized })
          .eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('text_fields')
          .insert({ project_id: activeProjectId, key: 'benchmarking', value: serialized })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['benchmarking', activeProjectId] })
    },
    onError: () => {
      showToast('Erro ao salvar concorrentes', 'err')
    },
  })

  // Sincronizar estados locais após carregamento das queries (adiado para evitar cascading renders síncronos)
  useEffect(() => {
    if (pricingData && localPricing === null) {
      const timer = setTimeout(() => {
        setLocalPricing(pricingData)
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [pricingData, localPricing])

  useEffect(() => {
    if (competitors && localCompetitors === null) {
      const timer = setTimeout(() => {
        setLocalCompetitors(competitors)
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [competitors, localCompetitors])

  const addCompetitor = () => {
    const list = [...(localCompetitors || competitors || []), { n: '', s: '', i: '' }]
    setLocalCompetitors(list)
    saveCompetitorsMutation.mutate(list)
  }

  const handleLocalCompetitorChange = (index: number, key: keyof Competitor, val: string) => {
    const list = [...(localCompetitors || competitors || [])]
    list[index] = { ...list[index], [key]: val }
    setLocalCompetitors(list)
  }

  const handleCompetitorBlur = () => {
    if (!localCompetitors) return
    saveCompetitorsMutation.mutate(localCompetitors)
  }

  const removeCompetitor = (index: number) => {
    const list = (localCompetitors || competitors || []).filter((_, i) => i !== index)
    setLocalCompetitors(list)
    saveCompetitorsMutation.mutate(list)
    showToast('Concorrente removido')
  }

  return (
    <div className="space-y-6">
      {/* Subtabs Navigation */}
      <div className="flex gap-1 border-b border-border-custom flex-wrap mb-4">
        <button
          onClick={() => setActiveSubTab('matriz')}
          className={`px-4 py-2 text-xs font-semibold cursor-pointer border-b-2 bg-transparent transition-colors duration-150 ${
            activeSubTab === 'matriz'
              ? 'border-text-custom text-text-custom font-semibold'
              : 'border-transparent text-text2 hover:text-text-custom'
          }`}
        >
          Matriz do perpétuo
        </button>
        <button
          onClick={() => setActiveSubTab('preco')}
          className={`px-4 py-2 text-xs font-semibold cursor-pointer border-b-2 bg-transparent transition-colors duration-150 ${
            activeSubTab === 'preco'
              ? 'border-text-custom text-text-custom font-semibold'
              : 'border-transparent text-text2 hover:text-text-custom'
          }`}
        >
          Precificação
        </button>
        <button
          onClick={() => setActiveSubTab('bench')}
          className={`px-4 py-2 text-xs font-semibold cursor-pointer border-b-2 bg-transparent transition-colors duration-150 ${
            activeSubTab === 'bench'
              ? 'border-text-custom text-text-custom font-semibold'
              : 'border-transparent text-text2 hover:text-text-custom'
          }`}
        >
          Benchmarking
        </button>
      </div>

      {/* ==========================================
          SUBTAB CONTENT: MATRIZ DO PERPÉTUO
          ========================================== */}
      {activeSubTab === 'matriz' && (
        <div className="space-y-6 animate-[fadeUp_0.15s_ease_both]">
          {/* Diagnostic results header */}
          {matrixCompleted && (
            <div className="p-4 rounded-xl border border-border-custom bg-surface shadow-sm">
              <h4 className="text-xs font-bold text-text-custom mb-2">Diagnóstico da Matriz</h4>
              <p className="text-xs text-text2 leading-relaxed mb-3">{diagnosticText}</p>
              <div className="flex gap-4 text-xs font-semibold">
                <div className="text-green-t bg-green-bg px-3 py-1 rounded-md">
                  Pontos Fortes: {strength}
                </div>
                <div className="text-red-t bg-red-bg px-3 py-1 rounded-md">
                  Gargalos: {weakness}
                </div>
              </div>
            </div>
          )}

          {/* Questionnaire list card */}
          <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm">
            <div className="flex justify-between items-center mb-4 border-b border-border-custom pb-3">
              <span className="text-xs font-bold text-text-custom">Perguntas Mapeadas</span>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-text3 font-medium">
                  {answeredCount} de 19 preenchidas
                </span>
                <button
                  onClick={resetMatrix}
                  className="px-2.5 py-1.5 border border-border2 text-[10px] text-text-custom rounded hover:bg-surface2 transition-colors cursor-pointer"
                >
                  Limpar
                </button>
              </div>
            </div>

            <div className="space-y-0.5 max-h-[460px] overflow-y-auto pr-1 scrollbar-thin">
              {PERGS.map((p, i) => {
                const ans = matrixData?.[i]
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-4 py-2 border-b border-border-custom last:border-none"
                  >
                    <div className="flex gap-2">
                      <span className="text-[11px] text-text3 mt-0.5 w-5 shrink-0">{i + 1}</span>
                      <span className="text-xs text-text-custom leading-tight">{p}</span>
                    </div>

                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={() => setMatrixAnswer(i, true)}
                        className={`px-3 py-1 rounded-md text-[10px] font-semibold cursor-pointer border border-border2 transition-colors duration-100 ${
                          ans === true
                            ? 'bg-green-bg text-green-t border-green-custom/25'
                            : 'bg-transparent text-text2 hover:text-text-custom hover:bg-surface2'
                        }`}
                      >
                        V
                      </button>
                      <button
                        onClick={() => setMatrixAnswer(i, false)}
                        className={`px-3 py-1 rounded-md text-[10px] font-semibold cursor-pointer border border-border2 transition-colors duration-100 ${
                          ans === false
                            ? 'bg-red-bg text-red-t border-red-t/25'
                            : 'bg-transparent text-text2 hover:text-text-custom hover:bg-surface2'
                        }`}
                      >
                        F
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          SUBTAB CONTENT: PRECIFICAÇÃO SIMULATOR
          ========================================== */}
      {activeSubTab === 'preco' && (localPricing || pricingData) && f && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-[fadeUp_0.15s_ease_both]">
          {/* Column 1: Config Parameters */}
          <div className="md:col-span-2 space-y-6">
            <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4">
              <h4 className="text-xs font-bold text-text-custom border-b border-border-custom pb-2">
                Simulação de Cenários
              </h4>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-text2 mb-1 block">Preço (R$)</label>
                  <input
                    type="number"
                    value={(localPricing || pricingData)?.preco ?? ''}
                    onChange={(e) => handleLocalPricingChange('preco', +e.target.value)}
                    onBlur={handlePricingBlur}
                    className="w-full px-3 py-2 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-text2 mb-1 block">Vendas / dia</label>
                  <input
                    type="number"
                    value={(localPricing || pricingData)?.vendasDia ?? ''}
                    onChange={(e) => handleLocalPricingChange('vendasDia', +e.target.value)}
                    onBlur={handlePricingBlur}
                    className="w-full px-3 py-2 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-text2 mb-1 block">CPA (R$)</label>
                  <input
                    type="number"
                    value={(localPricing || pricingData)?.cpa ?? ''}
                    onChange={(e) => handleLocalPricingChange('cpa', +e.target.value)}
                    onBlur={handlePricingBlur}
                    className="w-full px-3 py-2 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom"
                  />
                </div>
              </div>

              {/* Custos Variáveis */}
              <h5 className="text-[10px] font-bold text-text3 tracking-wide uppercase pt-2">
                Custos Variáveis (%)
              </h5>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="text-[9px] text-text2 mb-0.5 block">Gateway</label>
                  <input
                    type="number"
                    step="0.1"
                    value={(localPricing || pricingData)?.gateway ?? ''}
                    onChange={(e) => handleLocalPricingChange('gateway', +e.target.value)}
                    onBlur={handlePricingBlur}
                    className="w-full px-2.5 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-text2 mb-0.5 block">Reembolso</label>
                  <input
                    type="number"
                    step="0.1"
                    value={(localPricing || pricingData)?.reembolso ?? ''}
                    onChange={(e) => handleLocalPricingChange('reembolso', +e.target.value)}
                    onBlur={handlePricingBlur}
                    className="w-full px-2.5 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-text2 mb-0.5 block">Imposto</label>
                  <input
                    type="number"
                    step="0.1"
                    value={(localPricing || pricingData)?.imposto ?? ''}
                    onChange={(e) => handleLocalPricingChange('imposto', +e.target.value)}
                    onBlur={handlePricingBlur}
                    className="w-full px-2.5 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-text2 mb-0.5 block">Taxas Extras</label>
                  <input
                    type="number"
                    step="0.1"
                    value={(localPricing || pricingData)?.outrosVar ?? ''}
                    onChange={(e) => handleLocalPricingChange('outrosVar', +e.target.value)}
                    onBlur={handlePricingBlur}
                    className="w-full px-2.5 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom"
                  />
                </div>
              </div>

              {/* Custos Fixos */}
              <h5 className="text-[10px] font-bold text-text3 tracking-wide uppercase pt-2">
                Custos Fixos Mensais (R$)
              </h5>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[9px] text-text2 mb-0.5 block">Pró-Labore</label>
                  <input
                    type="number"
                    value={(localPricing || pricingData)?.proLabore ?? ''}
                    onChange={(e) => handleLocalPricingChange('proLabore', +e.target.value)}
                    onBlur={handlePricingBlur}
                    className="w-full px-2.5 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-text2 mb-0.5 block">Funcionários</label>
                  <input
                    type="number"
                    value={(localPricing || pricingData)?.funcionarios ?? ''}
                    onChange={(e) => handleLocalPricingChange('funcionarios', +e.target.value)}
                    onBlur={handlePricingBlur}
                    className="w-full px-2.5 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-text2 mb-0.5 block">Ferramentas/Infra</label>
                  <input
                    type="number"
                    value={(localPricing || pricingData)?.integracoes ?? ''}
                    onChange={(e) => handleLocalPricingChange('integracoes', +e.target.value)}
                    onBlur={handlePricingBlur}
                    className="w-full px-2.5 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom"
                  />
                </div>
              </div>

              {/* Looping de Retirada */}
              <h5 className="text-[10px] font-bold text-text3 tracking-wide uppercase pt-2">
                Distribuição de Lucro - Looping (%)
              </h5>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[9px] text-text2 mb-0.5 block">Retirada Mão</label>
                  <input
                    type="number"
                    value={(localPricing || pricingData)?.loopRetirada ?? ''}
                    onChange={(e) => handleLocalPricingChange('loopRetirada', +e.target.value)}
                    onBlur={handlePricingBlur}
                    className="w-full px-2.5 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-text2 mb-0.5 block">Fundo Caixa</label>
                  <input
                    type="number"
                    value={(localPricing || pricingData)?.loopInvestimento ?? ''}
                    onChange={(e) => handleLocalPricingChange('loopInvestimento', +e.target.value)}
                    onBlur={handlePricingBlur}
                    className="w-full px-2.5 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-text2 mb-0.5 block">Reserva Extra</label>
                  <input
                    type="number"
                    value={(localPricing || pricingData)?.loopOutros ?? ''}
                    onChange={(e) => handleLocalPricingChange('loopOutros', +e.target.value)}
                    onBlur={handlePricingBlur}
                    className="w-full px-2.5 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Column 2: Calculations & Output */}
          <div className="space-y-6">
            {/* DRE Summary */}
            <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-3">
              <h4 className="text-xs font-bold text-text-custom border-b border-border-custom pb-2">
                Resultado Projetado Anual
              </h4>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-border-custom">
                  <span className="text-text2">Faturamento Bruto</span>
                  <span className="text-green-t font-semibold">{f.formatCurrency(f.rec)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border-custom">
                  <span className="text-text2">Mídia (CAC)</span>
                  <span className="text-red-t font-medium">- {f.formatCurrency(f.cac)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border-custom">
                  <span className="text-text2">Gateway</span>
                  <span className="text-red-t">- {f.formatCurrency(f.cuGw)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border-custom">
                  <span className="text-text2">Reembolsos</span>
                  <span className="text-red-t">- {f.formatCurrency(f.cuRe)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border-custom">
                  <span className="text-text2">Impostos</span>
                  <span className="text-red-t">- {f.formatCurrency(f.cuImp)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border-custom">
                  <span className="text-text2">Custo Fixo Total</span>
                  <span className="text-red-t">- {f.formatCurrency(f.fixAno)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-border-custom font-semibold">
                  <span className="text-text-custom">Lucro Operacional</span>
                  <span className={f.lucroOp >= 0 ? 'text-green-custom' : 'text-red-t'}>
                    {f.formatCurrency(f.lucroOp)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-border-custom">
                  <span className="text-text2">Looping distribuído</span>
                  <span className="text-red-t">- {f.formatCurrency(f.totLoop)}</span>
                </div>
                <div className="flex justify-between py-2 font-bold border-t border-border-custom text-sm">
                  <span className="text-text-custom">Retirada Líquida</span>
                  <span className={f.saldo >= 0 ? 'text-green-custom' : 'text-red-t'}>
                    {f.formatCurrency(f.saldo)}
                  </span>
                </div>
              </div>
            </div>

            {/* Margem Unitária */}
            <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-3.5">
              <h4 className="text-xs font-bold text-text-custom border-b border-border-custom pb-2">
                Por Unidade
              </h4>

              <div className="space-y-2 text-xs">
                {[
                  { label: 'Preço de venda', val: pricingData.preco, cls: 'text-text-custom font-semibold' },
                  { label: 'CPA/Mídia', val: -pricingData.cpa, cls: 'text-red-t' },
                  { label: 'Custos variáveis/un', val: -f.varU, cls: 'text-red-t' },
                  { label: 'Custos fixos/un', val: -f.fixU, cls: 'text-red-t' },
                  { label: 'Margem de lucro/un', val: f.lucroU, cls: f.lucroU >= 0 ? 'text-green-custom font-bold' : 'text-red-t font-bold' },
                ].map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center py-1">
                    <span className="text-text2">{item.label}</span>
                    <div className="flex items-center gap-2">
                      <span className={item.cls}>{f.formatCurrency(item.val)}</span>
                      <span className="text-[10px] text-text3 w-9 text-right shrink-0">
                        {pricingData.preco > 0
                          ? f.formatPct((Math.abs(item.val) / pricingData.preco) * 100)
                          : '0%'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Proportional bars */}
              <div className="border-t border-border-custom pt-3.5 space-y-2 text-xs">
                {[
                  { label: 'Mídia', val: pricingData.cpa, bg: 'bg-[#E24B4A]' },
                  { label: 'Variáveis', val: f.varU, bg: 'bg-[#EF9F27]' },
                  { label: 'Fixos', val: f.fixU, bg: 'bg-[#85B7EB]' },
                  { label: 'Lucro', val: Math.max(0, f.lucroU), bg: 'bg-[#1D9E75]' },
                ].map((bar, idx) => {
                  const pct =
                    pricingData.preco > 0
                      ? Math.max(0, Math.min(100, (bar.val / pricingData.preco) * 100))
                      : 0
                  return (
                    <div key={idx} className="flex items-center gap-3">
                      <span className="text-[10px] text-text2 w-14 shrink-0">{bar.label}</span>
                      <div className="flex-1 bg-surface2 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${bar.bg}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-semibold text-text-custom w-8 text-right shrink-0">
                        {f.formatPct(pct)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          SUBTAB CONTENT: BENCHMARKING (COMPETITORS)
          ========================================== */}
      {activeSubTab === 'bench' && (localCompetitors || competitors) && (
        <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4 animate-[fadeUp_0.15s_ease_both]">
          <div className="flex justify-between items-center border-b border-border-custom pb-3">
            <span className="text-xs font-bold text-text-custom">Principais Concorrentes</span>
            <button
              onClick={addCompetitor}
              className="px-2.5 py-1.5 bg-text-custom text-white hover:opacity-90 rounded text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Adicionar concorrente</span>
            </button>
          </div>

          <div className="space-y-3">
            {(!localCompetitors || localCompetitors.length === 0) ? (
              <p className="text-xs text-text3 text-center py-6">Nenhum concorrente cadastrado.</p>
            ) : (
              localCompetitors.map((c, idx) => (
                <div
                  key={idx}
                  className="flex flex-col sm:flex-row gap-3 items-center border-b border-border-custom pb-3 last:border-none last:pb-0"
                >
                  <input
                    className="w-full sm:flex-1 px-3 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                    value={c.n}
                    onChange={(e) => handleLocalCompetitorChange(idx, 'n', e.target.value)}
                    onBlur={handleCompetitorBlur}
                    placeholder="Nome do Concorrente / Player"
                  />
                  <input
                    className="w-full sm:flex-1 px-3 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                    value={c.s}
                    onChange={(e) => handleLocalCompetitorChange(idx, 's', e.target.value)}
                    onBlur={handleCompetitorBlur}
                    placeholder="Site / Link"
                  />
                  <input
                    className="w-full sm:flex-1 px-3 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom font-mono outline-none"
                    value={c.i}
                    onChange={(e) => handleLocalCompetitorChange(idx, 'i', e.target.value)}
                    onBlur={handleCompetitorBlur}
                    placeholder="@instagram"
                  />
                  <button
                    onClick={() => removeCompetitor(idx)}
                    className="p-2 border border-red-t/30 text-red-t hover:bg-red-bg rounded transition-colors shrink-0 cursor-pointer"
                  >
                    <Trash className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
