'use client'

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  FileVideo,
  Loader2,
  Trash2,
  Upload,
} from 'lucide-react'
import type {
  SocialAccountPublic,
  SocialMediaPublic,
  SocialPostInput,
  SocialPostPublic,
} from '@/types/social'
import { createClient } from '@/utils/supabase/client'
import { formatSaoPauloDate, saoPauloLocalToUtc, toSaoPauloInput } from '@/utils/social/timezone'

interface ComposerMedia extends SocialMediaPublic {
  localPreview?: string
}

interface Props {
  projectId: string
  accounts: SocialAccountPublic[]
  editingPost?: SocialPostPublic | null
  onSaved: (post: SocialPostPublic, publishedNow: boolean) => void
}

function defaultSchedule() {
  const date = new Date(Date.now() + 60 * 60 * 1_000)
  date.setMinutes(0, 0, 0)
  return toSaoPauloInput(date.toISOString())
}

async function fileFingerprint(file: File) {
  const chunkSize = Math.min(file.size, 1024 * 1024)
  const first = new Uint8Array(await file.slice(0, chunkSize).arrayBuffer())
  const lastStart = Math.max(0, file.size - chunkSize)
  const last = new Uint8Array(await file.slice(lastStart).arrayBuffer())
  const metadata = new TextEncoder().encode(`${file.name}:${file.type}:${file.size}:${file.lastModified}`)
  const combined = new Uint8Array(first.length + last.length + metadata.length)
  combined.set(first)
  combined.set(last, first.length)
  combined.set(metadata, first.length + last.length)
  const digest = await crypto.subtle.digest('SHA-256', combined)
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function inspectFile(file: File) {
  const url = URL.createObjectURL(file)
  if (file.type.startsWith('image/')) {
    const image = new Image()
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
      image.onerror = () => reject(new Error('Não foi possível ler a imagem.'))
      image.src = url
    })
    return { ...dimensions, durationMs: null, mediaType: 'image' as const, url }
  }
  const video = document.createElement('video')
  video.preload = 'metadata'
  const metadata = await new Promise<{ width: number; height: number; durationMs: number }>((resolve, reject) => {
    video.onloadedmetadata = () => resolve({
      width: video.videoWidth,
      height: video.videoHeight,
      durationMs: Math.round(video.duration * 1_000),
    })
    video.onerror = () => reject(new Error('Não foi possível ler o vídeo.'))
    video.src = url
  })
  return { ...metadata, mediaType: 'video' as const, url }
}

export default function SocialComposer({ projectId, accounts, editingPost, onSaved }: Props) {
  const [supabase] = useState(() => createClient())
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const [title, setTitle] = useState(editingPost?.internalTitle || '')
  const [baseCaption, setBaseCaption] = useState(editingPost?.baseCaption || '')
  const [selected, setSelected] = useState<string[]>(
    editingPost?.targets.map((target) => target.socialAccountId)
      || accounts.filter((account) => account.provider === 'instagram' && account.status === 'connected').map((account) => account.id),
  )
  const [overrides, setOverrides] = useState<Record<string, string>>(() => Object.fromEntries(
    editingPost?.targets.map((target) => [target.socialAccountId, target.customCaption || '']) || [],
  ))
  const [settings, setSettings] = useState<Record<string, Record<string, unknown>>>(() => Object.fromEntries(
    editingPost?.targets.map((target) => [target.socialAccountId, target.providerSettings || {}]) || [],
  ))
  const [media, setMedia] = useState<ComposerMedia[]>(editingPost?.media || [])
  const [scheduleMode, setScheduleMode] = useState<'now' | 'schedule'>(editingPost?.scheduledAt ? 'schedule' : 'now')
  const [scheduledLocal, setScheduledLocal] = useState(
    editingPost?.scheduledAt ? toSaoPauloInput(editingPost.scheduledAt) : defaultSchedule(),
  )
  const [showOverrides, setShowOverrides] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const hydratedPost = useRef(editingPost?.id)
  const mediaRef = useRef(media)
  const uploadedPathsRef = useRef(new Set<string>())
  const removedExistingPathsRef = useRef(new Set<string>())
  const savedRef = useRef(false)

  useEffect(() => {
    mediaRef.current = media
  }, [media])

  useEffect(() => () => {
    mediaRef.current.forEach((item) => {
      if (item.localPreview) URL.revokeObjectURL(item.localPreview)
    })
    if (!savedRef.current) {
      uploadedPathsRef.current.forEach((storagePath) => {
        void fetch('/api/social/media', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, storagePath }),
          keepalive: true,
        })
      })
    }
  }, [projectId])

  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (!title && !baseCaption && !media.length) return
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [baseCaption, media.length, title])

  useEffect(() => {
    if (!editingPost || hydratedPost.current === editingPost.id) return
    hydratedPost.current = editingPost.id
    setTitle(editingPost.internalTitle || '')
    setBaseCaption(editingPost.baseCaption)
    setSelected(editingPost.targets.map((target) => target.socialAccountId))
    setOverrides(Object.fromEntries(editingPost.targets.map((target) => [target.socialAccountId, target.customCaption || ''])))
    setSettings(Object.fromEntries(editingPost.targets.map((target) => [target.socialAccountId, target.providerSettings || {}])))
    setMedia(editingPost.media)
    setScheduleMode(editingPost.scheduledAt ? 'schedule' : 'now')
    setScheduledLocal(editingPost.scheduledAt ? toSaoPauloInput(editingPost.scheduledAt) : defaultSchedule())
    uploadedPathsRef.current.clear()
    removedExistingPathsRef.current.clear()
    savedRef.current = false
  }, [editingPost])

  const selectedAccounts = useMemo(
    () => accounts.filter((account) => selected.includes(account.id)),
    [accounts, selected],
  )

  const compatibilityIssues = useMemo(() => {
    const issues: string[] = []
    selectedAccounts.forEach((account) => {
      const label = account.provider === 'instagram' ? 'Instagram' : 'Facebook'
      const caption = overrides[account.id]?.trim() || baseCaption
      if (caption.length > account.capabilities.maxCaptionLength) {
        issues.push(`A legenda excede o limite do ${label}.`)
      }
      if (!media.length && !account.capabilities.textOnly) {
        issues.push(`${label} exige pelo menos uma mídia.`)
      }
      if (media.length > account.capabilities.maxMedia) {
        issues.push(`${label} aceita no máximo ${account.capabilities.maxMedia} mídias.`)
      }
      const incompatible = media.find((item) => !account.capabilities.acceptedMimeTypes.includes(item.mimeType))
      if (incompatible) {
        issues.push(`${incompatible.mimeType} não é compatível com ${label}.`)
      }
      if (account.provider === 'facebook' && media.length > 1 && media.some((item) => item.mediaType === 'video')) {
        issues.push('O Facebook não aceita vídeo combinado com outras mídias nesta fase.')
      }
    })
    return [...new Set(issues)]
  }, [baseCaption, media, overrides, selectedAccounts])

  const deleteOrphan = async (storagePath: string) => {
    await fetch('/api/social/media', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, storagePath }),
    }).catch(() => undefined)
  }

  const removeMedia = (item: ComposerMedia) => {
    if (item.localPreview) {
      URL.revokeObjectURL(item.localPreview)
      uploadedPathsRef.current.delete(item.storagePath)
      void deleteOrphan(item.storagePath)
    } else {
      removedExistingPathsRef.current.add(item.storagePath)
    }
    setMedia((current) => current
      .filter((mediaItem) => mediaItem.id !== item.id)
      .map((mediaItem, position) => ({ ...mediaItem, position })))
  }

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return
    if (media.length + files.length > 10) {
      setError('Envie no máximo 10 mídias.')
      return
    }
    setUploading(true)
    setError(null)
    try {
      const next = [...media]
      for (const file of Array.from(files)) {
        const inspected = await inspectFile(file)
        const checksum = await fileFingerprint(file)
        const response = await fetch('/api/social/media/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            uploadId: idempotencyKey,
            mimeType: file.type,
            fileSize: file.size,
          }),
        })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Não foi possível preparar o upload.')
        const { error: uploadError } = await supabase.storage
          .from('social-publishing')
          .uploadToSignedUrl(payload.path, payload.token, file, {
            contentType: file.type,
          })
        if (uploadError) throw uploadError
        uploadedPathsRef.current.add(payload.path)
        next.push({
          id: crypto.randomUUID(),
          storagePath: payload.path,
          mediaType: inspected.mediaType,
          mimeType: file.type,
          fileSize: file.size,
          width: inspected.width,
          height: inspected.height,
          durationMs: inspected.durationMs,
          position: next.length,
          altText: '',
          checksum,
          localPreview: inspected.url,
          previewUrl: inspected.url,
        })
      }
      setMedia(next)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha no upload.')
    } finally {
      setUploading(false)
    }
  }

  const moveMedia = (index: number, direction: -1 | 1) => {
    const destination = index + direction
    if (destination < 0 || destination >= media.length) return
    setMedia((current) => {
      const copy = [...current]
      ;[copy[index], copy[destination]] = [copy[destination], copy[index]]
      return copy.map((item, position) => ({ ...item, position }))
    })
  }

  const submit = async (action: 'draft' | 'now' | 'schedule') => {
    setError(null)
    if (!selectedAccounts.length) return setError('Selecione pelo menos um destino.')
    if (action !== 'draft' && compatibilityIssues.length) return setError(compatibilityIssues[0])
    let scheduledAt: string | null = null
    try {
      if (action === 'schedule') scheduledAt = saoPauloLocalToUtc(scheduledLocal)
    } catch (reason) {
      return setError(reason instanceof Error ? reason.message : 'Data inválida.')
    }
    const input: SocialPostInput = {
      projectId,
      internalTitle: title.trim() || null,
      baseCaption,
      timezone: 'America/Sao_Paulo',
      scheduledAt,
      publishNow: action === 'now',
      saveAsDraft: action === 'draft',
      idempotencyKey,
      targets: selectedAccounts.map((account) => ({
        socialAccountId: account.id,
        customCaption: overrides[account.id]?.trim() || null,
        providerSettings: settings[account.id] || {},
      })),
      media: media.map((item, position) => ({
        storagePath: item.storagePath,
        mediaType: item.mediaType,
        mimeType: item.mimeType,
        fileSize: item.fileSize,
        width: item.width,
        height: item.height,
        durationMs: item.durationMs,
        position,
        altText: item.altText,
        checksum: item.checksum,
      })),
    }
    setSubmitting(action)
    try {
      const response = await fetch(
        editingPost ? `/api/social/posts/${editingPost.id}` : '/api/social/posts',
        {
          method: editingPost ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        },
      )
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Não foi possível salvar a publicação.')
      await Promise.all([...removedExistingPathsRef.current].map(deleteOrphan))
      removedExistingPathsRef.current.clear()
      savedRef.current = true
      onSaved(payload.post as SocialPostPublic, action === 'now')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar a publicação.')
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex gap-3 rounded-xl border border-red-t/20 bg-red-bg p-4 text-xs text-red-t" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <section className="rounded-xl border border-border-custom bg-surface p-4 md:p-5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-text3">1. Destinos</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {accounts.map((account) => {
            const active = selected.includes(account.id)
            const disabled = account.status !== 'connected'
            return (
              <button
                key={account.id}
                type="button"
                disabled={disabled}
                onClick={() => setSelected((current) => active
                  ? current.filter((id) => id !== account.id)
                  : [...current, account.id])}
                className={`flex min-h-16 items-center gap-3 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${active ? 'border-purple-custom bg-purple-bg/50' : 'border-border-custom hover:border-border2'}`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface2 text-xs font-bold">
                  {account.avatarUrl ? <img src={account.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" /> : account.provider === 'instagram' ? 'IG' : 'FB'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-text-custom">{account.displayName}</p>
                  <p className="truncate text-[10px] text-text3">{account.provider === 'instagram' ? 'Instagram profissional' : 'Facebook Page'}</p>
                </div>
                {active && <Check className="h-4 w-4 text-purple-t" />}
              </button>
            )
          })}
        </div>
      </section>

      <section className="rounded-xl border border-border-custom bg-surface p-4 md:p-5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-text3">2. Conteúdo</p>
        <div className="mt-4 grid gap-4">
          <label className="grid gap-1.5 text-xs font-semibold text-text2">
            Título interno <span className="font-normal text-text3">(opcional)</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} className="rounded-lg border border-border2 bg-bg px-3 py-2.5 text-sm text-text-custom outline-none focus:border-purple-custom" />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-text2">
            Legenda-base
            <textarea value={baseCaption} onChange={(event) => setBaseCaption(event.target.value)} rows={6} className="resize-y rounded-lg border border-border2 bg-bg px-3 py-2.5 text-sm leading-relaxed text-text-custom outline-none focus:border-purple-custom" />
          </label>
          <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border2 bg-surface2/40 p-5 text-center hover:border-purple-custom" aria-live="polite">
            {uploading ? <Loader2 className="h-5 w-5 animate-spin text-purple-t" /> : <Upload className="h-5 w-5 text-purple-t" />}
            <span className="mt-2 text-xs font-bold text-text-custom">{uploading ? 'Enviando mídia…' : 'Adicionar imagens ou vídeo'}</span>
            <span className="mt-1 text-[10px] text-text3">Upload privado e direto para o armazenamento</span>
            <input type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" disabled={uploading} onChange={(event) => void uploadFiles(event.target.files)} className="sr-only" />
          </label>
          {media.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {media.map((item, index) => (
                <div key={item.id} className="overflow-hidden rounded-xl border border-border-custom bg-surface2/40">
                  <div className="relative aspect-video bg-bg">
                    {item.mediaType === 'image'
                      ? <img src={item.previewUrl || item.localPreview || ''} alt="" className="h-full w-full object-cover" />
                      : <div className="flex h-full items-center justify-center"><FileVideo className="h-8 w-8 text-text3" /></div>}
                    <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-1 text-[9px] font-bold text-white">{index + 1}</span>
                  </div>
                  <div className="space-y-2 p-3">
                    <input
                      value={item.altText || ''}
                      onChange={(event) => setMedia((current) => current.map((mediaItem) => mediaItem.id === item.id ? { ...mediaItem, altText: event.target.value } : mediaItem))}
                      placeholder="Texto alternativo"
                      className="w-full rounded-md border border-border-custom bg-bg px-2 py-1.5 text-[10px] text-text-custom"
                    />
                    <div className="flex justify-between">
                      <div className="flex gap-1">
                        <button type="button" onClick={() => moveMedia(index, -1)} disabled={index === 0} className="rounded p-1.5 text-text3 hover:bg-surface disabled:opacity-30" aria-label="Mover mídia para a esquerda"><ArrowUp className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => moveMedia(index, 1)} disabled={index === media.length - 1} className="rounded p-1.5 text-text3 hover:bg-surface disabled:opacity-30" aria-label="Mover mídia para a direita"><ArrowDown className="h-3.5 w-3.5" /></button>
                      </div>
                      <button type="button" onClick={() => removeMedia(item)} className="rounded p-1.5 text-red-t hover:bg-red-bg" aria-label="Remover mídia"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {compatibilityIssues.length > 0 && (
        <div className="rounded-xl border border-amber-custom/20 bg-amber-bg p-4" role="alert">
          <p className="text-xs font-bold text-amber-t">Revise a compatibilidade</p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-[10px] text-text2">
            {compatibilityIssues.map((issue) => <li key={issue}>{issue}</li>)}
          </ul>
        </div>
      )}

      <section className="rounded-xl border border-border-custom bg-surface p-4 md:p-5">
        <button type="button" onClick={() => setShowOverrides((value) => !value)} className="flex w-full items-center justify-between text-left">
          <div><p className="text-[10px] font-bold uppercase tracking-wider text-text3">3. Personalizar por rede</p><p className="mt-1 text-xs text-text2">A legenda-base será usada quando não houver personalização.</p></div>
          <ChevronDown className={`h-4 w-4 text-text3 transition-transform ${showOverrides ? 'rotate-180' : ''}`} />
        </button>
        {showOverrides && <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {selectedAccounts.map((account) => (
            <div key={account.id} className="rounded-lg border border-border-custom p-3">
              <p className="text-xs font-bold text-text-custom">{account.displayName}</p>
              <p className="text-[10px] text-text3">{account.provider === 'instagram' ? 'Instagram' : 'Facebook'}</p>
              <textarea value={overrides[account.id] || ''} onChange={(event) => setOverrides((current) => ({ ...current, [account.id]: event.target.value }))} rows={4} placeholder="Manter legenda-base" className="mt-3 w-full resize-y rounded-md border border-border-custom bg-bg px-2.5 py-2 text-xs text-text-custom" />
              {media.some((item) => item.mediaType === 'video') && (
                <select
                  value={String(settings[account.id]?.[account.provider === 'instagram' ? 'instagramFormat' : 'facebookFormat'] || 'reel')}
                  onChange={(event) => setSettings((current) => ({
                    ...current,
                    [account.id]: {
                      ...(current[account.id] || {}),
                      [account.provider === 'instagram' ? 'instagramFormat' : 'facebookFormat']: event.target.value,
                    },
                  }))}
                  className="mt-2 w-full rounded-md border border-border-custom bg-bg px-2.5 py-2 text-xs text-text-custom"
                >
                  <option value="reel">Reel</option>
                  <option value="feed">Vídeo no feed</option>
                </select>
              )}
            </div>
          ))}
        </div>}
      </section>

      <section className="rounded-xl border border-border-custom bg-surface p-4 md:p-5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-text3">4. Data e horário</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={() => setScheduleMode('now')} className={`min-h-11 rounded-lg border px-4 text-xs font-bold ${scheduleMode === 'now' ? 'border-purple-custom bg-purple-bg text-purple-t' : 'border-border2 text-text2'}`}>Publicar agora</button>
          <button type="button" onClick={() => setScheduleMode('schedule')} className={`min-h-11 rounded-lg border px-4 text-xs font-bold ${scheduleMode === 'schedule' ? 'border-purple-custom bg-purple-bg text-purple-t' : 'border-border2 text-text2'}`}>Agendar</button>
        </div>
        {scheduleMode === 'schedule' && (
          <div className="mt-4 max-w-md">
            <label className="grid gap-1.5 text-xs font-semibold text-text2">Data e horário
              <input type="datetime-local" value={scheduledLocal} onChange={(event) => setScheduledLocal(event.target.value)} className="rounded-lg border border-border2 bg-bg px-3 py-2.5 text-sm text-text-custom" />
            </label>
            <p className="mt-2 text-[10px] text-text3">Fuso: America/Sao_Paulo · {scheduledLocal.length === 16 ? (() => {
              try { return formatSaoPauloDate(saoPauloLocalToUtc(scheduledLocal)) } catch { return 'horário inválido' }
            })() : ''}</p>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border-custom bg-gradient-to-br from-purple-bg/60 to-coral-bg/30 p-4 md:p-5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-text3">5. Revisão</p>
        <div className="mt-4 grid gap-3 text-xs text-text2 sm:grid-cols-3">
          <div><span className="block text-[9px] uppercase text-text3">Destinos</span><strong className="text-text-custom">{selectedAccounts.map((account) => account.displayName).join(', ') || 'Nenhum'}</strong></div>
          <div><span className="block text-[9px] uppercase text-text3">Formato</span><strong className="text-text-custom">{media.length > 1 ? 'Carrossel' : media[0]?.mediaType === 'video' ? 'Vídeo/Reel' : media.length ? 'Imagem' : 'Texto'}</strong></div>
          <div><span className="block text-[9px] uppercase text-text3">Envio</span><strong className="text-text-custom">{scheduleMode === 'now' ? 'Imediato' : scheduledLocal}</strong></div>
        </div>
        <div className="mt-4 flex flex-col gap-3 rounded-xl bg-surface/70 p-3 sm:flex-row">
          {media[0]?.mediaType === 'image' && (media[0].previewUrl || media[0].localPreview) && (
            <img src={media[0].previewUrl || media[0].localPreview || ''} alt={media[0].altText || ''} className="h-20 w-20 shrink-0 rounded-lg object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-text-custom">{baseCaption || 'Sem legenda-base'}</p>
            {selectedAccounts.some((account) => overrides[account.id]?.trim()) && (
              <div className="mt-2 space-y-1 border-t border-border-custom pt-2">
                {selectedAccounts.filter((account) => overrides[account.id]?.trim()).map((account) => (
                  <p key={account.id} className="text-[9px] text-text3"><strong>{account.displayName}:</strong> {overrides[account.id]}</p>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end" aria-live="polite">
          <button type="button" disabled={Boolean(submitting) || uploading} onClick={() => void submit('draft')} className="min-h-11 rounded-lg border border-border2 bg-surface px-4 text-xs font-bold text-text-custom disabled:opacity-50">{submitting === 'draft' ? 'Salvando…' : 'Salvar rascunho'}</button>
          <button type="button" disabled={Boolean(submitting) || uploading || compatibilityIssues.length > 0} onClick={() => void submit(scheduleMode)} className="min-h-11 rounded-lg bg-text-custom px-5 text-xs font-bold text-bg disabled:opacity-50">{submitting ? <span className="inline-flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />Processando</span> : scheduleMode === 'now' ? 'Publicar agora' : 'Agendar publicação'}</button>
        </div>
      </section>
    </div>
  )
}
