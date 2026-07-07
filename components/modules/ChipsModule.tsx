'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/utils/supabase/client'
import { useAppStore } from '@/store/useAppStore'
import { 
  Smartphone, Plus, Search, Trash2, Archive, History, 
  AlertTriangle, CheckCircle2, ShieldAlert, Cpu, 
  DollarSign, Activity, FileText, Lock, X, Edit2,
  Eye, EyeOff
} from 'lucide-react'

interface HistEntry {
  data: string
  evento: string
  obs: string
}

interface Chip {
  id: string
  project_id: string
  id_chip: number | null
  numero: string
  operadora: string
  funcao: string | null
  responsavel: string | null
  status: 'Ativo' | 'Ativo sem uso' | 'Bloqueado' | 'Quarentena' | 'Perdeu número'
  arquivado: boolean
  ultima_recarga: string | null
  periodicidade: number
  valor: number | null
  senha_whatsapp: string | null
  senha_app: string | null
  aparelho: string | null
  obs: string | null
  historico: HistEntry[]
  criado_em: string
  atualizado_em: string
}

export default function ChipsModule() {
  const queryClient = useQueryClient()
  const supabase = createClient()
  const { activeProjectId, showToast } = useAppStore()

  // State controls
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [hideNumbers, setHideNumbers] = useState(false)

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isHistModalOpen, setIsHistModalOpen] = useState(false)
  const [selectedChip, setSelectedChip] = useState<Chip | null>(null)

  // Form states (Chip creation/editing)
  const [fIdChip, setFIdChip] = useState('')
  const [fNumero, setFNumero] = useState('')
  const [fOperadora, setFOperadora] = useState('Vivo')
  const [fFuncao, setFFuncao] = useState('')
  const [fResponsavel, setFResponsavel] = useState('')
  const [fStatus, setFStatus] = useState<'Ativo' | 'Ativo sem uso' | 'Bloqueado' | 'Quarentena' | 'Perdeu número'>('Ativo')
  const [fUltRecarga, setFUltRecarga] = useState('')
  const [fPeriodicidade, setFPeriodicidade] = useState('60')
  const [fValor, setFValor] = useState('')
  const [fSenhaWhatsapp, setFSenhaWhatsapp] = useState('')
  const [fSenhaApp, setFSenhaApp] = useState('')
  const [fAparelho, setFAparelho] = useState('')
  const [fObs, setFObs] = useState('')

  // Form states (History log)
  const [hData, setHData] = useState(new Date().toISOString().slice(0, 10))
  const [hEvento, setHEvento] = useState('Observação')
  const [hObs, setHObs] = useState('')

  // 1. CARREGAR CHIPS
  const { data: chips = [], isLoading } = useQuery<Chip[]>({
    queryKey: ['chips', activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return []
      const { data, error } = await supabase
        .from('chips')
        .select('*')
        .eq('project_id', activeProjectId)
      if (error) {
        showToast('Erro ao carregar chips', 'err')
        throw error
      }
      return data as Chip[]
    },
    enabled: !!activeProjectId,
  })

  // 2. MUTATIONS
  const saveChipMutation = useMutation({
    mutationFn: async (chipData: Partial<Chip>) => {
      if (!activeProjectId) return
      if (chipData.id) {
        // Edit existing chip
        const { error } = await supabase
          .from('chips')
          .update({
            ...chipData,
            atualizado_em: new Date().toISOString()
          })
          .eq('id', chipData.id)
        if (error) throw error
      } else {
        // Create new chip
        const { error } = await supabase
          .from('chips')
          .insert({
            ...chipData,
            project_id: activeProjectId,
            historico: [{
              data: new Date().toISOString().slice(0, 10),
              evento: chipData.status || 'Ativo',
              obs: 'Registro inicial do chip no sistema'
            }]
          })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chips', activeProjectId] })
      showToast(selectedChip ? 'Chip atualizado com sucesso' : 'Chip criado com sucesso')
      closeModal()
    },
    onError: (err) => {
      showToast('Erro ao salvar chip: ' + err.message, 'err')
    }
  })

  const archiveChipMutation = useMutation({
    mutationFn: async ({ id, arquivado }: { id: string; arquivado: boolean }) => {
      const { error } = await supabase
        .from('chips')
        .update({ arquivado, atualizado_em: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['chips', activeProjectId] })
      showToast(variables.arquivado ? 'Chip arquivado' : 'Chip desarquivado')
    },
  })

  const deleteChipMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('chips')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chips', activeProjectId] })
      showToast('Chip excluído permanentemente')
    },
  })

  const addHistMutation = useMutation({
    mutationFn: async ({ chip, entry }: { chip: Chip; entry: HistEntry }) => {
      const newHistory = [...chip.historico, entry]
      // Se for alteração de status, atualiza o status do chip também
      const updateData: Partial<Chip> = {
        historico: newHistory,
        atualizado_em: new Date().toISOString()
      }
      const statusEvents = ['Ativo', 'Ativo sem uso', 'Bloqueado', 'Quarentena', 'Perdeu número']
      if (statusEvents.includes(entry.evento)) {
        updateData.status = entry.evento as Chip['status']
      }
      if (entry.evento === 'Recarga confirmada') {
        updateData.ultima_recarga = entry.data
      }

      const { error } = await supabase
        .from('chips')
        .update(updateData)
        .eq('id', chip.id)
      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['chips', activeProjectId] })
      showToast('Evento registrado com sucesso')
      setHObs('')
      // Update local hist modal content
      const updated = chips.find(c => c.id === variables.chip.id)
      if (updated) setSelectedChip(updated)
      closeHistorico()
    },
    onError: (err) => {
      showToast('Erro ao registrar histórico: ' + err.message, 'err')
    }
  })

  // Help functions
  const diasAteVencer = (chip: Chip) => {
    if (!chip.ultima_recarga || !chip.periodicidade) return null
    const prox = new Date(chip.ultima_recarga)
    prox.setDate(prox.setDate(prox.getDate()) + Number(chip.periodicidade))
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const diffTime = prox.getTime() - hoje.getTime()
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))
    return { prox, dias: diffDays }
  }

  const getAlerta = (chip: Chip) => {
    if (chip.status === 'Bloqueado') return { text: '🔴 Trocar chip', cls: 'bg-red-500/10 text-red-500 border border-red-500/20' }
    if (chip.status === 'Quarentena') return { text: '🟠 Em quarentena', cls: 'bg-purple-500/10 text-purple-400 border border-purple-500/20' }
    if (chip.status === 'Perdeu número') return { text: '⚪ Repor número', cls: 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20' }
    
    const r = diasAteVencer(chip)
    if (!r) return { text: '➖ Sem recarga', cls: 'bg-zinc-500/10 text-zinc-400' }
    if (r.dias <= 0) return { text: '⚠️ Recarga vencida', cls: 'bg-red-600/15 text-red-400 border border-red-600/30 animate-pulse' }
    if (r.dias <= 7) return { text: `🔶 Recarga em ${r.dias} dias`, cls: 'bg-amber-500/10 text-amber-400 border border-amber-500/20' }
    return { text: '✅ OK', cls: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' }
  }

  const getOperadoraColor = (op: string) => {
    switch (op) {
      case 'Vivo': return 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
      case 'Claro': return 'bg-red-500/10 text-red-400 border border-red-500/20'
      case 'TIM': return 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
      case 'Oi': return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
      default: return 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
    }
  }

  const getQtdBloqueios = (chip: Chip) => {
    return (chip.historico || []).filter(h => h.evento === 'Bloqueado').length
  }

  // Modals operations
  const openModal = (chip: Chip | null = null) => {
    setSelectedChip(chip)
    if (chip) {
      setFIdChip(chip.id_chip ? String(chip.id_chip) : '')
      setFNumero(chip.numero)
      setFOperadora(chip.operadora)
      setFFuncao(chip.funcao || '')
      setFResponsavel(chip.responsavel || '')
      setFStatus(chip.status)
      setFUltRecarga(chip.ultima_recarga || '')
      setFPeriodicidade(String(chip.periodicidade))
      setFValor(chip.valor ? String(chip.valor) : '')
      setFSenhaWhatsapp(chip.senha_whatsapp || '')
      setFSenhaApp(chip.senha_app || '')
      setFAparelho(chip.aparelho || '')
      setFObs(chip.obs || '')
    } else {
      setFIdChip('')
      setFNumero('')
      setFOperadora('Vivo')
      setFFuncao('')
      setFResponsavel('')
      setFStatus('Ativo')
      setFUltRecarga('')
      setFPeriodicidade('60')
      setFValor('')
      setFSenhaWhatsapp('')
      setFSenhaApp('')
      setFAparelho('')
      setFObs('')
    }
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setSelectedChip(null)
  }

  const openHistorico = (chip: Chip) => {
    setSelectedChip(chip)
    setHData(new Date().toISOString().slice(0, 10))
    setHEvento('Observação')
    setHObs('')
    setIsHistModalOpen(true)
  }

  const closeHistorico = () => {
    setIsHistModalOpen(false)
  }

  const handleSave = () => {
    if (!fNumero.trim()) {
      showToast('Por favor, informe o número do chip', 'err')
      return
    }
    const chipData: Partial<Chip> = {
      id_chip: fIdChip ? Number(fIdChip) : null,
      numero: fNumero,
      operadora: fOperadora,
      funcao: fFuncao || null,
      responsavel: fResponsavel || null,
      status: fStatus,
      ultima_recarga: fUltRecarga || null,
      periodicidade: Number(fPeriodicidade) || 60,
      valor: fValor ? Number(fValor) : null,
      senha_whatsapp: fSenhaWhatsapp || null,
      senha_app: fSenhaApp || null,
      aparelho: fAparelho || null,
      obs: fObs || null,
    }
    if (selectedChip) {
      chipData.id = selectedChip.id
    }
    saveChipMutation.mutate(chipData)
  }

  const handleDeleteChip = () => {
    if (!selectedChip) return
    if (confirm(`Tem certeza que deseja excluir o número ${selectedChip.numero} permanentemente?`)) {
      deleteChipMutation.mutate(selectedChip.id, {
        onSuccess: () => {
          closeModal()
        }
      })
    }
  }

  const handleAddHist = () => {
    if (!selectedChip) return
    const entry: HistEntry = {
      data: hData,
      evento: hEvento,
      obs: hObs.trim() || `Evento: ${hEvento} registrado`
    }
    addHistMutation.mutate({ chip: selectedChip, entry })
  }

  // Filter chips
  const filteredChips = chips.filter(c => {
    const term = searchTerm.toLowerCase()
    const matchesSearch = 
      (c.numero || '').toLowerCase().includes(term) ||
      (c.funcao || '').toLowerCase().includes(term) ||
      (c.responsavel || '').toLowerCase().includes(term) ||
      (c.aparelho || '').toLowerCase().includes(term) ||
      String(c.id_chip || '').includes(term)

    const matchesStatus = !statusFilter || c.status === statusFilter
    const matchesArchived = showArchived || !c.arquivado

    return matchesSearch && matchesStatus && matchesArchived
  }).sort((a, b) => {
    // Archived at bottom, then sorted by custom ID
    if (a.arquivado && !b.arquivado) return 1
    if (!a.arquivado && b.arquivado) return -1
    return (a.id_chip || 9999) - (b.id_chip || 9999)
  })

  const maskNumber = (num: string) => {
    if (!hideNumbers) return num
    const cleanDigits = num.replace(/\D/g, '')
    const totalDigits = cleanDigits.length
    let digitIndex = 0
    return num.replace(/\d/g, (d) => {
      digitIndex++
      if (digitIndex > 2 && digitIndex <= totalDigits - 2) {
        return '•'
      }
      return d
    })
  }

  // KPIs
  const activeCount = chips.filter(c => !c.arquivado && c.status === 'Ativo').length
  const blockedCount = chips.filter(c => !c.arquivado && c.status === 'Bloqueado').length
  const quarentenaCount = chips.filter(c => !c.arquivado && c.status === 'Quarentena').length
  const reporCount = chips.filter(c => !c.arquivado && c.status === 'Perdeu número').length
  
  const recargasVencidas = chips.filter(c => {
    if (c.arquivado || c.status === 'Bloqueado' || c.status === 'Perdeu número') return false
    const r = diasAteVencer(c)
    return r !== null && r.dias <= 0
  }).length

  const custoMensal = chips
    .filter(c => !c.arquivado && c.status !== 'Perdeu número')
    .reduce((acc, c) => acc + (Number(c.valor) || 0), 0)

  if (!activeProjectId) {
    return <div className="text-center py-10 text-xs text-text3">Selecione um projeto para gerenciar os chips.</div>
  }

  if (isLoading) {
    return <div className="text-center py-10 text-xs text-text3">Carregando painel de chips...</div>
  }

  return (
    <div className="space-y-6">
      {/* KPIs Panel */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        {[
          { label: 'Ativos', value: activeCount, color: 'text-emerald-400', icon: CheckCircle2, bg: 'bg-emerald-500/5 border-emerald-500/10' },
          { label: 'Bloqueados', value: blockedCount, color: 'text-red-400', icon: ShieldAlert, bg: 'bg-red-500/5 border-red-500/10' },
          { label: 'Quarentena', value: quarentenaCount, color: 'text-purple-400', icon: Activity, bg: 'bg-purple-500/5 border-purple-500/10' },
          { label: 'Perderam número', value: reporCount, color: 'text-zinc-400', icon: Smartphone, bg: 'bg-zinc-500/5 border-zinc-500/10' },
          { label: 'Recargas Vencidas', value: recargasVencidas, color: recargasVencidas > 0 ? 'text-amber-400 animate-pulse' : 'text-text3', icon: AlertTriangle, bg: recargasVencidas > 0 ? 'bg-amber-500/5 border-amber-500/10' : 'bg-surface border-border-custom' },
          { label: 'Custo mensal est.', value: `R$ ${custoMensal.toFixed(2).replace('.', ',')}`, color: 'text-yellow-400', icon: DollarSign, bg: 'bg-yellow-500/5 border-yellow-500/10' }
        ].map((kpi, idx) => {
          const Icon = kpi.icon
          return (
            <div key={idx} className={`bg-surface border rounded-xl p-4 flex flex-col justify-between shadow-sm ${kpi.bg}`}>
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-bold text-text3 uppercase tracking-wider">{kpi.label}</span>
                <Icon className={`w-4 h-4 ${kpi.color}`} />
              </div>
              <span className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</span>
            </div>
          )
        })}
      </div>

      {/* Main Table Panel */}
      <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="text-xs font-bold text-text-custom flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-purple-custom" />
            <span>Gerenciamento de Chips do WhatsApp</span>
          </h3>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text3" />
              <input
                type="text"
                placeholder="Buscar número, responsável..."
                className="pl-9 pr-3 py-1.5 border border-border2 rounded-lg bg-surface text-xs outline-none text-text-custom w-52 placeholder-text3 focus:border-text-custom"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <select
              className="px-3 py-1.5 border border-border2 rounded-lg bg-surface text-xs outline-none text-text-custom cursor-pointer"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">Todos os status</option>
              <option value="Ativo">Ativo</option>
              <option value="Ativo sem uso">Ativo sem uso</option>
              <option value="Bloqueado">Bloqueado</option>
              <option value="Quarentena">Quarentena</option>
              <option value="Perdeu número">Perdeu número</option>
            </select>

            <label className="flex items-center gap-2 text-xs text-text2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded accent-purple-custom"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              <span>Mostrar arquivados</span>
            </label>

            <button
              onClick={() => setHideNumbers(!hideNumbers)}
              className="px-2.5 py-1.5 border border-border2 hover:bg-surface2 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer text-text-custom transition-all"
              title={hideNumbers ? 'Mostrar Números' : 'Ocultar Números'}
            >
              {hideNumbers ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{hideNumbers ? 'Mostrar Números' : 'Ocultar Números'}</span>
            </button>

            <button
              onClick={() => openModal(null)}
              className="px-3 py-1.5 bg-purple-custom text-white hover:opacity-90 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Novo Chip</span>
            </button>
          </div>
        </div>

        {/* Table representation */}
        <div className="overflow-x-auto border border-border-custom rounded-lg bg-surface2/30">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border-custom bg-surface2/60">
                <th className="p-3 text-text3 font-semibold text-[10px] uppercase">ID</th>
                <th className="p-3 text-text3 font-semibold text-[10px] uppercase">Número</th>
                <th className="p-3 text-text3 font-semibold text-[10px] uppercase">Operadora</th>
                <th className="p-3 text-text3 font-semibold text-[10px] uppercase">Função</th>
                <th className="p-3 text-text3 font-semibold text-[10px] uppercase">Responsável</th>
                <th className="p-3 text-text3 font-semibold text-[10px] uppercase">Aparelho</th>
                <th className="p-3 text-text3 font-semibold text-[10px] uppercase">Status</th>
                <th className="p-3 text-text3 font-semibold text-[10px] uppercase">Alertas</th>
                <th className="p-3 text-text3 font-semibold text-[10px] uppercase">Últ. Recarga</th>
                <th className="p-3 text-text3 font-semibold text-[10px] uppercase text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-custom">
              {filteredChips.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-6 text-center text-text3">
                    Nenhum chip encontrado.
                  </td>
                </tr>
              ) : (
                filteredChips.map((chip) => {
                  const alert = getAlerta(chip)
                  const opClass = getOperadoraColor(chip.operadora)
                  return (
                    <tr 
                      key={chip.id} 
                      className={`hover:bg-surface2/20 transition-colors ${chip.arquivado ? 'opacity-40' : ''}`}
                    >
                      <td className="p-3 font-semibold text-text3">{chip.id_chip || '-'}</td>
                      <td className="p-3">
                        <button
                          onClick={() => openHistorico(chip)}
                          className="font-bold text-text-custom hover:text-purple-custom hover:underline text-left cursor-pointer"
                        >
                          {maskNumber(chip.numero)}
                        </button>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${opClass}`}>
                          {chip.operadora}
                        </span>
                      </td>
                      <td className="p-3 text-text-custom truncate max-w-[120px]">{chip.funcao || '-'}</td>
                      <td className="p-3 text-text2">{chip.responsavel || '-'}</td>
                      <td className="p-3 text-text2 truncate max-w-[120px]">{chip.aparelho || '-'}</td>
                      <td className="p-3">
                        <span className="text-[11px] font-semibold text-text-custom">
                          {chip.status}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${alert.cls}`}>
                          {alert.text}
                        </span>
                      </td>
                      <td className="p-3 text-text3">
                        {chip.ultima_recarga ? new Date(chip.ultima_recarga).toLocaleDateString('pt-BR') : '-'}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openModal(chip)}
                            className="p-1 hover:bg-surface2 rounded text-text3 hover:text-text-custom cursor-pointer transition-colors"
                            title="Editar Chip"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openHistorico(chip)}
                            className="p-1 hover:bg-surface2 rounded text-text3 hover:text-text-custom cursor-pointer transition-colors"
                            title="Histórico de Eventos"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => archiveChipMutation.mutate({ id: chip.id, arquivado: !chip.arquivado })}
                            className="p-1 hover:bg-surface2 rounded text-text3 hover:text-text-custom cursor-pointer transition-colors"
                            title={chip.arquivado ? 'Desarquivar' : 'Arquivar'}
                          >
                            <Archive className="w-3.5 h-3.5" />
                          </button>
                          {chip.arquivado && (
                            <button
                              onClick={() => {
                                if (confirm('Tem certeza que deseja excluir este chip permanentemente?')) {
                                  deleteChipMutation.mutate(chip.id)
                                }
                              }}
                              className="p-1 hover:bg-red-500/10 rounded text-red-400 hover:text-red-500 cursor-pointer transition-colors"
                              title="Excluir Permanentemente"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===================== CHIP CREATE/EDIT MODAL ===================== */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-[2px] animate-fadeIn">
          <div className="bg-surface border border-border-custom rounded-xl p-6 shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex justify-between items-center border-b border-border-custom pb-3">
              <h3 className="text-sm font-bold text-text-custom flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-purple-custom" />
                <span>{selectedChip ? 'Editar Chip' : 'Cadastrar Novo Chip'}</span>
              </h3>
              <button onClick={closeModal} className="text-text3 hover:text-text-custom cursor-pointer p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-text2 uppercase tracking-wider">ID (Identificador)</label>
                <input
                  type="number"
                  placeholder="ex: 15"
                  className="px-3 py-2 border border-border2 rounded-lg bg-surface text-text-custom outline-none w-full"
                  value={fIdChip}
                  onChange={(e) => setFIdChip(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-text2 uppercase tracking-wider">Número (WhatsApp)</label>
                <input
                  type="text"
                  placeholder="ex: 11 98765-4321"
                  className="px-3 py-2 border border-border2 rounded-lg bg-surface text-text-custom outline-none w-full"
                  value={fNumero}
                  onChange={(e) => setFNumero(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-text2 uppercase tracking-wider">Operadora</label>
                <select
                  className="px-3 py-2 border border-border2 rounded-lg bg-surface text-text-custom outline-none w-full cursor-pointer"
                  value={fOperadora}
                  onChange={(e) => setFOperadora(e.target.value)}
                >
                  <option value="Vivo">Vivo</option>
                  <option value="Claro">Claro</option>
                  <option value="TIM">TIM</option>
                  <option value="Oi">Oi</option>
                  <option value="Outra">Outra</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-text2 uppercase tracking-wider">Status do Chip</label>
                <select
                  className="px-3 py-2 border border-border2 rounded-lg bg-surface text-text-custom outline-none w-full cursor-pointer"
                  value={fStatus}
                  onChange={(e) => setFStatus(e.target.value as Chip['status'])}
                >
                  <option value="Ativo">Ativo</option>
                  <option value="Ativo sem uso">Ativo sem uso</option>
                  <option value="Bloqueado">Bloqueado</option>
                  <option value="Quarentena">Quarentena</option>
                  <option value="Perdeu número">Perdeu número</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-text2 uppercase tracking-wider">Função / Destinação</label>
                <input
                  type="text"
                  placeholder="ex: Atendimento Lançamentos"
                  className="px-3 py-2 border border-border2 rounded-lg bg-surface text-text-custom outline-none w-full"
                  value={fFuncao}
                  onChange={(e) => setFFuncao(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-text2 uppercase tracking-wider">Responsável</label>
                <input
                  type="text"
                  placeholder="ex: Francisco"
                  className="px-3 py-2 border border-border2 rounded-lg bg-surface text-text-custom outline-none w-full"
                  value={fResponsavel}
                  onChange={(e) => setFResponsavel(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-text2 uppercase tracking-wider">Última Recarga</label>
                <input
                  type="date"
                  className="px-3 py-2 border border-border2 rounded-lg bg-surface text-text-custom outline-none w-full"
                  value={fUltRecarga}
                  onChange={(e) => setFUltRecarga(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-text2 uppercase tracking-wider">Ciclo Recarga (Dias)</label>
                <input
                  type="number"
                  placeholder="ex: 60"
                  className="px-3 py-2 border border-border2 rounded-lg bg-surface text-text-custom outline-none w-full"
                  value={fPeriodicidade}
                  onChange={(e) => setFPeriodicidade(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-text2 uppercase tracking-wider">Custo / Valor Recarga (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="ex: 20.00"
                  className="px-3 py-2 border border-border2 rounded-lg bg-surface text-text-custom outline-none w-full"
                  value={fValor}
                  onChange={(e) => setFValor(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-text2 uppercase tracking-wider">Aparelho</label>
                <input
                  type="text"
                  placeholder="ex: iPhone 11 - Comercial"
                  className="px-3 py-2 border border-border2 rounded-lg bg-surface text-text-custom outline-none w-full"
                  value={fAparelho}
                  onChange={(e) => setFAparelho(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-text2 uppercase tracking-wider">Senha do WhatsApp (2FA)</label>
                <input
                  type="text"
                  placeholder="PIN ou Senha de backup"
                  className="px-3 py-2 border border-border2 rounded-lg bg-surface text-text-custom outline-none w-full font-mono"
                  value={fSenhaWhatsapp}
                  onChange={(e) => setFSenhaWhatsapp(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-text2 uppercase tracking-wider">Senha do Aparelho/App</label>
                <input
                  type="text"
                  placeholder="Senha de bloqueio do celular"
                  className="px-3 py-2 border border-border2 rounded-lg bg-surface text-text-custom outline-none w-full font-mono"
                  value={fSenhaApp}
                  onChange={(e) => setFSenhaApp(e.target.value)}
                />
              </div>
              <div className="col-span-2 flex flex-col gap-1">
                <label className="text-[10px] font-bold text-text2 uppercase tracking-wider">Observações Gerais</label>
                <textarea
                  placeholder="Histórico rápido, operadora vinculada, etc..."
                  className="px-3 py-2 border border-border2 rounded-lg bg-surface text-text-custom outline-none w-full h-20"
                  value={fObs}
                  onChange={(e) => setFObs(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-border-custom">
              {selectedChip ? (
                <button
                  onClick={handleDeleteChip}
                  className="px-4 py-2 bg-red-t/10 hover:bg-red-t/20 border border-red-t/30 text-red-t rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                >
                  Excluir Número
                </button>
              ) : (
                <div />
              )}
              <div className="flex gap-3">
                <button
                  onClick={closeModal}
                  className="px-4 py-2 border border-border2 hover:bg-surface2 rounded-lg text-xs font-semibold cursor-pointer text-text-custom"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  className="px-4 py-2 bg-purple-custom text-white hover:opacity-90 rounded-lg text-xs font-semibold cursor-pointer shadow-sm"
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== HISTORY/EVENTS LOG MODAL ===================== */}
      {isHistModalOpen && selectedChip && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-[2px] animate-fadeIn">
          <div className="bg-surface border border-border-custom rounded-xl p-6 shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex justify-between items-center border-b border-border-custom pb-3">
              <div>
                <h3 className="text-sm font-bold text-text-custom flex items-center gap-2">
                  <History className="w-4 h-4 text-purple-custom" />
                  <span>Histórico do Chip</span>
                </h3>
                <p className="text-[10px] text-text3 mt-0.5">{selectedChip.numero} ({selectedChip.funcao || 'Sem função'})</p>
              </div>
              <button onClick={closeHistorico} className="text-text3 hover:text-text-custom cursor-pointer p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Event list */}
            <div className="space-y-3 max-h-[300px] overflow-y-auto scrollbar-thin pr-1">
              {(selectedChip.historico || []).length === 0 ? (
                <p className="text-xs text-text3 text-center py-6">Nenhum evento registrado no histórico.</p>
              ) : (
                [...selectedChip.historico].reverse().map((entry, idx) => (
                  <div key={idx} className="p-3 bg-surface2/60 border border-border-custom rounded-lg space-y-1 text-xs">
                    <div className="flex justify-between items-center text-[10px] text-text3">
                      <span className="font-semibold px-1.5 py-0.5 rounded bg-surface border border-border-custom text-text-custom">
                        {entry.evento}
                      </span>
                      <span>{entry.data ? new Date(entry.data).toLocaleDateString('pt-BR') : '-'}</span>
                    </div>
                    <p className="text-text2 leading-normal">{entry.obs}</p>
                  </div>
                ))
              )}
            </div>

            {/* Add new event form */}
            <div className="border-t border-border-custom pt-4 space-y-3 text-xs">
              <h4 className="text-[11px] font-bold text-text-custom uppercase tracking-wider">Registrar Novo Evento</h4>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-text2 uppercase tracking-wider">Data</label>
                  <input
                    type="date"
                    className="px-3 py-2 border border-border2 rounded-lg bg-surface text-text-custom outline-none w-full"
                    value={hData}
                    onChange={(e) => setHData(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-text2 uppercase tracking-wider">Evento</label>
                  <select
                    className="px-3 py-2 border border-border2 rounded-lg bg-surface text-text-custom outline-none w-full cursor-pointer"
                    value={hEvento}
                    onChange={(e) => setHEvento(e.target.value)}
                  >
                    <option value="Observação">Observação</option>
                    <option value="Recarga confirmada">Recarga confirmada</option>
                    <option value="Ativo">Ativo</option>
                    <option value="Ativo sem uso">Ativo sem uso</option>
                    <option value="Bloqueado">Bloqueado</option>
                    <option value="Quarentena">Quarentena</option>
                    <option value="Perdeu número">Perdeu número</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-text2 uppercase tracking-wider">Descrição / Nota</label>
                <input
                  type="text"
                  placeholder="ex: recarregado R$ 20.00 via Pix"
                  className="px-3 py-2 border border-border2 rounded-lg bg-surface text-text-custom outline-none w-full"
                  value={hObs}
                  onChange={(e) => setHObs(e.target.value)}
                />
              </div>

              <button
                onClick={handleAddHist}
                className="w-full py-2 bg-purple-custom text-white hover:opacity-90 rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-sm"
              >
                Adicionar Registro
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
