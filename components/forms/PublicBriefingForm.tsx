'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Copy,
  FileImage,
  Loader2,
  Save,
  Trash2,
  Upload,
} from 'lucide-react'
import type {
  BriefingAnswer,
  BriefingAnswers,
  BriefingServiceType,
  ProjectFormAttachment,
  PublicProjectFormPayload,
} from '@/types/project-form'
import {
  SERVICE_OPTIONS,
  getBriefingSteps,
  getOptionLabel,
  getServiceType,
  isAnswerFormatValid,
  isAnswerFilled,
  isQuestionVisible,
  type BriefingQuestion,
} from '@/utils/forms/client-briefing'
import {
  publicRequestError,
  PublicRequestError,
  reportPublicError,
} from '@/utils/observability/public-error-reporter'

interface PublicBriefingFormProps {
  publicToken: string
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

function formatFileSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
}

export default function PublicBriefingForm({ publicToken }: PublicBriefingFormProps) {
  const [payload, setPayload] = useState<PublicProjectFormPayload | null>(null)
  const [answers, setAnswers] = useState<BriefingAnswers>({})
  const [responseToken, setResponseToken] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<ProjectFormAttachment[]>([])
  const [currentStep, setCurrentStep] = useState(0)
  const [isReviewing, setIsReviewing] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [missingIds, setMissingIds] = useState<string[]>([])
  const [copyFeedback, setCopyFeedback] = useState(false)
  const [uploading, setUploading] = useState(false)
  const latestAnswersRef = useRef(answers)
  const latestStepRef = useRef(currentStep)
  const editVersionRef = useRef(0)
  const responseTokenRef = useRef<string | null>(null)
  const saveRequestRef = useRef<Promise<void> | null>(null)

  const serviceType = getServiceType(answers)
  const steps = useMemo(() => getBriefingSteps(serviceType), [serviceType])
  const safeStep = Math.min(currentStep, Math.max(steps.length - 1, 0))
  const activeStep = steps[safeStep]
  const isLastStep = Boolean(serviceType) && safeStep === steps.length - 1
  const progress = isReviewing
    ? 100
    : serviceType
      ? Math.round(((safeStep + 1) / (steps.length + 1)) * 100)
      : 10
  const submitted = payload?.response.status
    ? !['draft', 'waiting'].includes(payload.response.status)
    : false

  const presentPublicError = useCallback(async (
    error: unknown,
    context: {
      category: 'public_briefing' | 'briefing_attachment'
      operation: string
      metadata?: Record<string, string | number | boolean | null>
    },
  ) => {
    const message = error instanceof Error ? error.message : 'Ocorreu uma falha inesperada.'
    if (error instanceof PublicRequestError) {
      if (error.reported) return message
      if (!error.reportable) return message
    }

    await reportPublicError({
      ...context,
      message,
      stackTrace: error instanceof Error ? error.stack : null,
      publicToken,
      responseToken: responseTokenRef.current,
      leadEmail: typeof latestAnswersRef.current.client_email === 'string'
        ? latestAnswersRef.current.client_email
        : null,
    })
    return message
  }, [publicToken])

  useEffect(() => {
    latestAnswersRef.current = answers
  }, [answers])

  useEffect(() => {
    latestStepRef.current = currentStep
  }, [currentStep])

  useEffect(() => {
    let cancelled = false
    const query = typeof window !== 'undefined' ? window.location.search : ''

    fetch(`/api/public/forms/${publicToken}${query}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) {
          throw publicRequestError(data, 'Não foi possível abrir o formulário.', response.status)
        }
        return data as PublicProjectFormPayload
      })
      .then((data) => {
        if (cancelled) return
        setPayload(data)
        setAnswers(data.response.answers || {})
        setResponseToken(data.response.token)
        responseTokenRef.current = data.response.token
        setAttachments(data.response.attachments || [])
        setCurrentStep(data.response.currentStep || 0)
      })
      .catch(async (error: unknown) => {
        const message = await presentPublicError(error, {
          category: 'public_briefing',
          operation: 'load_form_browser',
        })
        if (!cancelled) setLoadError(message)
      })

    return () => {
      cancelled = true
    }
  }, [presentPublicError, publicToken])

  const persist = useCallback(async (
    action: 'save' | 'submit',
    overrideAnswers?: BriefingAnswers,
    overrideStep?: number,
  ) => {
    if (saveRequestRef.current) {
      await saveRequestRef.current
    }

    let releaseRequest: () => void = () => {}
    const requestLock = new Promise<void>((resolve) => {
      releaseRequest = resolve
    })
    saveRequestRef.current = requestLock
    const savedVersion = editVersionRef.current
    try {
      setSaveState('saving')
      setFormError(null)
      const response = await fetch(`/api/public/forms/${publicToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          responseToken: responseTokenRef.current,
          answers: overrideAnswers ?? latestAnswersRef.current,
          currentStep: overrideStep ?? latestStepRef.current,
        }),
      })
      const data = await response.json()

      if (data.responseToken && data.responseToken !== responseTokenRef.current) {
        responseTokenRef.current = data.responseToken
        setResponseToken(data.responseToken)
        if (typeof window !== 'undefined' && data.resumeUrl) {
          window.history.replaceState({}, '', data.resumeUrl)
        }
      }

      if (!response.ok) {
        const responseMessage = Array.isArray(data.missing)
          ? `${data.error} ${data.missing.join('; ')}`
          : data.error || 'Não foi possível salvar o formulário.'
        throw new PublicRequestError(responseMessage, response.status, data.reported)
      }

      if (savedVersion === editVersionRef.current) {
        setIsDirty(false)
        setSaveState('saved')
      } else {
        setSaveState('idle')
      }
      return data as { responseToken: string; resumeUrl: string; submitted: boolean }
    } catch (error) {
      const message = await presentPublicError(error, {
        category: 'public_briefing',
        operation: action === 'submit' ? 'submit_form_browser' : 'save_draft_browser',
        metadata: { currentStep: overrideStep ?? latestStepRef.current },
      })
      setFormError(message)
      setSaveState('error')
      throw new Error(message)
    } finally {
      releaseRequest()
      if (saveRequestRef.current === requestLock) saveRequestRef.current = null
    }
  }, [presentPublicError, publicToken])

  useEffect(() => {
    if (!payload || !isDirty || submitted) return
    const timer = window.setTimeout(() => {
      persist('save').catch(() => undefined)
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [answers, currentStep, isDirty, payload, persist, submitted])

  const updateAnswer = (questionId: string, value: BriefingAnswer) => {
    editVersionRef.current += 1
    setAnswers((current) => {
      if (questionId === 'service_type' && current.service_type !== value) {
        const commonQuestionIds = new Set(
          getBriefingSteps(null).flatMap((step) => step.questions.map((question) => question.id)),
        )
        const commonAnswers = Object.fromEntries(
          Object.entries(current).filter(([key]) => commonQuestionIds.has(key)),
        ) as BriefingAnswers
        return { ...commonAnswers, service_type: value }
      }
      return { ...current, [questionId]: value }
    })
    setMissingIds((current) => current.filter((id) => id !== questionId))
    setIsDirty(true)
    setSaveState('idle')
  }

  const validateStep = () => {
    const visibleQuestions = activeStep.questions
      .filter((question) => isQuestionVisible(question, answers))
    const invalid = visibleQuestions
      .filter((question) => (
        (question.required && !isAnswerFilled(answers[question.id]))
        || !isAnswerFormatValid(question, answers[question.id])
      ))
      .map((question) => question.id)
    setMissingIds(invalid)
    if (invalid.length > 0) {
      setFormError('Revise os campos destacados para continuar.')
      document.getElementById(`question-${invalid[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return false
    }
    setFormError(null)
    return true
  }

  const goNext = async () => {
    if (!validateStep()) return
    const nextStep = safeStep + 1
    try {
      await persist('save', answers, Math.min(nextStep, steps.length - 1))
      if (nextStep >= steps.length) setIsReviewing(true)
      else setCurrentStep(nextStep)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      // A mensagem de erro já é exibida junto ao formulário.
    }
  }

  const goBack = () => {
    if (isReviewing) {
      setIsReviewing(false)
      setCurrentStep(steps.length - 1)
    } else {
      setCurrentStep((current) => Math.max(0, current - 1))
    }
    setMissingIds([])
    setFormError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const copyResumeLink = async () => {
    try {
      const result = await persist('save')
      await navigator.clipboard.writeText(result.resumeUrl)
      setCopyFeedback(true)
      window.setTimeout(() => setCopyFeedback(false), 2200)
    } catch {
      // A mensagem de erro já é exibida junto ao formulário.
    }
  }

  const submitBriefing = async () => {
    try {
      await persist('submit')
      setPayload((current) => current ? {
        ...current,
        response: { ...current.response, status: 'received', submittedAt: new Date().toISOString() },
      } : current)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      // A mensagem de erro já é exibida junto ao formulário.
    }
  }

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    setFormError(null)
    try {
      const draft = await persist('save')
      const remaining = Math.max(0, 5 - attachments.length)
      for (const file of Array.from(files).slice(0, remaining)) {
        const formData = new FormData()
        formData.set('responseToken', draft.responseToken)
        formData.set('questionId', 'identity_reference_files')
        formData.set('file', file)
        const response = await fetch(`/api/public/forms/${publicToken}/attachments`, {
          method: 'POST',
          body: formData,
        })
        const data = await response.json()
        if (!response.ok) {
          throw publicRequestError(data, 'Não foi possível enviar a imagem.', response.status)
        }
        setAttachments((current) => [...current, data.attachment])
      }
    } catch (error) {
      const message = await presentPublicError(error, {
        category: 'briefing_attachment',
        operation: 'upload_attachment_browser',
      })
      setFormError(message)
    } finally {
      setUploading(false)
    }
  }

  const removeAttachment = async (attachmentId: string) => {
    if (!responseToken) return
    try {
      const response = await fetch(`/api/public/forms/${publicToken}/attachments`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responseToken, attachmentId }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw publicRequestError(data, 'Não foi possível remover a imagem.', response.status)
      }
      setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId))
    } catch (error) {
      const message = await presentPublicError(error, {
        category: 'briefing_attachment',
        operation: 'remove_attachment_browser',
      })
      setFormError(message)
    }
  }

  if (loadError) {
    return (
      <main className="min-h-screen bg-[#f5f6f8] text-[#191919] flex items-center justify-center p-5">
        <div className="max-w-md w-full border border-[#dedede] bg-white p-6 rounded-lg text-center">
          <p className="font-semibold">Este formulário não pôde ser aberto</p>
          <p className="text-sm text-[#666] mt-2">{loadError}</p>
        </div>
      </main>
    )
  }

  if (!payload) {
    return (
      <main className="min-h-screen bg-[#f5f6f8] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#2d66b3]" />
      </main>
    )
  }

  if (submitted) {
    return (
      <main className="min-h-screen bg-[#f5f6f8] text-[#191919] flex items-center justify-center p-5">
        <section className="max-w-xl w-full bg-white border border-[#dedede] rounded-lg p-7 sm:p-10 text-center shadow-sm">
          <CheckCircle2 className="w-10 h-10 text-[#188665] mx-auto" />
          <h1 className="text-2xl font-bold mt-5">Briefing enviado com sucesso!</h1>
          <p className="text-[#626262] leading-relaxed mt-3">
            As informações serão analisadas e utilizadas no planejamento do projeto.
          </p>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f5f6f8] text-[#191919]">
      <header className="bg-white border-b border-[#dedede]">
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between gap-4">
          <Image src="/logo_black.svg" alt="Clave" width={112} height={28} className="object-contain" />
          <div className="text-right min-w-0">
            <p className="text-xs text-[#747474]">Projeto</p>
            <p className="text-sm font-semibold truncate">{payload.form.projectName}</p>
          </div>
        </div>
      </header>

      <div className="sticky top-0 z-10 bg-white/95 border-b border-[#e4e4e4] backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-5 py-3">
          <div className="flex items-center justify-between gap-4 text-xs">
            <span className="font-semibold">{isReviewing ? 'Revisão' : activeStep.title}</span>
            <span className="text-[#666]">{progress}%</span>
          </div>
          <div className="h-1.5 bg-[#e8e8e8] mt-2 overflow-hidden rounded-full">
            <div className="h-full bg-[#2d66b3] transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-5 py-8 sm:py-12">
        {payload.response.status === 'waiting' && (
          <div className="mb-6 px-4 py-3 border border-[#d8b878] bg-[#fff8e8] text-[#704b10] rounded-lg text-sm">
            A equipe solicitou informações complementares. Revise as respostas, faça os ajustes e envie novamente.
          </div>
        )}
        {!isReviewing && safeStep === 0 && (
          <section className="mb-9">
            <h1 className="text-3xl sm:text-4xl font-bold">{payload.form.title}</h1>
            <p className="mt-4 text-[#5f5f5f] leading-relaxed max-w-2xl">
              Este formulário nos ajudará a compreender o contexto, os objetivos e as particularidades do seu projeto. Quanto mais claras e completas forem as respostas, mais preciso será o planejamento. Você poderá salvar o preenchimento e continuar depois.
            </p>
            <div className="flex items-center gap-2 mt-4 text-sm text-[#6a6a6a]">
              <Clock3 className="w-4 h-4" />
              <span>Tempo estimado: {serviceType ? '12 a 18 minutos' : 'cerca de 15 minutos'}</span>
            </div>
          </section>
        )}

        {!isReviewing ? (
          <section aria-labelledby="step-title">
            <div className="mb-6">
              <p className="text-xs font-semibold text-[#2d66b3] uppercase">
                {serviceType ? `Etapa ${safeStep + 1} de ${steps.length}` : 'Etapa 1'}
              </p>
              <h2 id="step-title" className="text-2xl font-bold mt-1">{activeStep.title}</h2>
              <p className="text-sm text-[#666] mt-2">{activeStep.description}</p>
            </div>

            <div className="bg-white border border-[#dedede] rounded-lg divide-y divide-[#e5e5e5] shadow-sm">
              {activeStep.questions.filter((question) => isQuestionVisible(question, answers)).map((question) => (
                <QuestionField
                  key={question.id}
                  question={question}
                  value={answers[question.id]}
                  invalid={missingIds.includes(question.id)}
                  attachments={question.type === 'file' ? attachments : []}
                  uploading={uploading}
                  onChange={(value) => updateAnswer(question.id, value)}
                  onUpload={uploadFiles}
                  onRemoveAttachment={removeAttachment}
                />
              ))}
            </div>
          </section>
        ) : (
          <ReviewBriefing answers={answers} serviceType={serviceType} />
        )}

        {formError && (
          <div role="alert" className="mt-5 px-4 py-3 border border-[#d9a5a5] bg-[#fff2f2] text-[#9f2929] rounded-lg text-sm">
            {formError}
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {(safeStep > 0 || isReviewing) && (
              <button type="button" onClick={goBack} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-[#cecece] bg-white rounded-lg text-sm font-semibold hover:bg-[#f3f3f3] cursor-pointer">
                <ArrowLeft className="w-4 h-4" /> Voltar
              </button>
            )}
            <button type="button" onClick={copyResumeLink} disabled={saveState === 'saving'} className="inline-flex items-center justify-center gap-2 px-3 py-2.5 text-sm text-[#555] hover:text-[#111] cursor-pointer disabled:opacity-50">
              {copyFeedback ? <Check className="w-4 h-4 text-[#188665]" /> : <Copy className="w-4 h-4" />}
              {copyFeedback ? 'Link copiado' : 'Continuar depois'}
            </button>
          </div>

          {isReviewing ? (
            <button type="button" onClick={submitBriefing} disabled={saveState === 'saving'} className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-[#171717] text-white rounded-lg text-sm font-semibold hover:bg-black cursor-pointer disabled:opacity-60">
              {saveState === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
              Enviar briefing
            </button>
          ) : (
            <button type="button" onClick={goNext} disabled={saveState === 'saving'} className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-[#2d66b3] text-white rounded-lg text-sm font-semibold hover:bg-[#245795] cursor-pointer disabled:opacity-60">
              {saveState === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : isLastStep ? <ClipboardCheck className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
              {isLastStep ? 'Revisar respostas' : 'Continuar'}
            </button>
          )}
        </div>

        <div aria-live="polite" className="mt-5 min-h-5 flex items-center justify-end gap-1.5 text-xs text-[#777]">
          {saveState === 'saving' && <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando</>}
          {saveState === 'saved' && <><Save className="w-3.5 h-3.5" /> Rascunho salvo</>}
          {saveState === 'error' && <span className="text-[#9f2929]">Não foi possível salvar</span>}
        </div>
      </div>
    </main>
  )
}

function QuestionField({
  question,
  value,
  invalid,
  attachments,
  uploading,
  onChange,
  onUpload,
  onRemoveAttachment,
}: {
  question: BriefingQuestion
  value?: BriefingAnswer
  invalid: boolean
  attachments: ProjectFormAttachment[]
  uploading: boolean
  onChange: (value: BriefingAnswer) => void
  onUpload: (files: FileList | null) => void
  onRemoveAttachment: (attachmentId: string) => void
}) {
  const inputClass = `w-full px-3 py-2.5 border rounded-lg bg-white text-[15px] outline-none transition-colors ${invalid ? 'border-[#b83d3d]' : 'border-[#cfcfcf] focus:border-[#2d66b3]'}`
  const stringValue = typeof value === 'string' ? value : ''
  const arrayValue = Array.isArray(value) ? value : []
  const labelId = `question-label-${question.id}`
  const errorId = `question-error-${question.id}`
  const accessibilityProps = {
    'aria-labelledby': labelId,
    'aria-invalid': invalid,
    'aria-describedby': invalid ? errorId : undefined,
  }

  return (
    <div id={`question-${question.id}`} className="p-5 sm:p-6 scroll-mt-28">
      <div id={labelId} className="font-semibold text-[15px] leading-snug block">
        {question.label}
        {question.required && <span className="text-[#b83d3d] ml-1" aria-label="obrigatório">*</span>}
      </div>
      {question.help && <p className="text-sm text-[#737373] mt-1.5 leading-relaxed">{question.help}</p>}

      <div className="mt-3">
        {question.type === 'short' && (
          <input {...accessibilityProps} value={stringValue} onChange={(event) => onChange(event.target.value)} placeholder={question.placeholder} className={inputClass} />
        )}
        {question.type === 'email' && (
          <input {...accessibilityProps} type="email" autoComplete="email" value={stringValue} onChange={(event) => onChange(event.target.value)} placeholder="nome@empresa.com.br" className={inputClass} />
        )}
        {question.type === 'tel' && (
          <input {...accessibilityProps} type="tel" autoComplete="tel" value={stringValue} onChange={(event) => onChange(event.target.value)} placeholder="(00) 00000-0000" className={inputClass} />
        )}
        {question.type === 'number' && (
          <input {...accessibilityProps} type="number" min="0" step="1" inputMode="numeric" value={stringValue} onChange={(event) => onChange(event.target.value)} className={`${inputClass} max-w-xs`} />
        )}
        {question.type === 'long' && (
          <textarea {...accessibilityProps} value={stringValue} onChange={(event) => onChange(event.target.value)} placeholder={question.placeholder} rows={5} className={`${inputClass} resize-y min-h-28`} />
        )}
        {question.type === 'date' && (
          <input {...accessibilityProps} type="date" value={stringValue} onChange={(event) => onChange(event.target.value)} className={`${inputClass} max-w-xs`} />
        )}
        {question.type === 'currency' && (
          <div className="relative max-w-xs">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#666]">R$</span>
            <input {...accessibilityProps} type="number" min="0" step="0.01" value={stringValue} onChange={(event) => onChange(event.target.value)} className={`${inputClass} pl-10`} />
          </div>
        )}
        {question.type === 'url' && (
          <input {...accessibilityProps} type="url" value={stringValue} onChange={(event) => onChange(event.target.value)} placeholder="https://" className={inputClass} />
        )}
        {question.type === 'urls' && (
          <textarea {...accessibilityProps} value={stringValue} onChange={(event) => onChange(event.target.value)} placeholder={'https://exemplo.com\nhttps://instagram.com/exemplo'} rows={4} className={`${inputClass} resize-y min-h-24`} />
        )}
        {question.type === 'single' && (
          <div role="radiogroup" aria-labelledby={labelId} aria-invalid={invalid} className="grid sm:grid-cols-2 gap-2">
            {question.options?.map((option) => {
              const selected = stringValue === option
              const serviceOption = question.id === 'service_type'
                ? SERVICE_OPTIONS.find((candidate) => candidate.value === option)
                : null
              return (
                <button key={option} type="button" role="radio" aria-checked={selected} onClick={() => onChange(option)} className={`text-left border rounded-lg px-4 py-3 transition-colors cursor-pointer ${selected ? 'border-[#2d66b3] bg-[#edf4fd]' : 'border-[#d5d5d5] hover:border-[#999]'}`}>
                  <span className="text-sm font-semibold block">{getOptionLabel(question.id, option)}</span>
                  {serviceOption && <span className="text-xs text-[#676767] block mt-1 leading-relaxed">{serviceOption.description}</span>}
                </button>
              )
            })}
          </div>
        )}
        {question.type === 'multi' && (
          <div role="group" aria-labelledby={labelId} aria-describedby={invalid ? errorId : undefined} className="grid sm:grid-cols-2 gap-2">
            {question.options?.map((option) => {
              const selected = arrayValue.includes(option)
              const maxReached = Boolean(question.maxSelections && arrayValue.length >= question.maxSelections && !selected)
              return (
                <label key={option} className={`flex items-center gap-3 border rounded-lg px-3 py-2.5 text-sm cursor-pointer ${selected ? 'border-[#2d66b3] bg-[#edf4fd]' : 'border-[#d5d5d5]'} ${maxReached ? 'opacity-45 cursor-not-allowed' : ''}`}>
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={maxReached}
                    onChange={() => onChange(selected ? arrayValue.filter((item) => item !== option) : [...arrayValue, option])}
                    className="w-4 h-4 accent-[#2d66b3]"
                  />
                  <span>{option}</span>
                </label>
              )
            })}
          </div>
        )}
        {question.type === 'file' && (
          <div>
            <label className="min-h-24 border border-dashed border-[#bdbdbd] rounded-lg flex flex-col items-center justify-center px-4 py-5 text-center cursor-pointer hover:bg-[#f8f8f8]">
              {uploading ? <Loader2 className="w-5 h-5 animate-spin text-[#2d66b3]" /> : <Upload className="w-5 h-5 text-[#555]" />}
              <span className="text-sm font-semibold mt-2">Selecionar imagens</span>
              <input aria-labelledby={labelId} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" disabled={uploading || attachments.length >= 5} onChange={(event) => onUpload(event.target.files)} />
            </label>
            {attachments.length > 0 && (
              <div className="mt-3 space-y-2">
                {attachments.map((attachment) => (
                  <div key={attachment.id} className="flex items-center gap-3 border border-[#dedede] rounded-lg px-3 py-2.5">
                    <FileImage className="w-4 h-4 text-[#2d66b3] shrink-0" />
                    <span className="text-sm truncate flex-1">{attachment.original_name}</span>
                    <span className="text-xs text-[#777] shrink-0">{formatFileSize(attachment.size_bytes)}</span>
                    <button type="button" onClick={() => onRemoveAttachment(attachment.id)} title="Remover imagem" className="p-1.5 text-[#777] hover:text-[#aa3030] cursor-pointer">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {invalid && (
        <p id={errorId} className="text-xs text-[#a82f2f] mt-2">
          {question.type === 'url' || question.type === 'urls'
            ? 'Informe links completos, começando com http:// ou https://.'
            : question.type === 'email'
              ? 'Informe um endereço de e-mail válido.'
              : question.type === 'tel'
                ? 'Informe um telefone válido.'
            : question.type === 'date'
              ? 'Informe uma data válida.'
              : question.type === 'currency' || question.type === 'number'
                ? 'Informe um valor válido, igual ou maior que zero.'
                : 'Este campo é obrigatório.'}
        </p>
      )}
    </div>
  )
}

function ReviewBriefing({ answers, serviceType }: { answers: BriefingAnswers; serviceType: BriefingServiceType | null }) {
  const reviewSteps = getBriefingSteps(serviceType)
  return (
    <section>
      <p className="text-xs font-semibold text-[#2d66b3] uppercase">Última etapa</p>
      <h2 className="text-2xl font-bold mt-1">Revise suas respostas</h2>
      <p className="text-sm text-[#666] mt-2">Confira as informações antes do envio definitivo.</p>
      <div className="mt-6 space-y-4">
        {reviewSteps.map((step) => {
          const answeredQuestions = step.questions
            .filter((question) => isQuestionVisible(question, answers))
            .filter((question) => isAnswerFilled(answers[question.id]))
          if (answeredQuestions.length === 0) return null
          return (
            <div key={step.id} className="bg-white border border-[#dedede] rounded-lg overflow-hidden">
              <h3 className="px-5 py-3 font-semibold bg-[#f7f7f7] border-b border-[#e4e4e4]">{step.title}</h3>
              <dl className="divide-y divide-[#ededed]">
                {answeredQuestions.map((question) => (
                  <div key={question.id} className="px-5 py-4">
                    <dt className="text-xs font-semibold text-[#676767]">{question.label}</dt>
                    <dd className="text-sm mt-1.5 whitespace-pre-wrap leading-relaxed">
                      {Array.isArray(answers[question.id])
                        ? (answers[question.id] as string[]).join(', ')
                        : answers[question.id] as string}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )
        })}
      </div>
    </section>
  )
}
