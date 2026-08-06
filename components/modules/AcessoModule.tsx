'use client'

import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/utils/supabase/client'
import { useAppStore } from '@/store/useAppStore'
import {
  X,
  Trash,
  Search,
  CheckSquare,
  Square,
  UserPlus,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  Copy,
} from 'lucide-react'
import {
  DEFAULT_PROJECT_MODULES,
  PROJECT_MODULES,
  type ProjectModuleKey,
} from '@/utils/module-access'

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

interface ProjectMember {
  id: string
  permission_level: 'viewer' | 'editor' | 'admin'
  allowed_modules: ProjectModuleKey[]
  ativo: boolean
  criado_em: string
  user_id: string
  profiles: {
    nome: string | null
    email: string | null
    agency_role: string | null
    role: string | null
  } | null
}

interface AgencyProfile {
  id: string
  nome: string | null
  email: string | null
  agency_role: string | null
  role: string | null
}

interface ProjectInviteResult {
  invited: boolean
  email: string
  temporaryPassword: string | null
  accessLink: string
}

interface ProjectAccessAudit {
  id: string
  target_user_id: string
  actor_id: string | null
  acao: 'grant' | 'revoke' | 'update_level' | 'update_modules'
  nivel_anterior: string | null
  nivel_novo: string | null
  modulos_anteriores: ProjectModuleKey[] | null
  modulos_novos: ProjectModuleKey[] | null
  criado_em: string
}

const ROLES = ['Equipe B16', 'Clientes B16', 'Alunos da mentoria/consultoria']

const MODULE_PERMISSIONS = PROJECT_MODULES

export default function AcessoModule() {
  const queryClient = useQueryClient()
  const supabase = createClient()
  const { profile, projects, showToast, activeProjectId } = useAppStore()

  const [activeSubTab, setActiveSubTab] = useState<'colabs' | 'project_users' | 'clients' | 'students' | 'net' | 'pjs'>('project_users')

  // ==========================================
  // PROJECT MEMBERS & AUDIT STATES & QUERIES
  // ==========================================
  const [selectedMemberLevel, setSelectedMemberLevel] = useState<'viewer' | 'editor' | 'admin'>('editor')
  const [selectedMemberModules, setSelectedMemberModules] = useState<ProjectModuleKey[]>([])
  const [memberAccountRole, setMemberAccountRole] = useState<'colab' | 'client'>('colab')
  const [memberName, setMemberName] = useState('')
  const [memberEmail, setMemberEmail] = useState('')
  const [memberTemporaryPassword, setMemberTemporaryPassword] = useState('')
  const [showMemberTemporaryPassword, setShowMemberTemporaryPassword] = useState(false)
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false)
  const [projectInviteResult, setProjectInviteResult] = useState<ProjectInviteResult | null>(null)
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false)
  const [memberForAccessReset, setMemberForAccessReset] = useState<ProjectMember | null>(null)
  const [memberAccessPassword, setMemberAccessPassword] = useState('')
  const [showMemberAccessPassword, setShowMemberAccessPassword] = useState(false)
  const [sendMemberPasswordByEmail, setSendMemberPasswordByEmail] = useState(true)

  // Load members of the active project
  const { data: projectMembers = [] } = useQuery({
    queryKey: ['project_members', activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return []
      const { data, error } = await supabase
        .from('project_users')
        .select(`
          id,
          permission_level,
          allowed_modules,
          ativo,
          criado_em,
          user_id,
          profiles!project_users_user_id_fkey (
            nome,
            email,
            agency_role,
            role
          )
        `)
        .eq('project_id', activeProjectId)
        .eq('ativo', true)
      if (error) {
        showToast('Erro ao carregar colaboradores do projeto', 'err')
        return []
      }
      return data as unknown as ProjectMember[]
    },
    enabled: !!activeProjectId,
  })

  // Load profiles in the agency (excluding those already in the project)
  const { data: agencyProfiles = [] } = useQuery({
    queryKey: ['agency_profiles', profile?.agency_id],
    queryFn: async () => {
      if (!profile?.agency_id) return []
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nome, email, agency_role, role')
        .eq('agency_id', profile.agency_id)
        .is('deleted_at', null)
      if (error) return []
      return data as AgencyProfile[]
    },
    enabled: !!profile?.agency_id,
  })

  // Load project access audit logs
  const { data: auditLogs = [] } = useQuery({
    queryKey: ['project_access_audit', activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return []
      const { data, error } = await supabase
        .from('project_access_audit')
        .select('*')
        .eq('project_id', activeProjectId)
        .order('criado_em', { ascending: false })
      if (error) return []
      return data as ProjectAccessAudit[]
    },
    enabled: !!activeProjectId,
  })

  const inviteProjectMemberMutation = useMutation({
    mutationFn: async (vars: {
      name: string
      email: string
      accountRole: 'colab' | 'client'
      level: 'viewer' | 'editor' | 'admin'
      modules: ProjectModuleKey[]
      temporaryPassword: string
    }) => {
      if (!activeProjectId) throw new Error('Selecione um projeto.')

      const response = await fetch('/api/project-users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProjectId,
          name: vars.name,
          email: vars.email,
          accountRole: vars.accountRole,
          permissionLevel: vars.level,
          modules: vars.modules,
          temporaryPassword: vars.temporaryPassword,
        }),
      })
      const data = await response.json() as {
        error?: string
        invited: boolean
        email: string
        temporaryPassword: string | null
        accessLink: string
      }

      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível criar o acesso.')
      }

      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['project_members', activeProjectId] })
      queryClient.invalidateQueries({ queryKey: ['project_access_audit', activeProjectId] })
      queryClient.invalidateQueries({ queryKey: ['agency_profiles', profile?.agency_id] })
      setIsMemberModalOpen(false)
      setProjectInviteResult(data)
      setMemberName('')
      setMemberEmail('')
      setMemberTemporaryPassword('')
      setShowMemberTemporaryPassword(false)
      setMemberAccountRole('colab')
      setSelectedMemberLevel('editor')
      setSelectedMemberModules([])
      showToast(
        data.invited
          ? 'Convite enviado e módulos liberados!'
          : 'Usuário vinculado e link de acesso enviado!',
      )
    },
    onError: (err: Error) => {
      showToast(err.message || 'Erro ao adicionar usuário', 'err')
    },
  })

  const handleInviteProjectMember = () => {
    if (!memberName.trim() || !memberEmail.trim()) {
      showToast('Informe o nome e o e-mail.', 'err')
      return
    }
    if (memberTemporaryPassword.length > 0 && memberTemporaryPassword.length < 8) {
      showToast('A senha temporária deve ter no mínimo 8 caracteres.', 'err')
      return
    }
    if (selectedMemberLevel !== 'admin' && selectedMemberModules.length === 0) {
      showToast('Selecione pelo menos um módulo.', 'err')
      return
    }

    inviteProjectMemberMutation.mutate({
      name: memberName.trim(),
      email: memberEmail.trim(),
      accountRole: memberAccountRole,
      level: selectedMemberLevel,
      modules: selectedMemberModules,
      temporaryPassword: memberTemporaryPassword,
    })
  }

  const openMemberModal = () => {
    setProjectInviteResult(null)
    setMemberName('')
    setMemberEmail('')
    setMemberTemporaryPassword('')
    setShowMemberTemporaryPassword(false)
    setMemberAccountRole('colab')
    setSelectedMemberLevel('editor')
    setSelectedMemberModules([])
    setIsMemberModalOpen(true)
  }

  const copyText = async (text: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(text)
      showToast(successMessage)
    } catch {
      showToast('Não foi possível copiar. Tente novamente pelo navegador.', 'err')
    }
  }

  const copyProjectInvite = () => {
    if (!projectInviteResult) return

    const message = [
      `Seu acesso ao Clave${activeProject?.name ? ` para o projeto ${activeProject.name}` : ''} foi liberado.`,
      '',
      `E-mail: ${projectInviteResult.email}`,
      projectInviteResult.temporaryPassword
        ? `Senha temporária: ${projectInviteResult.temporaryPassword}`
        : 'Use a senha que você já cadastrou no Clave.',
      '',
      `Acessar: ${projectInviteResult.accessLink}`,
      projectInviteResult.temporaryPassword
        ? 'No primeiro acesso, você deverá criar uma senha pessoal.'
        : '',
    ].filter(Boolean).join('\n')

    void copyText(message, 'Convite copiado. Já pode enviar pelo WhatsApp.')
  }

  const copyCurrentLoginLink = () => {
    const loginLink = new URL('/login', window.location.origin).toString()
    void copyText(loginLink, 'Link de acesso copiado.')
  }

  const updateProjectMemberMutation = useMutation({
    mutationFn: async (vars: {
      id: string
      level?: 'viewer' | 'editor' | 'admin'
      ativo?: boolean
      modules?: ProjectModuleKey[]
    }) => {
      const updateData: {
        permission_level?: 'viewer' | 'editor' | 'admin'
        ativo?: boolean
        revogado_em?: string | null
        allowed_modules?: ProjectModuleKey[]
      } = {}
      if (vars.level !== undefined) updateData.permission_level = vars.level
      if (vars.modules !== undefined) updateData.allowed_modules = vars.modules
      if (vars.ativo !== undefined) {
        updateData.ativo = vars.ativo
        if (!vars.ativo) {
          updateData.revogado_em = new Date().toISOString()
        } else {
          updateData.revogado_em = null
        }
      }
      const { error } = await supabase
        .from('project_users')
        .update(updateData)
        .eq('id', vars.id)
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['project_members', activeProjectId] })
      queryClient.invalidateQueries({ queryKey: ['project_access_audit', activeProjectId] })
      showToast(
        vars.ativo === false
          ? 'Acesso revogado. Para liberar novamente, adicione o usuário.'
          : 'Acesso atualizado!',
      )
    },
    onError: (err) => {
      showToast('Erro ao atualizar: ' + err.message, 'err')
    }
  })

  const manageProjectMemberAccessMutation = useMutation({
    mutationFn: async (vars: {
      member: ProjectMember
      action: 'change_password' | 'resend_link'
      temporaryPassword?: string
      sendEmail?: boolean
    }) => {
      if (!activeProjectId) throw new Error('Selecione um projeto.')

      const response = await fetch('/api/project-users/reset-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProjectId,
          userId: vars.member.user_id,
          action: vars.action,
          temporaryPassword: vars.temporaryPassword,
          sendEmail: vars.sendEmail,
        }),
      })
      const data = await response.json() as { error?: string; passwordChanged?: boolean }
      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível reenviar o acesso.')
      }
    },
    onSuccess: (_data, vars) => {
      setMemberForAccessReset(null)
      setMemberAccessPassword('')
      setShowMemberAccessPassword(false)
      setSendMemberPasswordByEmail(true)
      showToast(
        vars.action === 'change_password'
          ? vars.sendEmail
            ? 'Senha alterada e enviada por e-mail.'
            : 'Senha alterada. A troca será exigida no próximo login.'
          : 'Link de acesso reenviado por e-mail.',
      )
    },
    onError: (error: Error) => {
      showToast(error.message || 'Não foi possível gerenciar o acesso.', 'err')
    },
  })

  const openMemberAccessModal = (member: ProjectMember) => {
    setMemberAccessPassword('')
    setShowMemberAccessPassword(false)
    setSendMemberPasswordByEmail(true)
    setMemberForAccessReset(member)
  }

  const closeMemberAccessModal = () => {
    if (manageProjectMemberAccessMutation.isPending) return
    setMemberForAccessReset(null)
    setMemberAccessPassword('')
    setShowMemberAccessPassword(false)
    setSendMemberPasswordByEmail(true)
  }

  const handleChangeMemberPassword = () => {
    if (!memberForAccessReset) return
    if (memberAccessPassword.length < 8 || memberAccessPassword.length > 72) {
      showToast('A nova senha deve ter entre 8 e 72 caracteres.', 'err')
      return
    }
    manageProjectMemberAccessMutation.mutate({
      member: memberForAccessReset,
      action: 'change_password',
      temporaryPassword: memberAccessPassword,
      sendEmail: sendMemberPasswordByEmail,
    })
  }

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
    onError: (err: Error) => {
      showToast('Erro ao salvar colaborador: ' + (err.message || 'Erro desconhecido'), 'err')
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
    onError: (err: Error) => {
      showToast('Erro ao salvar cliente: ' + (err.message || 'Erro desconhecido'), 'err')
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
  const activeProject = projects.find((project) => project.id === activeProjectId)
  const currentProjectMember = projectMembers.find(
    (member) => member.user_id === profile?.id && member.ativo,
  )
  const canManageProject =
    isAdmin
    || profile?.agency_role === 'admin'
    || activeProject?.user_id === profile?.id
    || currentProjectMember?.permission_level === 'admin'

  return (
    <div className="space-y-6">
      {/* Subtabs header */}
      <div className="flex gap-1 border-b border-border-custom flex-wrap mb-4">
        <button
          onClick={() => setActiveSubTab('project_users')}
          className={`px-4 py-2 text-xs font-semibold cursor-pointer border-b-2 bg-transparent transition-colors duration-150 ${
            activeSubTab === 'project_users'
              ? 'border-text-custom text-text-custom'
              : 'border-transparent text-text2 hover:text-text-custom'
          }`}
        >
          Usuários e módulos
        </button>
        <button
          onClick={() => setActiveSubTab('colabs')}
          className={`px-4 py-2 text-xs font-semibold cursor-pointer border-b-2 bg-transparent transition-colors duration-150 ${
            activeSubTab === 'colabs'
              ? 'border-text-custom text-text-custom'
              : 'border-transparent text-text2 hover:text-text-custom'
          }`}
        >
          Cadastro interno da equipe
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
              <span className="text-xs font-bold text-text-custom block">Cadastro interno da equipe</span>
              <span className="text-[10px] text-text3 mt-0.5">Contatos e funções da operação</span>
            </div>
            {isAdmin && (
              <button
                onClick={() => openColabModal()}
                className="px-3 py-1.5 bg-text-custom text-surface hover:opacity-90 rounded text-[11px] font-semibold cursor-pointer transition-colors"
              >
                + Contato
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
                    {editColabId ? 'Editar contato' : 'Adicionar contato'}
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
          TAB: ACESSOS DO PROJETO
          ========================================== */}
      {activeSubTab === 'project_users' && (
        <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-5 animate-[fadeUp_0.15s_ease_both]">
          <div className="flex justify-between items-start border-b border-border-custom pb-3 flex-wrap gap-4">
            <div>
              <span className="text-xs font-bold text-text-custom block">Usuários e módulos do projeto</span>
              <span className="text-[10px] text-text3 mt-1 max-w-xl block">
                Defina quais funcionários e clientes podem entrar neste projeto e quais módulos ficam disponíveis para cada pessoa.
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsAuditModalOpen(true)}
                className="text-[11px] text-purple-custom hover:underline font-semibold cursor-pointer"
              >
                Ver histórico
              </button>
              {canManageProject && (
                <button
                  onClick={openMemberModal}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-text-custom text-surface rounded-md text-[11px] font-semibold hover:opacity-90"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Adicionar usuário
                </button>
              )}
            </div>
          </div>

          {/* Members Table */}
          <div className="overflow-x-auto border border-border-custom rounded-lg bg-surface2/30">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border-custom bg-surface2/60">
                  <th className="p-3 text-text3 font-semibold text-[10px] uppercase">Nome</th>
                  <th className="p-3 text-text3 font-semibold text-[10px] uppercase">E-mail</th>
                  <th className="p-3 text-text3 font-semibold text-[10px] uppercase">Papel na Agência</th>
                  <th className="p-3 text-text3 font-semibold text-[10px] uppercase">Nível no Projeto</th>
                  <th className="p-3 text-text3 font-semibold text-[10px] uppercase min-w-72">Módulos</th>
                  <th className="p-3 text-text3 font-semibold text-[10px] uppercase">Data Concessão</th>
                  <th className="p-3 text-text3 font-semibold text-[10px] uppercase">Status</th>
                  <th className="p-3 text-text3 font-semibold text-[10px] uppercase text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-custom">
                {projectMembers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-text3">
                      Nenhuma pessoa vinculada a este projeto.
                    </td>
                  </tr>
                ) : (
                  projectMembers.map((pm) => (
                    <tr key={pm.id} className="hover:bg-surface2/20 transition-colors">
                      <td className="p-3 font-bold text-text-custom">{pm.profiles?.nome || 'Convidado'}</td>
                      <td className="p-3 text-text2">{pm.profiles?.email || '-'}</td>
                      <td className="p-3 text-text3 capitalize">{pm.profiles?.agency_role || '-'}</td>
                      <td className="p-3">
                        <select
                          className="px-2.5 py-1 border border-border2 rounded bg-surface text-text-custom text-xs outline-none cursor-pointer"
                          value={pm.permission_level}
                          onChange={(e) => {
                            updateProjectMemberMutation.mutate({
                              id: pm.id,
                              level: e.target.value as 'viewer' | 'editor' | 'admin',
                            })
                          }}
                          disabled={!canManageProject}
                        >
                          <option value="viewer">Viewer</option>
                          <option value="editor">Editor</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="p-3">
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 min-w-64">
                          {MODULE_PERMISSIONS.map((module) => (
                            <label
                              key={module.key}
                              className="flex items-center gap-1.5 text-[10px] text-text2 cursor-pointer min-w-0"
                            >
                              <input
                                type="checkbox"
                                className="accent-purple-custom shrink-0"
                                checked={
                                  pm.permission_level === 'admin'
                                  || (pm.allowed_modules || []).includes(module.key)
                                }
                                disabled={
                                  !canManageProject
                                  || pm.permission_level === 'admin'
                                }
                                onChange={(event) => {
                                  const current = pm.allowed_modules || []
                                  const modules = event.target.checked
                                    ? [...current, module.key]
                                    : current.filter((key) => key !== module.key)
                                  updateProjectMemberMutation.mutate({
                                    id: pm.id,
                                    modules,
                                  })
                                }}
                              />
                              <span className="truncate">{module.name}</span>
                            </label>
                          ))}
                        </div>
                      </td>
                      <td className="p-3 text-text3">
                        {pm.criado_em ? new Date(pm.criado_em).toLocaleDateString('pt-BR') : '-'}
                      </td>
                      <td className="p-3">
                        <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                          Ativo
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openMemberAccessModal(pm)}
                            disabled={!canManageProject || !pm.profiles?.email}
                            className="inline-flex h-7 w-7 items-center justify-center rounded border border-border2 text-text2 transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
                            title="Gerenciar acesso"
                            aria-label={`Gerenciar acesso de ${pm.profiles?.nome || pm.profiles?.email || 'usuário'}`}
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm('Revogar este acesso? A pessoa sairá da lista e precisará ser adicionada novamente.')) {
                                updateProjectMemberMutation.mutate({ id: pm.id, ativo: false })
                              }
                            }}
                            disabled={!canManageProject}
                            className="cursor-pointer rounded border border-red-t/30 px-2 py-1 text-[10px] font-bold text-red-t transition-colors hover:bg-red-bg disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Revogar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* ADD OR INVITE USER MODAL */}
          {isMemberModalOpen && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-[2px] animate-fadeIn">
              <div className="bg-surface border border-border-custom rounded-lg p-5 shadow-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center border-b border-border-custom pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-text-custom">Adicionar usuário</h3>
                    <p className="text-[10px] text-text3 mt-0.5">
                      {activeProject?.name || 'Projeto selecionado'}
                    </p>
                  </div>
                  <button
                    onClick={() => setIsMemberModalOpen(false)}
                    className="text-text3 hover:text-text-custom cursor-pointer p-1"
                    aria-label="Fechar"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 text-xs">
                  <div>
                    <label className="text-[10px] font-bold text-text2 mb-1 block">
                      Nome completo
                    </label>
                    <input
                      value={memberName}
                      onChange={(event) => setMemberName(event.target.value)}
                      className="w-full px-3 py-2 border border-border2 rounded-md bg-surface text-text-custom outline-none focus:border-text-custom"
                      maxLength={120}
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-text2 mb-1 block">
                      E-mail
                    </label>
                    <input
                      type="email"
                      value={memberEmail}
                      onChange={(event) => setMemberEmail(event.target.value)}
                      className="w-full px-3 py-2 border border-border2 rounded-md bg-surface text-text-custom outline-none focus:border-text-custom"
                      maxLength={254}
                      autoComplete="off"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-bold text-text2 mb-1 block">
                      Senha temporária (opcional)
                    </label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text3" />
                      <input
                        type={showMemberTemporaryPassword ? 'text' : 'password'}
                        value={memberTemporaryPassword}
                        onChange={(event) => setMemberTemporaryPassword(event.target.value)}
                        className="w-full pl-9 pr-9 py-2 border border-border2 rounded-md bg-surface text-text-custom outline-none focus:border-text-custom"
                        maxLength={72}
                        autoComplete="new-password"
                        placeholder="Em branco: gerar automaticamente"
                      />
                      <button
                        type="button"
                        onClick={() => setShowMemberTemporaryPassword((current) => !current)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text3 hover:text-text-custom"
                        aria-label={showMemberTemporaryPassword ? 'Ocultar senha temporária' : 'Mostrar senha temporária'}
                      >
                        {showMemberTemporaryPassword
                          ? <EyeOff className="w-3.5 h-3.5" />
                          : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <p className="text-[10px] text-text3 mt-1">
                      A senha será enviada no convite e a troca será obrigatória no primeiro acesso.
                    </p>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-text2 mb-1 block">
                      Tipo de usuário
                    </label>
                    <select
                      value={memberAccountRole}
                      onChange={(event) =>
                        setMemberAccountRole(event.target.value as 'colab' | 'client')
                      }
                      className="w-full px-3 py-2 border border-border2 rounded-md bg-surface text-text-custom outline-none"
                    >
                      <option value="colab">Funcionário</option>
                      <option value="client">Cliente</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-text2 mb-1 block">
                      Nível no projeto
                    </label>
                    <select
                      value={selectedMemberLevel}
                      onChange={(event) =>
                        setSelectedMemberLevel(
                          event.target.value as 'viewer' | 'editor' | 'admin',
                        )
                      }
                      className="w-full px-3 py-2 border border-border2 rounded-md bg-surface text-text-custom outline-none"
                    >
                      <option value="viewer">Leitura</option>
                      <option value="editor">Edição</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>
                </div>

                <div className="mt-4 border-t border-border-custom pt-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <span className="text-[10px] text-text2 uppercase font-bold">
                      Módulos liberados
                    </span>
                    <div className="flex gap-3 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setSelectedMemberModules([...DEFAULT_PROJECT_MODULES])}
                        className="text-purple-custom hover:underline"
                      >
                        Marcar todos
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedMemberModules([])}
                        className="text-text3 hover:text-text-custom"
                      >
                        Limpar
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {MODULE_PERMISSIONS.map((module) => (
                      <label
                        key={module.key}
                        className="flex items-center gap-2 px-2.5 py-2 border border-border-custom rounded-md text-[11px] text-text2 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          className="accent-purple-custom shrink-0"
                          checked={
                            selectedMemberLevel === 'admin'
                            || selectedMemberModules.includes(module.key)
                          }
                          disabled={selectedMemberLevel === 'admin'}
                          onChange={(event) => {
                            setSelectedMemberModules((current) =>
                              event.target.checked
                                ? [...current, module.key]
                                : current.filter((key) => key !== module.key),
                            )
                          }}
                        />
                        <span>{module.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-border-custom">
                  <button
                    type="button"
                    onClick={() => setIsMemberModalOpen(false)}
                    className="px-3 py-2 border border-border2 rounded-md text-xs text-text2 hover:bg-surface2"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleInviteProjectMember}
                    disabled={inviteProjectMemberMutation.isPending}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-text-custom text-surface rounded-md text-xs font-semibold disabled:opacity-50"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    {inviteProjectMemberMutation.isPending
                      ? 'Adicionando...'
                      : 'Adicionar usuário'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {projectInviteResult && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px] animate-fadeIn">
              <div className="w-full max-w-md rounded-lg border border-border-custom bg-surface p-5 shadow-2xl">
                <div className="flex items-center justify-between gap-3 border-b border-border-custom pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-text-custom">Acesso liberado</h3>
                    <p className="mt-0.5 text-[10px] text-text3">{projectInviteResult.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setProjectInviteResult(null)}
                    className="p-1 text-text3 hover:text-text-custom"
                    aria-label="Fechar"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <p className="mt-4 text-xs leading-relaxed text-text2">
                  O acesso foi enviado por e-mail. Copie também a mensagem abaixo para encaminhar pelo WhatsApp caso seja necessário.
                </p>
                <div className="mt-4">
                  <label className="mb-1 block text-[10px] font-bold uppercase text-text3">
                    Link de acesso
                  </label>
                  <div className="break-all rounded-md border border-border2 bg-surface2 px-3 py-2 font-mono text-[10px] text-text2">
                    {projectInviteResult.accessLink}
                  </div>
                </div>
                <p className="mt-3 text-[10px] leading-relaxed text-text3">
                  {projectInviteResult.temporaryPassword
                    ? 'A mensagem copiada inclui o e-mail, a senha temporária e o link.'
                    : 'A mensagem copiada inclui o e-mail e o link para usar com a senha atual.'}
                </p>
                <div className="mt-5 grid grid-cols-1 gap-2 border-t border-border-custom pt-4 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={copyProjectInvite}
                    className="inline-flex items-center justify-center gap-1.5 rounded-md bg-text-custom px-3 py-2 text-xs font-semibold text-surface"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copiar convite
                  </button>
                  <button
                    type="button"
                    onClick={() => setProjectInviteResult(null)}
                    className="rounded-md border border-border2 px-3 py-2 text-xs text-text2 hover:bg-surface2"
                  >
                    Concluir
                  </button>
                </div>
              </div>
            </div>
          )}

          {memberForAccessReset && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px] animate-fadeIn">
              <div className="w-full max-w-md rounded-lg border border-border-custom bg-surface p-5 shadow-2xl">
                <div className="flex items-center justify-between gap-3 border-b border-border-custom pb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-purple-bg text-purple-custom">
                      <KeyRound className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-text-custom">Gerenciar acesso</h3>
                      <p className="mt-0.5 text-[10px] text-text3">
                        {memberForAccessReset.profiles?.email || 'E-mail não informado'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeMemberAccessModal}
                    disabled={manageProjectMemberAccessMutation.isPending}
                    className="p-1 text-text3 hover:text-text-custom disabled:opacity-40"
                    aria-label="Fechar"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4">
                  <label className="mb-1 block text-[10px] font-bold text-text2">
                    Nova senha temporária
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text3" />
                    <input
                      type={showMemberAccessPassword ? 'text' : 'password'}
                      value={memberAccessPassword}
                      onChange={(event) => setMemberAccessPassword(event.target.value)}
                      minLength={8}
                      maxLength={72}
                      autoComplete="new-password"
                      placeholder="Entre 8 e 72 caracteres"
                      className="w-full rounded-md border border-border2 bg-surface py-2 pl-9 pr-9 text-xs text-text-custom outline-none focus:border-text-custom"
                    />
                    <button
                      type="button"
                      onClick={() => setShowMemberAccessPassword((current) => !current)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-text3 hover:text-text-custom"
                      aria-label={showMemberAccessPassword ? 'Ocultar nova senha' : 'Mostrar nova senha'}
                    >
                      {showMemberAccessPassword
                        ? <EyeOff className="h-3.5 w-3.5" />
                        : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <p className="mt-1.5 text-[10px] leading-relaxed text-text3">
                    A senha atual deixará de funcionar e a troca será obrigatória no próximo login.
                  </p>
                  <label className="mt-3 flex cursor-pointer items-center gap-2 text-[11px] text-text2">
                    <input
                      type="checkbox"
                      checked={sendMemberPasswordByEmail}
                      onChange={(event) => setSendMemberPasswordByEmail(event.target.checked)}
                      className="accent-purple-custom"
                    />
                    Enviar a nova senha por e-mail
                  </label>
                  <button
                    type="button"
                    onClick={handleChangeMemberPassword}
                    disabled={manageProjectMemberAccessMutation.isPending || memberAccessPassword.length < 8}
                    className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-text-custom px-3 py-2 text-xs font-semibold text-surface disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    {manageProjectMemberAccessMutation.isPending
                      && manageProjectMemberAccessMutation.variables?.action === 'change_password'
                      ? 'Alterando...'
                      : 'Alterar senha'}
                  </button>
                </div>

                <div className="mt-5 border-t border-border-custom pt-4">
                  <p className="text-xs font-semibold text-text-custom">Reenviar link de acesso</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-text3">
                    Envia somente o caminho para o login. A senha atual não será modificada.
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={copyCurrentLoginLink}
                      disabled={manageProjectMemberAccessMutation.isPending}
                      className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border2 px-3 py-2 text-xs font-semibold text-text2 hover:bg-surface2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copiar link
                    </button>
                    <button
                      type="button"
                      onClick={() => manageProjectMemberAccessMutation.mutate({
                        member: memberForAccessReset,
                        action: 'resend_link',
                      })}
                      disabled={manageProjectMemberAccessMutation.isPending}
                      className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border2 px-3 py-2 text-xs font-semibold text-text2 hover:bg-surface2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      {manageProjectMemberAccessMutation.isPending
                        && manageProjectMemberAccessMutation.variables?.action === 'resend_link'
                        ? 'Enviando...'
                        : 'Reenviar link'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* AUDIT LOG MODAL */}
          {isAuditModalOpen && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-[2px] animate-fadeIn">
              <div className="bg-surface border border-border-custom rounded-xl p-6 shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto space-y-4">
                <div className="flex justify-between items-center border-b border-border-custom pb-3">
                  <h3 className="text-sm font-bold text-text-custom">
                    Histórico de Auditoria de Acessos
                  </h3>
                  <button onClick={() => setIsAuditModalOpen(false)} className="text-text3 hover:text-text-custom cursor-pointer p-1">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-2">
                  {auditLogs.length === 0 ? (
                    <p className="text-xs text-text3 text-center py-6">Nenhum evento de auditoria registrado.</p>
                  ) : (
                    auditLogs.map((log) => {
                      const targetName = agencyProfiles.find(u => u.id === log.target_user_id)?.nome || 'Usuário'
                      const actorName = agencyProfiles.find(u => u.id === log.actor_id)?.nome || 'Sistema'
                      
                      let msg = ''
                      if (log.acao === 'grant') msg = `Acesso concedido como ${log.nivel_novo}`
                      if (log.acao === 'revoke') msg = `Acesso revogado`
                      if (log.acao === 'update_level') msg = `Nível alterado de ${log.nivel_anterior} para ${log.nivel_novo}`
                      if (log.acao === 'update_modules') {
                        const enabled = log.modulos_novos?.length || 0
                        msg = `Módulos atualizados: ${enabled} liberados`
                      }

                      return (
                        <div key={log.id} className="p-3 bg-surface2/50 border border-border-custom rounded-lg text-xs space-y-1.5">
                          <div className="flex justify-between items-center text-[10px] text-text3">
                            <span className="font-bold text-text-custom capitalize">Ação: {log.acao}</span>
                            <span>{new Date(log.criado_em).toLocaleString('pt-BR')}</span>
                          </div>
                          <p className="text-text2 leading-normal">
                            Colaborador: <strong className="text-text-custom">{targetName}</strong> <br/>
                            {msg} por <strong className="text-text-custom">{actorName}</strong>
                          </p>
                        </div>
                      )
                    })
                  )}
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
