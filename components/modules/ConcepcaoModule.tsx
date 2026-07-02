'use client'

import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/utils/supabase/client'
import { useAppStore, MaturityLevel } from '@/store/useAppStore'
import { Plus, Trash, ArrowUp, ArrowDown, Sparkles } from 'lucide-react'

// PERGUNTAS DA MATRIZ DO PERPÉTUO
const PERGS = [
  'Meu produto atua em mercado com baixa regulamentação',
  'O mercado já tem alta tração de consumo (o público já compra produtos assim)',
  'O mercado possui dinâmica forte de mudanças (tendências mudam rápido)',
  'Meu produto vai trabalhar um macro nicho (mercado amplo)',
  'O mercado âncora para cima produtos como o meu (existem opções mais caras que servem de referência)',
  'Meu mercado já é muito concorrido',
  'O mercado tem muita consciência do assunto (já sabe que tem o problema/precisa da solução)',
  'Meu produto tem muita pesquisa nos buscadores',
  'Meu produto tem muito lastro no assunto (histórico e provas do produto)',
  'Meu produto desperta desejo natural forte',
  'Meu produto tem muita urgência natural',
  'Meu produto tem alto grau de tangibilidade (resultado fácil de mostrar)',
  'Meu produto promove resultado rápido',
  'Meu produto âncora para outros produtos (puxa venda de outros produtos)',
  'Eu possuo muito lastro no assunto (meu histórico pessoal/resultados comprovados)',
  'Eu possuo alto grau de diferenciação',
  'Tenho muita credibilidade no assunto',
  'Consigo depoimentos com facilidade'
]

interface Competitor {
  n: string // nome
  s: string // site
  i: string // instagram
  p?: string | number // preço
}

export default function ConcepcaoModule() {
  const queryClient = useQueryClient()
  const supabase = createClient()
  const { activeProjectId, showToast, currentLevel } = useAppStore()
  const [activeSubTab, setActiveSubTab] = useState<'matriz' | 'bench'>('matriz')

  // Local state for competitors to avoid saving on every keypress
  const [localCompetitors, setLocalCompetitors] = useState<Competitor[] | null>(null)

  // Clear local states when switching projects so they reload for the new project
  useEffect(() => {
    const timer = setTimeout(() => {
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
      if (!activeProjectId) return new Array(18).fill(null)
      const { data, error } = await supabase
        .from('matrix_answers')
        .select('*')
        .eq('project_id', activeProjectId)
        .maybeSingle()

      if (error) {
        showToast('Erro ao carregar a matriz', 'err')
        return new Array(18).fill(null)
      }
      return data ? (data.answers as (boolean | null)[]) : new Array(18).fill(null)
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
      saveMatrixMutation.mutate(new Array(18).fill(null))
    }
  }

  // Estatísticas da matriz
  const answeredCount = matrixData ? matrixData.filter((x) => x !== null).length : 0
  const matrixCompleted = answeredCount === 18

  const calculateMatrixScore = () => {
    if (!matrixData) return { googleScore: 0, metaScore: 0, recommendedChannel: '', releasedChannel: '', blockedReason: '', diagnosticText: '', showRegulatedWarning: false }
    
    let googleScore = 0
    let metaScore = 0
    
    const googleIndices = [1, 4, 6, 7, 8, 10]
    const metaIndices = [2, 3, 5, 9, 11, 12, 13, 14, 15, 16, 17]
    
    matrixData.forEach((ans, idx) => {
      if (ans === null) return
      if (ans === true) {
        if (googleIndices.includes(idx)) googleScore++
        if (metaIndices.includes(idx)) metaScore++
      }
    })
    
    const showRegulatedWarning = matrixData[0] === false
    
    let recommendedChannel = ''
    if (googleScore > metaScore) {
      recommendedChannel = 'Google Ads'
    } else if (metaScore > googleScore) {
      recommendedChannel = 'Meta Ads'
    } else {
      recommendedChannel = 'Meta Ads (Empate - Recomendado como ponto de partida)'
    }
    
    // Níveis de faturamento: newbie = Fundação, soft = Estruturação, hard = Tração, pro = Expansão, master = Escala
    let releasedChannel = ''
    let blockedReason = ''
    
    if (currentLevel === 'newbie' || currentLevel === 'soft') {
      releasedChannel = 'Nenhum'
      blockedReason = 'Seu nível de faturamento atual (Fundação ou Estruturação) não permite investimentos em tráfego pago neste momento. Foque em validar a oferta e nos canais orgânicos.'
    } else if (currentLevel === 'hard') {
      // Tração: apenas Meta Ads liberado
      releasedChannel = 'Meta Ads'
      if (googleScore > metaScore) {
        blockedReason = 'A matriz indicou Google Ads como ideal para o seu mercado, porém o nível Tração de faturamento permite apenas o canal primário Meta Ads. Google Ads exige maior volume de verba e testes, sendo liberado apenas a partir do nível Expansão.'
      }
    } else {
      // pro ou master: ambos liberados
      releasedChannel = googleScore > metaScore ? 'Google Ads' : 'Meta Ads'
    }
    
    let diagnosticText = `A sua pontuação foi de Google Ads: ${googleScore} vs. Meta Ads: ${metaScore}. `
    if (googleScore > metaScore) {
      diagnosticText += 'Seu produto tem alta intenção de busca e consciência no mercado, indicando maior adequação para o Google Ads.'
    } else if (metaScore > googleScore) {
      diagnosticText += 'Seu produto tem forte apelo visual, gera desejo ou atua em mercado com forte dinâmica de mudanças, sendo ideal para Meta Ads.'
    } else {
      diagnosticText += 'Houve um empate técnico nas características do produto. Recomendamos iniciar por Meta Ads devido ao menor custo de entrada e facilidade de teste.'
    }
    
    return {
      googleScore,
      metaScore,
      recommendedChannel,
      releasedChannel,
      blockedReason,
      diagnosticText,
      showRegulatedWarning
    }
  }

  const {
    googleScore,
    metaScore,
    recommendedChannel,
    releasedChannel,
    blockedReason,
    diagnosticText,
    showRegulatedWarning
  } = calculateMatrixScore()

  // ==========================================
  // 2. SUB-TAB: BENCHMARKING LOGIC
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

  useEffect(() => {
    if (competitors && localCompetitors === null) {
      const timer = setTimeout(() => {
        setLocalCompetitors(competitors)
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [competitors, localCompetitors])

  const addCompetitor = () => {
    const list = [...(localCompetitors || competitors || []), { n: '', s: '', i: '', p: '' }]
    setLocalCompetitors(list)
    saveCompetitorsMutation.mutate(list)
  }

  const handleLocalCompetitorChange = (index: number, key: keyof Competitor, val: string) => {
    const list = [...(localCompetitors || competitors || [])]
    list[index] = { ...list[index], [key]: val } as Competitor
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

  const moveCompetitor = (fromIdx: number, toIdx: number) => {
    const list = [...(localCompetitors || competitors || [])]
    if (toIdx < 0 || toIdx >= list.length) return
    const [moved] = list.splice(fromIdx, 1)
    list.splice(toIdx, 0, moved)
    setLocalCompetitors(list)
    saveCompetitorsMutation.mutate(list)
  }

  const suggestHierarchy = () => {
    const list = [...(localCompetitors || competitors || [])]
    list.sort((a, b) => {
      const priceA = parseFloat(String(a.p || 0)) || 0
      const priceB = parseFloat(String(b.p || 0)) || 0
      return priceB - priceA
    })
    setLocalCompetitors(list)
    saveCompetitorsMutation.mutate(list)
    showToast('Hierarquia sugerida por preço aplicada!')
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
            <div className="p-4 rounded-xl border border-border-custom bg-surface shadow-sm space-y-3">
              <h4 className="text-xs font-bold text-text-custom mb-1.5">Diagnóstico da Matriz</h4>
              <p className="text-xs text-text2 leading-relaxed mb-3">{diagnosticText}</p>
              
              <div className="flex gap-4 text-xs font-semibold mb-3">
                <div className="text-green-t bg-green-bg px-3 py-1 rounded-md">
                  Pontuação Google Ads: {googleScore}
                </div>
                <div className="text-blue-t bg-blue-bg px-3 py-1 rounded-md">
                  Pontuação Meta Ads: {metaScore}
                </div>
              </div>

              <div className="border-t border-border-custom pt-3 space-y-2 text-xs">
                <div className="flex justify-between items-center py-1">
                  <span className="text-text2">Canal Recomendado (Mercado):</span>
                  <span className="text-text-custom font-semibold">{recommendedChannel}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-text2">Canal Liberado (Faturamento):</span>
                  <span className="text-text-custom font-semibold bg-surface2 px-2 py-0.5 rounded">{releasedChannel}</span>
                </div>
                {blockedReason && (
                  <div className="mt-2 p-2.5 bg-amber-bg text-amber-t rounded text-[11px] leading-relaxed border border-amber-t/25">
                    ⚠️ {blockedReason}
                  </div>
                )}
                {showRegulatedWarning && (
                  <div className="mt-2 p-2.5 bg-red-bg text-red-t rounded text-[11px] leading-relaxed font-semibold border border-red-t/25">
                    🚨 Alerta: Mercados regulados têm restrições severas de anúncios tanto no Google quanto no Meta.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Questionnaire list card */}
          <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm">
            <div className="flex justify-between items-center mb-4 border-b border-border-custom pb-3">
              <span className="text-xs font-bold text-text-custom">Perguntas Mapeadas</span>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-text3 font-medium">
                  {answeredCount} de 18 preenchidas
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
          SUBTAB CONTENT: BENCHMARKING (COMPETITORS)
          ========================================== */}
      {activeSubTab === 'bench' && (localCompetitors || competitors) && (
        <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4 animate-[fadeUp_0.15s_ease_both]">
          <div className="flex justify-between items-center border-b border-border-custom pb-3 flex-wrap gap-2">
            <div>
              <span className="text-xs font-bold text-text-custom block">Principais Concorrentes</span>
              <span className="text-[10px] text-text3 mt-0.5">Mapeamento de mercado e preços praticados</span>
            </div>
            <div className="flex gap-2">
              {localCompetitors && localCompetitors.length > 1 && (
                <button
                  onClick={suggestHierarchy}
                  className="px-2.5 py-1.5 border border-text-custom/30 text-text-custom hover:bg-surface2 rounded text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                  title="Ordenar a lista automaticamente do concorrente mais caro ao mais barato"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Sugerir Hierarquia</span>
                </button>
              )}
              <button
                onClick={addCompetitor}
                className="px-2.5 py-1.5 bg-text-custom text-surface hover:opacity-90 rounded text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Adicionar concorrente</span>
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {(!localCompetitors || localCompetitors.length === 0) ? (
              <p className="text-xs text-text3 text-center py-6">Nenhum concorrente cadastrado.</p>
            ) : (
              localCompetitors.map((c, idx) => (
                <div
                  key={idx}
                  className="flex flex-col md:flex-row gap-3 items-center border-b border-border-custom pb-3 last:border-none last:pb-0"
                >
                  {/* Reorder actions */}
                  <div className="flex gap-1 shrink-0 self-start md:self-center">
                    <button
                      onClick={() => moveCompetitor(idx, idx - 1)}
                      disabled={idx === 0}
                      className="p-1.5 border border-border2 hover:bg-surface2 rounded text-text3 hover:text-text-custom disabled:opacity-30 cursor-pointer"
                      title="Subir na hierarquia"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => moveCompetitor(idx, idx + 1)}
                      disabled={idx === localCompetitors.length - 1}
                      className="p-1.5 border border-border2 hover:bg-surface2 rounded text-text3 hover:text-text-custom disabled:opacity-30 cursor-pointer"
                      title="Descer na hierarquia"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Competitor fields */}
                  <input
                    className="w-full md:flex-1 px-3 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                    value={c.n}
                    onChange={(e) => handleLocalCompetitorChange(idx, 'n', e.target.value)}
                    onBlur={handleCompetitorBlur}
                    placeholder="Nome do Concorrente"
                  />
                  <input
                    className="w-full md:flex-1 px-3 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                    value={c.s}
                    onChange={(e) => handleLocalCompetitorChange(idx, 's', e.target.value)}
                    onBlur={handleCompetitorBlur}
                    placeholder="Site / Link"
                  />
                  <input
                    className="w-full md:w-[130px] px-3 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom font-mono outline-none"
                    value={c.i}
                    onChange={(e) => handleLocalCompetitorChange(idx, 'i', e.target.value)}
                    onBlur={handleCompetitorBlur}
                    placeholder="@instagram"
                  />
                  <div className="w-full md:w-[110px] flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] text-text3 font-semibold">R$</span>
                    <input
                      type="number"
                      className="w-full px-2 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom outline-none font-semibold"
                      value={c.p ?? ''}
                      onChange={(e) => handleLocalCompetitorChange(idx, 'p', e.target.value)}
                      onBlur={handleCompetitorBlur}
                      placeholder="Preço"
                    />
                  </div>

                  {/* Actions */}
                  <button
                    onClick={() => removeCompetitor(idx)}
                    className="p-2 border border-red-t/30 text-red-t hover:bg-red-bg rounded transition-colors shrink-0 cursor-pointer align-middle self-end md:self-center"
                    title="Remover concorrente"
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
