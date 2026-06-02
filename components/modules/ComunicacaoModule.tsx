'use client'

import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/utils/supabase/client'
import { useAppStore } from '@/store/useAppStore'
import { Trash } from 'lucide-react'

const VSL_S = [
  { id: 'promessa', l: 'Promessa QFD', must: true, kw: ['promessa', 'resultado', 'garanto', 'você vai', 'vou te mostrar', 'descubra', 'nesse vídeo'] },
  { id: 'para_quem', l: 'Para quem é/não é', must: true, kw: ['esse vídeo é para', 'se você', 'não é para', 'você que', 'para quem'] },
  { id: 'historia', l: 'História/origem', must: true, kw: ['quando eu', 'história', 'lembro', 'antes de', 'eu era', 'tudo começou', 'passei por'] },
  { id: 'contexto', l: 'Contexto de mercado', must: true, kw: ['mercado', 'cenário', 'por que agora', 'atualmente', 'a maioria', 'o problema é'] },
  { id: 'metodo', l: 'Explicação do método', must: true, kw: ['método', 'técnica', 'sistema', 'processo', 'como funciona', 'estratégia', 'passo'] },
  { id: 'prova', l: 'Prova/resultados', must: true, kw: ['resultado', 'prova', 'depoimento', 'aluno', 'cliente', 'conquistou', 'conseguiu', 'cases'] },
  { id: 'jeito', l: 'Jeito certo vs. errado', must: false, kw: ['jeito certo', 'jeito errado', 'diferente', 'ao contrário', 'mito', 'erro comum'] },
  { id: 'oferta', l: 'Apresentação da oferta', must: true, kw: ['curso', 'produto', 'programa', 'hoje', 'agora', 'estou abrindo', 'criamos'] },
  { id: 'preco', l: 'Preço e ancoragem', must: false, kw: ['preço', 'valor', 'investimento', 'r$', 'reais', 'por apenas', 'estou oferecendo'] },
  { id: 'cta', l: 'Call to action', must: true, kw: ['clique', 'clica', 'acesse', 'botão', 'garanta', 'inscreva', 'aproveite', 'agora'] }
]

interface Objection {
  o: string
  r: string
}

interface FAQ {
  p: string
  r: string
}

interface PageStructure {
  n: string
  d: string
}

export default function ComunicacaoModule() {
  const queryClient = useQueryClient()
  const supabase = createClient()
  const { activeProjectId, showToast } = useAppStore()

  const [activeSubTab, setActiveSubTab] = useState<'id' | 'urg' | 'bloq' | 'vsl' | 'pag'>('id')
  const [activeIdTab, setActiveIdTab] = useState<'comm' | 'prod' | 'cons'>('comm')

  // VSL analysis state locally to avoid heavy database calls on keypress
  const [vslTitle, setVslTitle] = useState('')
  const [vslCopy, setVslCopy] = useState('')

  // Local state for all fields (including urgs, objs, faqs, pags arrays) to avoid keypress mutations
  const [localFields, setLocalFields] = useState<Record<string, string> | null>(null)

  // 1. CARREGAR TODOS OS CAMPOS DO SUPABASE
  const { data: fields } = useQuery({
    queryKey: ['text_fields', activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return {}
      const { data, error } = await supabase
        .from('text_fields')
        .select('key, value')
        .eq('project_id', activeProjectId)

      if (error) {
        showToast('Erro ao carregar campos de texto', 'err')
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

  // Clear local states when switching projects so they reload for the new project
  useEffect(() => {
    const timer = setTimeout(() => {
      setLocalFields(null)
    }, 0)
    return () => clearTimeout(timer)
  }, [activeProjectId])

  // Sincronizar estado local (com setTimeout para evitar renderizações em cascata síncronas)
  useEffect(() => {
    if (fields && localFields === null) {
      const timer = setTimeout(() => {
        setLocalFields(fields)
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [fields, localFields])

  // Carregar VSL localmente após a query carregar
  useEffect(() => {
    if (fields) {
      const timer = setTimeout(() => {
        setVslTitle(fields['vsl-tt'] || '')
        setVslCopy(fields['vsl-copy'] || '')
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [fields])

  // 2. MUTATION SAVE FIELD
  const saveFieldMutation = useMutation({
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
      queryClient.invalidateQueries({ queryKey: ['text_fields', activeProjectId] })
    },
  })

  // Debounced/blur saves for text inputs
  const handleFieldBlur = (key: string, value: string) => {
    if (fields?.[key] === value) return
    saveFieldMutation.mutate({ key, value })
  }

  // Helper getters para arrays
  const getArrayField = <T,>(key: string, fallback: T[]): T[] => {
    const raw = (localFields || fields)?.[key]
    if (!raw) return fallback
    try {
      return JSON.parse(raw) as T[]
    } catch {
      return fallback
    }
  }

  // ==========================================
  // URGÊNCIAS OCULTAS LOGIC
  // ==========================================
  const urgs = getArrayField<string>('urgs', [])
  const addUrg = () => {
    const updated = [...urgs, '']
    const updatedFields = { ...(localFields || fields || {}), urgs: JSON.stringify(updated) }
    setLocalFields(updatedFields)
    saveFieldMutation.mutate({ key: 'urgs', value: JSON.stringify(updated) })
  }

  const updateLocalUrg = (idx: number, val: string) => {
    const updated = [...urgs]
    updated[idx] = val
    const updatedFields = { ...(localFields || fields || {}), urgs: JSON.stringify(updated) }
    setLocalFields(updatedFields)
  }

  const handleUrgBlur = () => {
    saveFieldMutation.mutate({ key: 'urgs', value: JSON.stringify(urgs) })
  }

  const deleteUrg = (idx: number) => {
    const updated = urgs.filter((_, i) => i !== idx)
    const updatedFields = { ...(localFields || fields || {}), urgs: JSON.stringify(updated) }
    setLocalFields(updatedFields)
    saveFieldMutation.mutate({ key: 'urgs', value: JSON.stringify(updated) })
    showToast('Urgência removida')
  }

  const urgProgress = Math.min((urgs.length / 150) * 100, 100)

  // ==========================================
  // OBJEÇÕES & FAQ LOGIC
  // ==========================================
  const objs = getArrayField<Objection>('objs', [])
  const addObj = () => {
    const updated = [...objs, { o: '', r: '' }]
    const updatedFields = { ...(localFields || fields || {}), objs: JSON.stringify(updated) }
    setLocalFields(updatedFields)
    saveFieldMutation.mutate({ key: 'objs', value: JSON.stringify(updated) })
  }

  const updateLocalObj = (idx: number, field: keyof Objection, val: string) => {
    const updated = [...objs]
    updated[idx] = { ...updated[idx], [field]: val }
    const updatedFields = { ...(localFields || fields || {}), objs: JSON.stringify(updated) }
    setLocalFields(updatedFields)
  }

  const handleObjBlur = () => {
    saveFieldMutation.mutate({ key: 'objs', value: JSON.stringify(objs) })
  }

  const deleteObj = (idx: number) => {
    const updated = objs.filter((_, i) => i !== idx)
    const updatedFields = { ...(localFields || fields || {}), objs: JSON.stringify(updated) }
    setLocalFields(updatedFields)
    saveFieldMutation.mutate({ key: 'objs', value: JSON.stringify(updated) })
    showToast('Objeção removida')
  }

  const faqs = getArrayField<FAQ>('faqs', [])
  const addFaq = () => {
    const updated = [...faqs, { p: '', r: '' }]
    const updatedFields = { ...(localFields || fields || {}), faqs: JSON.stringify(updated) }
    setLocalFields(updatedFields)
    saveFieldMutation.mutate({ key: 'faqs', value: JSON.stringify(updated) })
  }

  const updateLocalFaq = (idx: number, field: keyof FAQ, val: string) => {
    const updated = [...faqs]
    updated[idx] = { ...updated[idx], [field]: val }
    const updatedFields = { ...(localFields || fields || {}), faqs: JSON.stringify(updated) }
    setLocalFields(updatedFields)
  }

  const handleFaqBlur = () => {
    saveFieldMutation.mutate({ key: 'faqs', value: JSON.stringify(faqs) })
  }

  const deleteFaq = (idx: number) => {
    const updated = faqs.filter((_, i) => i !== idx)
    const updatedFields = { ...(localFields || fields || {}), faqs: JSON.stringify(updated) }
    setLocalFields(updatedFields)
    saveFieldMutation.mutate({ key: 'faqs', value: JSON.stringify(updated) })
    showToast('Pergunta de FAQ removida')
  }

  // ==========================================
  // VSL LOGIC
  // ==========================================
  const analyzeVsl = () => {
    const lowercaseCopy = vslCopy.toLowerCase()
    let detectedCount = 0

    const results = VSL_S.map((section) => {
      const matches = section.kw.filter((k) => lowercaseCopy.includes(k))
      let status: 'ok' | 'partial' | 'missing' = 'missing'

      if (matches.length >= 2) {
        status = 'ok'
        detectedCount++
      } else if (matches.length === 1) {
        status = 'partial'
      }

      return {
        ...section,
        status,
        matches,
      }
    })

    const scorePct = VSL_S.length > 0 ? Math.round((detectedCount / VSL_S.length) * 100) : 0
    return { results, scorePct, detectedCount }
  }

  const vslAnalysis = analyzeVsl()

  // Save VSL variables when blur
  const handleVslSave = (key: 'vsl-tt' | 'vsl-copy', val: string) => {
    saveFieldMutation.mutate({ key, value: val })
  }

  // ==========================================
  // PÁGINAS DE VENDA LOGIC
  // ==========================================
  const pags = getArrayField<PageStructure>('pags', [])
  const addPag = () => {
    const updated = [...pags, { n: `Página ${pags.length + 1}`, d: '' }]
    const updatedFields = { ...(localFields || fields || {}), pags: JSON.stringify(updated) }
    setLocalFields(updatedFields)
    saveFieldMutation.mutate({ key: 'pags', value: JSON.stringify(updated) })
  }

  const updateLocalPag = (idx: number, field: keyof PageStructure, val: string) => {
    const updated = [...pags]
    updated[idx] = { ...updated[idx], [field]: val }
    const updatedFields = { ...(localFields || fields || {}), pags: JSON.stringify(updated) }
    setLocalFields(updatedFields)
  }

  const handlePagBlur = () => {
    saveFieldMutation.mutate({ key: 'pags', value: JSON.stringify(pags) })
  }

  const deletePag = (idx: number) => {
    const updated = pags.filter((_, i) => i !== idx)
    const updatedFields = { ...(localFields || fields || {}), pags: JSON.stringify(updated) }
    setLocalFields(updatedFields)
    saveFieldMutation.mutate({ key: 'pags', value: JSON.stringify(updated) })
    showToast('Página removida')
  }

  return (
    <div className="space-y-6">
      {/* Sub-tabs header */}
      <div className="flex gap-1 border-b border-border-custom flex-wrap mb-4">
        {([
          { id: 'id', name: 'Identidades' },
          { id: 'urg', name: 'Urgências ocultas' },
          { id: 'bloq', name: 'Bloqueios e Objeções' },
          { id: 'vsl', name: 'Estrutura VSL' },
          { id: 'pag', name: 'Página de vendas' },
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

      {/* ==========================================
          TAB: IDENTIDADES
          ========================================== */}
      {activeSubTab === 'id' && (
        <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-5 animate-[fadeUp_0.15s_ease_both]">
          {/* Sub-sub-tabs */}
          <div className="flex gap-2 border-b border-border-custom pb-2 flex-wrap text-xs">
            <button
              onClick={() => setActiveIdTab('comm')}
              className={`px-3 py-1.5 rounded-md cursor-pointer transition-colors ${
                activeIdTab === 'comm' ? 'bg-surface2 font-semibold text-text-custom' : 'text-text2 hover:text-text-custom'
              }`}
            >
              Comunicador
            </button>
            <button
              onClick={() => setActiveIdTab('prod')}
              className={`px-3 py-1.5 rounded-md cursor-pointer transition-colors ${
                activeIdTab === 'prod' ? 'bg-surface2 font-semibold text-text-custom' : 'text-text2 hover:text-text-custom'
              }`}
            >
              Produto
            </button>
            <button
              onClick={() => setActiveIdTab('cons')}
              className={`px-3 py-1.5 rounded-md cursor-pointer transition-colors ${
                activeIdTab === 'cons' ? 'bg-surface2 font-semibold text-text-custom' : 'text-text2 hover:text-text-custom'
              }`}
            >
              Consumidor
            </button>
          </div>

          {activeIdTab === 'comm' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-text-custom mb-1 block">
                  Método (Furadeira)
                </label>
                <textarea
                  className="w-full p-3 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom h-20"
                  defaultValue={fields?.['id-met'] || ''}
                  onBlur={(e) => handleFieldBlur('id-met', e.target.value)}
                  placeholder="Qual é a sua ferramenta/veículo único de transformação? Ex: Método Clave."
                />
              </div>
              <div>
                <label className="text-xs font-bold text-text-custom mb-1 block">
                  Quadro na Parede (Resultado Visual)
                </label>
                <textarea
                  className="w-full p-3 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom h-20"
                  defaultValue={fields?.['id-qd'] || ''}
                  onBlur={(e) => handleFieldBlur('id-qd', e.target.value)}
                  placeholder="Descreva o resultado final que seu aluno ostenta na parede. Qual o troféu ou marco?"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-text-custom mb-1 block">
                  Argumentos Estratégicos
                </label>
                <textarea
                  className="w-full p-3 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom h-20"
                  defaultValue={fields?.['id-arg'] || ''}
                  onBlur={(e) => handleFieldBlur('id-arg', e.target.value)}
                  placeholder="Seus principais diferenciais lógicos de autoridade e provas do mercado."
                />
              </div>
            </div>
          )}

          {activeIdTab === 'prod' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-text-custom mb-1 block">
                  Frase de Impacto (Promessa Principal)
                </label>
                <textarea
                  className="w-full p-3 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom h-20"
                  defaultValue={fields?.['id-fi'] || ''}
                  onBlur={(e) => handleFieldBlur('id-fi', e.target.value)}
                  placeholder="O que o produto entrega de forma extremamente clara e irresistível em uma única linha."
                />
              </div>
              <div>
                <label className="text-xs font-bold text-text-custom mb-1 block">
                  Big Idea
                </label>
                <textarea
                  className="w-full p-3 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom h-20"
                  defaultValue={fields?.['id-bi'] || ''}
                  onBlur={(e) => handleFieldBlur('id-bi', e.target.value)}
                  placeholder="O conceito intelectual ou revelação contracorrente por trás do produto."
                />
              </div>
              <div>
                <label className="text-xs font-bold text-text-custom mb-1 block">
                  Ponto de Indiferença (Anticomparação)
                </label>
                <textarea
                  className="w-full p-3 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom h-20"
                  defaultValue={fields?.['id-pi'] || ''}
                  onBlur={(e) => handleFieldBlur('id-pi', e.target.value)}
                  placeholder="Por que comparar seu produto com os concorrentes tradicionais do mercado é inútil?"
                />
              </div>
            </div>
          )}

          {activeIdTab === 'cons' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-text-custom mb-1 block">
                  Para Quem É
                </label>
                <textarea
                  className="w-full p-3 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom h-20"
                  defaultValue={fields?.['id-pqe'] || ''}
                  onBlur={(e) => handleFieldBlur('id-pqe', e.target.value)}
                  placeholder="Descreva o perfil do comprador ideal do seu produto."
                />
              </div>
              <div>
                <label className="text-xs font-bold text-text-custom mb-1 block">
                  Para Quem NÃO É
                </label>
                <textarea
                  className="w-full p-3 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom h-20"
                  defaultValue={fields?.['id-pqne'] || ''}
                  onBlur={(e) => handleFieldBlur('id-pqne', e.target.value)}
                  placeholder="Diferencie quem você quer filtrar para evitar churn e reembolsos."
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==========================================
          TAB: URGÊNCIAS OCULTAS
          ========================================== */}
      {activeSubTab === 'urg' && (
        <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4 animate-[fadeUp_0.15s_ease_both]">
          <div className="flex justify-between items-center border-b border-border-custom pb-3">
            <div>
              <span className="text-xs font-bold text-text-custom block">Mapeador de Urgências Ocultas</span>
              <span className="text-[10px] text-text3 mt-0.5">As dores profundas versus buscas lógicas</span>
            </div>
            <button
              onClick={addUrg}
              className="px-3 py-1.5 bg-text-custom text-white hover:opacity-90 rounded text-[11px] font-semibold cursor-pointer transition-colors"
            >
              Adicionar item
            </button>
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] text-text2 font-semibold">
              <span>Progresso de Completude</span>
              <span>{urgs.length} / 150</span>
            </div>
            <div className="w-full h-2 bg-surface2 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-custom rounded-full transition-all duration-300"
                style={{ width: `${urgProgress}%` }}
              />
            </div>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto pr-1 scrollbar-thin">
            {urgs.length === 0 ? (
              <p className="text-xs text-text3 text-center py-6">Nenhum item mapeado ainda.</p>
            ) : (
              urgs.map((u, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 py-1.5 border-b border-border-custom last:border-none"
                >
                  <span className="text-[10px] text-text3 font-mono shrink-0 w-8">{idx + 1}</span>
                  <input
                    className="flex-1 px-2.5 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                    value={u}
                    onChange={(e) => updateLocalUrg(idx, e.target.value)}
                    onBlur={handleUrgBlur}
                    placeholder="Ex: Medo oculto de ser demitido mesmo parecendo bem-sucedido"
                  />
                  <button
                    onClick={() => deleteUrg(idx)}
                    className="p-1.5 border border-red-t/30 text-red-t hover:bg-red-bg rounded transition-colors shrink-0 cursor-pointer"
                  >
                    <Trash className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ==========================================
          TAB: BLOQUEIOS & OBJEÇÕES
          ========================================== */}
      {activeSubTab === 'bloq' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-[fadeUp_0.15s_ease_both]">
          {/* Objeções de Compra */}
          <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b border-border-custom pb-2">
              <span className="text-xs font-bold text-text-custom">Objeções & Quebras</span>
              <button
                onClick={addObj}
                className="px-2 py-1 border border-border2 rounded text-[10px] text-text-custom hover:bg-surface2 transition-colors cursor-pointer"
              >
                + Objeção
              </button>
            </div>

            <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1 scrollbar-thin">
              {objs.length === 0 ? (
                <p className="text-xs text-text3 text-center py-6">Nenhuma objeção mapeada.</p>
              ) : (
                objs.map((o, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-surface2 rounded-lg border border-border2 relative space-y-2.5"
                  >
                    <button
                      onClick={() => deleteObj(idx)}
                      className="absolute right-2 top-2 text-text3 hover:text-red-t cursor-pointer"
                    >
                      ×
                    </button>
                    <div>
                      <label className="text-[10px] font-bold text-text2 mb-1 block">
                        A Objeção {idx + 1}
                      </label>
                      <input
                        className="w-full px-2.5 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                        value={o.o}
                        onChange={(e) => updateLocalObj(idx, 'o', e.target.value)}
                        onBlur={handleObjBlur}
                        placeholder="Ex: Não tenho tempo..."
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-text2 mb-1 block">A Quebra</label>
                      <textarea
                        className="w-full px-2.5 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom outline-none h-14"
                        value={o.r}
                        onChange={(e) => updateLocalObj(idx, 'r', e.target.value)}
                        onBlur={handleObjBlur}
                        placeholder="Ex: O método foi desenhado para ser executado em 15 min..."
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* FAQ do Carrinho */}
          <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b border-border-custom pb-2">
              <span className="text-xs font-bold text-text-custom">FAQ da Página</span>
              <button
                onClick={addFaq}
                className="px-2 py-1 border border-border2 rounded text-[10px] text-text-custom hover:bg-surface2 transition-colors cursor-pointer"
              >
                + Pergunta
              </button>
            </div>

            <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1 scrollbar-thin">
              {faqs.length === 0 ? (
                <p className="text-xs text-text3 text-center py-6">Nenhuma pergunta cadastrada.</p>
              ) : (
                faqs.map((f, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-surface2 rounded-lg border border-border2 relative space-y-2.5"
                  >
                    <button
                      onClick={() => deleteFaq(idx)}
                      className="absolute right-2 top-2 text-text3 hover:text-red-t cursor-pointer"
                    >
                      ×
                    </button>
                    <div>
                      <label className="text-[10px] font-bold text-text2 mb-1 block">
                        Pergunta {idx + 1}
                      </label>
                      <input
                        className="w-full px-2.5 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                        value={f.p}
                        onChange={(e) => updateLocalFaq(idx, 'p', e.target.value)}
                        onBlur={handleFaqBlur}
                        placeholder="Ex: Quanto tempo tenho de suporte?"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-text2 mb-1 block">Resposta</label>
                      <textarea
                        className="w-full px-2.5 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom outline-none h-14"
                        value={f.r}
                        onChange={(e) => updateLocalFaq(idx, 'r', e.target.value)}
                        onBlur={handleFaqBlur}
                        placeholder="Ex: Suporte diário por e-mail e Discord..."
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          TAB: ESTRUTURA VSL
          ========================================== */}
      {activeSubTab === 'vsl' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-[fadeUp_0.15s_ease_both]">
          {/* Editor Column */}
          <div className="md:col-span-2 space-y-4">
            <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-3.5">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-text-custom">Roteiro / Copy do VSL</span>
                <span className="text-[11px] text-text3">
                  {vslCopy.trim().split(/\s+/).filter(Boolean).length.toLocaleString('pt-BR')}{' '}
                  palavras
                </span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-text2 mb-1 block">Título da Copy</label>
                  <input
                    className="w-full px-3 py-2 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom"
                    value={vslTitle}
                    onChange={(e) => setVslTitle(e.target.value)}
                    onBlur={() => handleVslSave('vsl-tt', vslTitle)}
                    placeholder="Ex: VSL Geral - Oferta de Abertura"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-text2 mb-1 block">Texto</label>
                  <textarea
                    className="w-full p-3 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom h-80 font-mono scrollbar-thin"
                    value={vslCopy}
                    onChange={(e) => setVslCopy(e.target.value)}
                    onBlur={() => handleVslSave('vsl-copy', vslCopy)}
                    placeholder="Escreva a copy do seu vídeo aqui para rodar o detector de estrutura..."
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Analysis Column */}
          <div className="space-y-4">
            {/* Score Progress */}
            <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-3 text-center">
              <span className="text-xs font-bold text-text-custom block">Estrutura Validada</span>
              <span className="text-2xl font-bold text-text-custom">{vslAnalysis.detectedCount} / {VSL_S.length}</span>
              
              <div className="w-full h-2.5 bg-surface2 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${vslAnalysis.scorePct}%`,
                    background:
                      vslAnalysis.scorePct >= 80
                        ? '#1D9E75'
                        : vslAnalysis.scorePct >= 50
                        ? '#EF9F27'
                        : '#E24B4A',
                  }}
                />
              </div>
              <span className="text-[10px] text-text3 font-semibold block">{vslAnalysis.scorePct}% da copy estruturada</span>
            </div>

            {/* Checklist results */}
            <div className="bg-surface border border-border-custom rounded-xl p-4 shadow-sm space-y-2 max-h-80 overflow-y-auto scrollbar-thin">
              {vslAnalysis.results.map((res) => {
                const colors = {
                  ok: 'bg-green-bg text-green-t border-[#9FE1CB]',
                  partial: 'bg-amber-bg text-amber-t border-[#FAC775]',
                  missing: 'bg-border2/30 text-text3 border-border2',
                }
                const labelText = {
                  ok: 'OK (Detectado)',
                  partial: 'Parcial',
                  missing: 'Ausente',
                }
                return (
                  <div
                    key={res.id}
                    className={`flex items-start gap-2.5 p-2 rounded-lg border text-xs leading-normal transition-colors ${
                      colors[res.status]
                    }`}
                  >
                    <div className="text-[10px] font-bold mt-0.5">
                      {res.status === 'ok' ? '✓' : res.status === 'partial' ? '~' : '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold">{res.l}</p>
                      <p className="text-[9px] mt-0.5">{labelText[res.status]}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          TAB: PÁGINAS DE VENDAS
          ========================================== */}
      {activeSubTab === 'pag' && (
        <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4 animate-[fadeUp_0.15s_ease_both]">
          <div className="flex justify-between items-center border-b border-border-custom pb-3">
            <div>
              <span className="text-xs font-bold text-text-custom block">Páginas de Vendas</span>
              <span className="text-[10px] text-text3 mt-0.5">Definição estrutural da copy por página</span>
            </div>
            <button
              onClick={addPag}
              className="px-3 py-1.5 bg-text-custom text-white hover:opacity-90 rounded text-[11px] font-semibold cursor-pointer transition-colors"
            >
              Nova página
            </button>
          </div>

          <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1 scrollbar-thin">
            {pags.length === 0 ? (
              <p className="text-xs text-text3 text-center py-6">Nenhuma página mapeada.</p>
            ) : (
              pags.map((p, idx) => (
                <div
                  key={idx}
                  className="p-4 bg-surface2 rounded-lg border border-border2 relative space-y-2.5"
                >
                  <button
                    onClick={() => deletePag(idx)}
                    className="absolute right-3 top-3 text-text3 hover:text-red-t cursor-pointer"
                  >
                    ×
                  </button>
                  <div className="max-w-[220px]">
                    <label className="text-[10px] font-bold text-text2 mb-1 block">Nome da Página</label>
                    <input
                      className="w-full px-2.5 py-1 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom font-semibold"
                      value={p.n}
                      onChange={(e) => updateLocalPag(idx, 'n', e.target.value)}
                      onBlur={handlePagBlur}
                      placeholder="Ex: Landing Page de Validação"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-text2 mb-1 block">Estrutura e Copy das Sessões</label>
                    <textarea
                      className="w-full px-2.5 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom outline-none h-20"
                      value={p.d}
                      onChange={(e) => updateLocalPag(idx, 'd', e.target.value)}
                      onBlur={handlePagBlur}
                      placeholder="Ex: Sessão 1: Promessa forte + VSL. Sessão 2: Dores do avatar (Urgências)..."
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
