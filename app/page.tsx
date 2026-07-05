'use client'

import React from 'react'
import { useAppStore } from '@/store/useAppStore'
import Providers from '@/components/Providers'
import AppShell from '@/components/AppShell'

// Import all modules
import DashboardModule from '@/components/modules/DashboardModule'
import ConcepcaoModule from '@/components/modules/ConcepcaoModule'
import ComunicacaoModule from '@/components/modules/ComunicacaoModule'
import LancamentosModule from '@/components/modules/LancamentosModule'
import ValidacaoModule from '@/components/modules/ValidacaoModule'
import HistoriasModule from '@/components/modules/HistoriasModule'
import FinanceiroModule from '@/components/modules/FinanceiroModule'
import PlanejadorModule from '@/components/modules/PlanejadorModule'
import UrlBuilderModule from '@/components/modules/UrlBuilderModule'
import AcessoModule from '@/components/modules/AcessoModule'
import ChipsModule from '@/components/modules/ChipsModule'

export default function Home() {
  const { activeModule } = useAppStore()

  const renderModule = () => {
    switch (activeModule) {
      case 'home':
        return <DashboardModule />
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
      case 'acesso':
        return <AcessoModule />
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
