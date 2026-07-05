'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/utils/supabase/client'
import { useAppStore } from '@/store/useAppStore'
import { Trash, AlertTriangle, Check, Plus, Sparkles } from 'lucide-react'

interface Offer {
  n: string
  ticket: number | string
  vendas: number | string
  cancel: number | string
  taxa_pct: number | string
  taxa_fix: number | string
}

interface Investment {
  nome: string
  valor: number | string
}

interface PricingConfig {
  price: number
  sales: number
  gatewayVal: number
  gatewayType: 'fixed' | 'percent'
  impostoVal: number
  impostoType: 'fixed' | 'percent'
  reembolsoVal: number
  reembolsoType: 'fixed' | 'percent'
  outrosVal: number
  outrosType: 'fixed' | 'percent'
  fixedCosts: number
}

interface AlternativeRange {
  id: string
  price: number
}

interface PricingScenario {
  id: string
  name: string
  config: PricingConfig
}

interface FinancialDataPayload {
  id?: string
  briefing: Record<string, string | number | boolean>
  params: Record<string, number | string>
  offers: Offer[]
  investments: Investment[]
  trafego_real?: number | string
  curCen: number
}

// DEFAULT OBJECT FOR FINANCIAL SHEETS
const finDefaultData = () => ({
  briefing: {
    produto: '',
    expert: '',
    cat: '',
    metodo: '',
    obj: '',
    plat: '',
    publico: '',
    ppl_ini: '',
    ppl_fim: '',
    cpls: 3,
    carr_ini: '',
    carr_fim: '',
    ob_ativo: false,
    ob_tick: 0,
    ob_prod: '',
    up_ativo: false,
    up_tick: 0,
    up_prod: '',
    dw_ativo: false,
    dw_tick: 0,
    dw_prod: '',
    grupo_leads: 'WhatsApp',
  },
  params: {
    ticket: 797,
    verba: 30000,
    conv: 1.5,
    cpl: 3,
    d_capt: 70,
    d_aquec: 5,
    d_lemb: 5,
    d_carr: 20,
    taxa_pct: 4.5,
    taxa_fix: 2.49,
    imposto: 6,
    b16: 50,
    exp: 50,
    com_est: 5,
    luc_mae: 33.33,
    luc_b16: 33.33,
    luc_fund: 33.34,
  },
  offers: [
    { n: 'Oferta Principal', ticket: 797, vendas: 0, cancel: 0, taxa_pct: 4.5, taxa_fix: 2.49 }
  ],
  investments: [
    { nome: 'Tráfego Pago', valor: 30000 }
  ],
  trafego_real: 30000,
  curCen: 0
})

export default function FinanceiroModule() {
  const queryClient = useQueryClient()
  const supabase = createClient()
  const { activeProjectId, showToast } = useAppStore()

  const [activeSubTab, setActiveSubTab] = useState<'brief' | 'params' | 'price' | 'serv' | 'prov' | 'real' | 'inv' | 'dre' | 'comm'>('brief')

  // ==========================================
  // SERVICES PRICING CALCULATOR LOGIC & STATE
  // ==========================================
  const [servMargemAlvo, setServMargemAlvo] = useState<number>(20)
  const [servVariaveis, setServVariaveis] = useState<{ id: string; nome: string; pct: number }[]>([
    { id: '1', nome: 'Impostos', pct: 6 },
    { id: '2', nome: 'Gateway/Taxas', pct: 4 },
    { id: '3', nome: 'Comissão de Vendas', pct: 10 },
    { id: '4', nome: 'Inadimplência/Reembolso', pct: 5 }
  ])
  const [servCustosDiretos, setServCustosDiretos] = useState<{
    id: string
    categoria: 'mao_obra_propria' | 'mao_obra_terceirizada' | 'material' | 'ferramenta' | 'deslocamento' | 'fixo_rateado' | 'outro'
    descricao: string
    modo: 'valor' | 'horas'
    horas?: number
    valorHora?: number
    valor: number
  }[]>([
    { id: '1', categoria: 'mao_obra_propria', descricao: 'Tempo de entrega do projeto', modo: 'horas', horas: 10, valorHora: 50, valor: 500 }
  ])
  const [servPrecoAlvo, setServPrecoAlvo] = useState<number>(1000)

  // Load services pricing data from text_fields
  const { data: servicesPricingData } = useQuery({
    queryKey: ['services_pricing', activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return null
      const { data, error } = await supabase
        .from('text_fields')
        .select('*')
        .eq('project_id', activeProjectId)
        .eq('key', 'services-pricing')
        .maybeSingle()
      if (error || !data) return null
      try {
        return JSON.parse(data.value)
      } catch (e) {
        return null
      }
    },
    enabled: !!activeProjectId,
  })

  // Sync loaded data to states
  useEffect(() => {
    if (servicesPricingData) {
      if (servicesPricingData.margemAlvo !== undefined) setServMargemAlvo(servicesPricingData.margemAlvo)
      if (servicesPricingData.variaveis !== undefined) setServVariaveis(servicesPricingData.variaveis)
      if (servicesPricingData.custosDiretos !== undefined) setServCustosDiretos(servicesPricingData.custosDiretos)
      if (servicesPricingData.precoAlvo !== undefined) setServPrecoAlvo(servicesPricingData.precoAlvo)
    } else {
      setServMargemAlvo(20)
      setServVariaveis([
        { id: '1', nome: 'Impostos', pct: 6 },
        { id: '2', nome: 'Gateway/Taxas', pct: 4 },
        { id: '3', nome: 'Comissão de Vendas', pct: 10 },
        { id: '4', nome: 'Inadimplência/Reembolso', pct: 5 }
      ])
      setServCustosDiretos([
        { id: '1', categoria: 'mao_obra_propria', descricao: 'Tempo de entrega do projeto', modo: 'horas', horas: 10, valorHora: 50, valor: 500 }
      ])
      setServPrecoAlvo(1000)
    }
  }, [servicesPricingData, activeProjectId])

  const saveServicesPricingMutation = useMutation({
    mutationFn: async (value: any) => {
      if (!activeProjectId) return
      
      const { data: existing } = await supabase
        .from('text_fields')
        .select('id')
        .eq('project_id', activeProjectId)
        .eq('key', 'services-pricing')
        .maybeSingle()
        
      if (existing) {
        const { error } = await supabase
          .from('text_fields')
          .update({ value: JSON.stringify(value) })
          .eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('text_fields')
          .insert({
            project_id: activeProjectId,
            key: 'services-pricing',
            value: JSON.stringify(value)
          })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services_pricing', activeProjectId] })
      showToast('Dados de precificação de serviços salvos!')
    },
    onError: (err) => {
      showToast('Erro ao salvar: ' + err.message, 'err')
    }
  })

  const triggerSaveServices = (
    margem = servMargemAlvo,
    vars = servVariaveis,
    costs = servCustosDiretos,
    targetPrice = servPrecoAlvo
  ) => {
    saveServicesPricingMutation.mutate({
      margemAlvo: margem,
      variaveis: vars,
      custosDiretos: costs,
      precoAlvo: targetPrice
    })
  }

  // Local state for typing optimization
  const [localFin, setLocalFin] = useState<FinancialDataPayload | null>(null)

  // Clear local state when project changes
  useEffect(() => {
    const timer = setTimeout(() => {
      setLocalFin(null)
    }, 0)
    return () => clearTimeout(timer)
  }, [activeProjectId])

  // ==========================================
  // UNIFIED PRICING SIMULATOR LOGIC & STATE
  // ==========================================
  const [priceConfig, setPriceConfig] = useState<PricingConfig>({
    price: 997,
    sales: 50,
    gatewayVal: 4.5,
    gatewayType: 'percent',
    impostoVal: 6,
    impostoType: 'percent',
    reembolsoVal: 2,
    reembolsoType: 'percent',
    outrosVal: 10,
    outrosType: 'fixed',
    fixedCosts: 5000,
  })

  const [altRanges, setAltRanges] = useState<AlternativeRange[]>([
    { id: '1', price: 497 },
    { id: '2', price: 1997 },
  ])

  const [scenarios, setScenarios] = useState<PricingScenario[]>([])

  // Load from localStorage on project load
  useEffect(() => {
    if (!activeProjectId) return
    const storedConfig = localStorage.getItem(`clave_price_config_${activeProjectId}`)
    const storedAlt = localStorage.getItem(`clave_price_alt_${activeProjectId}`)
    const storedScenarios = localStorage.getItem(`clave_price_scenarios_${activeProjectId}`)

    let configVal: PricingConfig = {
      price: 997,
      sales: 50,
      gatewayVal: 4.5,
      gatewayType: 'percent',
      impostoVal: 6,
      impostoType: 'percent',
      reembolsoVal: 2,
      reembolsoType: 'percent',
      outrosVal: 10,
      outrosType: 'fixed',
      fixedCosts: 5000,
    }
    if (storedConfig) {
      try {
        configVal = JSON.parse(storedConfig)
      } catch (e) {
        console.error(e)
      }
    }

    let altVal: AlternativeRange[] = [
      { id: '1', price: 497 },
      { id: '2', price: 1997 },
    ]
    if (storedAlt) {
      try {
        altVal = JSON.parse(storedAlt)
      } catch (e) {
        console.error(e)
      }
    }

    let scenariosVal: PricingScenario[] = []
    if (storedScenarios) {
      try {
        scenariosVal = JSON.parse(storedScenarios)
      } catch (e) {
        console.error(e)
      }
    }

    setTimeout(() => {
      setPriceConfig(configVal)
      setAltRanges(altVal)
      setScenarios(scenariosVal)
    }, 0)
  }, [activeProjectId])

  const savePriceConfig = (newConfig: PricingConfig) => {
    setPriceConfig(newConfig)
    if (activeProjectId) {
      localStorage.setItem(`clave_price_config_${activeProjectId}`, JSON.stringify(newConfig))
    }
  }

  const saveAltRanges = (newAlt: AlternativeRange[]) => {
    setAltRanges(newAlt)
    if (activeProjectId) {
      localStorage.setItem(`clave_price_alt_${activeProjectId}`, JSON.stringify(newAlt))
    }
  }

  const saveScenarios = (newScenarios: PricingScenario[]) => {
    setScenarios(newScenarios)
    if (activeProjectId) {
      localStorage.setItem(`clave_price_scenarios_${activeProjectId}`, JSON.stringify(newScenarios))
    }
  }

  // Query benchmarking competitors to calculate average price
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
      if (error) return []
      return data ? (JSON.parse(data.value) as { n: string; s: string; i: string; p?: string | number }[]) : []
    },
    enabled: !!activeProjectId,
  })

  const competitorPrices = (competitors || [])
    .map((c) => parseFloat(String(c.p || 0)))
    .filter((p) => p > 0)
  const avgCompetitorPrice = competitorPrices.length > 0
    ? competitorPrices.reduce((sum, p) => sum + p, 0) / competitorPrices.length
    : 0

  const gateway = priceConfig.gatewayType === 'percent' ? priceConfig.price * (priceConfig.gatewayVal / 100) : priceConfig.gatewayVal
  const imposto = priceConfig.impostoType === 'percent' ? priceConfig.price * (priceConfig.impostoVal / 100) : priceConfig.impostoVal
  const reembolso = priceConfig.reembolsoType === 'percent' ? priceConfig.price * (priceConfig.reembolsoVal / 100) : priceConfig.reembolsoVal
  const outros = priceConfig.outrosType === 'percent' ? priceConfig.price * (priceConfig.outrosVal / 100) : priceConfig.outrosVal
  const varCosts = gateway + imposto + reembolso + outros
  const contribMarginPerUnit = priceConfig.price - varCosts
  const monthlyRevenue = priceConfig.price * priceConfig.sales
  const annualRevenue = monthlyRevenue * 12
  const contribMarginPct = priceConfig.price > 0 ? (contribMarginPerUnit / priceConfig.price) * 100 : 0
  const monthlyProfit = (contribMarginPerUnit * priceConfig.sales) - priceConfig.fixedCosts
  const profitMarginPct = monthlyRevenue > 0 ? (monthlyProfit / monthlyRevenue) * 100 : 0
  const cpaMax = priceConfig.sales > 0 ? contribMarginPerUnit - (priceConfig.fixedCosts / priceConfig.sales) : 0

  const activeDiagnostic = useMemo(() => {
    if (avgCompetitorPrice <= 0 || priceConfig.price <= 0) return null
    const ratio = priceConfig.price / avgCompetitorPrice
    if (ratio < 0.85) {
      return {
        label: 'Abaixo do mercado',
        color: 'bg-red-bg text-red-t border border-red-t/25',
        desc: 'Seu preço está abaixo da média dos concorrentes. Excelente para atração inicial (preço de penetração), mas atente-se à sustentabilidade da margem.'
      }
    } else if (ratio <= 1.15) {
      return {
        label: 'Preço ideal',
        color: 'bg-green-bg text-green-t border border-green-custom/25',
        desc: 'Seu preço está alinhado com a média dos concorrentes. O foco deve ser nos diferenciais de produto e atendimento para vencer a concorrência.'
      }
    } else {
      return {
        label: 'Acima do mercado',
        color: 'bg-amber-bg text-amber-t border border-amber-t/25',
        desc: 'Seu preço está acima da média de mercado. Garanta que a sua comunicação de valor e branding sustentem esse posicionamento premium.'
      }
    }
  }, [priceConfig.price, avgCompetitorPrice])

  const handleToggle = (field: 'gatewayType' | 'impostoType' | 'reembolsoType' | 'outrosType') => {
    const updated = {
      ...priceConfig,
      [field]: priceConfig[field] === 'percent' ? 'fixed' : 'percent'
    } as PricingConfig
    savePriceConfig(updated)
  }

  const handleConfigChange = (field: keyof PricingConfig, val: string | number) => {
    const updated = {
      ...priceConfig,
      [field]: val === '' ? 0 : +val
    } as PricingConfig
    savePriceConfig(updated)
  }

  const addAltPriceRange = () => {
    const updated = [...altRanges, { id: 'alt_' + Date.now(), price: 497 }]
    saveAltRanges(updated)
  }

  const changeAltPrice = (id: string, price: number) => {
    const updated = altRanges.map((r) => r.id === id ? { ...r, price } : r)
    saveAltRanges(updated)
  }

  const removeAltRange = (id: string) => {
    const updated = altRanges.filter((r) => r.id !== id)
    saveAltRanges(updated)
  }

  const handleSaveScenario = () => {
    const name = prompt('Digite o nome do cenário de precificação (Ex: "Cenário Promocional"):')
    if (!name || !name.trim()) return
    const newScenario: PricingScenario = {
      id: 'sc_' + Date.now(),
      name: name.trim(),
      config: { ...priceConfig }
    }
    const updated = [...scenarios, newScenario]
    saveScenarios(updated)
    showToast('Cenário de precificação salvo!')
  }

  const handleLoadScenario = (sc: PricingScenario) => {
    savePriceConfig(sc.config)
    showToast(`Cenário "${sc.name}" carregado com sucesso!`)
  }

  const handleDeleteScenario = (id: string) => {
    if (confirm('Deseja excluir este cenário de precificação permanentemente?')) {
      const updated = scenarios.filter((sc) => sc.id !== id)
      saveScenarios(updated)
      showToast('Cenário excluído')
    }
  }

  // 1. QUERY FINANCIAL DATA
  const { data: dbFin } = useQuery({
    queryKey: ['financial_data', activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return finDefaultData()
      const { data, error } = await supabase
        .from('financial_data')
        .select('*')
        .eq('project_id', activeProjectId)
        .maybeSingle()

      if (error) {
        showToast('Erro ao carregar módulo financeiro', 'err')
        return finDefaultData()
      }
      if (!data) return finDefaultData()

      return {
        id: data.id,
        briefing: data.briefing || finDefaultData().briefing,
        params: data.params || finDefaultData().params,
        offers: data.offers || finDefaultData().offers,
        investments: data.investments || finDefaultData().investments,
        trafego_real: data.trafego_real || 0,
        curCen: data.curCen || 0
      }
    },
    enabled: !!activeProjectId,
  })

  // Sync query data into local state
  useEffect(() => {
    if (dbFin && localFin === null) {
      const timer = setTimeout(() => {
        setLocalFin(dbFin)
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [dbFin, localFin])


  // 2. MUTATION SAVE FINANCIAL DATA
  const saveFinMutation = useMutation({
    mutationFn: async (payload: FinancialDataPayload) => {
      if (!activeProjectId) return

      // Sanitize values for database storage
      const cleanParams: Record<string, number> = {}
      for (const [k, v] of Object.entries(payload.params || {})) {
        cleanParams[k] = v === '' ? 0 : +v
      }

      const cleanOffers = (payload.offers || []).map((o) => ({
        ...o,
        ticket: o.ticket === '' ? 0 : +o.ticket,
        vendas: o.vendas === '' ? 0 : +o.vendas,
        cancel: o.cancel === '' ? 0 : +o.cancel,
        taxa_pct: o.taxa_pct === '' ? 0 : +o.taxa_pct,
        taxa_fix: o.taxa_fix === '' ? 0 : +o.taxa_fix,
      }))

      const cleanInvestments = (payload.investments || []).map((inv) => ({
        ...inv,
        valor: inv.valor === '' ? 0 : +inv.valor,
      }))

      const cleanTrafegoReal = payload.trafego_real === '' ? 0 : +(payload.trafego_real || 0)

      if (payload.id) {
        const { error } = await supabase
          .from('financial_data')
          .update({
            briefing: payload.briefing,
            params: cleanParams,
            offers: cleanOffers,
            investments: cleanInvestments,
            trafego_real: cleanTrafegoReal,
            curCen: payload.curCen
          })
          .eq('id', payload.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('financial_data')
          .insert({
            project_id: activeProjectId,
            briefing: payload.briefing,
            params: cleanParams,
            offers: cleanOffers,
            investments: cleanInvestments,
            trafego_real: cleanTrafegoReal,
            curCen: payload.curCen
          })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial_data', activeProjectId] })
    },
  })

  const updateLocalSubField = (section: 'briefing' | 'params', key: string, val: string | number) => {
    const base = localFin || dbFin
    if (!base) return
    const updated = {
      ...base,
      [section]: {
        ...base[section],
        [key]: val
      }
    }
    setLocalFin(updated)
  }

  const handleFinBlur = () => {
    const dataToSave = localFin || dbFin
    if (!dataToSave) return
    saveFinMutation.mutate(dataToSave)
  }

  // ==========================================
  // REALIZADO & VENDAS (OFFERS CRUD)
  // ==========================================
  const addOffer = () => {
    const base = localFin || dbFin
    if (!base) return
    const list = [
      ...base.offers,
      { n: `Oferta ${base.offers.length + 1}`, ticket: 797, vendas: 0, cancel: 0, taxa_pct: 4.5, taxa_fix: 2.49 }
    ]
    const updated = { ...base, offers: list }
    setLocalFin(updated)
    saveFinMutation.mutate(updated)
  }

  const updateLocalOffer = (idx: number, key: string, val: string | number) => {
    const base = localFin || dbFin
    if (!base) return
    const list = [...base.offers]
    list[idx] = { ...list[idx], [key]: val } as Offer
    const updated = { ...base, offers: list }
    setLocalFin(updated)
  }

  const handleOfferBlur = () => {
    const dataToSave = localFin || dbFin
    if (!dataToSave) return
    saveFinMutation.mutate(dataToSave)
  }

  const deleteOffer = (idx: number) => {
    const base = localFin || dbFin
    if (!base) return
    const list = base.offers.filter((_item: Offer, i: number) => i !== idx)
    const updated = { ...base, offers: list }
    setLocalFin(updated)
    saveFinMutation.mutate(updated)
    showToast('Oferta excluída')
  }

  // ==========================================
  // INVESTIMENTOS CRUD
  // ==========================================
  const addInvestment = () => {
    const base = localFin || dbFin
    if (!base) return
    const list = [
      ...base.investments,
      { nome: '', valor: 0 }
    ]
    const updated = { ...base, investments: list }
    setLocalFin(updated)
    saveFinMutation.mutate(updated)
  }

  const updateLocalInvestment = (idx: number, key: 'nome' | 'valor', val: string | number) => {
    const base = localFin || dbFin
    if (!base) return
    const list = [...base.investments]
    list[idx] = { ...list[idx], [key]: val } as Investment
    const updated = { ...base, investments: list }
    setLocalFin(updated)
  }

  const handleInvestmentBlur = () => {
    const dataToSave = localFin || dbFin
    if (!dataToSave) return
    saveFinMutation.mutate(dataToSave)
  }

  const deleteInvestment = (idx: number) => {
    const base = localFin || dbFin
    if (!base) return
    const list = base.investments.filter((_item: Investment, i: number) => i !== idx)
    const updated = { ...base, investments: list }
    setLocalFin(updated)
    saveFinMutation.mutate(updated)
    showToast('Investimento removido')
  }

  // ==========================================
  // FINANCIAL CALCULATIONS LOGIC
  // ==========================================
  const calcFin = () => {
    if (!dbFin) return null

    const p = (localFin || dbFin).params
    const offers = (localFin || dbFin).offers || []
    const investments = (localFin || dbFin).investments || []

    // 1. Receitas de Ofertas
    let fatBruto = 0
    let totalTaxasPlat = 0

    offers.forEach((o: Offer) => {
      const liqSales = +(o.vendas || 0) - +(o.cancel || 0)
      const rev = liqSales * +(o.ticket || 0)
      const fee = rev * (+(o.taxa_pct || 0) / 100) + liqSales * +(o.taxa_fix || 0)
      fatBruto += rev
      totalTaxasPlat += fee
    })

    const recLiquida = fatBruto - totalTaxasPlat

    // 2. Investimentos
    const totalInvestido = investments.reduce((sum: number, item: Investment) => sum + (+item.valor || 0), 0)

    // 3. Imposto e Comissões
    const impostoVal = fatBruto * (+(p.imposto || 0) / 100)
    const comissaoEstrategista = recLiquida * (+(p.com_est || 0) / 100)

    // 4. Lucro Líquido Distribuível
    const lucroLiquido = recLiquida - totalInvestido - impostoVal - comissaoEstrategista

    // 5. Divisão de lucros
    const divExpert = Math.max(0, lucroLiquido) * (+(p.luc_mae || 0) / 100)
    const divB16 = Math.max(0, lucroLiquido) * (+(p.luc_b16 || 0) / 100)
    const divFundo = Math.max(0, lucroLiquido) * (+(p.luc_fund || 0) / 100)

    // 6. Provisionamento
    const leadsProjected = +(p.verba || 0) / Math.max(+(p.cpl || 0), 1)

    // Cenários de conversão
    const getScenario = (factor: number) => {
      const conv = +(p.conv || 0) * factor
      const buyers = leadsProjected * (conv / 100)
      const rev = buyers * +(p.ticket || 0)
      const roas = +(p.verba || 0) > 0 ? (rev / +(p.verba || 0)).toFixed(2) + 'x' : '0x'
      return { conv, buyers: Math.round(buyers), rev, roas }
    }

    const scLow = getScenario(0.7)
    const scMed = getScenario(1.0)
    const scHigh = getScenario(1.3)

    const formatCurrency = (val: number) =>
      `R$ ${Math.round(val).toLocaleString('pt-BR')}`

    return {
      fatBruto,
      totalTaxasPlat,
      recLiquida,
      totalInvestido,
      impostoVal,
      comissaoEstrategista,
      lucroLiquido,
      divExpert,
      divB16,
      divFundo,
      scLow,
      scMed,
      scHigh,
      leadsProjected,
      formatCurrency,
    }
  }

  const f = calcFin()

  if (!dbFin || !f) return <div className="text-xs text-text3 py-6 text-center">Carregando...</div>

  // Sum check validation for divisions
  const sumDivisions = +((localFin || dbFin).params.luc_mae || 0) + +((localFin || dbFin).params.luc_b16 || 0) + +((localFin || dbFin).params.luc_fund || 0)
  const isDivisionSumValid = Math.abs(sumDivisions - 100) < 0.05

  return (
    <div className="space-y-6">
      {/* Subtabs Navigation */}
      <div className="flex gap-1 border-b border-border-custom flex-wrap mb-4">
        {([
          { id: 'brief', name: 'Briefing' },
          { id: 'params', name: 'Parâmetros' },
          { id: 'price', name: 'Precificação' },
          { id: 'serv', name: 'Precificação de Serviços' },
          { id: 'prov', name: 'Provisionamento' },
          { id: 'real', name: 'Realizado & Vendas' },
          { id: 'inv', name: 'Investimentos' },
          { id: 'dre', name: 'DRE' },
          { id: 'comm', name: 'Comissões' },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`px-3 py-2 text-xs font-semibold cursor-pointer border-b-2 bg-transparent transition-colors duration-150 ${
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
          TAB: BRIEFING
          ========================================== */}
      {activeSubTab === 'brief' && (
        <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4 animate-[fadeUp_0.15s_ease_both]">
          <h4 className="text-xs font-bold text-text-custom border-b border-border-custom pb-2">
            Briefing do Produto & Lançamento
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="text-[10px] font-bold text-text2 mb-1 block">Nome do Produto</label>
              <input
                className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                value={(localFin || dbFin).briefing.produto}
                onChange={(e) => updateLocalSubField('briefing', 'produto', e.target.value)} onBlur={handleFinBlur}
                placeholder="Ex: Mentoria Maestro"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-text2 mb-1 block">Expert / Produtor</label>
              <input
                className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                value={(localFin || dbFin).briefing.expert}
                onChange={(e) => updateLocalSubField('briefing', 'expert', e.target.value)} onBlur={handleFinBlur}
                placeholder="Ex: Robson Freitas"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-text2 mb-1 block">Categoria</label>
              <input
                className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                value={(localFin || dbFin).briefing.cat}
                onChange={(e) => updateLocalSubField('briefing', 'cat', e.target.value)} onBlur={handleFinBlur}
                placeholder="Ex: Negócios & Marketing"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-text2 mb-1 block">Metodologia</label>
              <input
                className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                value={(localFin || dbFin).briefing.metodo}
                onChange={(e) => updateLocalSubField('briefing', 'metodo', e.target.value)} onBlur={handleFinBlur}
                placeholder="Ex: Método Clave"
              />
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          TAB: PARÂMETROS
          ========================================== */}
      {activeSubTab === 'params' && (
        <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4 animate-[fadeUp_0.15s_ease_both]">
          <h4 className="text-xs font-bold text-text-custom border-b border-border-custom pb-2">
            Configuração de Parâmetros Financeiros
          </h4>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <label className="text-[10px] font-bold text-text2 mb-1 block">Ticket Médio (R$)</label>
              <input
                type="number"
                className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                value={(localFin || dbFin).params.ticket}
                onChange={(e) => updateLocalSubField('params', 'ticket', e.target.value === '' ? '' : +e.target.value)} onBlur={handleFinBlur}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-text2 mb-1 block">Orçamento Tráfego (R$)</label>
              <input
                type="number"
                className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                value={(localFin || dbFin).params.verba}
                onChange={(e) => updateLocalSubField('params', 'verba', e.target.value === '' ? '' : +e.target.value)} onBlur={handleFinBlur}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-text2 mb-1 block">Meta CPL (R$)</label>
              <input
                type="number"
                step="0.1"
                className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                value={(localFin || dbFin).params.cpl}
                onChange={(e) => updateLocalSubField('params', 'cpl', e.target.value === '' ? '' : +e.target.value)} onBlur={handleFinBlur}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-text2 mb-1 block">Conversão Estimada (%)</label>
              <input
                type="number"
                step="0.01"
                className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                value={(localFin || dbFin).params.conv}
                onChange={(e) => updateLocalSubField('params', 'conv', e.target.value === '' ? '' : +e.target.value)} onBlur={handleFinBlur}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-text2 mb-1 block">Imposto (%)</label>
              <input
                type="number"
                step="0.1"
                className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                value={(localFin || dbFin).params.imposto}
                onChange={(e) => updateLocalSubField('params', 'imposto', e.target.value === '' ? '' : +e.target.value)} onBlur={handleFinBlur}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-text2 mb-1 block">Comissão Estrategista (%)</label>
              <input
                type="number"
                step="0.1"
                className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                value={(localFin || dbFin).params.com_est}
                onChange={(e) => updateLocalSubField('params', 'com_est', e.target.value === '' ? '' : +e.target.value)} onBlur={handleFinBlur}
              />
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          TAB: PRECIFICAÇÃO (SIMULATOR)
          ========================================== */}
      {activeSubTab === 'price' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-[fadeUp_0.15s_ease_both]">
          {/* Configs Column */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b border-border-custom pb-2 flex-wrap gap-2">
                <div>
                  <h4 className="text-xs font-bold text-text-custom">Configuração de Cenário Atual</h4>
                  <p className="text-[10px] text-text3 mt-0.5">Defina o preço, metas mensais e custos de venda</p>
                </div>
                <button
                  type="button"
                  onClick={handleSaveScenario}
                  className="px-2.5 py-1.5 bg-text-custom text-surface hover:opacity-90 rounded text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Salvar como Cenário</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <label className="text-[10px] font-bold text-text2 mb-1 block">Preço do Produto (R$)</label>
                  <input
                    type="number"
                    className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom font-semibold outline-none"
                    value={priceConfig.price || ''}
                    onChange={(e) => handleConfigChange('price', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-text2 mb-1 block">Meta de Vendas Mensais</label>
                  <input
                    type="number"
                    className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                    value={priceConfig.sales || ''}
                    onChange={(e) => handleConfigChange('sales', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-text2 mb-1 block">Custo Fixo Mensal (R$)</label>
                  <input
                    type="number"
                    className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                    value={priceConfig.fixedCosts || ''}
                    onChange={(e) => handleConfigChange('fixedCosts', e.target.value)}
                  />
                </div>
              </div>

              {/* Variáveis (Gateway, Imposto, Reembolso, Outros) */}
              <div className="border-t border-border-custom pt-4 space-y-4">
                <h5 className="text-[11px] font-bold text-text-custom">Custos Variáveis e Taxas por Venda</h5>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  {/* Gateway */}
                  <div className="flex flex-col gap-1.5 p-3 bg-surface2 border border-border2 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-text2 uppercase">Gateway / Plataforma</span>
                      <div className="flex items-center gap-1 bg-surface border border-border2 rounded p-0.5">
                        <button
                          type="button"
                          onClick={() => handleToggle('gatewayType')}
                          className={`px-1.5 py-0.5 rounded-[3px] text-[9px] font-bold transition-colors ${
                            priceConfig.gatewayType === 'percent' ? 'bg-text-custom text-surface' : 'bg-transparent text-text3'
                          }`}
                        >
                          %
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggle('gatewayType')}
                          className={`px-1.5 py-0.5 rounded-[3px] text-[9px] font-bold transition-colors ${
                            priceConfig.gatewayType === 'fixed' ? 'bg-text-custom text-surface' : 'bg-transparent text-text3'
                          }`}
                        >
                          R$
                        </button>
                      </div>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full px-2.5 py-1 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                      value={priceConfig.gatewayVal || ''}
                      onChange={(e) => handleConfigChange('gatewayVal', e.target.value)}
                    />
                  </div>

                  {/* Imposto */}
                  <div className="flex flex-col gap-1.5 p-3 bg-surface2 border border-border2 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-text2 uppercase">Imposto de Venda</span>
                      <div className="flex items-center gap-1 bg-surface border border-border2 rounded p-0.5">
                        <button
                          type="button"
                          onClick={() => handleToggle('impostoType')}
                          className={`px-1.5 py-0.5 rounded-[3px] text-[9px] font-bold transition-colors ${
                            priceConfig.impostoType === 'percent' ? 'bg-text-custom text-surface' : 'bg-transparent text-text3'
                          }`}
                        >
                          %
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggle('impostoType')}
                          className={`px-1.5 py-0.5 rounded-[3px] text-[9px] font-bold transition-colors ${
                            priceConfig.impostoType === 'fixed' ? 'bg-text-custom text-surface' : 'bg-transparent text-text3'
                          }`}
                        >
                          R$
                        </button>
                      </div>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full px-2.5 py-1 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                      value={priceConfig.impostoVal || ''}
                      onChange={(e) => handleConfigChange('impostoVal', e.target.value)}
                    />
                  </div>

                  {/* Reembolso */}
                  <div className="flex flex-col gap-1.5 p-3 bg-surface2 border border-border2 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-text2 uppercase">Projeção de Reembolso</span>
                      <div className="flex items-center gap-1 bg-surface border border-border2 rounded p-0.5">
                        <button
                          type="button"
                          onClick={() => handleToggle('reembolsoType')}
                          className={`px-1.5 py-0.5 rounded-[3px] text-[9px] font-bold transition-colors ${
                            priceConfig.reembolsoType === 'percent' ? 'bg-text-custom text-surface' : 'bg-transparent text-text3'
                          }`}
                        >
                          %
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggle('reembolsoType')}
                          className={`px-1.5 py-0.5 rounded-[3px] text-[9px] font-bold transition-colors ${
                            priceConfig.reembolsoType === 'fixed' ? 'bg-text-custom text-surface' : 'bg-transparent text-text3'
                          }`}
                        >
                          R$
                        </button>
                      </div>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full px-2.5 py-1 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                      value={priceConfig.reembolsoVal || ''}
                      onChange={(e) => handleConfigChange('reembolsoVal', e.target.value)}
                    />
                  </div>

                  {/* Outros / MMQ */}
                  <div className="flex flex-col gap-1.5 p-3 bg-surface2 border border-border2 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-text2 uppercase">MMQ / Outros Custos</span>
                      <div className="flex items-center gap-1 bg-surface border border-border2 rounded p-0.5">
                        <button
                          type="button"
                          onClick={() => handleToggle('outrosType')}
                          className={`px-1.5 py-0.5 rounded-[3px] text-[9px] font-bold transition-colors ${
                            priceConfig.outrosType === 'percent' ? 'bg-text-custom text-surface' : 'bg-transparent text-text3'
                          }`}
                        >
                          %
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggle('outrosType')}
                          className={`px-1.5 py-0.5 rounded-[3px] text-[9px] font-bold transition-colors ${
                            priceConfig.outrosType === 'fixed' ? 'bg-text-custom text-surface' : 'bg-transparent text-text3'
                          }`}
                        >
                          R$
                        </button>
                      </div>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full px-2.5 py-1 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                      value={priceConfig.outrosVal || ''}
                      onChange={(e) => handleConfigChange('outrosVal', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Alternative price ranges table */}
            <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b border-border-custom pb-2">
                <div>
                  <h4 className="text-xs font-bold text-text-custom">Tabela de Faixas de Preço Alternativas</h4>
                  <p className="text-[10px] text-text3 mt-0.5">Analise o volume necessário e lucratividade para outros preços</p>
                </div>
                <button
                  type="button"
                  onClick={addAltPriceRange}
                  className="px-2.5 py-1.5 border border-border2 text-[10px] text-text-custom rounded hover:bg-surface2 transition-colors cursor-pointer"
                >
                  + Faixa de Preço
                </button>
              </div>

              <div className="overflow-x-auto text-xs leading-normal">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-border-custom text-text2 text-[10px] font-bold uppercase text-left">
                      <th className="py-2 pr-4">Preço Alternativo</th>
                      <th className="py-2 px-4">CM Unitária</th>
                      <th className="py-2 px-4">Vendas p/ Meta</th>
                      <th className="py-2 px-4">CPA Máximo</th>
                      <th className="py-2 px-4">Lucro Projetado (Vol. Atual)</th>
                      <th className="py-2 pl-4 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {altRanges.map((r) => {
                      const altPrice = r.price
                      const altGateway = priceConfig.gatewayType === 'percent' ? altPrice * (priceConfig.gatewayVal / 100) : priceConfig.gatewayVal
                      const altImposto = priceConfig.impostoType === 'percent' ? altPrice * (priceConfig.impostoVal / 100) : priceConfig.impostoVal
                      const altReembolso = priceConfig.reembolsoType === 'percent' ? altPrice * (priceConfig.reembolsoVal / 100) : priceConfig.reembolsoVal
                      const altOutros = priceConfig.outrosType === 'percent' ? altPrice * (priceConfig.outrosVal / 100) : priceConfig.outrosVal
                      const altVarCosts = altGateway + altImposto + altReembolso + altOutros
                      const altCM = altPrice - altVarCosts
                      const targetProfit = monthlyProfit
                      const altNecessarySales = altCM > 0 ? (priceConfig.fixedCosts + Math.max(0, targetProfit)) / altCM : 0
                      const altCpa = altNecessarySales > 0 ? altCM - (priceConfig.fixedCosts / altNecessarySales) : 0
                      const altProjProfit = (altCM * priceConfig.sales) - priceConfig.fixedCosts

                      return (
                        <tr key={r.id} className="border-b border-border-custom last:border-none">
                          <td className="py-2.5 pr-4">
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-text3 font-semibold">R$</span>
                              <input
                                type="number"
                                className="w-20 px-2 py-0.5 text-xs border border-border2 rounded bg-surface text-text-custom outline-none font-semibold"
                                value={r.price || ''}
                                onChange={(e) => changeAltPrice(r.id, e.target.value === '' ? 0 : +e.target.value)}
                              />
                            </div>
                          </td>
                          <td className="py-2.5 px-4 font-mono font-semibold">
                            {f.formatCurrency(altCM)}
                          </td>
                          <td className="py-2.5 px-4 font-semibold text-text-custom">
                            {altNecessarySales === Infinity || altNecessarySales === 0
                              ? '—'
                              : Math.ceil(altNecessarySales) + ' vendas'}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-amber-t">
                            {altNecessarySales > 0 ? f.formatCurrency(altCpa) : '—'}
                          </td>
                          <td className={`py-2.5 px-4 font-mono font-semibold ${altProjProfit >= 0 ? 'text-green-custom' : 'text-red-t'}`}>
                            {f.formatCurrency(altProjProfit)}
                          </td>
                          <td className="py-2.5 pl-4 text-right">
                            <button
                              type="button"
                              onClick={() => removeAltRange(r.id)}
                              className="text-red-t hover:underline font-semibold cursor-pointer"
                            >
                              Excluir
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Diagnostic & Scenarios Side Column */}
          <div className="space-y-6">
            {/* Diagnostic relative to Benchmarking */}
            {activeDiagnostic && (
              <div className={`p-4 rounded-xl border ${activeDiagnostic.color} shadow-sm space-y-2`}>
                <div className="flex justify-between items-center">
                  <h5 className="text-[11px] font-bold uppercase">Diagnóstico vs. Mercado</h5>
                  <span className="text-[10px] font-bold bg-surface/40 px-2 py-0.5 rounded uppercase">
                    {activeDiagnostic.label}
                  </span>
                </div>
                <p className="text-xs leading-relaxed">{activeDiagnostic.desc}</p>
                <div className="border-t border-current/25 pt-2 flex justify-between text-[11px] font-medium">
                  <span>Média do Concorrente:</span>
                  <span>{f.formatCurrency(avgCompetitorPrice)}</span>
                </div>
              </div>
            )}

            {/* Results card */}
            <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4">
              <h4 className="text-xs font-bold text-text-custom border-b border-border-custom pb-2">
                Resultado do Cenário Atual
              </h4>

              <div className="space-y-3 text-xs leading-normal">
                <div className="flex justify-between border-b border-border-custom pb-2">
                  <span className="text-text2">Receita Mensal Projetada</span>
                  <span className="text-text-custom font-semibold">{f.formatCurrency(monthlyRevenue)}</span>
                </div>
                <div className="flex justify-between border-b border-border-custom pb-2">
                  <span className="text-text2">Receita Anual Projetada</span>
                  <span className="text-text-custom font-semibold">{f.formatCurrency(annualRevenue)}</span>
                </div>
                <div className="flex justify-between border-b border-border-custom pb-2">
                  <span className="text-text2">Vendas Diárias (Média)</span>
                  <span className="text-text-custom font-semibold">{(priceConfig.sales / 30).toFixed(1)} / dia</span>
                </div>
                <div className="flex justify-between border-b border-border-custom pb-2">
                  <span className="text-text2">Margem de Contribuição unitária</span>
                  <span className="text-text-custom font-mono font-semibold">{f.formatCurrency(contribMarginPerUnit)} ({contribMarginPct.toFixed(1)}%)</span>
                </div>
                <div className="flex justify-between border-b border-border-custom pb-2">
                  <span className="text-text2">Lucro Mensal Projetado</span>
                  <span className={`font-mono font-bold ${monthlyProfit >= 0 ? 'text-green-custom' : 'text-red-t'}`}>
                    {f.formatCurrency(monthlyProfit)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-border-custom pb-2">
                  <span className="text-text2">Margem de Lucro</span>
                  <span className={`font-semibold ${monthlyProfit >= 0 ? 'text-green-custom' : 'text-red-t'}`}>
                    {profitMarginPct.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between pb-1">
                  <span className="text-text2">CPA Máximo Sustentável</span>
                  <span className="text-amber-t font-mono font-semibold">{f.formatCurrency(cpaMax)}</span>
                </div>
              </div>
            </div>

            {/* Saved scenarios comparison and load list */}
            <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4">
              <h4 className="text-xs font-bold text-text-custom border-b border-border-custom pb-2">
                Cenários Salvos
              </h4>

              <div className="space-y-3 max-h-60 overflow-y-auto pr-1 scrollbar-thin">
                {scenarios.length === 0 ? (
                  <p className="text-[11px] text-text3 text-center py-4">Nenhum cenário salvo ainda.</p>
                ) : (
                  scenarios.map((sc) => {
                    const scGateway = sc.config.gatewayType === 'percent' ? sc.config.price * (sc.config.gatewayVal / 100) : sc.config.gatewayVal
                    const scImposto = sc.config.impostoType === 'percent' ? sc.config.price * (sc.config.impostoVal / 100) : sc.config.impostoVal
                    const scReembolso = sc.config.reembolsoType === 'percent' ? sc.config.price * (sc.config.reembolsoVal / 100) : sc.config.reembolsoVal
                    const scOutros = sc.config.outrosType === 'percent' ? sc.config.price * (sc.config.outrosVal / 100) : sc.config.outrosVal
                    const scVarCosts = scGateway + scImposto + scReembolso + scOutros
                    const scCMUnit = sc.config.price - scVarCosts
                    const scProfit = (scCMUnit * sc.config.sales) - sc.config.fixedCosts
                    const scCPA = sc.config.sales > 0 ? scCMUnit - (sc.config.fixedCosts / sc.config.sales) : 0

                    return (
                      <div
                        key={sc.id}
                        className="p-3 bg-surface2 border border-border2 rounded-lg space-y-2 relative"
                      >
                        <button
                          type="button"
                          onClick={() => handleDeleteScenario(sc.id)}
                          className="absolute right-2 top-2 text-text3 hover:text-red-t text-xs font-bold cursor-pointer"
                        >
                          ×
                        </button>
                        <div>
                          <span className="text-[11px] font-bold text-text-custom block pr-4 truncate">
                            {sc.name}
                          </span>
                          <span className="text-[9px] text-text3 uppercase">
                            Preço: {f.formatCurrency(sc.config.price)} | Vol: {sc.config.sales}/mês
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[10px] border-t border-border-custom/50 pt-2 text-text2">
                          <div>
                            <span>Lucro: </span>
                            <span className={`font-semibold ${scProfit >= 0 ? 'text-green-custom' : 'text-red-t'}`}>
                              {f.formatCurrency(scProfit)}
                            </span>
                          </div>
                          <div>
                            <span>CPA Max: </span>
                            <span className="font-semibold text-amber-t">{f.formatCurrency(scCPA)}</span>
                          </div>
                        </div>

                        <div className="flex gap-2 justify-end pt-1">
                          <button
                            type="button"
                            onClick={() => handleLoadScenario(sc)}
                            className="px-2 py-1 bg-surface border border-border2 hover:bg-surface2 text-[10px] text-text-custom font-semibold rounded cursor-pointer transition-colors"
                          >
                            Carregar
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          TAB: PRECIFICAÇÃO DE SERVIÇOS
          ========================================== */}
      {activeSubTab === 'serv' && (() => {
        // Calculations
        const sumV = servVariaveis.reduce((acc, v) => acc + (Number(v.pct) || 0), 0)
        const totalDirect = servCustosDiretos.reduce((acc, c) => {
          if (c.modo === 'horas') {
            return acc + ((Number(c.horas) || 0) * (Number(c.valorHora) || 0))
          }
          return acc + (Number(c.valor) || 0)
        }, 0)

        const denominator = 1 - ((servMargemAlvo + sumV) / 100)
        const isDivergent = (servMargemAlvo + sumV) >= 100

        const precoSugerido = !isDivergent && denominator > 0
          ? totalDirect / denominator
          : 0

        const lucroReais = precoSugerido * (servMargemAlvo / 100)

        // Price Target (cálculo reverso)
        const orcamentoDisponivel = servPrecoAlvo * (1 - (sumV / 100) - (servMargemAlvo / 100))
        const saldoAlvo = orcamentoDisponivel - totalDirect
        const margemReal = servPrecoAlvo > 0
          ? (1 - (sumV / 100) - (totalDirect / servPrecoAlvo)) * 100
          : 0

        const formatCurrency = (val: number) => {
          return 'R$ ' + val.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
        }

        const handleAddVariable = () => {
          const updated = [...servVariaveis, { id: Math.random().toString(36).substring(7), nome: 'Nova taxa', pct: 5 }]
          setServVariaveis(updated)
          triggerSaveServices(servMargemAlvo, updated, servCustosDiretos, servPrecoAlvo)
        }

        const handleRemoveVariable = (id: string) => {
          const updated = servVariaveis.filter(v => v.id !== id)
          setServVariaveis(updated)
          triggerSaveServices(servMargemAlvo, updated, servCustosDiretos, servPrecoAlvo)
        }

        const handleVarChange = (id: string, field: 'nome' | 'pct', val: any) => {
          const updated = servVariaveis.map(v => {
            if (v.id === id) {
              return { ...v, [field]: field === 'pct' ? (val === '' ? '' : Number(val)) : val }
            }
            return v
          })
          setServVariaveis(updated)
          triggerSaveServices(servMargemAlvo, updated, servCustosDiretos, servPrecoAlvo)
        }

        const handleAddCost = () => {
          const updated = [
            ...servCustosDiretos,
            {
              id: Math.random().toString(36).substring(7),
              categoria: 'mao_obra_propria' as const,
              descricao: 'Novo custo',
              modo: 'valor' as const,
              valor: 100
            }
          ]
          setServCustosDiretos(updated)
          triggerSaveServices(servMargemAlvo, servVariaveis, updated, servPrecoAlvo)
        }

        const handleRemoveCost = (id: string) => {
          const updated = servCustosDiretos.filter(c => c.id !== id)
          setServCustosDiretos(updated)
          triggerSaveServices(servMargemAlvo, servVariaveis, updated, servPrecoAlvo)
        }

        const handleCostChange = (id: string, field: string, val: any) => {
          const updated = servCustosDiretos.map(c => {
            if (c.id === id) {
              const updatedItem = { ...c, [field]: val }
              if (field === 'modo') {
                if (val === 'horas') {
                  updatedItem.horas = 10
                  updatedItem.valorHora = 50
                  updatedItem.valor = 500
                } else {
                  updatedItem.valor = 100
                  delete updatedItem.horas
                  delete updatedItem.valorHora
                }
              }
              if (field === 'horas' || field === 'valorHora') {
                const h = field === 'horas' ? Number(val) : (c.horas || 0)
                const vh = field === 'valorHora' ? Number(val) : (c.valorHora || 0)
                updatedItem.valor = h * vh
              }
              if (field === 'valor') {
                updatedItem.valor = val === '' ? 0 : Number(val)
              }
              return updatedItem
            }
            return c
          }) as any
          setServCustosDiretos(updated)
          triggerSaveServices(servMargemAlvo, servVariaveis, updated, servPrecoAlvo)
        }

        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-[fadeUp_0.15s_ease_both]">
            {/* Inputs Column */}
            <div className="lg:col-span-2 space-y-6">
              {/* Passo 1: Margem */}
              <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4">
                <div>
                  <h4 className="text-xs font-bold text-text-custom flex items-center gap-2">
                    <span className="w-5 h-5 flex items-center justify-center rounded-full bg-yellow-500/10 text-yellow-400 text-[11px] font-extrabold border border-yellow-500/20">1</span>
                    <span>Margem de Lucro Alvo</span>
                  </h4>
                  <p className="text-[10px] text-text3 mt-0.5 ml-7">Sua rentabilidade pretendida sobre o preço final de venda.</p>
                </div>
                <div className="pl-7 flex items-center gap-4">
                  <input
                    type="range"
                    min="5"
                    max="95"
                    className="flex-1 accent-yellow-400 cursor-pointer"
                    value={servMargemAlvo}
                    onChange={(e) => {
                      const val = Number(e.target.value)
                      setServMargemAlvo(val)
                      triggerSaveServices(val, servVariaveis, servCustosDiretos, servPrecoAlvo)
                    }}
                  />
                  <span className="text-2xl font-bold text-yellow-400 w-16 text-right">{servMargemAlvo}%</span>
                </div>
              </div>

              {/* Passo 2: Taxas variáveis */}
              <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="text-xs font-bold text-text-custom flex items-center gap-2">
                      <span className="w-5 h-5 flex items-center justify-center rounded-full bg-yellow-500/10 text-yellow-400 text-[11px] font-extrabold border border-yellow-500/20">2</span>
                      <span>Variáveis sobre o Preço de Venda</span>
                    </h4>
                    <p className="text-[10px] text-text3 mt-0.5 ml-7">Custos calculados sob o preço final (impostos, comissões, taxas).</p>
                  </div>
                  <button
                    onClick={handleAddVariable}
                    className="px-2.5 py-1 bg-surface border border-border-custom hover:bg-surface2 text-text-custom hover:text-text-custom text-[11px] font-semibold rounded cursor-pointer transition-colors"
                  >
                    + Adicionar
                  </button>
                </div>

                <div className="pl-7 space-y-3">
                  {servVariaveis.map((v) => (
                    <div key={v.id} className="flex items-center gap-3">
                      <input
                        type="text"
                        placeholder="Nome da taxa"
                        className="flex-1 px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom text-xs outline-none"
                        value={v.nome}
                        onChange={(e) => handleVarChange(v.id, 'nome', e.target.value)}
                      />
                      <div className="relative w-24">
                        <input
                          type="number"
                          placeholder="0"
                          className="w-full pr-7 pl-3 py-1.5 border border-border2 rounded bg-surface text-text-custom text-xs outline-none text-right"
                          value={v.pct}
                          onChange={(e) => handleVarChange(v.id, 'pct', e.target.value)}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text3 text-[11px] font-bold">%</span>
                      </div>
                      <button
                        onClick={() => handleRemoveVariable(v.id)}
                        className="p-1.5 border border-border-custom hover:border-red-500/30 rounded-lg text-text3 hover:text-red-400 hover:bg-red-500/5 transition-colors cursor-pointer"
                        title="Remover"
                      >
                        <Trash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <div className="text-[11px] text-text3 flex justify-between pt-2 border-t border-border-custom">
                    <span>Soma das variáveis:</span>
                    <span className="font-bold text-text-custom">{sumV}%</span>
                  </div>
                </div>
              </div>

              {/* Passo 3: Custos Diretos */}
              <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="text-xs font-bold text-text-custom flex items-center gap-2">
                      <span className="w-5 h-5 flex items-center justify-center rounded-full bg-yellow-500/10 text-yellow-400 text-[11px] font-extrabold border border-yellow-500/20">3</span>
                      <span>Custos Diretos do Serviço</span>
                    </h4>
                    <p className="text-[10px] text-text3 mt-0.5 ml-7">Materiais, mão de obra, softwares e despesas dedicadas.</p>
                  </div>
                  <button
                    onClick={handleAddCost}
                    className="px-2.5 py-1 bg-surface border border-border-custom hover:bg-surface2 text-text-custom hover:text-text-custom text-[11px] font-semibold rounded cursor-pointer transition-colors"
                  >
                    + Novo Custo
                  </button>
                </div>

                <div className="pl-7 space-y-3">
                  {servCustosDiretos.length === 0 ? (
                    <p className="text-xs text-text3 py-2">Nenhum custo direto cadastrado.</p>
                  ) : (
                    servCustosDiretos.map((c) => (
                      <div key={c.id} className="p-3 bg-surface2/45 border border-border-custom rounded-lg space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <select
                            className="px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom text-xs outline-none cursor-pointer w-full"
                            value={c.categoria}
                            onChange={(e) => handleCostChange(c.id, 'categoria', e.target.value)}
                          >
                            <option value="mao_obra_propria">Mão de obra própria</option>
                            <option value="mao_obra_terceirizada">Mão de obra terceirizada</option>
                            <option value="material">Material / Insumo</option>
                            <option value="ferramenta">Ferramenta / Software</option>
                            <option value="deslocamento">Deslocamento / Viagem</option>
                            <option value="fixo_rateado">Rateio de Custo Fixo</option>
                            <option value="outro">Outro custo</option>
                          </select>

                          <input
                            type="text"
                            placeholder="Descrição curta"
                            className="px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom text-xs outline-none w-full"
                            value={c.descricao}
                            onChange={(e) => handleCostChange(c.id, 'descricao', e.target.value)}
                          />

                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => handleCostChange(c.id, 'modo', c.modo === 'horas' ? 'valor' : 'horas')}
                              className={`px-2.5 py-1 border rounded text-[10px] font-bold cursor-pointer transition-colors ${
                                c.modo === 'horas'
                                  ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/25'
                                  : 'bg-surface border-border2 text-text3 hover:text-text-custom'
                              }`}
                            >
                              {c.modo === 'horas' ? 'Por Horas' : 'Valor Direto'}
                            </button>
                            <button
                              onClick={() => handleRemoveCost(c.id)}
                              className="p-1.5 border border-border-custom hover:border-red-500/30 rounded-lg text-text3 hover:text-red-400 hover:bg-red-500/5 transition-colors cursor-pointer"
                              title="Remover"
                            >
                              <Trash className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {c.modo === 'horas' ? (
                          <div className="grid grid-cols-2 gap-3 pl-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-text3 uppercase font-bold">Horas:</span>
                              <input
                                type="number"
                                className="w-full px-2.5 py-1 border border-border2 rounded bg-surface text-text-custom text-xs outline-none text-right"
                                value={c.horas === undefined ? '' : c.horas}
                                onChange={(e) => handleCostChange(c.id, 'horas', e.target.value)}
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-text3 uppercase font-bold">Valor/Hora:</span>
                              <div className="relative w-full">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text3 text-[9px] font-bold">R$</span>
                                <input
                                  type="number"
                                  className="w-full pl-7 pr-2.5 py-1 border border-border2 rounded bg-surface text-text-custom text-xs outline-none text-right"
                                  value={c.valorHora === undefined ? '' : c.valorHora}
                                  onChange={(e) => handleCostChange(c.id, 'valorHora', e.target.value)}
                                />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 pl-1">
                            <span className="text-[10px] text-text3 uppercase font-bold whitespace-nowrap">Valor Total:</span>
                            <div className="relative w-full max-w-[180px]">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text3 text-[9px] font-bold">R$</span>
                              <input
                                type="number"
                                className="w-full pl-7 pr-2.5 py-1 border border-border2 rounded bg-surface text-text-custom text-xs outline-none text-right font-bold"
                                value={c.valor}
                                onChange={(e) => handleCostChange(c.id, 'valor', e.target.value)}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}

                  <div className="text-[11px] text-text3 flex justify-between pt-2 border-t border-border-custom">
                    <span>Total custos diretos:</span>
                    <span className="font-bold text-text-custom">{formatCurrency(totalDirect)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Results Sidebar Column */}
            <div className="space-y-6">
              {/* Preço sugerido Hero */}
              <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4">
                <div>
                  <span className="text-[9px] font-bold text-text3 uppercase tracking-wider block">Preço de Venda Sugerido</span>
                  {isDivergent ? (
                    <div className="text-sm font-bold text-red-t mt-1">Divergência matemática</div>
                  ) : (
                    <div className="text-3xl font-extrabold text-yellow-400 leading-tight mt-1">
                      {formatCurrency(precoSugerido)}
                    </div>
                  )}
                </div>

                {isDivergent ? (
                  <div className="p-3 bg-red-500/5 border border-red-500/10 rounded-lg text-[10px] text-red-t leading-normal">
                    Aviso: A soma das margens e taxas atingiu ou superou 100% ({servMargemAlvo + sumV}%). Reduza a margem ou taxas para possibilitar o cálculo do preço.
                  </div>
                ) : (
                  <>
                    {/* Visual Breakdown bar */}
                    <div className="h-5 rounded-lg overflow-hidden flex text-[9px] font-bold text-bg border border-border-custom">
                      <div
                        className="bg-emerald-500 flex items-center justify-center"
                        style={{ width: `${precoSugerido > 0 ? (totalDirect / precoSugerido) * 100 : 0}%` }}
                        title={`Custo Direto: ${formatCurrency(totalDirect)}`}
                      >
                        {totalDirect > 0 && 'Custo'}
                      </div>
                      <div
                        className="bg-yellow-400 flex items-center justify-center text-zinc-900"
                        style={{ width: `${precoSugerido > 0 ? (lucroReais / precoSugerido) * 100 : 0}%` }}
                        title={`Lucro: ${formatCurrency(lucroReais)}`}
                      >
                        {lucroReais > 0 && 'Lucro'}
                      </div>
                      <div
                        className="bg-purple-500 flex items-center justify-center text-white"
                        style={{ width: `${precoSugerido > 0 ? (precoSugerido * (sumV / 100) / precoSugerido) * 100 : 0}%` }}
                        title={`Variáveis: ${sumV}%`}
                      >
                        {sumV > 0 && 'Taxas'}
                      </div>
                    </div>

                    {/* Cost values table breakdown */}
                    <div className="text-[11px] divide-y divide-border-custom space-y-1.5">
                      <div className="flex justify-between py-1 pt-2">
                        <span className="text-text2">Custo Direto Total:</span>
                        <span className="font-semibold text-text-custom">{formatCurrency(totalDirect)}</span>
                      </div>
                      <div className="flex justify-between py-1 text-emerald-400">
                        <span>Lucro Pretendido ({servMargemAlvo}%):</span>
                        <span className="font-bold">{formatCurrency(lucroReais)}</span>
                      </div>
                      {servVariaveis.map(v => {
                        const valReais = precoSugerido * ((Number(v.pct) || 0) / 100)
                        return (
                          <div key={v.id} className="flex justify-between py-1 text-text3">
                            <span>{v.nome} ({v.pct}%):</span>
                            <span>{formatCurrency(valReais)}</span>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Simulador Preço Alvo */}
              <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4">
                <div>
                  <h4 className="text-xs font-bold text-text-custom flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-yellow-400" />
                    <span>Simulador de Preço Alvo</span>
                  </h4>
                  <p className="text-[10px] text-text3 mt-0.5">Analise a margem real se negociar por outro preço.</p>
                </div>

                <div className="space-y-3.5 text-xs">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-text3 uppercase font-bold block">Preço de Negociação (Preço-Alvo)</label>
                    <div className="relative w-full">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text3 text-[11px] font-bold">R$</span>
                      <input
                        type="number"
                        className="w-full pl-8 pr-3 py-1.5 border border-border2 rounded bg-surface text-text-custom text-xs font-bold outline-none"
                        value={servPrecoAlvo === 0 ? '' : servPrecoAlvo}
                        onChange={(e) => {
                          const val = e.target.value === '' ? 0 : Number(e.target.value)
                          setServPrecoAlvo(val)
                          triggerSaveServices(servMargemAlvo, servVariaveis, servCustosDiretos, val)
                        }}
                      />
                    </div>
                  </div>

                  <div className="divide-y divide-border-custom space-y-2 text-[11px] pt-1">
                    <div className="flex justify-between py-1">
                      <span className="text-text2">Orçamento para Custos:</span>
                      <span className="font-semibold text-text-custom">{formatCurrency(Math.max(0, orcamentoDisponivel))}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-text2">Saldo Restante:</span>
                      <span className={`font-bold ${saldoAlvo >= 0 ? 'text-emerald-400' : 'text-red-t'}`}>
                        {formatCurrency(saldoAlvo)}
                      </span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-text2">Margem Real Resultante:</span>
                      <span className={`font-bold ${margemReal >= servMargemAlvo ? 'text-emerald-400' : margemReal > 0 ? 'text-yellow-400' : 'text-red-t'}`}>
                        {servPrecoAlvo > 0 ? `${margemReal.toFixed(1)}%` : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ==========================================
          TAB: PROVISIONAMENTO (SCENARIOS)
          ========================================== */}
      {activeSubTab === 'prov' && (
        <div className="space-y-4 animate-[fadeUp_0.15s_ease_both]">
          <div className="p-4 bg-surface border border-border-custom rounded-xl">
            <p className="text-xs font-bold text-text-custom">Provisionamento de Leads</p>
            <p className="text-xs text-text2 mt-1">
              Com base no orçamento de <strong>{f.formatCurrency((localFin || dbFin).params.verba)}</strong> e meta CPL de{' '}
              <strong>{f.formatCurrency((localFin || dbFin).params.cpl)}</strong>, a projeção é captar{' '}
              <strong>{Math.round(f.leadsProjected).toLocaleString('pt-BR')}</strong> leads.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { title: 'Cenário Baixo (Conversão: ' + ((localFin || dbFin).params.conv * 0.7).toFixed(2) + '%)', data: f.scLow, border: 'border-border-custom', bg: 'bg-surface' },
              { title: 'Cenário Esperado (Conversão: ' + (localFin || dbFin).params.conv.toFixed(2) + '%)', data: f.scMed, border: 'border-blue-custom/30', bg: 'bg-blue-bg/20' },
              { title: 'Cenário Alto (Conversão: ' + ((localFin || dbFin).params.conv * 1.3).toFixed(2) + '%)', data: f.scHigh, border: 'border-green-custom/30', bg: 'bg-green-bg/20' },
            ].map((cen, idx) => (
              <div
                key={idx}
                className={`border rounded-xl p-5 shadow-sm space-y-3.5 flex flex-col justify-between ${cen.border} ${cen.bg}`}
              >
                <h5 className="text-xs font-bold text-text-custom">{cen.title}</h5>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between border-b border-border-custom pb-1.5">
                    <span className="text-text2">Compradores</span>
                    <span className="text-text-custom font-semibold">{cen.data.buyers}</span>
                  </div>
                  <div className="flex justify-between border-b border-border-custom pb-1.5">
                    <span className="text-text2">Faturamento Bruto</span>
                    <span className="text-green-t font-semibold">{f.formatCurrency(cen.data.rev)}</span>
                  </div>
                  <div className="flex justify-between border-b border-border-custom pb-1.5">
                    <span className="text-text2">ROAS</span>
                    <span className="text-text-custom font-semibold">{cen.data.roas}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==========================================
          TAB: REALIZADO & VENDAS (OFFERS)
          ========================================== */}
      {activeSubTab === 'real' && (
        <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4 animate-[fadeUp_0.15s_ease_both]">
          <div className="flex justify-between items-center border-b border-border-custom pb-3">
            <div>
              <span className="text-xs font-bold text-text-custom block">Vendas por Oferta</span>
              <span className="text-[10px] text-text3 mt-0.5">Registro real de vendas brutas e cancelamentos</span>
            </div>
            <button
              onClick={addOffer}
              className="px-3 py-1.5 bg-text-custom text-surface hover:opacity-90 rounded text-[11px] font-semibold cursor-pointer transition-colors"
            >
              Nova Oferta
            </button>
          </div>

          <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1 scrollbar-thin">
            {(localFin || dbFin).offers.length === 0 ? (
              <p className="text-xs text-text3 text-center py-6">Nenhuma oferta registrada.</p>
            ) : (
              (localFin || dbFin).offers.map((o: Offer, idx: number) => {
                const netSales = +(o.vendas || 0) - +(o.cancel || 0)
                const rev = netSales * +(o.ticket || 0)
                return (
                  <div
                    key={idx}
                    className="p-4 bg-surface2 rounded-lg border border-border2 relative grid grid-cols-1 sm:grid-cols-6 gap-3 items-center"
                  >
                    <button
                      onClick={() => deleteOffer(idx)}
                      className="absolute right-3 top-3 text-text3 hover:text-red-t cursor-pointer"
                    >
                      ×
                    </button>

                    <div className="col-span-2">
                      <label className="text-[9px] font-bold text-text2 mb-0.5 block">Nome da Oferta</label>
                      <input
                        className="w-full px-2.5 py-1 text-xs border border-border2 rounded bg-surface text-text-custom outline-none font-semibold"
                        value={o.n}
                        onChange={(e) => updateLocalOffer(idx, 'n', e.target.value)} onBlur={handleOfferBlur}
                        placeholder="Ex: Oferta Principal"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-text2 mb-0.5 block">Ticket (R$)</label>
                      <input
                        type="number"
                        className="w-full px-2.5 py-1 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                        value={o.ticket}
                        onChange={(e) => updateLocalOffer(idx, 'ticket', e.target.value === '' ? '' : +e.target.value)} onBlur={handleOfferBlur}
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-text2 mb-0.5 block">Vendas Brutas</label>
                      <input
                        type="number"
                        className="w-full px-2.5 py-1 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                        value={o.vendas}
                        onChange={(e) => updateLocalOffer(idx, 'vendas', e.target.value === '' ? '' : +e.target.value)} onBlur={handleOfferBlur}
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-text2 mb-0.5 block">Reembolsos / Cancel</label>
                      <input
                        type="number"
                        className="w-full px-2.5 py-1 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                        value={o.cancel}
                        onChange={(e) => updateLocalOffer(idx, 'cancel', e.target.value === '' ? '' : +e.target.value)} onBlur={handleOfferBlur}
                      />
                    </div>
                    <div className="bg-surface border border-border-custom p-2 rounded text-center">
                      <div className="text-xs font-bold text-green-custom">{f.formatCurrency(rev)}</div>
                      <div className="text-[8px] text-text3 uppercase mt-0.5">Líquido</div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* ==========================================
          TAB: INVESTIMENTOS (COSTS & TRAFFIC)
          ========================================== */}
      {activeSubTab === 'inv' && (
        <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4 animate-[fadeUp_0.15s_ease_both]">
          <div className="flex justify-between items-center border-b border-border-custom pb-3">
            <div>
              <span className="text-xs font-bold text-text-custom block">Custos e Investimentos</span>
              <span className="text-[10px] text-text3 mt-0.5">Registro de despesas adicionais do lançamento</span>
            </div>
            <button
              onClick={addInvestment}
              className="px-3 py-1.5 bg-text-custom text-surface hover:opacity-90 rounded text-[11px] font-semibold cursor-pointer transition-colors"
            >
              Nova Despesa
            </button>
          </div>

          <div className="space-y-3">
            {(localFin || dbFin).investments.length === 0 ? (
              <p className="text-xs text-text3 text-center py-6">Nenhum custo registrado.</p>
            ) : (
              (localFin || dbFin).investments.map((item: Investment, idx: number) => (
                <div
                  key={idx}
                  className="flex gap-3 items-center border-b border-border-custom pb-2 last:border-none"
                >
                  <input
                    className="flex-1 px-3 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                    value={item.nome}
                    onChange={(e) => updateLocalInvestment(idx, 'nome', e.target.value)} onBlur={handleInvestmentBlur}
                    placeholder="Descrição do custo (Ex: Coprodução, Designer...)"
                  />
                  <input
                    type="number"
                    className="w-36 px-3 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                    value={item.valor}
                    onChange={(e) => updateLocalInvestment(idx, 'valor', e.target.value === '' ? '' : +e.target.value)} onBlur={handleInvestmentBlur}
                    placeholder="Valor (R$)"
                  />
                  <button
                    onClick={() => deleteInvestment(idx)}
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
          TAB: DRE
          ========================================== */}
      {activeSubTab === 'dre' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-[fadeUp_0.15s_ease_both]">
          {/* Detailed Statement */}
          <div className="md:col-span-2 bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4">
            <h4 className="text-xs font-bold text-text-custom border-b border-border-custom pb-2">
              Demonstrativo de Resultados (DRE)
            </h4>

            <div className="space-y-2 text-xs leading-normal">
              <div className="flex justify-between py-1.5 border-b border-border-custom font-semibold">
                <span>(=) FATURAMENTO BRUTO</span>
                <span className="text-green-t">{f.formatCurrency(f.fatBruto)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-custom pl-4 text-text2">
                <span>(-) Taxas de Plataformas</span>
                <span className="text-red-t">- {f.formatCurrency(f.totalTaxasPlat)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-border-custom font-semibold">
                <span>(=) RECEITA LÍQUIDA</span>
                <span>{f.formatCurrency(f.recLiquida)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-custom pl-4 text-text2">
                <span>(-) Custos Totais de Lançamento</span>
                <span className="text-red-t">- {f.formatCurrency(f.totalInvestido)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-custom pl-4 text-text2">
                <span>(-) Imposto de Venda</span>
                <span className="text-red-t">- {f.formatCurrency(f.impostoVal)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-custom pl-4 text-text2">
                <span>(-) Comissão de Coprodutor</span>
                <span className="text-red-t">- {f.formatCurrency(f.comissaoEstrategista)}</span>
              </div>
              <div className="flex justify-between py-2 border-t border-border-custom font-bold text-sm">
                <span>(=) RESULTADO LÍQUIDO GERAL</span>
                <span className={f.lucroLiquido >= 0 ? 'text-green-custom' : 'text-red-t'}>
                  {f.formatCurrency(f.lucroLiquido)}
                </span>
              </div>
            </div>
          </div>

          {/* Divisão Visual do Lucro */}
          <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4">
            <h4 className="text-xs font-bold text-text-custom border-b border-border-custom pb-2">
              Divisão de Retiradas
            </h4>

            {f.lucroLiquido > 0 ? (
              <div className="space-y-4 text-xs">
                <div>
                  <div className="flex justify-between text-text2 mb-1">
                    <span>Expert ({(localFin || dbFin).params.luc_mae}%)</span>
                    <span className="font-semibold">{f.formatCurrency(f.divExpert)}</span>
                  </div>
                  <div className="w-full bg-surface2 h-1.5 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-custom" style={{ width: `${(localFin || dbFin).params.luc_mae}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-text2 mb-1">
                    <span>Agência B16 ({(localFin || dbFin).params.luc_b16}%)</span>
                    <span className="font-semibold">{f.formatCurrency(f.divB16)}</span>
                  </div>
                  <div className="w-full bg-surface2 h-1.5 rounded-full overflow-hidden">
                    <div className="h-full bg-green-custom" style={{ width: `${(localFin || dbFin).params.luc_b16}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-text2 mb-1">
                    <span>Fundo Lançamento ({(localFin || dbFin).params.luc_fund}%)</span>
                    <span className="font-semibold">{f.formatCurrency(f.divFundo)}</span>
                  </div>
                  <div className="w-full bg-surface2 h-1.5 rounded-full overflow-hidden">
                    <div className="h-full bg-coral-custom" style={{ width: `${(localFin || dbFin).params.luc_fund}%` }} />
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-text3 text-center py-6">
                Faturamento líquido insuficiente para realizar divisões.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ==========================================
          TAB: COMISSÕES (DIVISÃO DE LUCRO CONFIG)
          ========================================== */}
      {activeSubTab === 'comm' && (
        <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4 animate-[fadeUp_0.15s_ease_both]">
          <div className="flex justify-between items-center border-b border-border-custom pb-2 flex-wrap gap-3">
            <div>
              <span className="text-xs font-bold text-text-custom block">Configuração de Divisão</span>
              <span className="text-[10px] text-text3 mt-0.5">Certifique-se de que a soma dos percentuais valida a 100%</span>
            </div>

            {/* Sum status badge */}
            <div
              className={`flex items-center gap-1 px-3 py-1.5 rounded text-[11px] font-bold ${
                isDivisionSumValid ? 'bg-green-bg text-green-t' : 'bg-red-bg text-red-t'
              }`}
            >
              {isDivisionSumValid ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Soma = 100%</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4" />
                  <span>Soma = {sumDivisions}% (Inválida)</span>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 text-xs">
            <div>
              <label className="text-[10px] font-bold text-text2 mb-1 block">Expert (%)</label>
              <input
                type="number"
                step="0.001"
                className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                value={(localFin || dbFin).params.luc_mae}
                onChange={(e) => updateLocalSubField('params', 'luc_mae', e.target.value === '' ? '' : +e.target.value)} onBlur={handleFinBlur}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-text2 mb-1 block">Agência B16 (%)</label>
              <input
                type="number"
                step="0.001"
                className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                value={(localFin || dbFin).params.luc_b16}
                onChange={(e) => updateLocalSubField('params', 'luc_b16', e.target.value === '' ? '' : +e.target.value)} onBlur={handleFinBlur}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-text2 mb-1 block">Fundo Caixa (%)</label>
              <input
                type="number"
                step="0.001"
                className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                value={(localFin || dbFin).params.luc_fund}
                onChange={(e) => updateLocalSubField('params', 'luc_fund', e.target.value === '' ? '' : +e.target.value)} onBlur={handleFinBlur}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
