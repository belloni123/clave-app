'use client'

import React, { useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ExternalLink,
  Loader2,
  LockKeyhole,
  PlayCircle,
  Send,
  ShieldCheck,
} from 'lucide-react'
import {
  EMPTY_EXPERT_APPLICATION,
  type DigitalProduct,
  type ExpertApplicationAnswers,
  type PartnershipExperience,
} from '@/types/expert-application'
import {
  DIGITAL_PRODUCT_OPTIONS,
  OTHER_PLATFORM_OPTIONS,
  PARTNERSHIP_OPTIONS,
  REVENUE_OPTIONS,
  TIMELINE_OPTIONS,
  TRAFFIC_OPTIONS,
  formatCurrencyInput,
  formatWhatsapp,
  validateExpertApplication,
  type ExpertApplicationErrors,
} from '@/utils/forms/expert-application'

type Authorization = '' | 'yes' | 'no'
type SubmissionState = 'idle' | 'submitting' | 'success' | 'error'

interface FieldProps {
  id: keyof ExpertApplicationAnswers
  label: string
  help?: string
  error?: string
  children: React.ReactNode
}

const inputClass = 'w-full rounded-md border border-[#d8d5ce] bg-white px-3.5 py-3 text-[15px] text-[#1a1916] outline-none transition-colors placeholder:text-[#9a968e] focus:border-[#171613] focus:ring-2 focus:ring-[#f3c600]/35 disabled:cursor-not-allowed disabled:bg-[#efede8] disabled:text-[#87837a]'

function RequiredMark() {
  return <span className="ml-1 text-[#b73a28]" aria-hidden="true">*</span>
}

function Field({ id, label, help, error, children }: FieldProps) {
  return (
    <fieldset
      data-field={id}
      className="min-w-0 border-0 p-0"
      aria-describedby={[help ? `${id}-help` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined}
    >
      <legend className="mb-2 block w-full text-sm font-semibold text-[#24221e]">
        {label}<RequiredMark />
      </legend>
      {help && <p id={`${id}-help`} className="mb-2 text-sm text-[#6c6860]">{help}</p>}
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-2 text-sm font-medium text-[#a62d22]">
          {error}
        </p>
      )}
    </fieldset>
  )
}

function CheckboxGroup<T extends string>({
  field,
  options,
  selected,
  onToggle,
  error,
}: {
  field: keyof ExpertApplicationAnswers
  options: Array<{ value: T; label: string }>
  selected: T[]
  onToggle: (value: T) => void
  error?: string
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((option, index) => {
        const checked = selected.includes(option.value)
        return (
          <label
            key={option.value}
            className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-3.5 py-2.5 text-sm transition-colors ${
              checked
                ? 'border-[#1d6d57] bg-[#e8f5ef] text-[#104f40]'
                : error
                  ? 'border-[#d78b82] bg-[#fff8f7] text-[#35322d]'
                  : 'border-[#d8d5ce] bg-white text-[#35322d] hover:border-[#8c877d]'
            }`}
          >
            <input
              id={index === 0 ? `field-${field}` : undefined}
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(option.value)}
              className="peer sr-only"
            />
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${checked ? 'border-[#1d6d57] bg-[#1d6d57] text-white' : 'border-[#a5a097] bg-white'}`}>
              {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
            </span>
            <span>{option.label}</span>
          </label>
        )
      })}
    </div>
  )
}

function RadioGroup<T extends string>({
  field,
  options,
  value,
  onChange,
  error,
}: {
  field: keyof ExpertApplicationAnswers
  options: Array<{ value: T; label: string }>
  value: T | ''
  onChange: (value: T) => void
  error?: string
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((option, index) => {
        const checked = value === option.value
        return (
          <label
            key={option.value}
            className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-3.5 py-2.5 text-sm transition-colors ${
              checked
                ? 'border-[#1a1916] bg-[#f3c600]/15 text-[#1a1916]'
                : error
                  ? 'border-[#d78b82] bg-[#fff8f7] text-[#35322d]'
                  : 'border-[#d8d5ce] bg-white text-[#35322d] hover:border-[#8c877d]'
            }`}
          >
            <input
              id={index === 0 ? `field-${field}` : undefined}
              type="radio"
              name={field}
              checked={checked}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${checked ? 'border-[#1a1916]' : 'border-[#a5a097]'}`}>
              {checked && <span className="h-2.5 w-2.5 rounded-full bg-[#1a1916]" />}
            </span>
            <span>{option.label}</span>
          </label>
        )
      })}
    </div>
  )
}

function ExternalTextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-semibold text-[#155f9b] underline decoration-[#155f9b]/35 underline-offset-4 transition-colors hover:text-[#0d456f] focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#155f9b]"
    >
      {children}
      <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    </a>
  )
}

export default function ExpertApplicationForm() {
  const [step, setStep] = useState<1 | 2>(1)
  const [authorization, setAuthorization] = useState<Authorization>('')
  const [answers, setAnswers] = useState<ExpertApplicationAnswers>(EMPTY_EXPERT_APPLICATION)
  const [errors, setErrors] = useState<ExpertApplicationErrors>({})
  const [submitState, setSubmitState] = useState<SubmissionState>('idle')
  const [submitError, setSubmitError] = useState('')
  const idempotencyKey = useRef(crypto.randomUUID())
  const startedAt = useRef(new Date().toISOString())
  const [companyWebsite, setCompanyWebsite] = useState('')
  const formSectionRef = useRef<HTMLElement>(null)

  const progress = step === 1 ? 50 : 100
  const authorizationError = errors.authorization

  const update = <K extends keyof ExpertApplicationAnswers>(
    field: K,
    value: ExpertApplicationAnswers[K],
  ) => {
    setAnswers((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }))
    setSubmitError('')
    if (submitState === 'error') setSubmitState('idle')
  }

  const toggleSimple = <T extends string>(field: 'otherPlatforms', value: T) => {
    const selected = answers[field] as T[]
    update(field, (selected.includes(value)
      ? selected.filter((item) => item !== value)
      : [...selected, value]) as ExpertApplicationAnswers[typeof field])
  }

  const toggleProduct = (value: DigitalProduct) => {
    const current = answers.digitalProducts
    if (value === 'none') {
      update('digitalProducts', current.includes('none') ? [] : ['none'])
      return
    }
    const withoutNone = current.filter((item) => item !== 'none')
    update('digitalProducts', withoutNone.includes(value)
      ? withoutNone.filter((item) => item !== value)
      : [...withoutNone, value])
  }

  const togglePartnership = (value: PartnershipExperience) => {
    const independent = value === 'starting_now' || value === 'worked_alone'
    const incompatible = independent
      ? new Set<PartnershipExperience>(['freelancers', 'agency', 'partnership'])
      : new Set<PartnershipExperience>(['starting_now', 'worked_alone'])
    const compatibleCurrent = answers.partnershipExperience.filter((item) => !incompatible.has(item))
    update('partnershipExperience', compatibleCurrent.includes(value)
      ? compatibleCurrent.filter((item) => item !== value)
      : [...compatibleCurrent, value])
  }

  const continueToForm = () => {
    if (authorization !== 'yes') {
      setErrors((current) => ({ ...current, authorization: 'Selecione “Sim” para continuar.' }))
      return
    }
    setErrors({})
    setStep(2)
    window.setTimeout(() => formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 20)
  }

  const focusFirstError = (nextErrors: ExpertApplicationErrors) => {
    const first = Object.keys(nextErrors)[0]
    if (!first) return
    const target = document.querySelector<HTMLElement>(
      `[data-field="${first}"] input, [data-field="${first}"] textarea, [data-field="${first}"] select, [data-field="${first}"] button`,
    )
    target?.focus()
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submitState === 'submitting' || submitState === 'success') return

    const nextErrors = validateExpertApplication(answers)
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      focusFirstError(nextErrors)
      return
    }

    setSubmitState('submitting')
    setSubmitError('')
    setErrors({})

    try {
      const response = await fetch('/api/public/expert-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...answers,
          authorization: 'yes',
          idempotencyKey: idempotencyKey.current,
          startedAt: startedAt.current,
          companyWebsite,
        }),
      })
      const data = await response.json() as {
        error?: string
        errors?: ExpertApplicationErrors
      }

      if (!response.ok) {
        if (data.errors) {
          setErrors(data.errors)
          focusFirstError(data.errors)
        }
        throw new Error(data.error || 'Não foi possível enviar a candidatura.')
      }

      setSubmitState('success')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      setSubmitState('error')
      setSubmitError(error instanceof Error ? error.message : 'Não foi possível enviar a candidatura.')
    }
  }

  const launchOptions = useMemo(
    () => Array.from({ length: 11 }, (_, value) => ({ value: String(value), label: String(value) })),
    [],
  )

  if (submitState === 'success') {
    return (
      <main className="min-h-screen bg-[#f5f4f0] text-[#1a1916]">
        <section className="mx-auto flex min-h-screen max-w-3xl items-center px-5 py-12 sm:px-8">
          <div className="w-full border-t-4 border-[#f3c600] bg-white px-6 py-10 shadow-[0_18px_60px_rgba(30,28,23,0.12)] sm:px-12 sm:py-14">
            <Image src="/logo_black.svg" alt="Agência B16" width={132} height={32} className="h-8 w-auto" />
            <div className="mt-10 flex h-12 w-12 items-center justify-center rounded-full bg-[#e3f4ec] text-[#176b52]">
              <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
            </div>
            <p className="mt-6 text-xs font-bold uppercase text-[#176b52]">Candidatura recebida</p>
            <h1 className="mt-2 text-3xl font-bold text-[#1a1916] sm:text-4xl">Obrigado pelo seu tempo.</h1>
            <div className="mt-6 space-y-5 text-base leading-7 text-[#555149]">
              <p>Obrigado por dedicar um tempo ao preenchimento deste formulário. Sabemos que o tempo de um Expert é valioso.</p>
              <p>
                Para agilizar nossa análise, envie um direct para{' '}
                <ExternalTextLink href="https://www.instagram.com/franciscoeugeniio/">@franciscoeugeniio</ExternalTextLink>{' '}
                avisando que preencheu este formulário, por favor.
              </p>
              <p>Nos falamos em breve!</p>
              <p>
                Acompanhe nossos trabalhos em{' '}
                <ExternalTextLink href="https://www.instagram.com/agencia16/">@agenciab16</ExternalTextLink>.
              </p>
              <p className="font-bold text-[#1a1916]">Estamos unidos na oração e no Trabalho!</p>
            </div>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f5f4f0] text-[#1a1916]">
      <section className="relative min-h-[78svh] overflow-hidden border-b-4 border-[#f3c600]" aria-labelledby="hero-title">
        <Image
          src="/images/expert-application-hero.webp"
          alt="Expert e equipe de estratégia reunidos em um estúdio de conteúdo"
          fill
          priority
          sizes="100vw"
          className="object-cover object-[66%_center] md:object-center"
        />
        <div className="absolute inset-0 bg-black/55 md:bg-transparent" aria-hidden="true" />
        <div className="absolute inset-y-0 left-0 hidden w-[40%] bg-white/45 md:block" aria-hidden="true" />
        <div className="relative mx-auto flex min-h-[78svh] max-w-7xl flex-col px-5 py-6 sm:px-8 md:px-12">
          <header className="flex items-center justify-between">
            <Image src="/logo_white.svg" alt="Agência B16" width={126} height={30} className="h-7 w-auto md:hidden" />
            <Image src="/logo_black.svg" alt="Agência B16" width={126} height={30} className="hidden h-7 w-auto md:block" />
            <span className="border border-white/35 bg-black/20 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm md:border-black/15 md:bg-white/70 md:text-[#1a1916]">
              Candidatura de experts
            </span>
          </header>
          <div className="flex flex-1 items-end pb-12 pt-16 md:items-center md:pb-0 md:pt-8">
            <div className="max-w-lg text-white md:max-w-[430px] md:text-[#171613]">
              <p className="mb-4 text-sm font-bold uppercase text-[#f3c600] md:text-[#745c00]">Parcerias B16</p>
              <h1 id="hero-title" className="text-4xl font-bold leading-[1.08] sm:text-5xl md:text-[58px]">
                <span className="block">Expert —</span>
                <span className="block">Agência B16</span>
              </h1>
              <p className="mt-5 max-w-[400px] text-base leading-7 text-white/90 md:text-lg md:text-[#3f3b35]">
                Procuramos especialistas com repertório, propósito e disposição para construir projetos digitais relevantes em parceria.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="sticky top-0 z-20 border-b border-[#dad7d0] bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-5 py-3 sm:px-8">
          <span className="shrink-0 text-xs font-bold uppercase text-[#4f4b44]">Etapa {step} de 2</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#e7e4de]" aria-label={`${progress}% concluído`}>
            <div className="h-full rounded-full bg-[#1d6d57] transition-[width] duration-500" style={{ width: `${progress}%` }} />
          </div>
          <span className="w-9 text-right text-xs font-semibold text-[#6d6961]">{progress}%</span>
        </div>
      </div>

      {step === 1 ? (
        <section className="mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-16" aria-labelledby="presentation-title">
          <div className="grid items-stretch gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)] lg:gap-14">
            <div>
              <p className="text-xs font-bold uppercase text-[#176b52]">Apresentação</p>
              <h2 id="presentation-title" className="mt-2 max-w-2xl text-3xl font-bold sm:text-4xl">Uma parceria para construir com profundidade.</h2>
              <div className="mt-7 space-y-5 text-base leading-7 text-[#57534c]">
                <p>
                  Já pensou em ter ao seu lado profissionais que já faturaram alguns <strong className="text-[#1a1916]">milhões na internet</strong>, que investem centenas de milhares de reais em formações, participando de <strong className="text-[#1a1916]">Mentorias</strong> e <strong className="text-[#1a1916]">Masterminds</strong> com os principais nomes do mercado e, o mais importante, mantendo um posicionamento alinhado à moral cristã? Estamos fazendo isso desde 2016. Na <strong className="text-[#1a1916]">B16</strong>, temos uma grande responsabilidade e muita ambição para chegar ainda mais longe.
                </p>
                <p>Se deseja conhecer um pouco mais sobre a B16, nosso fundador participou de um podcast no qual conta um pouco da nossa história e dos nossos resultados.</p>
                <a
                  href="https://www.youtube.com/watch?v=gdoSAy7RPnw&t=48s"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-12 items-center gap-3 border-b-2 border-[#f3c600] py-2 font-bold text-[#1a1916] transition-colors hover:border-[#176b52] hover:text-[#176b52] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#176b52]"
                >
                  <PlayCircle className="h-5 w-5 text-[#176b52]" aria-hidden="true" />
                  Assista ao episódio
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
            </div>
            <aside className="flex flex-col bg-[#191815] px-6 py-7 text-white sm:px-8 sm:py-9">
              <p className="text-xs font-bold uppercase text-[#f3c600]">Em boa companhia</p>
              <h3 className="mt-2 text-2xl font-bold leading-tight">Experts e sócios que constroem com a B16</h3>
              <ul className="mt-6 border-b border-white/15" aria-label="Experts e sócios da B16">
                {[
                  ['01', 'Juliano Cazarré', 'https://www.instagram.com/cazarre/'],
                  ['02', 'Maestro Thiago Santos', 'https://www.instagram.com/maestro.thiagosantos/'],
                  ['03', 'Farol e a Forja', 'https://www.instagram.com/faroleforja/'],
                  ['04', 'Haroldo Lourenço', 'https://www.instagram.com/prof_haroldolourenco/'],
                  ['05', 'Mundial Cromo', 'https://www.instagram.com/mundialcromo/'],
                ].map(([number, name, href]) => (
                  <li key={href} className="border-t border-white/15">
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex min-h-12 items-center gap-3 py-3 text-sm font-semibold transition-colors hover:text-[#f3c600] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#f3c600]"
                    >
                      <span className="w-6 shrink-0 text-xs font-bold text-[#f3c600]">{number}</span>
                      <span className="flex-1">{name}</span>
                      <ExternalLink className="h-3.5 w-3.5 text-white/50 transition-colors group-hover:text-[#f3c600]" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
              <div className="mt-auto flex items-start gap-3 border-t border-white/15 pt-6 text-sm leading-6 text-white/70">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#7dc7ac]" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-white">Avaliação reservada</p>
                  <p className="mt-1">As informações desta candidatura serão analisadas somente pelos sócios da B16.</p>
                </div>
              </div>
            </aside>
          </div>

          <div className="mt-14 border-y border-[#d8d5ce] py-9" data-field="authorization">
            <fieldset>
              <legend className="max-w-3xl text-lg font-bold leading-7 text-[#24221e]">
                Você gostaria de se candidatar a uma parceria como expert e autoriza que seus dados sejam utilizados em nossos processos de avaliação interna?<RequiredMark />
              </legend>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {([
                  { value: 'yes' as const, label: 'Sim' },
                  { value: 'no' as const, label: 'Não, muito obrigado.' },
                ]).map((option) => (
                  <label key={option.value} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-md border px-4 py-3 transition-colors ${authorization === option.value ? 'border-[#1a1916] bg-white' : 'border-[#d8d5ce] hover:border-[#8c877d]'}`}>
                    <input
                      type="radio"
                      name="authorization"
                      value={option.value}
                      checked={authorization === option.value}
                      onChange={() => {
                        setAuthorization(option.value)
                        setErrors((current) => ({ ...current, authorization: undefined }))
                      }}
                      className="h-4 w-4 accent-[#1d6d57]"
                    />
                    <span className="font-medium">{option.label}</span>
                  </label>
                ))}
              </div>
              {authorizationError && <p role="alert" className="mt-3 text-sm font-medium text-[#a62d22]">{authorizationError}</p>}
              {authorization === 'no' && (
                <div className="mt-5 border-l-2 border-[#1d6d57] bg-[#e8f5ef] px-4 py-3 text-sm leading-6 text-[#104f40]">
                  Agradecemos por conhecer melhor a B16. Respeitamos sua escolha e nenhum dado de candidatura será solicitado ou armazenado.
                </div>
              )}
            </fieldset>
          </div>

          <div className="mt-8 flex justify-end">
            <button
              type="button"
              onClick={continueToForm}
              disabled={authorization !== 'yes'}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[#1a1916] px-6 text-sm font-bold text-white transition-colors hover:bg-[#34312c] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#1a1916] disabled:cursor-not-allowed disabled:bg-[#c5c1b9]"
            >
              Continuar
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </section>
      ) : (
        <section ref={formSectionRef} id="application-form" className="scroll-mt-16 bg-white" aria-labelledby="form-title">
          <form onSubmit={submit} noValidate className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
            <div className="border-b border-[#d8d5ce] pb-8">
              <p className="text-xs font-bold uppercase text-[#176b52]">Etapa 2 de 2</p>
              <h2 id="form-title" className="mt-2 text-3xl font-bold sm:text-4xl">Formulário</h2>
              <div className="mt-5 flex items-start gap-3 border-l-2 border-[#f3c600] bg-[#f8f7f4] px-4 py-3 text-sm leading-6 text-[#58544c]">
                <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-[#176b52]" aria-hidden="true" />
                <p>Todas as informações deste formulário serão analisadas somente pelos sócios da B16 e serão protegidas de acordo com as normas da LGPD.</p>
              </div>
            </div>

            <div className="pointer-events-none fixed -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
              <label htmlFor="company-website">Site da empresa</label>
              <input id="company-website" tabIndex={-1} autoComplete="off" value={companyWebsite} onChange={(event) => setCompanyWebsite(event.target.value)} />
            </div>

            <div className="grid gap-x-6 gap-y-9 pt-10 sm:grid-cols-2">
              <Field id="fullName" label="Nome completo" error={errors.fullName}>
                <input id="field-fullName" value={answers.fullName} onChange={(event) => update('fullName', event.target.value)} autoComplete="name" className={inputClass} aria-invalid={Boolean(errors.fullName)} />
              </Field>

              <Field id="whatsapp" label="WhatsApp (DDD + número)" error={errors.whatsapp}>
                <input id="field-whatsapp" value={answers.whatsapp} onChange={(event) => update('whatsapp', formatWhatsapp(event.target.value))} inputMode="tel" autoComplete="tel" placeholder="(00) 00000-0000" maxLength={15} className={inputClass} aria-invalid={Boolean(errors.whatsapp)} />
              </Field>

              <Field id="email" label="E-mail" error={errors.email}>
                <input id="field-email" type="email" value={answers.email} onChange={(event) => update('email', event.target.value)} autoComplete="email" className={inputClass} aria-invalid={Boolean(errors.email)} />
              </Field>

              <Field id="instagram" label="Seu Instagram" help="Informe @usuario ou a URL completa do perfil." error={errors.instagram}>
                <input id="field-instagram" value={answers.instagram} onChange={(event) => update('instagram', event.target.value)} autoComplete="url" placeholder="@seuusuario" className={inputClass} aria-invalid={Boolean(errors.instagram)} />
              </Field>

              <div className="sm:col-span-2">
                <Field id="otherPlatforms" label="Além do Instagram, você produz conteúdo em outra plataforma?" error={errors.otherPlatforms}>
                  <CheckboxGroup field="otherPlatforms" options={OTHER_PLATFORM_OPTIONS} selected={answers.otherPlatforms} onToggle={(value) => toggleSimple('otherPlatforms', value)} error={errors.otherPlatforms} />
                </Field>
              </div>

              <div className="sm:col-span-2">
                <Field id="niche" label="Qual é o seu nicho?" error={errors.niche}>
                  <textarea id="field-niche" value={answers.niche} onChange={(event) => update('niche', event.target.value)} rows={4} className={`${inputClass} resize-y`} aria-invalid={Boolean(errors.niche)} />
                </Field>
              </div>

              <div className="sm:col-span-2">
                <Field id="workAndPains" label="Descreva um pouco sobre o seu trabalho e quais dores deseja resolver com seu conteúdo e produtos digitais:" error={errors.workAndPains}>
                  <textarea id="field-workAndPains" value={answers.workAndPains} onChange={(event) => update('workAndPains', event.target.value)} rows={6} className={`${inputClass} resize-y`} aria-invalid={Boolean(errors.workAndPains)} />
                </Field>
              </div>

              <div className="sm:col-span-2">
                <Field id="competitorReference" label="Neste nicho, qual é o seu principal concorrente e/ou referência?" help="Se possível, informe o @ do Instagram dele." error={errors.competitorReference}>
                  <textarea id="field-competitorReference" value={answers.competitorReference} onChange={(event) => update('competitorReference', event.target.value)} rows={4} className={`${inputClass} resize-y`} aria-invalid={Boolean(errors.competitorReference)} />
                </Field>
              </div>

              <div className="sm:col-span-2">
                <Field id="digitalProducts" label="Você já possui produto digital?" error={errors.digitalProducts}>
                  <CheckboxGroup field="digitalProducts" options={DIGITAL_PRODUCT_OPTIONS} selected={answers.digitalProducts} onToggle={toggleProduct} error={errors.digitalProducts} />
                </Field>
              </div>

              <Field id="launchesCount" label="Quantos lançamentos você já fez no mercado digital?" help="Pode considerar a soma de produtos diferentes." error={errors.launchesCount}>
                <select id="field-launchesCount" value={answers.launchesCount} onChange={(event) => update('launchesCount', event.target.value)} className={inputClass} aria-invalid={Boolean(errors.launchesCount)}>
                  <option value="">Selecione</option>
                  {launchOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </Field>

              <div className="sm:col-span-2">
                <Field id="partnershipExperience" label="Com seu projeto digital, você já teve:" error={errors.partnershipExperience}>
                  <CheckboxGroup field="partnershipExperience" options={PARTNERSHIP_OPTIONS} selected={answers.partnershipExperience} onToggle={togglePartnership} error={errors.partnershipExperience} />
                </Field>
              </div>

              <div className="sm:col-span-2">
                <Field id="revenueLast12Months" label="Qual foi seu faturamento na internet nos últimos 12 meses?" error={errors.revenueLast12Months}>
                  <RadioGroup field="revenueLast12Months" options={REVENUE_OPTIONS} value={answers.revenueLast12Months} onChange={(value) => update('revenueLast12Months', value)} error={errors.revenueLast12Months} />
                </Field>
              </div>

              <div className="sm:col-span-2">
                <Field id="paidTrafficLast12Months" label="Quanto investiu em tráfego pago nos últimos 12 meses?" error={errors.paidTrafficLast12Months}>
                  <RadioGroup field="paidTrafficLast12Months" options={TRAFFIC_OPTIONS} value={answers.paidTrafficLast12Months} onChange={(value) => update('paidTrafficLast12Months', value)} error={errors.paidTrafficLast12Months} />
                </Field>
              </div>

              <div className="sm:col-span-2">
                <Field id="monthlyMarketingBudget" label="Quanto você está disposto a investir em marketing na sua empresa mensalmente?" help="Digite apenas números." error={errors.monthlyMarketingBudget}>
                  <input id="field-monthlyMarketingBudget" value={answers.monthlyMarketingBudget} onChange={(event) => update('monthlyMarketingBudget', formatCurrencyInput(event.target.value))} inputMode="numeric" placeholder="R$ 10.000,00" className={inputClass} aria-invalid={Boolean(errors.monthlyMarketingBudget)} />
                </Field>
              </div>

              <div className="sm:col-span-2">
                <Field id="discoveryAndImpressions" label="Como conheceu o trabalho da B16? Quais são suas impressões sobre nós?" error={errors.discoveryAndImpressions}>
                  <textarea id="field-discoveryAndImpressions" value={answers.discoveryAndImpressions} onChange={(event) => update('discoveryAndImpressions', event.target.value)} rows={5} className={`${inputClass} resize-y`} aria-invalid={Boolean(errors.discoveryAndImpressions)} />
                </Field>
              </div>

              <div className="sm:col-span-2">
                <Field id="launchTimeline" label="Entrando na B16, quando pretende lançar?" error={errors.launchTimeline}>
                  <RadioGroup field="launchTimeline" options={TIMELINE_OPTIONS} value={answers.launchTimeline} onChange={(value) => update('launchTimeline', value)} error={errors.launchTimeline} />
                </Field>
              </div>

              <div className="sm:col-span-2">
                <Field id="motivation" label="Por que você gostaria que a Agência B16 lançasse seu projeto?" error={errors.motivation}>
                  <textarea id="field-motivation" value={answers.motivation} onChange={(event) => update('motivation', event.target.value)} rows={6} className={`${inputClass} resize-y`} aria-invalid={Boolean(errors.motivation)} />
                </Field>
              </div>
            </div>

            <div className="mt-10 border-y border-[#d8d5ce] py-7" data-field="lgpdConsent">
              <label className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-[#45413b]">
                <input
                  id="field-lgpdConsent"
                  type="checkbox"
                  checked={answers.lgpdConsent}
                  onChange={(event) => update('lgpdConsent', event.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 accent-[#1d6d57]"
                />
                <span>Confirmo que li e autorizo o tratamento dos meus dados pessoais para fins de avaliação da minha candidatura pela Agência B16.<RequiredMark /></span>
              </label>
              {errors.lgpdConsent && <p role="alert" className="mt-2 text-sm font-medium text-[#a62d22]">{errors.lgpdConsent}</p>}
            </div>

            {(submitError || errors.form) && (
              <div role="alert" className="mt-6 border-l-2 border-[#a62d22] bg-[#fff1ef] px-4 py-3 text-sm text-[#84271f]">
                {submitError || errors.form}
              </div>
            )}

            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => {
                  setStep(1)
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                disabled={submitState === 'submitting'}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-[#bdb9b0] bg-white px-5 text-sm font-bold text-[#35322d] transition-colors hover:bg-[#f2f0eb] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#1a1916] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Voltar
              </button>
              <button
                type="submit"
                disabled={submitState === 'submitting'}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[#1a1916] px-6 text-sm font-bold text-white transition-colors hover:bg-[#34312c] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#1a1916] disabled:cursor-not-allowed disabled:bg-[#aaa69e]"
              >
                {submitState === 'submitting' ? (
                  <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Enviando...</>
                ) : (
                  <><Send className="h-4 w-4" aria-hidden="true" /> Enviar candidatura</>
                )}
              </button>
            </div>
          </form>
        </section>
      )}
    </main>
  )
}
