'use client'

import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/utils/supabase/client'
import { useAppStore } from '@/store/useAppStore'
import { Plus, X } from 'lucide-react'

// AD PLATFORMS & STATUS OPTIONS
const PLATFORMS = ['Facebook Ads', 'Instagram Ads', 'Google Ads', 'YouTube Ads']
const AD_STATUS = ['rascunho', 'ativo', 'pausado', 'encerrado']

interface Ad {
  id: string
  project_id: string
  name: string
  platform: string
  status: 'rascunho' | 'ativo' | 'pausado' | 'encerrado'
  invested: number
  revenue: number
  leads: number
  sales: number
  notes: string
}



export default function ValidacaoModule() {
  const queryClient = useQueryClient()
  const supabase = createClient()
  const { activeProjectId, showToast } = useAppStore()

  // Search & Filter local states
  const [adFilter, setAdFilter] = useState<string>('todos')

  // Modal local states (Ad)
  const [adModalOpen, setAdModalOpen] = useState(false)
  const [editAdId, setEditAdId] = useState<string | null>(null)
  const [adName, setAdName] = useState('')
  const [adPlatform, setAdPlatform] = useState(PLATFORMS[0])
  const [adStatus, setAdStatus] = useState<Ad['status']>('rascunho')
  const [adInvested, setAdInvested] = useState(0)
  const [adRevenue, setAdRevenue] = useState(0)
  const [adLeads, setAdLeads] = useState(0)
  const [adSales, setAdSales] = useState(0)
  const [adNotes, setAdNotes] = useState('')

  // ==========================================
  // 1. SUB-TAB: CENTRAL DE ANÚNCIOS (SUPABASE)
  // ==========================================
  const { data: adsList } = useQuery({
    queryKey: ['ads', activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return []
      const { data, error } = await supabase
        .from('ads')
        .select('*')
        .eq('project_id', activeProjectId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (error) {
        showToast('Erro ao carregar anúncios', 'err')
        return []
      }
      return data as Ad[]
    },
    enabled: !!activeProjectId,
  })

  const saveAdMutation = useMutation({
    mutationFn: async (payload: Partial<Ad>) => {
      if (!activeProjectId) return
      if (payload.id) {
        // update
        const { error } = await supabase
          .from('ads')
          .update(payload)
          .eq('id', payload.id)
        if (error) throw error
      } else {
        // insert
        const { error } = await supabase
          .from('ads')
          .insert({ ...payload, project_id: activeProjectId })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ads', activeProjectId] })
      showToast(editAdId ? 'Anúncio atualizado' : 'Anúncio criado')
      closeAdModal()
    },
    onError: () => {
      showToast('Erro ao salvar anúncio', 'err')
    },
  })

  const deleteAdMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ads')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ads', activeProjectId] })
      showToast('Anúncio excluído')
      closeAdModal()
    },
    onError: () => {
      showToast('Erro ao excluir anúncio', 'err')
    },
  })

  const openAdModal = (ad?: Ad) => {
    if (ad) {
      setEditAdId(ad.id)
      setAdName(ad.name)
      setAdPlatform(ad.platform)
      setAdStatus(ad.status)
      setAdInvested(ad.invested)
      setAdRevenue(ad.revenue)
      setAdLeads(ad.leads)
      setAdSales(ad.sales)
      setAdNotes(ad.notes || '')
    } else {
      setEditAdId(null)
      setAdName('')
      setAdPlatform(PLATFORMS[0])
      setAdStatus('rascunho')
      setAdInvested(0)
      setAdRevenue(0)
      setAdLeads(0)
      setAdSales(0)
      setAdNotes('')
    }
    setAdModalOpen(true)
  }

  const closeAdModal = () => {
    setAdModalOpen(false)
    setEditAdId(null)
  }

  const handleSaveAd = () => {
    if (!adName.trim()) return
    const payload: Partial<Ad> = {
      name: adName.trim(),
      platform: adPlatform,
      status: adStatus,
      invested: adInvested,
      revenue: adRevenue,
      leads: adLeads,
      sales: adSales,
      notes: adNotes,
    }
    if (editAdId) payload.id = editAdId
    saveAdMutation.mutate(payload)
  }

  const handleDeleteAd = () => {
    if (!editAdId) return
    if (confirm('Deseja excluir este anúncio permanentemente?')) {
      deleteAdMutation.mutate(editAdId)
    }
  }

  // Filtragem e totalizadores de anúncios
  const filteredAds = (adsList || []).filter(
    (a) => adFilter === 'todos' || a.status === adFilter
  )

  const activeAdsCount = (adsList || []).filter((a) => a.status === 'ativo').length
  const totalInvested = (adsList || []).reduce((sum, a) => sum + (+a.invested || 0), 0)
  const totalRevenue = (adsList || []).reduce((sum, a) => sum + (+a.revenue || 0), 0)
  const avgRoas = totalInvested > 0 ? (totalRevenue / totalInvested).toFixed(2) + 'x' : '—'



  return (
    <div className="space-y-6">
      {/* ==========================================
          TAB: CENTRAL DE ANÚNCIOS
          ========================================== */}
      <div className="space-y-6 animate-[fadeUp_0.15s_ease_both]">
          {/* Ad Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-surface border border-border-custom rounded-xl p-4 text-center">
              <span className="text-[10px] font-bold text-text3 block uppercase">Anúncios</span>
              <span className="text-xl font-bold text-text-custom mt-1 block">{adsList?.length || 0}</span>
            </div>
            <div className="bg-surface border border-border-custom rounded-xl p-4 text-center">
              <span className="text-[10px] font-bold text-text3 block uppercase">Ativos</span>
              <span className="text-xl font-bold text-text-custom mt-1 block">{activeAdsCount}</span>
            </div>
            <div className="bg-surface border border-border-custom rounded-xl p-4 text-center">
              <span className="text-[10px] font-bold text-text3 block uppercase">Investido</span>
              <span className="text-xl font-bold text-text-custom mt-1 block">
                R$ {Math.round(totalInvested).toLocaleString('pt-BR')}
              </span>
            </div>
            <div className="bg-surface border border-border-custom rounded-xl p-4 text-center">
              <span className="text-[10px] font-bold text-text3 block uppercase">Média ROAS</span>
              <span className="text-xl font-bold text-green-custom mt-1 block">{avgRoas}</span>
            </div>
          </div>

          {/* Filters & Add Button */}
          <div className="flex justify-between items-center bg-surface border border-border-custom rounded-xl p-3.5 shadow-sm flex-wrap gap-3">
            <div className="flex gap-2 text-xs flex-wrap">
              {['todos', 'ativo', 'pausado', 'rascunho', 'encerrado'].map((status) => (
                <button
                  key={status}
                  onClick={() => setAdFilter(status)}
                  className={`px-3 py-1.5 rounded-full border cursor-pointer capitalize transition-all ${
                    adFilter === status
                      ? 'bg-text-custom text-surface border-text-custom'
                      : 'border-border2 text-text2 hover:text-text-custom hover:bg-surface2'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>

            <button
              onClick={() => openAdModal()}
              className="px-3.5 py-2 bg-text-custom text-surface hover:opacity-90 rounded text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>Novo Anúncio</span>
            </button>
          </div>

          {/* Ads Cards list */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredAds.length === 0 ? (
              <div className="col-span-2 py-10 bg-surface border border-border-custom rounded-xl text-center text-text3 text-xs">
                Nenhum criativo cadastrado neste status.
              </div>
            ) : (
              filteredAds.map((ad) => {
                const colors = {
                  ativo: 'bg-green-bg/30 text-green-t',
                  pausado: 'bg-gray-bg/40 text-gray-t',
                  rascunho: 'bg-amber-bg/30 text-amber-t',
                  encerrado: 'bg-red-bg/30 text-red-t',
                }
                const roasVal = ad.invested > 0 ? (ad.revenue / ad.invested).toFixed(2) + 'x' : '—'
                const cpaVal = ad.sales > 0 ? Math.round(ad.invested / ad.sales) : 0
                const cplVal = ad.leads > 0 ? (ad.invested / ad.leads).toFixed(2) : '0.00'
                const convVal = ad.leads > 0 ? ((ad.sales / ad.leads) * 100).toFixed(1) + '%' : '—'

                return (
                  <div
                    key={ad.id}
                    className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm flex flex-col justify-between"
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h5 className="text-xs font-bold text-text-custom leading-tight">{ad.name}</h5>
                          <span
                            className={`text-[9px] px-2 py-0.5 rounded font-semibold capitalize ${
                              colors[ad.status]
                            }`}
                          >
                            {ad.status}
                          </span>
                          <span className="text-[9px] px-2 py-0.5 rounded bg-surface2 text-text2 border border-border-custom font-medium">
                            {ad.platform}
                          </span>
                        </div>
                        {ad.notes && (
                          <p className="text-[11px] text-text2 mt-2 leading-relaxed italic">
                            &quot;{ad.notes}&quot;
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => openAdModal(ad)}
                        className="px-2.5 py-1.5 border border-border2 text-[10px] text-text-custom hover:bg-surface2 rounded cursor-pointer shrink-0 transition-colors"
                      >
                        Editar
                      </button>
                    </div>

                    <div className="grid grid-cols-5 gap-1.5 mt-5">
                      <div className="bg-surface2 p-1.5 rounded text-center">
                        <div className="text-[11px] font-bold text-green-custom">
                          R$ {Math.round(ad.revenue).toLocaleString('pt-BR')}
                        </div>
                        <div className="text-[8px] text-text3 uppercase mt-0.5">Receita</div>
                      </div>
                      <div className="bg-surface2 p-1.5 rounded text-center">
                        <div className="text-[11px] font-bold text-text-custom">{roasVal}</div>
                        <div className="text-[8px] text-text3 uppercase mt-0.5">ROAS</div>
                      </div>
                      <div className="bg-surface2 p-1.5 rounded text-center">
                        <div className="text-[11px] font-bold text-text-custom">
                          {cpaVal > 0 ? `R$ ${cpaVal}` : '—'}
                        </div>
                        <div className="text-[8px] text-text3 uppercase mt-0.5">CPA</div>
                      </div>
                      <div className="bg-surface2 p-1.5 rounded text-center">
                        <div className="text-[11px] font-bold text-text-custom">R$ {cplVal}</div>
                        <div className="text-[8px] text-text3 uppercase mt-0.5">CPL</div>
                      </div>
                      <div className="bg-surface2 p-1.5 rounded text-center">
                        <div className="text-[11px] font-bold text-text-custom">{convVal}</div>
                        <div className="text-[8px] text-text3 uppercase mt-0.5">Conv.</div>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Modal Adicionar/Editar Criativo */}
          {adModalOpen && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] animate-[fadeUp_0.15s_ease_both]">
              <div className="bg-surface rounded-xl p-5 w-full max-w-[420px] shadow-2xl border border-border2">
                <div className="flex justify-between items-center mb-4 border-b border-border-custom pb-2">
                  <p className="text-sm font-semibold text-text-custom">
                    {editAdId ? 'Editar anúncio' : 'Novo anúncio'}
                  </p>
                  <button
                    onClick={closeAdModal}
                    className="text-text3 hover:text-text-custom cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold text-text2 mb-1 block">Nome do Anúncio</label>
                    <input
                      className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom"
                      value={adName}
                      onChange={(e) => setAdName(e.target.value)}
                      placeholder="Ex: Criativo VSL - Hook 3"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-text2 mb-1 block">Plataforma</label>
                    <select
                      className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                      value={adPlatform}
                      onChange={(e) => setAdPlatform(e.target.value)}
                    >
                      {PLATFORMS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-text2 mb-1 block">Status</label>
                    <select
                      className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                      value={adStatus}
                      onChange={(e) => setAdStatus(e.target.value as Ad['status'])}
                    >
                      {AD_STATUS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-text2 mb-1 block">Investido (R$)</label>
                    <input
                      type="number"
                      className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                      value={adInvested}
                      onChange={(e) => setAdInvested(+e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-text2 mb-1 block">Receita (R$)</label>
                    <input
                      type="number"
                      className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                      value={adRevenue}
                      onChange={(e) => setAdRevenue(+e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-text2 mb-1 block">Leads Gerados</label>
                    <input
                      type="number"
                      className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                      value={adLeads}
                      onChange={(e) => setAdLeads(+e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-text2 mb-1 block">Vendas</label>
                    <input
                      type="number"
                      className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                      value={adSales}
                      onChange={(e) => setAdSales(+e.target.value)}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold text-text2 mb-1 block">Notas do Criativo</label>
                    <textarea
                      className="w-full px-3 py-2 border border-border2 rounded bg-surface text-text-custom outline-none h-14"
                      value={adNotes}
                      onChange={(e) => setAdNotes(e.target.value)}
                      placeholder="Identificação do público, link do Drive, etc."
                    />
                  </div>
                </div>

                <div className="flex justify-between items-center gap-2 mt-6">
                  {editAdId && (
                    <button
                      onClick={handleDeleteAd}
                      className="px-3 py-2 border border-red-t/30 text-red-t rounded text-xs hover:bg-red-bg transition-colors cursor-pointer"
                    >
                      Excluir
                    </button>
                  )}
                  <div className="flex gap-2 ml-auto">
                    <button
                      onClick={closeAdModal}
                      className="px-3 py-2 border border-border2 rounded text-xs hover:bg-surface2 text-text2 transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSaveAd}
                      className="px-4 py-2 bg-text-custom text-surface rounded text-xs font-semibold hover:opacity-90 transition-colors cursor-pointer"
                    >
                      Salvar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
      </div>
    </div>
  )
}
