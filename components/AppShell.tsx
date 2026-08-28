'use client'

import React, { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useAppStore, MaturityLevel } from '@/store/useAppStore'
import { createClient } from '@/utils/supabase/client'
import {
  DEFAULT_PROJECT_MODULES,
  type AppModuleKey,
  type ProjectModuleKey,
} from '@/utils/module-access'
import ProjectSwitcher from './ProjectSwitcher'
import LevelSelector from './LevelSelector'
import Toast from './Toast'
import {
  LayoutDashboard,
  Lightbulb,
  MessageSquare,
  Rocket,
  ShieldCheck,
  BookOpen,
  DollarSign,
  Calendar,
  Link2,
  Users,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
  Smartphone,
  Settings,
  ClipboardList,
  ContactRound,
  FileUser,
  Activity,
  Camera as InstagramIcon,
} from 'lucide-react'

interface AppShellProps {
  children: React.ReactNode
}

const LEVEL_DETAILS: Record<
  MaturityLevel,
  { name: string; color: string; badgeClass: string; dotClass: string }
> = {
  newbie: {
    name: 'Fundação',
    color: '#888780',
    badgeClass: 'bg-gray-bg border-border2 text-gray-t',
    dotClass: 'bg-[#888780]',
  },
  soft: {
    name: 'Estruturação',
    color: '#1D9E75',
    badgeClass: 'bg-green-bg border-green-custom/30 text-green-t',
    dotClass: 'bg-[#1D9E75]',
  },
  hard: {
    name: 'Tração',
    color: '#185FA5',
    badgeClass: 'bg-blue-bg border-blue-custom/30 text-blue-t',
    dotClass: 'bg-[#185FA5]',
  },
  pro: {
    name: 'Expansão',
    color: '#534AB7',
    badgeClass: 'bg-purple-bg border-purple-custom/30 text-purple-t',
    dotClass: 'bg-[#534AB7]',
  },
  master: {
    name: 'Escala',
    color: '#D85A30',
    badgeClass: 'bg-coral-bg border-coral-custom/30 text-coral-t',
    dotClass: 'bg-[#D85A30]',
  },
}

export default function AppShell({ children }: AppShellProps) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const {
    sidebarCollapsed,
    toggleSidebar,
    activeModule,
    setActiveModule,
    currentLevel,
    profile,
    projects,
    activeProjectId,
    setProfile,
    allowedModules,
    setAllowedModules,
    showToast,
    theme,
    setTheme,
    toggleTheme,
  } = useAppStore()

  const [mobileOpen, setMobileOpen] = useState(false)
  const requestedModuleRef = useRef<AppModuleKey | null>(
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('activeModule') as AppModuleKey | null,
  )

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const instagramStatus = params.get('instagram')
    if (instagramStatus === 'connected') showToast('Instagram conectado com sucesso')
    if (instagramStatus === 'cancelled') showToast('Conexão com o Instagram cancelada', 'err')
    if (instagramStatus === 'invalid_state') showToast('A conexão expirou. Tente novamente.', 'err')
    if (instagramStatus === 'not_configured') showToast('Configure as chaves do Instagram no servidor.', 'err')
    if (instagramStatus === 'error') showToast('Não foi possível conectar o Instagram.', 'err')
  }, [showToast])

  // 1. INICIALIZAR TEMA
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('clave_theme') as 'light' | 'dark' | null
      const finalTheme = savedTheme || 'dark'
      setTheme(finalTheme)
      if (finalTheme === 'dark') {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    }
  }, [setTheme])

  // 2. VERIFICAR AUTENTICAÇÃO E CARREGAR PERFIL
  useEffect(() => {
    async function getSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        router.push('/login')
        return
      }

      // Buscar perfil do banco de dados
      const { data: dbProfile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()

      if (error || !dbProfile) {
        // Se der erro ou não houver perfil, criar um perfil de cliente básico
        const { data: newProfile, error: insertError } = await supabase
          .from('profiles')
          .insert({
            id: session.user.id,
            role: 'client',
            plan: 'free',
            max_projects: 2,
          })
          .select()
          .single()

        if (insertError) {
          // Se for erro de duplicidade (código PG 23505), o perfil já existe.
          // Tentamos buscá-lo novamente de forma silenciosa para prosseguir.
          if (insertError.code === '23505') {
            const { data: retryProfile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .single()
            if (retryProfile) {
              setProfile(retryProfile)
              return
            }
          }
          showToast('Erro ao criar perfil de usuário', 'err')
          return
        }
        setProfile(newProfile)
      } else {
        setProfile(dbProfile)
      }
    }

    getSession()
  }, [supabase, router, setProfile, showToast])

  useEffect(() => {
    if (
      profile?.must_change_password
      && typeof window !== 'undefined'
      && window.location.pathname !== '/definir-senha'
    ) {
      router.replace('/definir-senha?obrigatoria=1')
    }
  }, [profile, router])

  // 3. CARREGAR OS MÓDULOS LIBERADOS PARA O PROJETO ATIVO
  useEffect(() => {
    let cancelled = false

    async function loadAllowedModules() {
      if (!profile) {
        setAllowedModules(['home'])
        return
      }

      if (profile.role === 'admin' || profile.agency_role === 'admin') {
        setAllowedModules([
          'home',
          ...DEFAULT_PROJECT_MODULES,
          'candidaturas',
          'monitoramento',
          'configuracoes',
        ])
        return
      }

      if (!activeProjectId) {
        setAllowedModules(['home'])
        return
      }

      const activeProject = projects.find(
        (project) => project.id === activeProjectId,
      )
      if (activeProject?.user_id === profile.id) {
        setAllowedModules(['home', ...DEFAULT_PROJECT_MODULES])
        return
      }

      const { data, error } = await supabase
        .from('project_users')
        .select('allowed_modules, ativo, permission_level')
        .eq('project_id', activeProjectId)
        .eq('user_id', profile.id)
        .maybeSingle()

      if (cancelled) return

      if (error || !data?.ativo) {
        setAllowedModules(['home'])
        return
      }

      if (data.permission_level === 'admin') {
        setAllowedModules(['home', ...DEFAULT_PROJECT_MODULES])
        return
      }

      const modules = ((data.allowed_modules || []) as string[]).filter(
        (module: string): module is ProjectModuleKey =>
          DEFAULT_PROJECT_MODULES.includes(module as ProjectModuleKey),
      )
      setAllowedModules(['home', ...modules])
    }

    loadAllowedModules()
    return () => {
      cancelled = true
    }
  }, [activeProjectId, profile, projects, setAllowedModules, supabase])

  useEffect(() => {
    if (!allowedModules.includes(activeModule)) {
      const timer = setTimeout(() => setActiveModule('home'), 0)
      return () => clearTimeout(timer)
    }
  }, [activeModule, allowedModules, setActiveModule])

  useEffect(() => {
    const requestedModule = requestedModuleRef.current
    if (!requestedModule || !allowedModules.includes(requestedModule)) return
    setActiveModule(requestedModule)
    requestedModuleRef.current = null
    const url = new URL(window.location.href)
    url.searchParams.delete('activeModule')
    url.searchParams.delete('instagram')
    url.searchParams.delete('sync')
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  }, [allowedModules, setActiveModule])

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      showToast('Erro ao deslogar', 'err')
    } else {
      setProfile(null)
      showToast('Sessão encerrada')
      router.push('/login')
    }
  }

  const lvlDetail = LEVEL_DETAILS[currentLevel] || LEVEL_DETAILS.newbie

  // Menu items config
  type NavGroup = {
    group: string
    items: Array<{
      id: AppModuleKey
      name: string
      icon: React.ComponentType<{ className?: string }>
    }>
  }

  const allNavItems: NavGroup[] = [
    {
      group: 'INÍCIO',
      items: [
        { id: 'home', name: 'Dashboard', icon: LayoutDashboard },
      ],
    },
    {
      group: 'MÓDULOS',
      items: [
        { id: 'cliente', name: 'Cliente & Evolução', icon: ContactRound },
        { id: 'concepcao', name: 'Concepção', icon: Lightbulb },
        { id: 'comunicacao', name: 'Comunicação', icon: MessageSquare },
        { id: 'lancamentos', name: 'Lançamentos', icon: Rocket },
        { id: 'validacao', name: 'Validação direta', icon: ShieldCheck },
        { id: 'historias', name: 'Banco de histórias', icon: BookOpen },
        { id: 'financeiro', name: 'Financeiro', icon: DollarSign },
      ],
    },
    {
      group: 'FERRAMENTAS',
      items: [
        { id: 'planejador', name: 'Planejador', icon: Calendar },
        { id: 'urlbuilder', name: 'Links & QR Code', icon: Link2 },
        { id: 'chips', name: 'Controle de Chips', icon: Smartphone },
        { id: 'formularios', name: 'Formulários', icon: ClipboardList },
        { id: 'instagram', name: 'Instagram', icon: InstagramIcon },
        { id: 'acesso', name: 'Central de acesso', icon: Users },
      ],
    },
    {
      group: 'ADMINISTRAÇÃO',
      items: [
        { id: 'candidaturas', name: 'Candidaturas', icon: FileUser },
        { id: 'monitoramento', name: 'Monitoramento', icon: Activity },
        { id: 'configuracoes', name: 'Configurações', icon: Settings },
      ],
    },
  ]

  const navItems = allNavItems.map((group) => ({
    ...group,
    items: group.items.filter((item) => allowedModules.includes(item.id)),
  }))

  const getModuleTitle = () => {
    for (const group of navItems) {
      const match = group.items.find((item) => item.id === activeModule)
      if (match) return match.name
    }
    return 'Dashboard'
  }

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-bg relative print:block print:h-auto print:w-auto print:overflow-visible">
      {/* Mobile Backdrop Overlay */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-black/45 z-40 md:hidden backdrop-blur-[2px] transition-opacity duration-200"
        />
      )}

      {/* 1. SIDEBAR (drawer on mobile, static on desktop) */}
      <aside
        className={`bg-surface border-r border-border-custom flex flex-col h-full shrink-0 z-50 transition-all duration-200 ease-in-out print:hidden
          fixed inset-y-0 left-0 md:static md:translate-x-0 ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          } ${
            sidebarCollapsed ? 'md:w-[60px] w-[228px]' : 'w-[228px]'
          }`}
      >
        {/* Top Header */}
        <div className="flex items-center gap-2.5 px-3 py-3.5 border-b border-border-custom h-14 shrink-0 min-w-0">
          {sidebarCollapsed && !mobileOpen ? (
            <Image
              src="/favicon.svg"
              alt="Clave"
              width={28}
              height={28}
              className="w-7 h-7 object-contain shrink-0"
            />
          ) : (
            <Image
              src={theme === 'dark' ? '/logo_white.svg' : '/logo_black.svg'}
              alt="B16 Clave"
              width={120}
              height={28}
              className="h-7 object-contain max-w-[120px] shrink-0"
            />
          )}
          <button
            onClick={toggleSidebar}
            className="p-1 text-text3 hover:text-text-custom hover:bg-surface2 rounded-md shrink-0 transition-colors md:block hidden"
          >
            <Menu className="w-4 h-4" />
          </button>
          <button
            onClick={() => setMobileOpen(false)}
            className="p-1 text-text3 hover:text-text-custom hover:bg-surface2 rounded-md shrink-0 transition-colors md:hidden block"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Project Switcher */}
        <ProjectSwitcher />

        {/* Navigation List */}
        <nav className="flex-1 overflow-y-auto pt-2 space-y-3 scrollbar-thin">
          {navItems.map((group, gIdx) => (
            <div key={gIdx} className="space-y-0.5">
              {(!sidebarCollapsed || mobileOpen) && (
                <div className="text-[10px] font-semibold tracking-wider text-text3 px-4 py-1.5 uppercase">
                  {group.group}
                </div>
              )}
              {group.items.map((item) => {
                const IconComponent = item.icon
                const isActive = activeModule === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveModule(item.id)
                      setMobileOpen(false)
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-all duration-150 border-l-2 ${
                      isActive
                        ? 'bg-surface2/85 font-semibold text-text-custom border-purple-custom'
                        : 'text-text2 hover:bg-surface2/40 hover:text-text-custom border-transparent hover:translate-x-0.5'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 flex items-center justify-center shrink-0 ${
                        isActive ? 'text-text-custom' : 'text-text3'
                      }`}
                    >
                      <IconComponent className="w-4 h-4" />
                    </div>
                    {(!sidebarCollapsed || mobileOpen) && (
                      <span className="text-xs text-left truncate flex-1">{item.name}</span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Level Selector */}
        <LevelSelector />
      </aside>

      {/* 2. MAIN PANEL */}
      <main className="flex-1 flex flex-col h-full min-w-0 overflow-hidden print:block print:h-auto print:overflow-visible">
        {/* Topbar */}
        <header className="h-14 border-b border-border-custom bg-surface flex items-center justify-between px-4 md:px-6 gap-3 shrink-0 print:hidden">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileOpen(true)}
              className="p-1.5 text-text3 hover:text-text-custom hover:bg-surface2 rounded-md shrink-0 transition-colors md:hidden block"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0 flex flex-col">
              <h2 className="text-[14px] font-semibold text-text-custom leading-tight">
                {getModuleTitle()}
              </h2>
              <p className="text-[11px] text-text3 truncate leading-normal hidden sm:block">
                {activeModule === 'home' && 'Seu painel estratégico de controle'}
                {activeModule === 'cliente' && 'Perfil, marco de entrada e evolução do cliente'}
                {activeModule === 'concepcao' && 'Definição e análise do produto'}
                {activeModule === 'comunicacao' && 'Roteiros de copy e funis de vendas'}
                {activeModule === 'lancamentos' && 'Acompanhamento de eventos e picos de vendas'}
                {activeModule === 'validacao' && 'Central de anúncios e CRM de networking'}
                {activeModule === 'historias' && 'Banco de storytelling auxiliado por IA'}
                {activeModule === 'financeiro' && 'Gestão de caixa e planejamento do DRE'}
                {activeModule === 'planejador' && 'Calendário editorial e eventos anuais'}
                {activeModule === 'urlbuilder' && 'Gere tags UTM, links de WhatsApp e QR Codes'}
                {activeModule === 'chips' && 'Status, vínculos e alertas de recarga dos chips de WhatsApp'}
                {activeModule === 'formularios' && 'Links públicos, respostas e briefings do projeto'}
                {activeModule === 'instagram' && 'Crescimento, alcance e performance de conteúdo'}
                {activeModule === 'acesso' && 'Permissões e equipe'}
                {activeModule === 'candidaturas' && 'Avaliação de experts e conversão em projetos'}
                {activeModule === 'monitoramento' && 'Erros, ocorrências e acompanhamento operacional'}
                {activeModule === 'configuracoes' && 'Configurações globais e integrações administrativas'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Maturity Badge */}
            <div
              className={`flex items-center gap-1.5 px-3 py-1 border rounded-full text-xs font-medium cursor-default transition-all duration-150 sm:flex hidden ${lvlDetail.badgeClass}`}
            >
              <div
                className={`w-2 h-2 rounded-full shrink-0 ${lvlDetail.dotClass}`}
              />
              <span>{lvlDetail.name}</span>
            </div>

            <a
              href="https://crm.agenciab16.com.br"
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1.5 text-xs bg-green-custom text-white font-semibold rounded-md hover:opacity-90 cursor-pointer transition-all flex items-center gap-1.5 shadow-sm shadow-green-custom/20 border border-green-custom/10"
            >
              <DollarSign className="w-3.5 h-3.5 shrink-0 text-white" />
              <span>Meu Comercial</span>
            </a>

            <button
              onClick={() => setActiveModule('planejador')}
              className="px-2.5 py-1.5 text-xs border border-border2 bg-surface text-text-custom font-medium rounded-md hover:bg-surface2 cursor-pointer transition-colors sm:block hidden"
            >
              Planejador
            </button>
            <button
              onClick={() => setActiveModule('urlbuilder')}
              className="px-2.5 py-1.5 text-xs border border-border2 bg-surface text-text-custom font-medium rounded-md hover:bg-surface2 cursor-pointer transition-colors sm:block hidden"
            >
              Links & QR
            </button>
            <button
              onClick={toggleTheme}
              className="p-1.5 border border-border2 bg-surface text-text-custom rounded-md hover:bg-surface2 cursor-pointer transition-colors flex items-center justify-center shrink-0"
              title={theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={handleLogout}
              className="px-2.5 py-1.5 text-xs border border-red-t/30 bg-surface text-red-t font-medium rounded-md hover:bg-red-bg cursor-pointer transition-colors flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="sm:inline hidden">Sair</span>
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 scrollbar-thin print:overflow-visible print:p-0">
          <div className="max-w-6xl mx-auto w-full print:max-w-none">{children}</div>
        </div>
      </main>

      {/* Floating Notifications */}
      <div className="print:hidden"><Toast /></div>
    </div>
  )
}
