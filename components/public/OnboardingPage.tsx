'use client'

import Image from 'next/image'
import React, { useEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowDown,
  BadgeCheck,
  Boxes,
  BriefcaseBusiness,
  Check,
  CloudCog,
  Compass,
  Files,
  Fingerprint,
  Flag,
  FolderKanban,
  LockKeyhole,
  MessageSquareText,
  Palette,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Target,
  UsersRound,
} from 'lucide-react'

interface IconItem {
  icon: LucideIcon
  title: string
  description: string
}

interface MaterialGroup {
  icon: LucideIcon
  title: string
  items: string[]
  accent: string
  iconBackground: string
}

const onboardingPillars: IconItem[] = [
  {
    icon: ScanSearch,
    title: 'Imersão no negócio',
    description: 'Conhecemos a empresa, seus produtos, serviços, público, posicionamento, diferenciais, objetivos e principais desafios.',
  },
  {
    icon: FolderKanban,
    title: 'Organização das informações',
    description: 'Centralizamos materiais e referências para que nossa equipe tenha uma visão mais completa do projeto.',
  },
  {
    icon: Target,
    title: 'Definição de prioridades',
    description: 'Analisamos o momento atual do cliente para identificar necessidades, oportunidades e prioridades.',
  },
  {
    icon: MessageSquareText,
    title: 'Alinhamento inicial',
    description: 'Organizamos responsabilidades, canais de comunicação, aprovações e os elementos necessários para o início do trabalho.',
  },
]

const materialGroups: MaterialGroup[] = [
  {
    icon: Palette,
    title: 'Identidade visual',
    items: [
      'Logotipos em boa qualidade',
      'Manual ou guia da marca',
      'Paleta de cores e tipografias',
      'Elementos gráficos e arquivos editáveis',
      'Aplicações anteriores da marca',
    ],
    accent: 'text-[#705900]',
    iconBackground: 'bg-[#fff4bd]',
  },
  {
    icon: Files,
    title: 'Conteúdos e materiais',
    items: [
      'Fotografias e vídeos',
      'Apresentações, catálogos e portfólios',
      'Materiais comerciais e textos utilizados',
      'Informações sobre produtos e serviços',
      'Campanhas e conteúdos anteriores',
    ],
    accent: 'text-[#155b49]',
    iconBackground: 'bg-[#e1f2eb]',
  },
  {
    icon: BadgeCheck,
    title: 'Provas e referências',
    items: [
      'Depoimentos de clientes ou alunos',
      'Estudos de caso e resultados alcançados',
      'Perguntas frequentes',
      'Objeções comuns do público',
      'Referências de comunicação e posicionamento',
    ],
    accent: 'text-[#944225]',
    iconBackground: 'bg-[#f9e7df]',
  },
  {
    icon: CloudCog,
    title: 'Plataformas e ativos digitais',
    items: [
      'Sites, páginas, domínios e redes sociais',
      'Plataformas de cursos e áreas de membros',
      'Ferramentas de marketing e automação',
      'Contas de anúncios e análise',
      'Sistemas relacionados ao projeto contratado',
    ],
    accent: 'text-[#174f83]',
    iconBackground: 'bg-[#e4eef8]',
  },
]

const collaborationItems = [
  { icon: Boxes, text: 'Centralizar as informações solicitadas' },
  { icon: Files, text: 'Disponibilizar materiais atualizados' },
  { icon: UsersRound, text: 'Indicar os responsáveis pelas decisões' },
  { icon: MessageSquareText, text: 'Enviar feedbacks claros e objetivos' },
  { icon: Flag, text: 'Comunicar mudanças importantes no negócio' },
  { icon: ShieldCheck, text: 'Respeitar os canais e prazos combinados' },
]

function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
}) {
  const elementRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const element = elementRef.current
    if (!element) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const frame = window.requestAnimationFrame(() => setVisible(true))
      return () => window.cancelAnimationFrame(frame)
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setVisible(true)
        observer.disconnect()
      },
      { threshold: 0.12 },
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={elementRef}
      className={`${className} transform-gpu transition-[opacity,transform] duration-700 ease-out ${visible ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'}`}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
    >
      {children}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-3 text-xs font-bold uppercase text-[#176b52]">
      <span className="h-px w-8 bg-[#f3c600]" aria-hidden="true" />
      {children}
    </p>
  )
}

export default function OnboardingPage() {
  return (
    <main className="overflow-x-hidden bg-[#f5f4f0] text-[#1a1916]">
      <section className="relative h-[88svh] min-h-[600px] max-h-[900px] overflow-hidden border-b-4 border-[#f3c600]" aria-labelledby="onboarding-title">
        <Image
          src="/images/onboarding-hero.webp"
          alt="Equipe reunida em torno de uma mesa organizando a estratégia de um novo projeto"
          fill
          priority
          sizes="100vw"
          className="scale-[1.02] object-cover object-[68%_center] motion-safe:animate-[hero-settle_1.4s_ease-out_both] md:object-center"
        />
        <div className="absolute inset-0 bg-white/80 md:right-auto md:w-[55%] md:bg-white/88" aria-hidden="true" />

        <div className="relative mx-auto flex h-full max-w-7xl flex-col px-5 py-6 sm:px-8 md:px-12 lg:px-16">
          <header className="flex items-center justify-between gap-4">
            <Image src="/logo_black.svg" alt="Agência B16" width={132} height={25} className="h-auto w-[116px] sm:w-[132px]" />
            <span className="border border-black/15 bg-white/70 px-3 py-1.5 text-xs font-semibold text-[#292722] backdrop-blur-sm">
              Experiência do cliente
            </span>
          </header>

          <div className="flex flex-1 items-center py-10">
            <div className="max-w-[610px]">
              <p className="text-xs font-bold uppercase text-[#6f5900] sm:text-sm">Onboarding B16</p>
              <h1 id="onboarding-title" className="mt-4 max-w-[590px] text-4xl font-bold leading-[1.04] sm:text-5xl lg:text-[68px]">
                Seu projeto começa aqui
              </h1>
              <div className="mt-6 max-w-[590px] space-y-4 text-base leading-7 text-[#4d4941] sm:text-lg sm:leading-8">
                <p>Com o contrato assinado, iniciamos uma etapa essencial para o desenvolvimento do projeto. O onboarding é o momento em que organizamos informações, reunimos os materiais necessários e aprofundamos nosso entendimento sobre sua empresa, seus objetivos e o cenário atual da operação.</p>
                <p className="font-semibold text-[#24221e]">Esse processo nos permite começar o trabalho com mais clareza, alinhamento e segurança.</p>
              </div>
            </div>
          </div>

          <a
            href="#metodologia"
            className="mb-1 inline-flex w-fit items-center gap-2 text-sm font-semibold text-[#34312c] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1a1916]"
          >
            Conheça o processo
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </section>

      <section id="metodologia" className="scroll-mt-8 bg-[#171715] text-white">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 md:px-12 md:py-28 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:gap-20 lg:px-16">
          <Reveal>
            <SectionLabel>Metodologia PD3</SectionLabel>
            <h2 className="mt-5 text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">Estratégia ajustada à realidade de cada negócio.</h2>
            <div className="mt-7 space-y-5 text-base leading-7 text-white/72">
              <p>Ao longo dos anos, a Agência B16 acumulou experiência em projetos de marketing, posicionamento, tecnologia e desenvolvimento digital. A partir desse conhecimento, consolidamos nossa própria metodologia de trabalho, a PD3.</p>
              <p>A metodologia orienta nossas decisões e ajuda a organizar cada projeto de acordo com o estágio, a maturidade, os objetivos e as necessidades de cada cliente.</p>
              <p>Cada empresa possui uma realidade diferente. Por isso, antes de definir prioridades e ações, buscamos compreender o momento atual do negócio e identificar o que precisa ser desenvolvido, corrigido ou fortalecido.</p>
            </div>
          </Reveal>

          <Reveal delay={120} className="relative aspect-[4/3] overflow-hidden border border-white/10">
            <Image
              src="/images/onboarding-methodology.webp"
              alt="Materiais de estratégia sendo organizados sobre uma mesa de planejamento"
              fill
              sizes="(max-width: 1024px) 100vw, 58vw"
              className="object-cover transition-transform duration-700 hover:scale-[1.015]"
            />
            <div className="absolute bottom-0 left-0 flex items-center gap-2 bg-[#f3c600] px-4 py-3 text-xs font-bold uppercase text-[#1a1916]">
              <Fingerprint className="h-4 w-4" aria-hidden="true" />
              Diagnóstico antes da ação
            </div>
          </Reveal>
        </div>
      </section>

      <section className="bg-[#f5f4f0]" aria-labelledby="processo-title">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 md:px-12 md:py-28 lg:px-16">
          <Reveal className="max-w-3xl">
            <SectionLabel>Base do projeto</SectionLabel>
            <h2 id="processo-title" className="mt-5 text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">Como conduzimos o início do projeto</h2>
            <p className="mt-6 text-base leading-7 text-[#5f5a52] sm:text-lg sm:leading-8">O onboarding cria a base necessária para que a equipe da Agência B16 compreenda o negócio e organize o início do trabalho. A condução é adaptada ao escopo contratado e à realidade de cada cliente.</p>
          </Reveal>

          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {onboardingPillars.map((pillar, index) => {
              const Icon = pillar.icon
              return (
                <Reveal key={pillar.title} delay={index * 70} className="h-full">
                  <article className="group flex h-full min-h-[270px] flex-col border border-[#d8d5ce] bg-white p-6 shadow-[0_2px_8px_rgba(36,33,27,0.04)] transition-[border-color,transform,box-shadow] hover:-translate-y-1 hover:border-[#aaa59b] hover:shadow-[0_14px_35px_rgba(36,33,27,0.08)]">
                    <div className="flex h-11 w-11 items-center justify-center bg-[#1a1916] text-[#f3c600]">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <span className="mt-8 text-xs font-semibold text-[#8b867d]">0{index + 1}</span>
                    <h3 className="mt-2 text-lg font-bold text-[#24221e]">{pillar.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-[#656057]">{pillar.description}</p>
                  </article>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      <section className="border-y border-[#dedbd4] bg-white" aria-labelledby="materials-title">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 md:px-12 md:py-28 lg:px-16">
          <Reveal className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20">
            <div>
              <SectionLabel>Preparação</SectionLabel>
              <h2 id="materials-title" className="mt-5 text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">O que precisamos receber</h2>
            </div>
            <p className="text-base leading-7 text-[#5f5a52] sm:text-lg sm:leading-8">Para desenvolver o trabalho com consistência e preservar tudo o que já foi construído pela empresa, é importante que a Agência B16 tenha acesso aos materiais, ativos e informações existentes.</p>
          </Reveal>

          <div className="mt-12 grid gap-px overflow-hidden border border-[#dcd9d2] bg-[#dcd9d2] md:grid-cols-2">
            {materialGroups.map((group, index) => {
              const Icon = group.icon
              return (
                <Reveal key={group.title} delay={index * 60} className="h-full bg-white">
                  <article className="h-full bg-white p-6 sm:p-8">
                    <div className="flex items-center gap-4">
                      <span className={`flex h-11 w-11 shrink-0 items-center justify-center ${group.iconBackground} ${group.accent}`}>
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <h3 className="text-lg font-bold text-[#25231f]">{group.title}</h3>
                    </div>
                    <ul className="mt-6 space-y-3 text-sm leading-6 text-[#5d5850]">
                      {group.items.map((item) => (
                        <li key={item} className="flex items-start gap-3">
                          <Check className={`mt-1 h-4 w-4 shrink-0 ${group.accent}`} aria-hidden="true" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                </Reveal>
              )
            })}
          </div>

          <Reveal className="mt-8 flex items-start gap-4 border-l-4 border-[#f3c600] bg-[#f4f2ed] px-5 py-5 sm:px-6">
            <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-[#155b49]" aria-hidden="true" />
            <p className="text-sm font-medium leading-6 text-[#444038]">Por segurança, senhas e credenciais deverão ser compartilhadas pelo processo indicado pela equipe da Agência B16.</p>
          </Reveal>
        </div>
      </section>

      <section className="bg-[#ece9e3]" aria-labelledby="collaboration-title">
        <div className="mx-auto grid max-w-7xl gap-14 px-5 py-20 sm:px-8 md:px-12 md:py-28 lg:grid-cols-[0.9fr_1.1fr] lg:gap-24 lg:px-16">
          <Reveal>
            <SectionLabel>Trabalho conjunto</SectionLabel>
            <h2 id="collaboration-title" className="mt-5 text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">Clareza e colaboração durante o projeto</h2>
            <p className="mt-6 text-base leading-7 text-[#5f5a52] sm:text-lg sm:leading-8">Um bom projeto depende de comunicação clara e colaboração entre as partes. Ao longo do trabalho, a equipe da Agência B16 poderá solicitar informações, materiais, validações e aprovações relacionadas ao escopo contratado.</p>
          </Reveal>

          <div className="grid content-start gap-px border-y border-[#cbc7be]">
            {collaborationItems.map((item, index) => {
              const Icon = item.icon
              return (
                <Reveal key={item.text} delay={index * 50}>
                  <div className="flex min-h-16 items-center gap-4 border-b border-[#cbc7be] py-4 last:border-b-0">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-white text-[#176b52]">
                      <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                    </span>
                    <p className="font-semibold text-[#35322d]">{item.text}</p>
                  </div>
                </Reveal>
              )
            })}
          </div>

          <Reveal className="lg:col-span-2">
            <div className="grid gap-5 border-t border-[#aaa69d] pt-8 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-6">
              <div className="flex h-12 w-12 items-center justify-center bg-[#1a1916] text-[#f3c600]">
                <Compass className="h-6 w-6" aria-hidden="true" />
              </div>
              <p className="max-w-4xl text-base font-semibold leading-7 text-[#39362f]">A frequência das reuniões, entregas e aprovações será definida de acordo com as características e necessidades de cada projeto.</p>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="bg-[#f3c600] text-[#171613]">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-14 sm:px-8 md:flex-row md:items-center md:justify-between md:px-12 lg:px-16">
          <Reveal className="max-w-3xl">
            <p className="flex items-center gap-2 text-xs font-bold uppercase">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Próxima etapa
            </p>
            <h2 className="mt-3 text-2xl font-bold leading-tight sm:text-3xl">Informação organizada. Decisões mais seguras. Um início mais consistente.</h2>
          </Reveal>
          <BriefcaseBusiness className="hidden h-12 w-12 shrink-0 md:block" aria-hidden="true" />
        </div>
      </section>

      <footer className="bg-[#171715] text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8 md:px-12 lg:px-16">
          <Image src="/logo_white.svg" alt="Agência B16" width={116} height={22} className="h-auto w-[116px]" />
          <p className="text-sm text-white/55">Estratégia, posicionamento, tecnologia e desenvolvimento digital.</p>
        </div>
      </footer>

      <style jsx global>{`
        @keyframes hero-settle {
          from { opacity: 0.7; transform: scale(1.045); }
          to { opacity: 1; transform: scale(1.02); }
        }

        @media (prefers-reduced-motion: reduce) {
          html { scroll-behavior: auto; }
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            scroll-behavior: auto !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </main>
  )
}
