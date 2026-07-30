'use client'

import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/utils/supabase/client'
import { useAppStore } from '@/store/useAppStore'
import { ArrowLeft, HelpCircle, PackagePlus, Plus, Trash } from 'lucide-react'

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
  l?: string
}

interface CommunicationProduct {
  id: string
  project_id: string
  name: string
  archived: boolean
  created_at: string
}

export default function ComunicacaoModule() {
  const queryClient = useQueryClient()
  const supabase = createClient()
  const { activeProjectId, profile, showToast } = useAppStore()

  const [activeSubTab, setActiveSubTab] = useState<'id' | 'urg' | 'bloq' | 'vsl' | 'pag'>('id')
  const [activeIdTab, setActiveIdTab] = useState<'comm' | 'prod' | 'cons'>('comm')
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  const [newProductName, setNewProductName] = useState('')
  const [isCreatingProduct, setIsCreatingProduct] = useState(false)

  // VSL analysis state locally to avoid heavy database calls on keypress
  const [vslTitle, setVslTitle] = useState('')
  const [vslCopy, setVslCopy] = useState('')

  // Local state for all fields (including urgs, objs, faqs, pags arrays) to avoid keypress mutations
  const [localFields, setLocalFields] = useState<Record<string, string> | null>(null)

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ['communication_products', activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return []
      const { data, error } = await supabase
        .from('communication_products')
        .select('id, project_id, name, archived, created_at')
        .eq('project_id', activeProjectId)
        .eq('archived', false)
        .order('created_at', { ascending: true })

      if (error) throw error
      return data as CommunicationProduct[]
    },
    enabled: !!activeProjectId,
  })

  const createProductMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!activeProjectId || !profile?.id) {
        throw new Error('Projeto ou usuário não identificado.')
      }
      const { data, error } = await supabase
        .from('communication_products')
        .insert({
          project_id: activeProjectId,
          name,
          created_by: profile.id,
        })
        .select('id')
        .single()

      if (error) throw error
      return data.id as string
    },
    onSuccess: (productId) => {
      queryClient.invalidateQueries({ queryKey: ['communication_products', activeProjectId] })
      setNewProductName('')
      setIsCreatingProduct(false)
      setSelectedProductId(productId)
      showToast('Produto criado com sucesso')
    },
    onError: (error: Error) => {
      showToast(error.message || 'Erro ao criar produto', 'err')
    },
  })

  const archiveProductMutation = useMutation({
    mutationFn: async (productId: string) => {
      const { error } = await supabase
        .from('communication_products')
        .update({ archived: true })
        .eq('id', productId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['communication_products', activeProjectId] })
      setSelectedProductId(null)
      showToast('Produto arquivado')
    },
    onError: (error: Error) => {
      showToast(error.message || 'Erro ao arquivar produto', 'err')
    },
  })

  // 1. CARREGAR TODOS OS CAMPOS DO PRODUTO/CURSO
  const { data: fields, isLoading: fieldsLoading } = useQuery({
    queryKey: ['communication_product_fields', selectedProductId],
    queryFn: async () => {
      if (!selectedProductId) return {}
      const { data, error } = await supabase
        .from('communication_product_fields')
        .select('key, value')
        .eq('product_id', selectedProductId)

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
    enabled: !!selectedProductId,
  })

  // Clear local states when switching projects so they reload for the new project
  useEffect(() => {
    const timer = setTimeout(() => {
      setLocalFields(null)
      setSelectedProductId(null)
      setActiveSubTab('id')
      setActiveIdTab('comm')
    }, 0)
    return () => clearTimeout(timer)
  }, [activeProjectId])

  useEffect(() => {
    const timer = setTimeout(() => {
      setLocalFields(null)
    }, 0)
    return () => clearTimeout(timer)
  }, [selectedProductId])

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
      if (!selectedProductId) return
      const { error } = await supabase
        .from('communication_product_fields')
        .upsert(
          { product_id: selectedProductId, key, value },
          { onConflict: 'product_id,key' },
        )
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['communication_product_fields', selectedProductId],
      })
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
    const updated = [...pags, { n: `Página ${pags.length + 1}`, d: '', l: '' }]
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

  const selectedProduct = products.find((product) => product.id === selectedProductId)

  if (!activeProjectId) {
    return (
      <div className="py-10 text-center text-xs text-text3">
        Selecione um projeto para configurar a Comunicação.
      </div>
    )
  }

  if (productsLoading) {
    return (
      <div className="py-10 text-center text-xs text-text3">
        Carregando produtos e cursos...
      </div>
    )
  }

  if (!selectedProductId) {
    return (
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-custom pb-4">
          <div>
            <h3 className="text-sm font-bold text-text-custom">Produtos e cursos</h3>
            <p className="text-[11px] text-text3 mt-1">
              Cada produto possui sua própria estratégia completa de Comunicação.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsCreatingProduct(true)}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 bg-purple-custom text-white rounded-lg text-xs font-semibold cursor-pointer hover:opacity-90"
          >
            <Plus className="w-4 h-4" />
            Novo produto ou curso
          </button>
        </div>

        {isCreatingProduct && (
          <div className="border border-border-custom bg-surface p-4 rounded-lg flex flex-col sm:flex-row gap-3 sm:items-end">
            <label className="flex-1 text-[10px] font-bold text-text2 uppercase">
              Nome
              <input
                autoFocus
                value={newProductName}
                onChange={(event) => setNewProductName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && newProductName.trim()) {
                    createProductMutation.mutate(newProductName.trim())
                  }
                }}
                placeholder="Ex: Escola do Ouvido"
                className="mt-1 w-full px-3 py-2 border border-border2 rounded-lg bg-surface text-xs text-text-custom outline-none focus:border-purple-custom"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsCreatingProduct(false)
                  setNewProductName('')
                }}
                className="px-3 py-2 border border-border2 rounded-lg text-xs text-text2 cursor-pointer hover:bg-surface2"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!newProductName.trim() || createProductMutation.isPending}
                onClick={() => createProductMutation.mutate(newProductName.trim())}
                className="px-3 py-2 bg-text-custom text-surface rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                Criar
              </button>
            </div>
          </div>
        )}

        {products.length === 0 ? (
          <div className="py-14 border border-dashed border-border2 rounded-lg text-center">
            <PackagePlus className="w-7 h-7 text-text3 mx-auto mb-3" />
            <p className="text-xs font-semibold text-text-custom">
              Nenhum produto ou curso cadastrado
            </p>
            <p className="text-[11px] text-text3 mt-1">
              Crie o primeiro para liberar as configurações de Comunicação.
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {products.map((product) => (
              <div
                key={product.id}
                className="border border-border-custom bg-surface rounded-lg p-4 flex items-center gap-3"
              >
                <button
                  type="button"
                  onClick={() => setSelectedProductId(product.id)}
                  className="flex-1 text-left min-w-0 cursor-pointer"
                >
                  <span className="block text-xs font-bold text-text-custom truncate">
                    {product.name}
                  </span>
                  <span className="block text-[10px] text-text3 mt-1">
                    Abrir estratégia de Comunicação
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Arquivar "${product.name}"?`)) {
                      archiveProductMutation.mutate(product.id)
                    }
                  }}
                  title="Arquivar produto"
                  className="p-2 text-text3 hover:text-red-t cursor-pointer"
                >
                  <Trash className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (fieldsLoading) {
    return (
      <div className="py-10 text-center text-xs text-text3">
        Carregando Comunicação de {selectedProduct?.name || 'produto'}...
      </div>
    )
  }

  return (
    <div key={selectedProductId} className="space-y-6">
      <div className="flex items-center gap-3 border-b border-border-custom pb-3">
        <button
          type="button"
          onClick={() => setSelectedProductId(null)}
          title="Voltar para produtos e cursos"
          className="p-2 border border-border2 rounded-lg text-text2 hover:text-text-custom cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0">
          <span className="block text-[10px] uppercase font-bold text-text3">
            Produto ou curso
          </span>
          <h3 className="text-sm font-bold text-text-custom truncate">
            {selectedProduct?.name || 'Comunicação'}
          </h3>
        </div>
      </div>

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
                <div className="flex items-center gap-1.5 mb-1">
                  <label className="text-xs font-bold text-text-custom">
                    Mecanismo Único
                  </label>
                  <HelpCircle
                    className="w-3.5 h-3.5 text-text3"
                    aria-label="Ajuda sobre Mecanismo Único"
                  />
                </div>
                <p className="text-[10px] text-text3 leading-relaxed mb-2">
                  O mecanismo é o motivo pelo qual o seu método funciona e é diferente de tudo que já existe no mercado. O conceito vem da publicidade direto-resposta clássica. Eugene Schwartz já descrevia esse elemento central em Breakthrough Advertising, em 1966.
                </p>
                <textarea
                  className="w-full p-3 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom h-20"
                  defaultValue={fields?.['id-met'] || ''}
                  onBlur={(e) => handleFieldBlur('id-met', e.target.value)}
                  placeholder="Qual é o seu processo, sistema ou algoritmo proprietário? Ex: Método Clave."
                />
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <label className="text-xs font-bold text-text-custom">
                    Resultado-Alvo
                  </label>
                  <HelpCircle
                    className="w-3.5 h-3.5 text-text3"
                    aria-label="Ajuda sobre Resultado-Alvo"
                  />
                </div>
                <p className="text-[10px] text-text3 leading-relaxed mb-2">
                  É o resultado específico que a metodologia entrega, não o método em si. A ideia se relaciona à formulação atribuída a Theodore Levitt sobre o cliente querer o resultado, não a ferramenta, e ao framework Jobs-to-be-Done difundido por Clayton Christensen.
                </p>
                <textarea
                  className="w-full p-3 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom h-20"
                  defaultValue={fields?.['id-qd'] || ''}
                  onBlur={(e) => handleFieldBlur('id-qd', e.target.value)}
                  placeholder="Descreva o resultado final, específico e mensurável, que o seu cliente alcança. Qual o marco ou troféu?"
                />
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <label className="text-xs font-bold text-text-custom">
                    Benefício Estendido
                  </label>
                  <HelpCircle
                    className="w-3.5 h-3.5 text-text3"
                    aria-label="Ajuda sobre Benefício Estendido"
                  />
                </div>
                <p className="text-[10px] text-text3 leading-relaxed mb-2">
                  É o motivo emocional mais profundo por trás do resultado prometido. O conceito se relaciona à Means-End Chain Theory, de Jonathan Gutman (1982), usada para conectar atributos de produto a valores humanos.
                </p>
                <textarea
                  className="w-full p-3 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom h-20"
                  defaultValue={fields?.['id-arg'] || ''}
                  onBlur={(e) => handleFieldBlur('id-arg', e.target.value)}
                  placeholder="O que o cliente realmente busca por trás do resultado-alvo? (status, segurança, liberdade, pertencimento...)"
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
              className="px-3 py-1.5 bg-text-custom text-surface hover:opacity-90 rounded text-[11px] font-semibold cursor-pointer transition-colors"
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
              className="px-3 py-1.5 bg-text-custom text-surface hover:opacity-90 rounded text-[11px] font-semibold cursor-pointer transition-colors"
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
                  <div className="flex gap-4 flex-wrap md:flex-nowrap">
                    <div className="w-full md:w-[220px]">
                      <label className="text-[10px] font-bold text-text2 mb-1 block">Nome da Página</label>
                      <input
                        className="w-full px-2.5 py-1 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom font-semibold"
                        value={p.n}
                        onChange={(e) => updateLocalPag(idx, 'n', e.target.value)}
                        onBlur={handlePagBlur}
                        placeholder="Ex: Landing Page de Validação"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] font-bold text-text2 mb-1 block">Link da Página</label>
                      <input
                        className="w-full px-2.5 py-1 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom font-mono"
                        value={p.l || ''}
                        onChange={(e) => updateLocalPag(idx, 'l', e.target.value)}
                        onBlur={handlePagBlur}
                        placeholder="Ex: https://suapagina.com"
                      />
                    </div>
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
