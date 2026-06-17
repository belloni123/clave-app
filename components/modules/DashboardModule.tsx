'use client'

import React from 'react'
import { useAppStore, MaturityLevel } from '@/store/useAppStore'
import {
  Lightbulb,
  MessageSquare,
  Rocket,
  ShieldCheck,
  BookOpen,
  Calendar,
} from 'lucide-react'

interface PrioItem {
  module: string
  label: string
}

interface LevelConfig {
  name: string
  color: string
  bg: string
  border: string
  text: string
  msg: string
  prios: PrioItem[]
}

const LEVEL_CONFIGS: Record<MaturityLevel, LevelConfig> = {
  newbie: {
    name: 'Fundação',
    color: '#888780',
    bg: 'bg-gray-bg/40',
    border: 'border-border-custom',
    text: 'text-gray-t',
    msg: 'Foco do nível: vender, não criar. Oferta definida, processo simples de atendimento e pelo menos 1 canal ativo.',
    prios: [
      { module: 'concepcao', label: 'Prioridade 1' },
      { module: 'comunicacao', label: 'Prioridade 2' },
      { module: 'lancamentos', label: 'Em seguida' },
      { module: 'validacao', label: 'Depois' },
    ],
  },
  soft: {
    name: 'Estruturação',
    color: '#1D9E75',
    bg: 'bg-green-bg/30',
    border: 'border-green-custom/20',
    text: 'text-green-t',
    msg: 'Foco do nível: consistência. Cadência de conteúdo, leads organizados e funil básico documentado.',
    prios: [
      { module: 'comunicacao', label: 'Prioridade 1' },
      { module: 'validacao', label: 'Prioridade 2' },
      { module: 'lancamentos', label: 'Em seguida' },
      { module: 'concepcao', label: 'Ajuste fino' },
    ],
  },
  hard: {
    name: 'Tração',
    color: '#185FA5',
    bg: 'bg-blue-bg/30',
    border: 'border-blue-custom/20',
    text: 'text-blue-t',
    msg: 'Foco do nível: escalar aquisição pelo canal mais barato. Investimento estruturado em tráfego e funil conhecido.',
    prios: [
      { module: 'lancamentos', label: 'Prioridade 1' },
      { module: 'validacao', label: 'Prioridade 2' },
      { module: 'comunicacao', label: 'Em seguida' },
      { module: 'concepcao', label: 'Ajuste fino' },
    ],
  },
  pro: {
    name: 'Expansão',
    color: '#534AB7',
    bg: 'bg-purple-bg/35',
    border: 'border-purple-custom/20',
    text: 'text-purple-t',
    msg: 'Foco do nível: diversificar com segurança. Início de delegação, equipe e teste de novos canais.',
    prios: [
      { module: 'validacao', label: 'Prioridade 1' },
      { module: 'lancamentos', label: 'Prioridade 2' },
      { module: 'concepcao', label: 'Em seguida' },
      { module: 'comunicacao', label: 'Ajuste fino' },
    ],
  },
  master: {
    name: 'Escala',
    color: '#D85A30',
    bg: 'bg-coral-bg/30',
    border: 'border-coral-custom/20',
    text: 'text-coral-t',
    msg: 'Foco do nível: previsibilidade e margem. Múltiplos canais ativos com dados confiáveis e equipe estruturada.',
    prios: [
      { module: 'validacao', label: 'Prioridade 1' },
      { module: 'lancamentos', label: 'Prioridade 2' },
      { module: 'comunicacao', label: 'Em seguida' },
      { module: 'concepcao', label: 'Expansão' },
    ],
  },
}

const MODULE_NAMES: Record<string, string> = {
  concepcao: 'Concepção',
  comunicacao: 'Comunicação',
  lancamentos: 'Lançamentos',
  validacao: 'Validação direta',
}

export default function DashboardModule() {
  const { currentLevel, setActiveModule, getActiveProject } = useAppStore()

  const config = LEVEL_CONFIGS[currentLevel] || LEVEL_CONFIGS.newbie
  const activeProj = getActiveProject()

  const homeCards = [
    {
      id: 'concepcao',
      title: 'Concepção do produto',
      desc: 'Matriz, precificação e benchmarking',
      bg: 'bg-green-bg/25',
      icon: Lightbulb,
      iconColor: 'text-green-custom',
    },
    {
      id: 'comunicacao',
      title: 'Elementos de comunicação',
      desc: 'Identidade, urgências, VSL e página',
      bg: 'bg-blue-bg/25',
      icon: MessageSquare,
      iconColor: 'text-blue-custom',
    },
    {
      id: 'lancamentos',
      title: 'Lançamentos',
      desc: 'Validação, evento pago e pico de vendas',
      bg: 'bg-amber-bg/25',
      icon: Rocket,
      iconColor: 'text-amber-custom',
    },
    {
      id: 'validacao',
      title: 'Validação direta',
      desc: 'Anúncios, networking e projetos',
      bg: 'bg-purple-bg/25',
      icon: ShieldCheck,
      iconColor: 'text-purple-custom',
    },
    {
      id: 'historias',
      title: 'Banco de histórias',
      desc: 'Ativos de storytelling com IA',
      bg: 'bg-coral-bg/25',
      icon: BookOpen,
      iconColor: 'text-coral-custom',
    },
    {
      id: 'planejador',
      title: 'Planejador anual',
      desc: 'Calendário e agenda de eventos',
      bg: 'bg-gray-bg/40',
      icon: Calendar,
      iconColor: 'text-text2',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="p-4 bg-surface border border-border-custom rounded-xl shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="text-sm font-semibold text-text-custom">
            Projeto: {activeProj?.name || 'Projeto padrão'}
          </h3>
          <p className="text-xs text-text2 mt-1">
            Status geral do workspace. Mude o seu nível de maturidade na barra lateral para adaptar as recomendações.
          </p>
        </div>
      </div>

      {/* Priorities Recommended Banner */}
      <div
        className={`border p-5 rounded-xl transition-colors duration-150 ${config.bg} ${config.border}`}
      >
        <p className="text-xs font-bold text-text-custom">
          {config.name} — Prioridades Recomendadas
        </p>
        <p className={`text-xs mt-1.5 leading-relaxed opacity-90 ${config.text}`}>
          {config.msg}
        </p>

        <div className="flex flex-col gap-2 mt-4">
          {config.prios.map((p, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <div
                className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0 shadow-sm"
                style={{ background: config.color }}
              >
                {idx + 1}
              </div>
              <span className="text-xs font-semibold text-text-custom">
                {MODULE_NAMES[p.module]}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-black/5 text-text2 font-medium">
                {p.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Navigation Cards */}
      <div>
        <h4 className="text-xs font-bold text-text-custom tracking-wide uppercase mb-3.5">
          Acessar Módulos
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {homeCards.map((card) => {
            const IconComp = card.icon
            return (
              <div
                key={card.id}
                onClick={() => setActiveModule(card.id)}
                className="bg-surface border border-border-custom hover:border-border2 hover:shadow-md rounded-xl p-4.5 cursor-pointer transition-all duration-150 flex flex-col items-start"
              >
                <div className={`p-2.5 rounded-lg mb-4.5 shrink-0 ${card.bg}`}>
                  <IconComp className={`w-5 h-5 ${card.iconColor}`} />
                </div>
                <h5 className="text-xs font-semibold text-text-custom mb-1">
                  {card.title}
                </h5>
                <p className="text-[11px] text-text2 leading-normal">
                  {card.desc}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
