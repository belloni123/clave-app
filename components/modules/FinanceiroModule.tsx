'use client'

import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/utils/supabase/client'
import { useAppStore } from '@/store/useAppStore'
import { Trash, AlertTriangle, Check } from 'lucide-react'

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

  const [activeSubTab, setActiveSubTab] = useState<'brief' | 'params' | 'prov' | 'real' | 'inv' | 'dre' | 'comm'>('brief')

  // Local state for typing optimization
  const [localFin, setLocalFin] = useState<FinancialDataPayload | null>(null)

  // Clear local state when project changes
  useEffect(() => {
    const timer = setTimeout(() => {
      setLocalFin(null)
    }, 0)
    return () => clearTimeout(timer)
  }, [activeProjectId])

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
              className="px-3 py-1.5 bg-text-custom text-white hover:opacity-90 rounded text-[11px] font-semibold cursor-pointer transition-colors"
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
              className="px-3 py-1.5 bg-text-custom text-white hover:opacity-90 rounded text-[11px] font-semibold cursor-pointer transition-colors"
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
