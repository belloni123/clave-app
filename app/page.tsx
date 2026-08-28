'use client'

import React from 'react'
import dynamic from 'next/dynamic'
import { useAppStore } from '@/store/useAppStore'
import Providers from '@/components/Providers'
import AppShell from '@/components/AppShell'

import DashboardModule from '@/components/modules/DashboardModule'

function ModuleLoading() {
  return (
    <div className="space-y-4 animate-pulse" aria-label="Carregando módulo">
      <div className="h-24 rounded-xl border border-border-custom bg-surface" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="h-36 rounded-xl border border-border-custom bg-surface" />
        <div className="h-36 rounded-xl border border-border-custom bg-surface" />
        <div className="h-36 rounded-xl border border-border-custom bg-surface" />
      </div>
    </div>
  )
}

// Keep the dashboard in the initial bundle and load every secondary module
// only when the user opens it. This prevents the whole workspace from blocking
// the first render.
const ClienteModule = dynamic(() => import('@/components/modules/ClienteModule'), { loading: ModuleLoading })
const ConcepcaoModule = dynamic(() => import('@/components/modules/ConcepcaoModule'), { loading: ModuleLoading })
const ComunicacaoModule = dynamic(() => import('@/components/modules/ComunicacaoModule'), { loading: ModuleLoading })
const LancamentosModule = dynamic(() => import('@/components/modules/LancamentosModule'), { loading: ModuleLoading })
const ValidacaoModule = dynamic(() => import('@/components/modules/ValidacaoModule'), { loading: ModuleLoading })
const HistoriasModule = dynamic(() => import('@/components/modules/HistoriasModule'), { loading: ModuleLoading })
const FinanceiroModule = dynamic(() => import('@/components/modules/FinanceiroModule'), { loading: ModuleLoading })
const PlanejadorModule = dynamic(() => import('@/components/modules/PlanejadorModule'), { loading: ModuleLoading })
const UrlBuilderModule = dynamic(() => import('@/components/modules/UrlBuilderModule'), { loading: ModuleLoading })
const ChipsModule = dynamic(() => import('@/components/modules/ChipsModule'), { loading: ModuleLoading })
const FormulariosModule = dynamic(() => import('@/components/modules/FormulariosModule'), { loading: ModuleLoading })
const InstagramModule = dynamic(() => import('@/components/modules/InstagramModule'), { loading: ModuleLoading })
const AcessoModule = dynamic(() => import('@/components/modules/AcessoModule'), { loading: ModuleLoading })
const AdminSmtpModule = dynamic(() => import('@/components/modules/AdminSmtpModule'), { loading: ModuleLoading })
const CandidaturasModule = dynamic(() => import('@/components/modules/CandidaturasModule'), { loading: ModuleLoading })
const MonitoramentoModule = dynamic(() => import('@/components/modules/MonitoramentoModule'), { loading: ModuleLoading })

export default function Home() {
  const { activeModule } = useAppStore()

  const renderModule = () => {
    switch (activeModule) {
      case 'home':
        return <DashboardModule />
      case 'cliente':
        return <ClienteModule />
      case 'concepcao':
        return <ConcepcaoModule />
      case 'comunicacao':
        return <ComunicacaoModule />
      case 'lancamentos':
        return <LancamentosModule />
      case 'validacao':
        return <ValidacaoModule />
      case 'historias':
        return <HistoriasModule />
      case 'financeiro':
        return <FinanceiroModule />
      case 'planejador':
        return <PlanejadorModule />
      case 'urlbuilder':
        return <UrlBuilderModule />
      case 'chips':
        return <ChipsModule />
      case 'formularios':
        return <FormulariosModule />
      case 'instagram':
        return <InstagramModule />
      case 'acesso':
        return <AcessoModule />
      case 'configuracoes':
        return <AdminSmtpModule />
      case 'candidaturas':
        return <CandidaturasModule />
      case 'monitoramento':
        return <MonitoramentoModule />
      default:
        return <DashboardModule />
    }
  }

  return (
    <Providers>
      <AppShell>
        {renderModule()}
      </AppShell>
    </Providers>
  )
}
