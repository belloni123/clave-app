'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/utils/supabase/client'
import { useAppStore } from '@/store/useAppStore'
import { Plus, Trash, Search, CheckSquare, Square, X } from 'lucide-react'

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

interface NetworkContact {
  nm: string // nome
  tp: 'Produtor' | 'Especialista' | 'Afiliado' | 'Parceiro' // tipo
  ni: string // nicho
  ig: string // instagram
  ob: string // observações/como colaborar
}

interface SubTask {
  t: string // text
  d: boolean // done
}

interface SubProject {
  id: string
  nm: string // nome
  st: 'planejado' | 'em andamento' | 'concluido' // status
  prazo: string // prazo
  tasks: SubTask[]
}

export default function ValidacaoModule() {
  const queryClient = useQueryClient()
  const supabase = createClient()
  const { activeProjectId, showToast } = useAppStore()

  const [activeSubTab, setActiveSubTab] = useState<'ads' | 'net' | 'pjs'>('ads')

  // Search & Filter local states
  const [adFilter, setAdFilter] = useState<string>('todos')
  const [netSearch, setNetSearch] = useState('')
  const [netFilter, setNetFilter] = useState('')

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

  // ==========================================
  // 2. SUB-TAB: NETWORKING DIRECTORY (TEXT_FIELDS)
  // ==========================================
  const { data: contactsData } = useQuery({
    queryKey: ['networking_contacts', activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return []
      const { data, error } = await supabase
        .from('text_fields')
        .select('*')
        .eq('project_id', activeProjectId)
        .eq('key', 'networking_contacts')
        .maybeSingle()

      if (error) {
        showToast('Erro ao carregar contatos de networking', 'err')
        return []
      }
      return data ? (JSON.parse(data.value) as NetworkContact[]) : []
    },
    enabled: !!activeProjectId,
  })

  const saveContactsMutation = useMutation({
    mutationFn: async (list: NetworkContact[]) => {
      if (!activeProjectId) return
      const serialized = JSON.stringify(list)
      const { data: existing } = await supabase
        .from('text_fields')
        .select('id')
        .eq('project_id', activeProjectId)
        .eq('key', 'networking_contacts')
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
          .insert({ project_id: activeProjectId, key: 'networking_contacts', value: serialized })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['networking_contacts', activeProjectId] })
    },
  })

  const addContact = () => {
    if (!contactsData) return
    const list = [...contactsData, { nm: '', tp: 'Produtor' as const, ni: '', ig: '', ob: '' }]
    saveContactsMutation.mutate(list)
  }

  const updateContact = (idx: number, key: keyof NetworkContact, val: string) => {
    if (!contactsData) return
    const list = [...contactsData]
    list[idx] = { ...list[idx], [key]: val } as NetworkContact
    saveContactsMutation.mutate(list)
  }

  const deleteContact = (idx: number) => {
    if (!contactsData) return
    const list = contactsData.filter((_, i) => i !== idx)
    saveContactsMutation.mutate(list)
    showToast('Contato removido')
  }

  const filteredContacts = (contactsData || []).filter((c) => {
    const query = netSearch.toLowerCase()
    const matchesSearch =
      !query || c.nm.toLowerCase().includes(query) || c.ni.toLowerCase().includes(query)
    const matchesFilter = !netFilter || c.tp === netFilter
    return matchesSearch && matchesFilter
  })

  // ==========================================
  // 3. SUB-TAB: PROJETOS / SUB-PROJETOS (TEXT_FIELDS)
  // ==========================================
  const { data: subProjects } = useQuery({
    queryKey: ['sub_projects', activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return []
      const { data, error } = await supabase
        .from('text_fields')
        .select('*')
        .eq('project_id', activeProjectId)
        .eq('key', 'sub_projects')
        .maybeSingle()

      if (error) {
        showToast('Erro ao carregar projetos de validação', 'err')
        return []
      }
      return data ? (JSON.parse(data.value) as SubProject[]) : []
    },
    enabled: !!activeProjectId,
  })

  const saveSubProjectsMutation = useMutation({
    mutationFn: async (list: SubProject[]) => {
      if (!activeProjectId) return
      const serialized = JSON.stringify(list)
      const { data: existing } = await supabase
        .from('text_fields')
        .select('id')
        .eq('project_id', activeProjectId)
        .eq('key', 'sub_projects')
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
          .insert({ project_id: activeProjectId, key: 'sub_projects', value: serialized })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sub_projects', activeProjectId] })
    },
  })

  const addSubProject = () => {
    if (!subProjects) return
    const list: SubProject[] = [
      ...subProjects,
      {
        id: 'sp_' + Date.now(),
        nm: '',
        st: 'planejado',
        prazo: '',
        tasks: [],
      },
    ]
    saveSubProjectsMutation.mutate(list)
  }

  const updateSubProject = (idx: number, key: keyof SubProject, val: SubProject[keyof SubProject]) => {
    if (!subProjects) return
    const list = [...subProjects]
    list[idx] = { ...list[idx], [key]: val } as SubProject
    saveSubProjectsMutation.mutate(list)
  }

  const deleteSubProject = (idx: number) => {
    if (!subProjects) return
    const list = subProjects.filter((_, i) => i !== idx)
    saveSubProjectsMutation.mutate(list)
    showToast('Sub-projeto removido')
  }

  const toggleSubTask = (pIdx: number, tIdx: number) => {
    if (!subProjects) return
    const list = [...subProjects]
    const proj = { ...list[pIdx] }
    const tasks = [...proj.tasks]
    tasks[tIdx] = { ...tasks[tIdx], d: !tasks[tIdx].d }
    proj.tasks = tasks
    list[pIdx] = proj
    saveSubProjectsMutation.mutate(list)
  }

  const addSubTask = (pIdx: number, text: string) => {
    if (!text.trim() || !subProjects) return
    const list = [...subProjects]
    const proj = { ...list[pIdx] }
    proj.tasks = [...proj.tasks, { t: text.trim(), d: false }]
    list[pIdx] = proj
    saveSubProjectsMutation.mutate(list)
  }

  const removeSubTask = (pIdx: number, tIdx: number) => {
    if (!subProjects) return
    const list = [...subProjects]
    const proj = { ...list[pIdx] }
    proj.tasks = proj.tasks.filter((_, i) => i !== tIdx)
    list[pIdx] = proj
    saveSubProjectsMutation.mutate(list)
  }

  return (
    <div className="space-y-6">
      {/* Subtabs header */}
      <div className="flex gap-1 border-b border-border-custom flex-wrap mb-4">
        <button
          onClick={() => setActiveSubTab('ads')}
          className={`px-4 py-2 text-xs font-semibold cursor-pointer border-b-2 bg-transparent transition-colors duration-150 ${
            activeSubTab === 'ads'
              ? 'border-text-custom text-text-custom'
              : 'border-transparent text-text2 hover:text-text-custom'
          }`}
        >
          Central de anúncios
        </button>
        <button
          onClick={() => setActiveSubTab('net')}
          className={`px-4 py-2 text-xs font-semibold cursor-pointer border-b-2 bg-transparent transition-colors duration-150 ${
            activeSubTab === 'net'
              ? 'border-text-custom text-text-custom'
              : 'border-transparent text-text2 hover:text-text-custom'
          }`}
        >
          Networking
        </button>
        <button
          onClick={() => setActiveSubTab('pjs')}
          className={`px-4 py-2 text-xs font-semibold cursor-pointer border-b-2 bg-transparent transition-colors duration-150 ${
            activeSubTab === 'pjs'
              ? 'border-text-custom text-text-custom'
              : 'border-transparent text-text2 hover:text-text-custom'
          }`}
        >
          Projetos
        </button>
      </div>

      {/* ==========================================
          TAB: CENTRAL DE ANÚNCIOS
          ========================================== */}
      {activeSubTab === 'ads' && (
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
                      ? 'bg-text-custom text-white border-text-custom'
                      : 'border-border2 text-text2 hover:text-text-custom hover:bg-surface2'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>

            <button
              onClick={() => openAdModal()}
              className="px-3.5 py-2 bg-text-custom text-white hover:opacity-90 rounded text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
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
                      className="px-4 py-2 bg-text-custom text-white rounded text-xs font-semibold hover:opacity-90 transition-colors cursor-pointer"
                    >
                      Salvar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==========================================
          TAB: NETWORKING DIRECTORY
          ========================================== */}
      {activeSubTab === 'net' && contactsData && (
        <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4 animate-[fadeUp_0.15s_ease_both]">
          {/* Header Search & Filter */}
          <div className="flex justify-between items-center border-b border-border-custom pb-3 flex-wrap gap-3">
            <div className="flex gap-2 flex-1 max-w-lg min-w-[200px]">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text3" />
                <input
                  className="w-full pl-9 pr-3 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom"
                  value={netSearch}
                  onChange={(e) => setNetSearch(e.target.value)}
                  placeholder="Pesquisar por nome ou nicho..."
                />
              </div>

              <select
                className="px-3 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                value={netFilter}
                onChange={(e) => setNetFilter(e.target.value)}
              >
                <option value="">Todos Tipos</option>
                <option value="Produtor">Produtor</option>
                <option value="Especialista">Especialista</option>
                <option value="Afiliado">Afiliado</option>
                <option value="Parceiro">Parceiro</option>
              </select>
            </div>

            <button
              onClick={addContact}
              className="px-3 py-1.5 bg-text-custom text-white hover:opacity-90 rounded text-[11px] font-semibold cursor-pointer transition-colors"
            >
              Adicionar Contato
            </button>
          </div>

          {/* Contacts Directory */}
          <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1 scrollbar-thin">
            {filteredContacts.length === 0 ? (
              <p className="text-xs text-text3 text-center py-6">Nenhum contato encontrado.</p>
            ) : (
              filteredContacts.map((c, idx) => (
                <div
                  key={idx}
                  className="p-4 bg-surface2 rounded-lg border border-border2 flex flex-col md:flex-row gap-3 items-center justify-between"
                >
                  <div className="flex flex-col sm:flex-row gap-3 items-center flex-1 w-full">
                    <input
                      className="w-full sm:flex-1 px-3 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom outline-none font-semibold"
                      value={c.nm}
                      onChange={(e) => updateContact(idx, 'nm', e.target.value)}
                      placeholder="Nome do Contato"
                    />

                    <select
                      className="w-full sm:w-32 px-3 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                      value={c.tp}
                      onChange={(e) => updateContact(idx, 'tp', e.target.value)}
                    >
                      <option value="Produtor">Produtor</option>
                      <option value="Especialista">Especialista</option>
                      <option value="Afiliado">Afiliado</option>
                      <option value="Parceiro">Parceiro</option>
                    </select>

                    <input
                      className="w-full sm:w-32 px-3 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                      value={c.ni}
                      onChange={(e) => updateContact(idx, 'ni', e.target.value)}
                      placeholder="Nicho de atuação"
                    />

                    <input
                      className="w-full sm:w-36 px-3 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom font-mono outline-none"
                      value={c.ig}
                      onChange={(e) => updateContact(idx, 'ig', e.target.value)}
                      placeholder="@instagram"
                    />
                  </div>

                  <div className="flex gap-2 items-center w-full md:w-auto mt-2 md:mt-0">
                    <input
                      className="flex-1 md:w-56 px-3 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                      value={c.ob}
                      onChange={(e) => updateContact(idx, 'ob', e.target.value)}
                      placeholder="Oportunidade / Notas"
                    />

                    <button
                      onClick={() => deleteContact(idx)}
                      className="p-1.5 border border-red-t/30 text-red-t hover:bg-red-bg rounded transition-colors shrink-0 cursor-pointer"
                    >
                      <Trash className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ==========================================
          TAB: PROJETOS / TAREFAS INTERNAS
          ========================================== */}
      {activeSubTab === 'pjs' && subProjects && (
        <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4 animate-[fadeUp_0.15s_ease_both]">
          <div className="flex justify-between items-center border-b border-border-custom pb-3">
            <div>
              <span className="text-xs font-bold text-text-custom block">Checklist de Projetos de Validação</span>
              <span className="text-[10px] text-text3 mt-0.5">Organização de etapas e mini-projetos internos</span>
            </div>
            <button
              onClick={addSubProject}
              className="px-3 py-1.5 bg-text-custom text-white hover:opacity-90 rounded text-[11px] font-semibold cursor-pointer transition-colors"
            >
              Adicionar Projeto
            </button>
          </div>

          <div className="space-y-6 max-h-[460px] overflow-y-auto pr-1 scrollbar-thin">
            {subProjects.length === 0 ? (
              <p className="text-xs text-text3 text-center py-6">Nenhum projeto cadastrado.</p>
            ) : (
              subProjects.map((p, pIdx) => {
                const totalTasks = p.tasks.length
                const completedTasks = p.tasks.filter((t) => t.d).length
                const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

                return (
                  <div key={p.id} className="p-4 bg-surface2 rounded-lg border border-border2 space-y-3 relative">
                    <button
                      onClick={() => deleteSubProject(pIdx)}
                      className="absolute right-3 top-3 text-text3 hover:text-red-t cursor-pointer"
                    >
                      ×
                    </button>

                    {/* Project Header Row */}
                    <div className="flex flex-col sm:flex-row gap-3 items-center max-w-[580px]">
                      <input
                        className="w-full sm:flex-1 px-2.5 py-1 text-xs border border-border2 rounded bg-surface text-text-custom outline-none font-bold"
                        value={p.nm}
                        onChange={(e) => updateSubProject(pIdx, 'nm', e.target.value)}
                        placeholder="Nome do Sub-projeto"
                      />
                      <select
                        className="w-full sm:w-32 px-2.5 py-1 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                        value={p.st}
                        onChange={(e) => updateSubProject(pIdx, 'st', e.target.value)}
                      >
                        <option value="planejado">Planejado</option>
                        <option value="em andamento">Em Andamento</option>
                        <option value="concluido">Concluído</option>
                      </select>
                      <input
                        type="date"
                        className="w-full sm:w-36 px-2.5 py-1 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                        value={p.prazo}
                        onChange={(e) => updateSubProject(pIdx, 'prazo', e.target.value)}
                      />
                    </div>

                    {/* Progress details */}
                    {totalTasks > 0 && (
                      <div className="space-y-1 w-full max-w-[280px]">
                        <div className="flex justify-between text-[9px] text-text2 font-semibold">
                          <span>{progressPct}% das tarefas feitas</span>
                          <span>{completedTasks}/{totalTasks}</span>
                        </div>
                        <div className="w-full h-1 bg-surface rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-custom rounded-full transition-all duration-300"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Tasks checklist inside project */}
                    <div className="pl-4 space-y-2 border-l border-border2 mt-3">
                      {p.tasks.map((task, tIdx) => (
                        <div key={tIdx} className="flex items-center justify-between gap-3 max-w-[480px]">
                          <div
                            onClick={() => toggleSubTask(pIdx, tIdx)}
                            className="flex items-center gap-2 cursor-pointer flex-1 min-w-0"
                          >
                            {task.d ? (
                              <CheckSquare className="w-4 h-4 text-green-custom shrink-0" />
                            ) : (
                              <Square className="w-4 h-4 text-text3 shrink-0" />
                            )}
                            <span className={`text-xs text-text-custom truncate ${task.d ? 'line-through text-text3' : ''}`}>
                              {task.t}
                            </span>
                          </div>
                          <button
                            onClick={() => removeSubTask(pIdx, tIdx)}
                            className="text-text3 hover:text-red-t text-[10px] font-semibold hover:underline cursor-pointer shrink-0"
                          >
                            Excluir
                          </button>
                        </div>
                      ))}

                      {/* Add new subtask inline */}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault()
                          const form = e.currentTarget
                          const input = form.elements.namedItem('taskText') as HTMLInputElement
                          addSubTask(pIdx, input.value)
                          form.reset()
                        }}
                        className="flex gap-2 max-w-[360px] mt-2"
                      >
                        <input
                          name="taskText"
                          className="flex-1 px-2.5 py-1 text-[11px] border border-border2 rounded bg-surface text-text-custom outline-none"
                          placeholder="Nova tarefa..."
                        />
                        <button
                          type="submit"
                          className="px-3 py-1 bg-text-custom text-white hover:opacity-90 rounded text-[10px] font-semibold cursor-pointer"
                        >
                          + Add
                        </button>
                      </form>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
