'use client'

import React, { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  ClipboardCopy,
  Download,
  ExternalLink,
  FileDown,
  FileText,
  Link2,
  Loader2,
  Paperclip,
  Printer,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { useAppStore } from '@/store/useAppStore'
import type {
  BriefingAnswers,
  BriefingServiceType,
  BriefingSubmissionStatus,
  ProjectFormAttachment,
  ProjectFormSubmission,
} from '@/types/project-form'
import {
  SUBMISSION_STATUS_LABELS,
  SERVICE_OPTIONS,
  getBriefingSteps,
  getQuestionLabel,
  getServiceType,
  isQuestionVisible,
} from '@/utils/forms/client-briefing'

interface ProjectFormRecord {
  id: string
  project_id: string
  title: string
  public_token: string
  active: boolean
  version: number
  updated_at: string
}

const STATUS_STYLES: Record<BriefingSubmissionStatus, string> = {
  draft: 'bg-gray-bg text-gray-t',
  received: 'bg-blue-bg text-blue-t',
  reviewing: 'bg-amber-bg text-amber-t',
  waiting: 'bg-red-bg text-red-t',
  completed: 'bg-green-bg text-green-t',
}

function answerToText(value: BriefingAnswers[string] | undefined) {
  return Array.isArray(value) ? value.join(', ') : value || ''
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function escapeCsv(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}

export default function FormulariosModule() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { activeProjectId, profile, showToast } = useAppStore()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [serviceFilter, setServiceFilter] = useState<'all' | BriefingServiceType>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | BriefingSubmissionStatus>('all')
  const [copied, setCopied] = useState(false)
  const [notes, setNotes] = useState('')
  const [origin, setOrigin] = useState('')

  React.useEffect(() => {
    const timer = window.setTimeout(() => setOrigin(window.location.origin), 0)
    return () => window.clearTimeout(timer)
  }, [])

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setSelectedId(null)
      setSearch('')
      setServiceFilter('all')
      setStatusFilter('all')
    }, 0)
    return () => window.clearTimeout(timer)
  }, [activeProjectId])

  const { data: canManage = false, isLoading: accessLoading } = useQuery<boolean>({
    queryKey: ['can_manage_project_forms', activeProjectId, profile?.id],
    queryFn: async () => {
      if (!activeProjectId || !profile?.id) return false
      const { data, error } = await supabase.rpc('user_can_manage_project', {
        proj_id: activeProjectId,
        usr_id: profile.id,
      })
      if (error) throw error
      return data === true
    },
    enabled: !!activeProjectId && !!profile?.id,
  })

  const { data: form, isLoading: formLoading } = useQuery<ProjectFormRecord | null>({
    queryKey: ['project_form', activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return null
      const { data, error } = await supabase
        .from('project_forms')
        .select('*')
        .eq('project_id', activeProjectId)
        .eq('kind', 'client_briefing')
        .maybeSingle()
      if (error) throw error
      return data as ProjectFormRecord | null
    },
    enabled: !!activeProjectId,
  })

  const createFormMutation = useMutation({
    mutationFn: async () => {
      if (!activeProjectId || !profile?.id) throw new Error('Projeto ou usuário não identificado.')
      const { error } = await supabase.from('project_forms').insert({
        project_id: activeProjectId,
        created_by: profile.id,
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project_form', activeProjectId] }),
    onError: (error: Error) => showToast(error.message || 'Não foi possível criar o formulário.', 'err'),
  })

  const { data: submissions = [], isLoading: submissionsLoading } = useQuery<ProjectFormSubmission[]>({
    queryKey: ['project_form_submissions', activeProjectId, form?.id],
    queryFn: async () => {
      if (!activeProjectId || !form?.id) return []
      const { data, error } = await supabase
        .from('project_form_submissions')
        .select('*')
        .eq('project_id', activeProjectId)
        .eq('form_id', form.id)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data as ProjectFormSubmission[]
    },
    enabled: !!activeProjectId && !!form?.id,
  })

  const selectedSubmission = submissions.find((submission) => submission.id === selectedId) ?? null

  const { data: attachments = [] } = useQuery<ProjectFormAttachment[]>({
    queryKey: ['project_form_attachments', selectedId],
    queryFn: async () => {
      if (!selectedId) return []
      const { data, error } = await supabase
        .from('project_form_attachments')
        .select('id, question_id, original_name, mime_type, size_bytes, created_at, storage_path')
        .eq('submission_id', selectedId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as ProjectFormAttachment[]
    },
    enabled: !!selectedId,
  })

  const updateSubmissionMutation = useMutation({
    mutationFn: async (data: { status?: BriefingSubmissionStatus; internal_notes?: string }) => {
      if (!selectedId) return
      const { error } = await supabase
        .from('project_form_submissions')
        .update(data)
        .eq('id', selectedId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project_form_submissions', activeProjectId, form?.id] })
      showToast('Briefing atualizado')
    },
    onError: () => showToast('Não foi possível atualizar o briefing.', 'err'),
  })

  const toggleFormMutation = useMutation({
    mutationFn: async () => {
      if (!form) return
      const { error } = await supabase
        .from('project_forms')
        .update({ active: !form.active })
        .eq('id', form.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project_form', activeProjectId] })
      showToast(form?.active ? 'Formulário pausado' : 'Formulário ativado')
    },
  })

  const regenerateLinkMutation = useMutation({
    mutationFn: async () => {
      if (!form) return
      const nextToken = crypto.randomUUID()
      const { error } = await supabase
        .from('project_forms')
        .update({ public_token: nextToken })
        .eq('id', form.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project_form', activeProjectId] })
      showToast('Novo link público gerado')
    },
  })

  const filteredSubmissions = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR')
    return submissions.filter((submission) => {
      if (serviceFilter !== 'all' && submission.service_type !== serviceFilter) return false
      if (statusFilter !== 'all' && submission.status !== statusFilter) return false
      if (!normalizedSearch) return true
      const projectName = answerToText(submission.answers.project_name).toLocaleLowerCase('pt-BR')
      return projectName.includes(normalizedSearch)
    })
  }, [search, serviceFilter, statusFilter, submissions])

  const publicLink = form && origin ? `${origin}/formularios/${form.public_token}` : ''
  const receivedCount = submissions.filter((submission) => submission.status === 'received').length
  const openCount = submissions.filter((submission) => ['received', 'reviewing', 'waiting'].includes(submission.status)).length
  const completedCount = submissions.filter((submission) => submission.status === 'completed').length

  const copyPublicLink = async () => {
    if (!publicLink) return
    await navigator.clipboard.writeText(publicLink)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2200)
  }

  const openAttachment = async (attachment: ProjectFormAttachment & { storage_path?: string }) => {
    if (!attachment.storage_path) return
    const { data, error } = await supabase.storage
      .from('briefing-references')
      .createSignedUrl(attachment.storage_path, 60)
    if (error || !data?.signedUrl) {
      showToast('Não foi possível abrir o anexo.', 'err')
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const exportSelected = (format: 'json' | 'csv') => {
    if (!selectedSubmission) return
    const name = answerToText(selectedSubmission.answers.project_name) || 'briefing'
    const safeName = name.toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    if (format === 'json') {
      downloadFile(`${safeName || 'briefing'}.json`, JSON.stringify(selectedSubmission.answers, null, 2), 'application/json')
      return
    }
    const rows = Object.entries(selectedSubmission.answers).map(([key, value]) =>
      `${escapeCsv(getQuestionLabel(key))},${escapeCsv(answerToText(value))}`,
    )
    downloadFile(`${safeName || 'briefing'}.csv`, `Pergunta,Resposta\n${rows.join('\n')}`, 'text/csv;charset=utf-8')
  }

  if (!activeProjectId) {
    return <div className="py-12 text-center text-xs text-text3">Selecione um projeto para acessar os formulários.</div>
  }

  if (accessLoading || formLoading) {
    return <div className="py-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-text3" /></div>
  }

  if (!canManage) {
    return (
      <div className="border border-border-custom bg-surface rounded-lg p-8 text-center">
        <ShieldCheck className="w-8 h-8 text-text3 mx-auto" />
        <h3 className="text-sm font-bold text-text-custom mt-3">Acesso de gestão necessário</h3>
        <p className="text-xs text-text3 mt-1">As respostas e anotações do briefing ficam disponíveis apenas para gestores deste projeto.</p>
      </div>
    )
  }

  if (!form) {
    return (
      <div className="border border-border-custom bg-surface rounded-lg p-8 text-center">
        <FileText className="w-8 h-8 text-text3 mx-auto" />
        <h3 className="text-sm font-bold text-text-custom mt-3">Briefing do Cliente</h3>
        <p className="text-xs text-text3 mt-1">Crie o formulário público exclusivo deste projeto.</p>
        <button onClick={() => createFormMutation.mutate()} disabled={createFormMutation.isPending} className="mt-4 px-4 py-2 bg-text-custom text-surface rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50">
          Criar formulário
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5 print:bg-white print:text-black">
      <section className="border border-border-custom bg-surface rounded-lg overflow-hidden print:hidden">
        <div className="p-4 md:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border-custom">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-blue-bg text-blue-t rounded-lg flex items-center justify-center shrink-0"><FileText className="w-4 h-4" /></div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-text-custom">{form.title}</h3>
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${form.active ? 'bg-green-bg text-green-t' : 'bg-gray-bg text-gray-t'}`}>
                  {form.active ? 'Ativo' : 'Pausado'}
                </span>
              </div>
              <p className="text-[11px] text-text3 mt-1">Link exclusivo do projeto · versão {form.version}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => toggleFormMutation.mutate()} className="px-3 py-2 border border-border2 rounded-lg text-xs text-text2 hover:bg-surface2 cursor-pointer">
              {form.active ? 'Pausar' : 'Ativar'}
            </button>
            <button
              onClick={() => {
                if (confirm('Gerar um novo link? O link atual deixará de funcionar.')) regenerateLinkMutation.mutate()
              }}
              title="Gerar novo link"
              className="p-2 border border-border2 rounded-lg text-text2 hover:bg-surface2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <a href={publicLink} target="_blank" rel="noreferrer" className="p-2 border border-border2 rounded-lg text-text2 hover:bg-surface2" title="Abrir formulário">
              <ExternalLink className="w-4 h-4" />
            </a>
            <button onClick={copyPublicLink} className="inline-flex items-center gap-2 px-3 py-2 bg-blue-custom text-white rounded-lg text-xs font-semibold cursor-pointer hover:opacity-90">
              {copied ? <Check className="w-4 h-4" /> : <ClipboardCopy className="w-4 h-4" />}
              {copied ? 'Link copiado' : 'Copiar link'}
            </button>
          </div>
        </div>
        <div className="p-4 md:p-5">
          <label className="text-[10px] font-bold uppercase text-text3">URL pública</label>
          <div className="mt-1.5 flex items-center gap-2 px-3 py-2 border border-border2 rounded-lg bg-surface2/40">
            <Link2 className="w-4 h-4 text-text3 shrink-0" />
            <span className="text-xs font-mono text-text2 truncate">{publicLink}</span>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-3 print:hidden">
        {[
          { label: 'Recebidos', value: receivedCount },
          { label: 'Em andamento', value: openCount },
          { label: 'Concluídos', value: completedCount },
        ].map((item) => (
          <div key={item.label} className="border border-border-custom bg-surface rounded-lg p-4">
            <p className="text-[10px] uppercase font-bold text-text3">{item.label}</p>
            <p className="text-xl font-bold text-text-custom mt-1">{item.value}</p>
          </div>
        ))}
      </section>

      <section className="border border-border-custom bg-surface rounded-lg overflow-hidden print:hidden">
        <div className="p-4 border-b border-border-custom flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-bold text-text-custom">Respostas</h3>
            <p className="text-[10px] text-text3 mt-0.5">Rascunhos e briefings gerais deste cliente. Briefings de lançamentos permanecem separados.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="relative flex-1 sm:w-56">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text3" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar projeto ou marca" className="w-full pl-8 pr-3 py-2 border border-border2 rounded-lg bg-surface text-xs text-text-custom outline-none" />
            </label>
            <select value={serviceFilter} onChange={(event) => setServiceFilter(event.target.value as typeof serviceFilter)} className="px-3 py-2 border border-border2 rounded-lg bg-surface text-xs text-text-custom outline-none">
              <option value="all">Todos os serviços</option>
              {SERVICE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="px-3 py-2 border border-border2 rounded-lg bg-surface text-xs text-text-custom outline-none">
              <option value="all">Todos os status</option>
              {Object.entries(SUBMISSION_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        </div>

        {submissionsLoading ? (
          <div className="py-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-text3" /></div>
        ) : filteredSubmissions.length === 0 ? (
          <div className="py-12 text-center">
            <Send className="w-7 h-7 text-text3 mx-auto" />
            <p className="text-xs font-semibold text-text-custom mt-3">Nenhuma resposta encontrada</p>
            <p className="text-[11px] text-text3 mt-1">Compartilhe o link do briefing com o cliente.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-surface2/50 text-[10px] uppercase text-text3">
                <tr><th className="px-4 py-3">Projeto ou marca</th><th className="px-4 py-3">Serviço</th><th className="px-4 py-3">Atualização</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Ação</th></tr>
              </thead>
              <tbody className="divide-y divide-border-custom text-xs">
                {filteredSubmissions.map((submission) => {
                  const service = SERVICE_OPTIONS.find((option) => option.value === submission.service_type)
                  return (
                    <tr key={submission.id} className="hover:bg-surface2/35">
                      <td className="px-4 py-3 font-semibold text-text-custom">{answerToText(submission.answers.project_name) || 'Ainda não informado'}</td>
                      <td className="px-4 py-3 text-text2">{service?.label || 'Não selecionado'}</td>
                      <td className="px-4 py-3 text-text3">{new Date(submission.updated_at).toLocaleString('pt-BR')}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-1 rounded text-[10px] font-semibold ${STATUS_STYLES[submission.status]}`}>{SUBMISSION_STATUS_LABELS[submission.status]}</span></td>
                      <td className="px-4 py-3 text-right"><button onClick={() => { setSelectedId(submission.id); setNotes(submission.internal_notes || '') }} className="px-3 py-1.5 border border-border2 rounded-lg text-[11px] font-semibold text-text-custom hover:bg-surface2 cursor-pointer">Visualizar</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedSubmission && (
        <SubmissionDetail
          submission={selectedSubmission}
          attachments={attachments}
          notes={notes}
          onNotesChange={setNotes}
          onClose={() => setSelectedId(null)}
          onStatusChange={(status) => updateSubmissionMutation.mutate({ status })}
          onSaveNotes={() => updateSubmissionMutation.mutate({ internal_notes: notes })}
          onOpenAttachment={openAttachment}
          onExport={exportSelected}
        />
      )}
    </div>
  )
}

function SubmissionDetail({
  submission,
  attachments,
  notes,
  onNotesChange,
  onClose,
  onStatusChange,
  onSaveNotes,
  onOpenAttachment,
  onExport,
}: {
  submission: ProjectFormSubmission
  attachments: ProjectFormAttachment[]
  notes: string
  onNotesChange: (value: string) => void
  onClose: () => void
  onStatusChange: (status: BriefingSubmissionStatus) => void
  onSaveNotes: () => void
  onOpenAttachment: (attachment: ProjectFormAttachment) => void
  onExport: (format: 'json' | 'csv') => void
}) {
  const serviceType = getServiceType(submission.answers)
  const steps = getBriefingSteps(serviceType)
  return (
    <div className="fixed inset-0 bg-black/60 z-[100] p-3 sm:p-6 flex justify-end print:static print:bg-white print:p-0">
      <article className="w-full max-w-3xl h-full bg-surface border border-border-custom rounded-lg shadow-2xl flex flex-col print:max-w-none print:h-auto print:border-none print:shadow-none">
        <header className="p-4 border-b border-border-custom flex items-start justify-between gap-4 print:border-b-2 print:border-black">
          <div>
            <p className="text-[10px] uppercase font-bold text-text3 print:text-black">Briefing do Cliente</p>
            <h2 className="text-base font-bold text-text-custom print:text-black mt-1">{answerToText(submission.answers.project_name) || 'Projeto sem nome'}</h2>
            <p className="text-[11px] text-text3 print:text-black mt-1">Enviado em {submission.submitted_at ? new Date(submission.submitted_at).toLocaleString('pt-BR') : 'rascunho'}</p>
          </div>
          <button onClick={onClose} title="Fechar" className="p-2 text-text3 hover:text-text-custom cursor-pointer print:hidden"><X className="w-5 h-5" /></button>
        </header>

        <div className="px-4 py-3 border-b border-border-custom flex flex-wrap items-center gap-2 print:hidden">
          {submission.status === 'draft' ? (
            <span className="px-3 py-2 border border-border2 rounded-lg bg-surface2 text-xs text-text3">Rascunho do cliente</span>
          ) : (
            <select value={submission.status} onChange={(event) => onStatusChange(event.target.value as BriefingSubmissionStatus)} className="px-3 py-2 border border-border2 rounded-lg bg-surface text-xs text-text-custom">
              {Object.entries(SUBMISSION_STATUS_LABELS).filter(([value]) => value !== 'draft').map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          )}
          <button onClick={() => onExport('csv')} className="p-2 border border-border2 rounded-lg text-text2 hover:bg-surface2 cursor-pointer" title="Exportar CSV"><FileDown className="w-4 h-4" /></button>
          <button onClick={() => onExport('json')} className="p-2 border border-border2 rounded-lg text-text2 hover:bg-surface2 cursor-pointer" title="Exportar JSON"><Download className="w-4 h-4" /></button>
          <button onClick={() => window.print()} className="p-2 border border-border2 rounded-lg text-text2 hover:bg-surface2 cursor-pointer" title="Imprimir ou salvar em PDF"><Printer className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 print:overflow-visible print:p-0 print:pt-5">
          {submission.strategic_summary && (
            <section className="border border-blue-custom/25 bg-blue-bg/40 rounded-lg p-4 print:border-black print:bg-white">
              <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-blue-t print:text-black" /><h3 className="text-xs font-bold text-text-custom print:text-black">Resumo estratégico</h3></div>
              <p className="text-xs text-text2 print:text-black whitespace-pre-wrap leading-relaxed mt-3">{submission.strategic_summary}</p>
            </section>
          )}

          {steps.map((step) => {
            const questions = step.questions.filter((question) => isQuestionVisible(question, submission.answers))
            return (
              <section key={step.id} className="border border-border-custom rounded-lg overflow-hidden break-inside-avoid print:border-black">
                <h3 className="px-4 py-3 bg-surface2/60 border-b border-border-custom text-xs font-bold text-text-custom print:bg-white print:text-black print:border-black">{step.title}</h3>
                <dl className="divide-y divide-border-custom print:divide-black">
                  {questions.map((question) => {
                    const value = answerToText(submission.answers[question.id])
                    return (
                      <div key={question.id} className="px-4 py-3">
                        <dt className="text-[10px] uppercase font-bold text-text3 print:text-black">{question.label}</dt>
                        <dd className={`text-xs mt-1.5 whitespace-pre-wrap leading-relaxed ${value ? 'text-text-custom print:text-black' : 'text-red-t italic'}`}>{value || 'Não respondido'}</dd>
                      </div>
                    )
                  })}
                </dl>
              </section>
            )
          })}

          {attachments.length > 0 && (
            <section className="border border-border-custom rounded-lg p-4 print:border-black">
              <h3 className="text-xs font-bold text-text-custom print:text-black flex items-center gap-2"><Paperclip className="w-4 h-4" />Referências anexadas</h3>
              <div className="mt-3 space-y-2">
                {attachments.map((attachment) => (
                  <button key={attachment.id} onClick={() => onOpenAttachment(attachment)} className="w-full flex items-center justify-between gap-3 px-3 py-2 border border-border2 rounded-lg text-xs text-left hover:bg-surface2 cursor-pointer print:border-black">
                    <span className="truncate">{attachment.original_name}</span><ExternalLink className="w-3.5 h-3.5 shrink-0 print:hidden" />
                  </button>
                ))}
              </div>
            </section>
          )}

          {(submission.mapped_fields.length > 0 || submission.skipped_fields.length > 0) && (
            <section className="grid sm:grid-cols-2 gap-3 print:hidden">
              <div className="border border-green-custom/25 bg-green-bg/35 rounded-lg p-4"><h3 className="text-xs font-bold text-green-t">Campos preenchidos no Clave</h3><ul className="mt-2 space-y-1 text-[11px] text-text2">{submission.mapped_fields.map((item) => <li key={item}>• {item}</li>)}</ul></div>
              <div className="border border-border-custom rounded-lg p-4"><h3 className="text-xs font-bold text-text-custom">Campos preservados</h3><ul className="mt-2 space-y-1 text-[11px] text-text3">{submission.skipped_fields.map((item) => <li key={item}>• {item}</li>)}</ul></div>
            </section>
          )}

          <section className="border border-border-custom rounded-lg p-4 print:hidden">
            <h3 className="text-xs font-bold text-text-custom">Anotações internas</h3>
            <textarea value={notes} onChange={(event) => onNotesChange(event.target.value)} rows={5} placeholder="Registre análises, pendências e decisões da equipe." className="mt-3 w-full p-3 border border-border2 rounded-lg bg-surface text-xs text-text-custom outline-none resize-y" />
            <button onClick={onSaveNotes} className="mt-3 px-3 py-2 bg-text-custom text-surface rounded-lg text-xs font-semibold cursor-pointer">Salvar anotações</button>
          </section>
        </div>
      </article>
    </div>
  )
}
