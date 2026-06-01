'use client'

import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore, MaturityLevel } from '@/store/useAppStore'
import { createClient } from '@/utils/supabase/client'
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
} from 'lucide-react'

interface AppShellProps {
  children: React.ReactNode
}

const LEVEL_DETAILS: Record<
  MaturityLevel,
  { name: string; color: string; bg: string; text: string; border: string }
> = {
  newbie: {
    name: 'Newbie',
    color: '#888780',
    bg: 'var(--gray-bg)',
    text: 'var(--gray-t)',
    border: '#B4B2A9',
  },
  soft: {
    name: 'Soft',
    color: '#1D9E75',
    bg: 'var(--green-bg)',
    text: 'var(--green-t)',
    border: '#9FE1CB',
  },
  hard: {
    name: 'Hard',
    color: '#185FA5',
    bg: 'var(--blue-bg)',
    text: 'var(--blue-t)',
    border: '#85B7EB',
  },
  pro: {
    name: 'Pro',
    color: '#534AB7',
    bg: 'var(--purple-bg)',
    text: 'var(--purple-t)',
    border: '#AFA9EC',
  },
  master: {
    name: 'Master',
    color: '#D85A30',
    bg: 'var(--coral-bg)',
    text: 'var(--coral-t)',
    border: '#F0997B',
  },
}

export default function AppShell({ children }: AppShellProps) {
  const router = useRouter()
  const supabase = createClient()
  const {
    sidebarCollapsed,
    toggleSidebar,
    activeModule,
    setActiveModule,
    currentLevel,
    setProfile,
    showToast,
  } = useAppStore()

  // 1. VERIFICAR AUTENTICAÇÃO E CARREGAR PERFIL
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
  const navItems = [
    {
      group: 'INÍCIO',
      items: [
        { id: 'home', name: 'Dashboard', icon: LayoutDashboard },
      ],
    },
    {
      group: 'MÓDULOS',
      items: [
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
        { id: 'acesso', name: 'Central de acesso', icon: Users },
      ],
    },
  ]

  const getModuleTitle = () => {
    for (const group of navItems) {
      const match = group.items.find((item) => item.id === activeModule)
      if (match) return match.name
    }
    return 'Dashboard'
  }

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-bg">
      {/* 1. SIDEBAR */}
      <aside
        className={`bg-surface border-r border-border-custom flex flex-col h-full shrink-0 transition-all duration-200 ease-in-out ${
          sidebarCollapsed ? 'w-[60px]' : 'w-[228px]'
        }`}
      >
        {/* Top Header */}
        <div className="flex items-center gap-2.5 px-3 py-3.5 border-b border-border-custom h-14 shrink-0 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-text-custom flex items-center justify-center shrink-0">
            <span className="text-white text-sm font-semibold select-none">C</span>
          </div>
          {!sidebarCollapsed && (
            <span className="text-sm font-semibold tracking-tight text-text-custom truncate flex-1">
              Clave
            </span>
          )}
          <button
            onClick={toggleSidebar}
            className="p-1 text-text3 hover:text-text-custom hover:bg-surface2 rounded-md shrink-0 transition-colors"
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>

        {/* Project Switcher */}
        <ProjectSwitcher />

        {/* Navigation List */}
        <nav className="flex-1 overflow-y-auto pt-2 space-y-3 scrollbar-thin">
          {navItems.map((group, gIdx) => (
            <div key={gIdx} className="space-y-0.5">
              {!sidebarCollapsed && (
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
                    onClick={() => setActiveModule(item.id)}
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
                    {!sidebarCollapsed && (
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
      <main className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-14 border-b border-border-custom bg-surface flex items-center justify-between px-6 gap-3 shrink-0">
          <div className="min-w-0 flex flex-col">
            <h2 className="text-[14px] font-semibold text-text-custom leading-tight">
              {getModuleTitle()}
            </h2>
            <p className="text-[11px] text-text3 truncate leading-normal">
              {activeModule === 'home' && 'Seu painel estratégico de controle'}
              {activeModule === 'concepcao' && 'Definição e análise do produto'}
              {activeModule === 'comunicacao' && 'Roteiros de copy e funis de vendas'}
              {activeModule === 'lancamentos' && 'Acompanhamento de eventos e picos de vendas'}
              {activeModule === 'validacao' && 'Central de anúncios e CRM de networking'}
              {activeModule === 'historias' && 'Banco de storytelling auxiliado por IA'}
              {activeModule === 'financeiro' && 'Gestão de caixa e planejamento do DRE'}
              {activeModule === 'planejador' && 'Calendário editorial e eventos anuais'}
              {activeModule === 'urlbuilder' && 'Gere tags UTM, links de WhatsApp e QR Codes'}
              {activeModule === 'acesso' && 'Permissões e equipe'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Maturity Badge */}
            <div
              className="flex items-center gap-1.5 px-3 py-1 border rounded-full text-xs font-medium cursor-default transition-all duration-150"
              style={{
                background: lvlDetail.bg,
                borderColor: lvlDetail.border,
                color: lvlDetail.text,
              }}
            >
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: lvlDetail.color }}
              />
              <span>{lvlDetail.name}</span>
            </div>

            <button
              onClick={() => setActiveModule('planejador')}
              className="px-3 py-1.5 text-xs border border-border2 bg-surface text-text-custom font-medium rounded-md hover:bg-surface2 cursor-pointer transition-colors"
            >
              Planejador
            </button>
            <button
              onClick={() => setActiveModule('urlbuilder')}
              className="px-3 py-1.5 text-xs border border-border2 bg-surface text-text-custom font-medium rounded-md hover:bg-surface2 cursor-pointer transition-colors"
            >
              Links & QR
            </button>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 text-xs border border-red-t/30 bg-surface text-red-t font-medium rounded-md hover:bg-red-bg cursor-pointer transition-colors flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair</span>
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          <div className="max-w-6xl mx-auto w-full">{children}</div>
        </div>
      </main>

      {/* Floating Notifications */}
      <Toast />
    </div>
  )
}
