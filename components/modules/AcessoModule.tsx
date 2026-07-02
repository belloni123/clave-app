'use client'

import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/utils/supabase/client'
import { useAppStore } from '@/store/useAppStore'
import { X, Check, Plus, Trash, Search, CheckSquare, Square } from 'lucide-react'

interface SaveColabPayload {
  id?: string
  name: string
  role: string
  email: string
  permissions: string[]
}

interface SaveClientPayload {
  id?: string
  name: string
  company: string
  niche: string
  networking_enabled: boolean
}

interface TeamMember {
  id: string
  owner_id: string
  name: string
  role: string // Designer, Copywriter, etc.
  email: string
  permissions: string[] // List of enabled modules
}

interface Client {
  id: string
  owner_id: string
  name: string
  company: string
  niche: string
  status: string
  networking_enabled: boolean
}

interface Student {
  id: string
  owner_id: string
  name: string
  niche: string
  skills: string[]
  cohort: string
  talent_pool: boolean
}

interface NetworkContact {
  nm: string
  tp: 'Produtor' | 'Especialista' | 'Afiliado' | 'Parceiro'
  ni: string
  ig: string
  ob: string
}

interface SubTask {
  t: string
  d: boolean
}

interface SubProject {
  id: string
  nm: string
  st: 'planejado' | 'em andamento' | 'concluido'
  prazo: string
  tasks: SubTask[]
}

const ROLES = ['Equipe B16', 'Clientes B16', 'Alunos da mentoria/consultoria']

const MODULE_PERMISSIONS = [
  { key: 'concepcao', name: 'Concepção' },
  { key: 'comunicacao', name: 'Comunicação' },
  { key: 'lancamentos', name: 'Lançamentos' },
  { key: 'validacao', name: 'Validação Direta' },
  { key: 'historias', name: 'Banco de Histórias' },
  { key: 'financeiro', name: 'Financeiro' },
  { key: 'planejador', name: 'Planejador' },
]

export default function AcessoModule() {
  const queryClient = useQueryClient()
  const supabase = createClient()
  const { profile, showToast, activeProjectId } = useAppStore()

  const [activeSubTab, setActiveSubTab] = useState<'colabs' | 'clients' | 'students' | 'net' | 'pjs'>('colabs')

  // Modals local states
  const [colabModalOpen, setColabModalOpen] = useState(false)
  const [editColabId, setEditColabId] = useState<string | null>(null)
  const [colabName, setColabName] = useState('')
  const [colabRole, setColabRole] = useState(ROLES[0])
  const [colabEmail, setColabEmail] = useState('')
  const [colabPerms, setColabPerms] = useState<string[]>([])

  const [clientModalOpen, setClientModalOpen] = useState(false)
  const [editClientId, setEditClientId] = useState<string | null>(null)
  const [clientName, setClientName] = useState('')
  const [clientCompany, setClientCompany] = useState('')
  const [clientNiche, setClientNiche] = useState('')
  const [clientNet, setClientNet] = useState(false)

  // ==========================================
  // 1. QUERY & MUTATIONS: COLABORADORES
  // ==========================================
  const { data: colabs } = useQuery({
    queryKey: ['team_members'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_members')
        .select('*')
        .is('deleted_at', null)
      if (error) {
        showToast('Erro ao carregar colaboradores', 'err')
        return []
      }
      return data as TeamMember[]
    },
  })

  const saveColabMutation = useMutation({
    mutationFn: async (payload: SaveColabPayload) => {
      if (payload.id) {
        const { error } = await supabase
          .from('team_members')
          .update(payload)
          .eq('id', payload.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('team_members')
          .insert({ ...payload, owner_id: profile!.id })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team_members'] })
      showToast(editColabId ? 'Colaborador atualizado' : 'Colaborador adicionado')
      closeColabModal()
    },
    onError: () => {
      showToast('Erro ao salvar colaborador', 'err')
    },
  })

  const deleteColabMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('team_members')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team_members'] })
      showToast('Colaborador excluído')
      closeColabModal()
    },
  })

  const openColabModal = (colab?: TeamMember) => {
    if (colab) {
      setEditColabId(colab.id)
      setColabName(colab.name)
      setColabRole(colab.role)
      setColabEmail(colab.email)
      setColabPerms(colab.permissions || [])
    } else {
      setEditColabId(null)
      setColabName('')
      setColabRole(ROLES[0])
      setColabEmail('')
      setColabPerms([])
    }
    setColabModalOpen(true)
  }

  const closeColabModal = () => {
    setColabModalOpen(false)
    setEditColabId(null)
  }

  const handleSaveColab = () => {
    if (!colabName.trim() || !colabEmail.trim()) return
    const payload: SaveColabPayload = {
      name: colabName.trim(),
      role: colabRole,
      email: colabEmail.trim(),
      permissions: colabPerms,
    }
    if (editColabId) payload.id = editColabId
    saveColabMutation.mutate(payload)
  }

  const togglePermission = (key: string) => {
    if (colabPerms.includes(key)) {
      setColabPerms(colabPerms.filter((p) => p !== key))
    } else {
      setColabPerms([...colabPerms, key])
    }
  }

  // ==========================================
  // 2. QUERY & MUTATIONS: CLIENTES
  // ==========================================
  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .is('deleted_at', null)
      if (error) {
        showToast('Erro ao carregar clientes', 'err')
        return []
      }
      return data as Client[]
    },
  })

  const saveClientMutation = useMutation({
    mutationFn: async (payload: SaveClientPayload) => {
      if (payload.id) {
        const { error } = await supabase
          .from('clients')
          .update(payload)
          .eq('id', payload.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('clients')
          .insert({ ...payload, owner_id: profile!.id })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      showToast(editClientId ? 'Cliente atualizado' : 'Cliente adicionado')
      closeClientModal()
    },
    onError: () => {
      showToast('Erro ao salvar cliente', 'err')
    },
  })

  const deleteClientMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('clients')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      showToast('Cliente excluído')
      closeClientModal()
    },
  })

  const openClientModal = (client?: Client) => {
    if (client) {
      setEditClientId(client.id)
      setClientName(client.name)
      setClientCompany(client.company)
      setClientNiche(client.niche)
      setClientNet(client.networking_enabled)
    } else {
      setEditClientId(null)
      setClientName('')
      setClientCompany('')
      setClientNiche('')
      setClientNet(false)
    }
    setClientModalOpen(true)
  }

  const closeClientModal = () => {
    setClientModalOpen(false)
    setEditClientId(null)
  }

  const handleSaveClient = () => {
    if (!clientName.trim() || !clientCompany.trim()) return
    const payload: SaveClientPayload = {
      name: clientName.trim(),
      company: clientCompany.trim(),
      niche: clientNiche.trim(),
      networking_enabled: clientNet,
    }
    if (editClientId) payload.id = editClientId
    saveClientMutation.mutate(payload)
  }

  // ==========================================
  // 3. QUERY & MUTATIONS: ALUNOS
  // ==========================================
  const { data: students } = useQuery({
    queryKey: ['students'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('students')
        .select('*')
        .is('deleted_at', null)
      if (error) {
        showToast('Erro ao carregar alunos', 'err')
        return []
      }
      return data as Student[]
    },
  })

  // ==========================================
  // NETWORKING & PROJETOS STATE & LOGIC
  // ==========================================
  const [localContacts, setLocalContacts] = useState<NetworkContact[] | null>(null)
  const [localSubProjects, setLocalSubProjects] = useState<SubProject[] | null>(null)
  const [netSearch, setNetSearch] = useState('')
  const [netFilter, setNetFilter] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      setLocalContacts(null)
      setLocalSubProjects(null)
    }, 0)
    return () => clearTimeout(timer)
  }, [activeProjectId])

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
    const list = [...(localContacts || contactsData || []), { nm: '', tp: 'Produtor' as const, ni: '', ig: '', ob: '' }]
    setLocalContacts(list)
    saveContactsMutation.mutate(list)
  }

  const updateLocalContact = (idx: number, key: keyof NetworkContact, val: string) => {
    const list = [...(localContacts || contactsData || [])]
    list[idx] = { ...list[idx], [key]: val } as NetworkContact
    setLocalContacts(list)
  }

  const handleContactBlur = () => {
    if (!localContacts) return
    saveContactsMutation.mutate(localContacts)
  }

  const deleteContact = (idx: number) => {
    const list = (localContacts || contactsData || []).filter((_, i) => i !== idx)
    setLocalContacts(list)
    saveContactsMutation.mutate(list)
    showToast('Contato removido')
  }

  const filteredContacts = (localContacts || contactsData || []).filter((c) => {
    const query = netSearch.toLowerCase()
    const matchesSearch =
      !query || c.nm.toLowerCase().includes(query) || c.ni.toLowerCase().includes(query)
    const matchesFilter = !netFilter || c.tp === netFilter
    return matchesSearch && matchesFilter
  })

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
        showToast('Erro ao carregar projetos', 'err')
        return []
      }
      return data ? (JSON.parse(data.value) as SubProject[]) : []
    },
    enabled: !!activeProjectId,
  })

  useEffect(() => {
    if (contactsData && localContacts === null) {
      const timer = setTimeout(() => {
        setLocalContacts(contactsData)
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [contactsData, localContacts])

  useEffect(() => {
    if (subProjects && localSubProjects === null) {
      const timer = setTimeout(() => {
        setLocalSubProjects(subProjects)
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [subProjects, localSubProjects])

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
    const list: SubProject[] = [
      ...(localSubProjects || subProjects || []),
      {
        id: 'sp_' + Date.now(),
        nm: '',
        st: 'planejado',
        prazo: '',
        tasks: [],
      },
    ]
    setLocalSubProjects(list)
    saveSubProjectsMutation.mutate(list)
  }

  const updateLocalSubProject = (idx: number, key: keyof SubProject, val: SubProject[keyof SubProject]) => {
    const list = [...(localSubProjects || subProjects || [])]
    list[idx] = { ...list[idx], [key]: val } as SubProject
    setLocalSubProjects(list)
  }

  const handleSubProjectBlur = () => {
    if (!localSubProjects) return
    saveSubProjectsMutation.mutate(localSubProjects)
  }

  const deleteSubProject = (idx: number) => {
    const list = (localSubProjects || subProjects || []).filter((_, i) => i !== idx)
    setLocalSubProjects(list)
    saveSubProjectsMutation.mutate(list)
    showToast('Sub-projeto removido')
  }

  const toggleSubTask = (pIdx: number, tIdx: number) => {
    const base = localSubProjects || subProjects
    if (!base) return
    const list = [...base]
    const proj = { ...list[pIdx] }
    const tasks = [...proj.tasks]
    tasks[tIdx] = { ...tasks[tIdx], d: !tasks[tIdx].d }
    proj.tasks = tasks
    list[pIdx] = proj
    setLocalSubProjects(list)
    saveSubProjectsMutation.mutate(list)
  }

  const addSubTask = (pIdx: number, text: string) => {
    if (!text.trim()) return
    const base = localSubProjects || subProjects
    if (!base) return
    const list = [...base]
    const proj = { ...list[pIdx] }
    proj.tasks = [...proj.tasks, { t: text.trim(), d: false }]
    list[pIdx] = proj
    setLocalSubProjects(list)
    saveSubProjectsMutation.mutate(list)
  }

  const removeSubTask = (pIdx: number, tIdx: number) => {
    const base = localSubProjects || subProjects
    if (!base) return
    const list = [...base]
    const proj = { ...list[pIdx] }
    proj.tasks = proj.tasks.filter((_, i) => i !== tIdx)
    list[pIdx] = proj
    setLocalSubProjects(list)
    saveSubProjectsMutation.mutate(list)
  }

  const isAdmin = profile?.role === 'admin'

  return (
    <div className="space-y-6">
      {/* Subtabs header */}
      <div className="flex gap-1 border-b border-border-custom flex-wrap mb-4">
        <button
          onClick={() => setActiveSubTab('colabs')}
          className={`px-4 py-2 text-xs font-semibold cursor-pointer border-b-2 bg-transparent transition-colors duration-150 ${
            activeSubTab === 'colabs'
              ? 'border-text-custom text-text-custom'
              : 'border-transparent text-text2 hover:text-text-custom'
          }`}
        >
          Equipe / Colaboradores
        </button>
        <button
          onClick={() => setActiveSubTab('clients')}
          className={`px-4 py-2 text-xs font-semibold cursor-pointer border-b-2 bg-transparent transition-colors duration-150 ${
            activeSubTab === 'clients'
              ? 'border-text-custom text-text-custom'
              : 'border-transparent text-text2 hover:text-text-custom'
          }`}
        >
          Clientes (Agência)
        </button>
        <button
          onClick={() => setActiveSubTab('students')}
          className={`px-4 py-2 text-xs font-semibold cursor-pointer border-b-2 bg-transparent transition-colors duration-150 ${
            activeSubTab === 'students'
              ? 'border-text-custom text-text-custom'
              : 'border-transparent text-text2 hover:text-text-custom'
          }`}
        >
          Alunos de Mentoria
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
          TAB: COLABORADORES
          ========================================== */}
      {activeSubTab === 'colabs' && colabs && (
        <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4 animate-[fadeUp_0.15s_ease_both]">
          <div className="flex justify-between items-center border-b border-border-custom pb-3">
            <div>
              <span className="text-xs font-bold text-text-custom block">Membros da Equipe</span>
              <span className="text-[10px] text-text3 mt-0.5">Gerenciamento de acessos e permissões por colaborador</span>
            </div>
            {isAdmin && (
              <button
                onClick={() => openColabModal()}
                className="px-3 py-1.5 bg-text-custom text-surface hover:opacity-90 rounded text-[11px] font-semibold cursor-pointer transition-colors"
              >
                + Colaborador
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {colabs.length === 0 ? (
              <div className="col-span-2 py-6 text-center text-text3 text-xs">
                Nenhum colaborador registrado.
              </div>
            ) : (
              colabs.map((colab) => (
                <div
                  key={colab.id}
                  className="p-4 bg-surface2 border border-border-custom rounded-xl flex flex-col justify-between gap-3 shadow-sm"
                >
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-text-custom leading-tight">
                          {colab.name}
                        </span>
                        <span className={`text-[9px] px-2 py-0.5 rounded border font-semibold uppercase ${
                          colab.role === 'Equipe B16'
                            ? 'bg-purple-bg text-purple-t border-purple-custom/25'
                            : colab.role === 'Clientes B16'
                            ? 'bg-green-bg text-green-t border-green-custom/25'
                            : 'bg-amber-bg text-amber-t border-amber-custom/25'
                        }`}>
                          {colab.role}
                        </span>
                      </div>
                      <p className="text-[10px] text-text2 mt-1">{colab.email}</p>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => openColabModal(colab)}
                        className="px-2 py-1 border border-border2 text-[10px] text-text-custom hover:bg-surface rounded cursor-pointer shrink-0 transition-colors"
                      >
                        Editar
                      </button>
                    )}
                  </div>

                  {/* Permissões */}
                  <div className="border-t border-border-custom/50 pt-2.5">
                    <span className="text-[9px] font-bold text-text3 block uppercase mb-1.5">
                      Módulos Permitidos
                    </span>
                    <div className="flex gap-1.5 flex-wrap">
                      {colab.permissions && colab.permissions.length > 0 ? (
                        colab.permissions.map((p) => (
                          <span
                            key={p}
                            className="text-[8px] font-semibold px-2 py-0.5 rounded bg-purple-bg text-purple-t border border-purple-custom/10 capitalize"
                          >
                            {p}
                          </span>
                        ))
                      ) : (
                        <span className="text-[9px] text-text3 italic">Nenhum módulo permitido</span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Modal Colaborador */}
          {colabModalOpen && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] animate-[fadeUp_0.15s_ease_both]">
              <div className="bg-surface rounded-xl p-5 w-full max-w-[380px] shadow-2xl border border-border2">
                <div className="flex justify-between items-center mb-4 border-b border-border-custom pb-2">
                  <p className="text-sm font-semibold text-text-custom">
                    {editColabId ? 'Editar Colaborador' : 'Adicionar Colaborador'}
                  </p>
                  <button
                    onClick={closeColabModal}
                    className="text-text3 hover:text-text-custom cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-3.5 text-xs">
                  <div>
                    <label className="text-[10px] font-bold text-text2 mb-1 block">Nome Completo</label>
                    <input
                      className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom"
                      value={colabName}
                      onChange={(e) => setColabName(e.target.value)}
                      placeholder="Ex: Francisco Belloni"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-text2 mb-1 block">E-mail</label>
                    <input
                      type="email"
                      className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom"
                      value={colabEmail}
                      onChange={(e) => setColabEmail(e.target.value)}
                      placeholder="Ex: francisco@clave.app"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-text2 mb-1 block">Tipo de Vínculo / Acesso</label>
                    <select
                      className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                      value={colabRole}
                      onChange={(e) => setColabRole(e.target.value)}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Permissões do Colaborador */}
                  <div>
                    <label className="text-[10px] font-bold text-text2 mb-1.5 block">
                      Permissões de Módulo
                    </label>
                    <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto border border-border-custom rounded p-2.5 scrollbar-thin">
                      {MODULE_PERMISSIONS.map((perm) => {
                        const isChecked = colabPerms.includes(perm.key)
                        return (
                          <div
                            key={perm.key}
                            onClick={() => togglePermission(perm.key)}
                            className="flex items-center gap-2 cursor-pointer py-0.5 select-none"
                          >
                            <div
                              className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                                isChecked
                                  ? 'bg-purple-custom border-purple-custom text-white'
                                  : 'border-border2 bg-transparent'
                              }`}
                            >
                              {isChecked && <Check className="w-2.5 h-2.5" />}
                            </div>
                            <span className="text-[11px] text-text-custom truncate">
                              {perm.name}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center gap-2 mt-6 pt-3 border-t border-border-custom">
                  {editColabId && (
                    <button
                      onClick={() => {
                        if (confirm('Deseja excluir este colaborador da equipe?')) {
                          deleteColabMutation.mutate(editColabId)
                        }
                      }}
                      className="px-3 py-2 border border-red-t/30 text-red-t rounded text-xs hover:bg-red-bg transition-colors cursor-pointer"
                    >
                      Excluir
                    </button>
                  )}
                  <div className="flex gap-2 ml-auto">
                    <button
                      onClick={closeColabModal}
                      className="px-3 py-2 border border-border2 rounded text-xs hover:bg-surface2 text-text2 transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSaveColab}
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
      )}

      {/* ==========================================
          TAB: CLIENTES
          ========================================== */}
      {activeSubTab === 'clients' && clients && (
        <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4 animate-[fadeUp_0.15s_ease_both]">
          <div className="flex justify-between items-center border-b border-border-custom pb-3">
            <div>
              <span className="text-xs font-bold text-text-custom block">Clientes de Carteira</span>
              <span className="text-[10px] text-text3 mt-0.5">Empresas e contas gerenciadas pela agência</span>
            </div>
            {isAdmin && (
              <button
                onClick={() => openClientModal()}
                className="px-3 py-1.5 bg-text-custom text-surface hover:opacity-90 rounded text-[11px] font-semibold cursor-pointer transition-colors"
              >
                + Cliente
              </button>
            )}
          </div>

          <div className="space-y-3">
            {clients.length === 0 ? (
              <p className="text-xs text-text3 text-center py-6">Nenhum cliente cadastrado.</p>
            ) : (
              clients.map((c) => (
                <div
                  key={c.id}
                  className="p-4 bg-surface2 border border-border-custom rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
                >
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-text-custom leading-tight">
                        {c.name}
                      </span>
                      <span className="text-[9px] px-2 py-0.5 rounded bg-green-bg text-green-t border border-green-custom/25 font-semibold uppercase">
                        {c.company}
                      </span>
                      {c.niche && (
                        <span className="text-[9px] px-2 py-0.5 rounded bg-surface2 text-text2 border border-border-custom font-medium">
                          {c.niche}
                        </span>
                      )}
                      {c.networking_enabled && (
                        <span className="text-[9px] px-2 py-0.5 rounded bg-purple-bg text-purple-t font-semibold">
                          Networking Ativo
                        </span>
                      )}
                    </div>
                  </div>

                  {isAdmin && (
                    <button
                      onClick={() => openClientModal(c)}
                      className="px-2.5 py-1.5 border border-border2 text-[10px] text-text-custom hover:bg-surface rounded cursor-pointer shrink-0 transition-colors self-end sm:self-auto"
                    >
                      Editar
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Modal Cliente */}
          {clientModalOpen && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] animate-[fadeUp_0.15s_ease_both]">
              <div className="bg-surface rounded-xl p-5 w-full max-w-[360px] shadow-2xl border border-border2">
                <div className="flex justify-between items-center mb-4 border-b border-border-custom pb-2">
                  <p className="text-sm font-semibold text-text-custom">
                    {editClientId ? 'Editar Cliente' : 'Adicionar Cliente'}
                  </p>
                  <button
                    onClick={closeClientModal}
                    className="text-text3 hover:text-text-custom cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-3.5 text-xs">
                  <div>
                    <label className="text-[10px] font-bold text-text2 mb-1 block">Nome do Cliente</label>
                    <input
                      className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="Ex: Thiago Santos"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-text2 mb-1 block">Empresa / Marca</label>
                    <input
                      className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom"
                      value={clientCompany}
                      onChange={(e) => setClientCompany(e.target.value)}
                      placeholder="Ex: Maestro Orquestra"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-text2 mb-1 block">Nicho de Negócios</label>
                    <input
                      className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom"
                      value={clientNiche}
                      onChange={(e) => setClientNiche(e.target.value)}
                      placeholder="Ex: Música Clássica / Educação"
                    />
                  </div>

                  <div className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      id="net-chk"
                      checked={clientNet}
                      onChange={(e) => setClientNet(e.target.checked)}
                      className="rounded border-border2 text-text-custom focus:ring-0"
                    />
                    <label htmlFor="net-chk" className="text-[11px] text-text2 font-semibold">
                      Compartilhar no Banco de Talentos / Networking
                    </label>
                  </div>
                </div>

                <div className="flex justify-between items-center gap-2 mt-6 pt-3 border-t border-border-custom">
                  {editClientId && (
                    <button
                      onClick={() => {
                        if (confirm('Deseja excluir este cliente e seus dados?')) {
                          deleteClientMutation.mutate(editClientId)
                        }
                      }}
                      className="px-3 py-2 border border-red-t/30 text-red-t rounded text-xs hover:bg-red-bg transition-colors cursor-pointer"
                    >
                      Excluir
                    </button>
                  )}
                  <div className="flex gap-2 ml-auto">
                    <button
                      onClick={closeClientModal}
                      className="px-3 py-2 border border-border2 rounded text-xs hover:bg-surface2 text-text2 transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSaveClient}
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
      )}

      {/* ==========================================
          TAB: ALUNOS
          ========================================== */}
      {activeSubTab === 'students' && students && (
        <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4 animate-[fadeUp_0.15s_ease_both]">
          <div className="flex justify-between items-center border-b border-border-custom pb-3">
            <div>
              <span className="text-xs font-bold text-text-custom block">Alunos de Mentoria</span>
              <span className="text-[10px] text-text3 mt-0.5">Alunos registrados no programa de acompanhamento estratégico</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {students.length === 0 ? (
              <div className="col-span-2 py-6 text-center text-text3 text-xs">
                Nenhum aluno de mentoria cadastrado no sistema.
              </div>
            ) : (
              students.map((student) => (
                <div
                  key={student.id}
                  className="p-4 bg-surface2 border border-border-custom rounded-xl space-y-2 shadow-sm"
                >
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <span className="text-xs font-bold text-text-custom block">{student.name}</span>
                      <span className="text-[9px] text-text3">Turma: {student.cohort || 'Sem turma'}</span>
                    </div>
                    {student.talent_pool && (
                      <span className="text-[9px] px-2 py-0.5 rounded bg-purple-bg text-purple-t font-semibold">
                        Banco de Talentos
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-text3 block uppercase mb-1">Habilidades</span>
                    <div className="flex gap-1 flex-wrap">
                      {student.skills && student.skills.length > 0 ? (
                        student.skills.map((skill) => (
                          <span
                            key={skill}
                            className="text-[8px] px-2 py-0.5 rounded bg-surface text-text2 border border-border-custom font-semibold capitalize"
                          >
                            {skill}
                          </span>
                        ))
                      ) : (
                        <span className="text-[9px] text-text3 italic">Nenhuma informada</span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ==========================================
          TAB: NETWORKING DIRECTORY
          ========================================== */}
      {activeSubTab === 'net' && (localContacts || contactsData) && (
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
              className="px-3 py-1.5 bg-text-custom text-surface hover:opacity-90 rounded text-[11px] font-semibold cursor-pointer transition-colors"
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
                      onChange={(e) => updateLocalContact(idx, 'nm', e.target.value)} onBlur={handleContactBlur}
                      placeholder="Nome do Contato"
                    />

                    <select
                      className="w-full sm:w-32 px-3 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                      value={c.tp}
                      onChange={(e) => updateLocalContact(idx, 'tp', e.target.value)} onBlur={handleContactBlur}
                    >
                      <option value="Produtor">Produtor</option>
                      <option value="Especialista">Especialista</option>
                      <option value="Afiliado">Afiliado</option>
                      <option value="Parceiro">Parceiro</option>
                    </select>

                    <input
                      className="w-full sm:w-32 px-3 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                      value={c.ni}
                      onChange={(e) => updateLocalContact(idx, 'ni', e.target.value)} onBlur={handleContactBlur}
                      placeholder="Nicho de atuação"
                    />

                    <input
                      className="w-full sm:w-36 px-3 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom font-mono outline-none"
                      value={c.ig}
                      onChange={(e) => updateLocalContact(idx, 'ig', e.target.value)} onBlur={handleContactBlur}
                      placeholder="@instagram"
                    />
                  </div>

                  <div className="flex gap-2 items-center w-full md:w-auto mt-2 md:mt-0">
                    <input
                      className="flex-1 md:w-56 px-3 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                      value={c.ob}
                      onChange={(e) => updateLocalContact(idx, 'ob', e.target.value)} onBlur={handleContactBlur}
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
      {activeSubTab === 'pjs' && (localSubProjects || subProjects) && (
        <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4 animate-[fadeUp_0.15s_ease_both]">
          <div className="flex justify-between items-center border-b border-border-custom pb-3">
            <div>
              <span className="text-xs font-bold text-text-custom block">Checklist de Projetos</span>
              <span className="text-[10px] text-text3 mt-0.5">Organização de etapas e mini-projetos internos</span>
            </div>
            <button
              onClick={addSubProject}
              className="px-3 py-1.5 bg-text-custom text-surface hover:opacity-90 rounded text-[11px] font-semibold cursor-pointer transition-colors"
            >
              Adicionar Projeto
            </button>
          </div>

          <div className="space-y-6 max-h-[460px] overflow-y-auto pr-1 scrollbar-thin">
            {(localSubProjects || subProjects || []).length === 0 ? (
              <p className="text-xs text-text3 text-center py-6">Nenhum projeto cadastrado.</p>
            ) : (
              (localSubProjects || subProjects || []).map((p, pIdx) => {
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
                        onChange={(e) => updateLocalSubProject(pIdx, 'nm', e.target.value)} onBlur={handleSubProjectBlur}
                        placeholder="Nome do Sub-projeto"
                      />
                      <select
                        className="w-full sm:w-32 px-2.5 py-1 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                        value={p.st}
                        onChange={(e) => updateLocalSubProject(pIdx, 'st', e.target.value)} onBlur={handleSubProjectBlur}
                      >
                        <option value="planejado">Planejado</option>
                        <option value="em andamento">Em Andamento</option>
                        <option value="concluido">Concluído</option>
                      </select>
                      <input
                        type="date"
                        className="w-full sm:w-36 px-2.5 py-1 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                        value={p.prazo}
                        onChange={(e) => updateLocalSubProject(pIdx, 'prazo', e.target.value)} onBlur={handleSubProjectBlur}
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
                          className="px-3 py-1 bg-text-custom text-surface hover:opacity-90 rounded text-[10px] font-semibold cursor-pointer"
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
