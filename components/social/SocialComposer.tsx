'use client'

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  FileVideo,
  Loader2,
  Send,
  Trash2,
  Upload,
} from 'lucide-react'
import type {
  FacebookPublishingFormat,
  InstagramPublishingFormat,
  SocialAccountPublic,
  SocialMediaPublic,
  SocialPostInput,
  SocialPostPublic,
} from '@/types/social'
import {
  getFacebookPublishingFormat,
  getInstagramPublishingFormat,
  getPublishingFormat,
} from '@/utils/social/formats'
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

type PublishingFormat = InstagramPublishingFormat | FacebookPublishingFormat

const FORMAT_LABELS: Record<PublishingFormat, string> = {
  feed: 'Feed',
  reel: 'Reels',
  story: 'Stories',
}

function defaultSchedule() {
  const date = new Date(Date.now() + 60 * 60 * 1_000)
  date.setMinutes(0, 0, 0)
  return toSaoPauloInput(date.toISOString())
}

function defaultSelectedAccounts(accounts: SocialAccountPublic[]) {
  const preferred = accounts.find((account) => account.provider === 'instagram' && account.status === 'connected')
    || accounts.find((account) => account.status === 'connected')
  return preferred ? [preferred.id] : []
}

function providerName(account: SocialAccountPublic) {
  return account.provider === 'instagram' ? 'Instagram profissional' : 'Facebook Page'
}

function formatDescription(format: PublishingFormat, media: ComposerMedia[]) {
  if (format === 'story') return 'Story vertical'
  if (format === 'reel') return 'Vídeo curto'
  if (media.length > 1) return 'Carrossel no Feed'
  if (media[0]?.mediaType === 'video') return 'Vídeo no Feed'
  return 'Publicação no Feed'
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
  const [baseCaption, setBaseCaption] = useState(editingPost?.baseCaption || '')
  const [selected, setSelected] = useState<string[]>(
    editingPost?.targets.map((target) => target.socialAccountId) || defaultSelectedAccounts(accounts),
  )
  const [overrides, setOverrides] = useState<Record<string, string>>(() => Object.fromEntries(
    editingPost?.targets.map((target) => [target.socialAccountId, target.customCaption || '']) || [],
  ))
  const [settings, setSettings] = useState<Record<string, Record<string, unknown>>>(() => Object.fromEntries(
    editingPost?.targets.map((target) => [target.socialAccountId, target.providerSettings || {}]) || [],
  ))
  const [media, setMedia] = useState<ComposerMedia[]>(editingPost?.media || [])
  const [scheduledLocal, setScheduledLocal] = useState(
    editingPost?.scheduledAt ? toSaoPauloInput(editingPost.scheduledAt) : defaultSchedule(),
  )
  const [activeCaptionTarget, setActiveCaptionTarget] = useState<'base' | string>('base')
  const [profilesOpen, setProfilesOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState<'now' | 'schedule' | null>(null)
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
      if (!baseCaption && !media.length && !Object.values(overrides).some(Boolean)) return
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [baseCaption, media.length, overrides])

  useEffect(() => {
    if (!editingPost || hydratedPost.current === editingPost.id) return
    hydratedPost.current = editingPost.id
    setBaseCaption(editingPost.baseCaption)
    setSelected(editingPost.targets.map((target) => target.socialAccountId))
    setOverrides(Object.fromEntries(editingPost.targets.map((target) => [target.socialAccountId, target.customCaption || ''])))
    setSettings(Object.fromEntries(editingPost.targets.map((target) => [target.socialAccountId, target.providerSettings || {}])))
    setMedia(editingPost.media)
    setScheduledLocal(editingPost.scheduledAt ? toSaoPauloInput(editingPost.scheduledAt) : defaultSchedule())
    setActiveCaptionTarget('base')
    uploadedPathsRef.current.clear()
    removedExistingPathsRef.current.clear()
    savedRef.current = false
  }, [editingPost])

  const selectedAccounts = useMemo(
    () => accounts.filter((account) => selected.includes(account.id)),
    [accounts, selected],
  )
  const activeCaptionAccount = activeCaptionTarget === 'base'
    ? null
    : selectedAccounts.find((account) => account.id === activeCaptionTarget) || null
  const previewAccount = selectedAccounts[0] || null
  const previewFormat = previewAccount
    ? getPublishingFormat(previewAccount.provider, settings[previewAccount.id] || {})
    : 'feed'
  const previewCaption = previewAccount
    ? overrides[previewAccount.id]?.trim() || baseCaption
    : baseCaption
  const scheduledDate = scheduledLocal.split('T')[0] || ''
  const scheduledTime = scheduledLocal.split('T')[1]?.slice(0, 5) || ''

  const compatibilityIssues = useMemo(() => {
    const issues: string[] = []
    selectedAccounts.forEach((account) => {
      const label = account.provider === 'instagram' ? 'Instagram' : 'Facebook'
      const caption = overrides[account.id]?.trim() || baseCaption
      const format = getPublishingFormat(account.provider, settings[account.id] || {})
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
      if (format === 'reel' && (media.length !== 1 || media[0]?.mediaType !== 'video')) {
        issues.push(`Reels do ${label} exigem um único vídeo.`)
      }
      if (account.provider === 'instagram' && format === 'story' && media.length !== 1) {
        issues.push('Stories do Instagram aceitam uma única imagem ou vídeo por publicação.')
      }
      if (account.provider === 'facebook' && format === 'feed' && media.length > 1 && media.some((item) => item.mediaType === 'video')) {
        issues.push('O Facebook não aceita vídeo combinado com outras mídias nesta fase.')
      }
    })
    return [...new Set(issues)]
  }, [baseCaption, media, overrides, selectedAccounts, settings])

  const setPublishingFormat = (account: SocialAccountPublic, format: PublishingFormat) => {
    const key = account.provider === 'instagram' ? 'instagramFormat' : 'facebookFormat'
    setSettings((current) => ({
      ...current,
      [account.id]: { ...(current[account.id] || {}), [key]: format },
    }))
  }

  const toggleAccount = (account: SocialAccountPublic) => {
    if (account.status !== 'connected') return
    if (selected.includes(account.id) && activeCaptionTarget === account.id) {
      setActiveCaptionTarget('base')
    }
    setSelected((current) => current.includes(account.id)
      ? current.filter((id) => id !== account.id)
      : [...current, account.id])
  }

  const updateCaption = (value: string) => {
    if (activeCaptionTarget === 'base') {
      setBaseCaption(value)
      return
    }
    setOverrides((current) => ({ ...current, [activeCaptionTarget]: value }))
  }

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
          .uploadToSignedUrl(payload.path, payload.token, file, { contentType: file.type })
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

  const submit = async (action: 'now' | 'schedule') => {
    setError(null)
    if (!selectedAccounts.length) return setError('Selecione pelo menos um perfil.')
    if (compatibilityIssues.length) return setError(compatibilityIssues[0])
    let scheduledAt: string | null = null
    try {
      if (action === 'schedule') scheduledAt = saoPauloLocalToUtc(scheduledLocal)
    } catch (reason) {
      return setError(reason instanceof Error ? reason.message : 'Data inválida.')
    }
    const input: SocialPostInput = {
      projectId,
      internalTitle: editingPost?.internalTitle || null,
      baseCaption,
      timezone: 'America/Sao_Paulo',
      scheduledAt,
      publishNow: action === 'now',
      saveAsDraft: false,
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

  const activeCaptionValue = activeCaptionTarget === 'base'
    ? baseCaption
    : overrides[activeCaptionTarget] || ''
  const activeCaptionLimit = activeCaptionAccount?.capabilities.maxCaptionLength
    || (selectedAccounts.length
      ? Math.min(...selectedAccounts.map((account) => account.capabilities.maxCaptionLength))
      : 2_200)
  const activeIsStory = activeCaptionAccount?.provider === 'instagram'
    && getInstagramPublishingFormat(settings[activeCaptionAccount.id] || {}) === 'story'

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex gap-3 rounded-xl border border-red-t/20 bg-red-bg p-4 text-xs text-red-t" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid overflow-hidden rounded-2xl border border-border-custom bg-surface min-[1100px]:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)_280px] 2xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)_320px]">
        <div className="space-y-6 border-b border-border-custom p-4 md:p-6 min-[1100px]:border-b-0 min-[1100px]:border-r">
          <section>
            <p className="text-xs font-bold text-text-custom">1. Selecione os perfis</p>
            <div className="relative mt-3">
              <button
                type="button"
                onClick={() => setProfilesOpen((value) => !value)}
                className="flex min-h-12 w-full items-center gap-2 rounded-xl border border-border2 bg-bg px-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-custom"
                aria-expanded={profilesOpen}
              >
                <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                  {selectedAccounts.length ? selectedAccounts.map((account) => (
                    <span key={account.id} className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-surface2 px-2 py-1 text-[10px] font-semibold text-text-custom">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-bg text-[7px] font-black">{account.provider === 'instagram' ? 'IG' : 'FB'}</span>
                      <span className="truncate">{account.displayName}</span>
                    </span>
                  )) : <span className="text-xs text-text3">Selecionar perfis</span>}
                </div>
                <ChevronDown className={`h-4 w-4 shrink-0 text-text3 transition-transform ${profilesOpen ? 'rotate-180' : ''}`} />
              </button>
              {profilesOpen && (
                <div className="absolute left-0 right-0 z-20 mt-2 max-h-72 space-y-1 overflow-y-auto rounded-xl border border-border2 bg-surface p-2 shadow-2xl">
                  {accounts.map((account) => {
                    const active = selected.includes(account.id)
                    const disabled = account.status !== 'connected'
                    return (
                      <button
                        key={account.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => toggleAccount(account)}
                        className="flex w-full items-center gap-3 rounded-lg p-2.5 text-left hover:bg-surface2 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface2 text-[9px] font-black">
                          {account.avatarUrl ? <img src={account.avatarUrl} alt="" className="h-full w-full object-cover" /> : account.provider === 'instagram' ? 'IG' : 'FB'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-text-custom">{account.displayName}</p>
                          <p className="truncate text-[9px] text-text3">{providerName(account)}{disabled ? ' · indisponível' : ''}</p>
                        </div>
                        <span className={`flex h-5 w-5 items-center justify-center rounded border ${active ? 'border-purple-custom bg-purple-custom text-white' : 'border-border2'}`}>
                          {active && <Check className="h-3 w-3" />}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </section>

          <section>
            <p className="text-xs font-bold text-text-custom">3. Legenda</p>
            <div className="mt-3 overflow-hidden rounded-xl border border-border2 bg-bg">
              <div className="flex overflow-x-auto border-b border-border-custom" role="tablist" aria-label="Legenda por perfil">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeCaptionTarget === 'base'}
                  onClick={() => setActiveCaptionTarget('base')}
                  className={`min-h-10 shrink-0 border-b-2 px-4 text-[10px] font-bold ${activeCaptionTarget === 'base' ? 'border-purple-custom text-purple-t' : 'border-transparent text-text3'}`}
                >
                  Todos
                </button>
                {selectedAccounts.map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    role="tab"
                    aria-selected={activeCaptionTarget === account.id}
                    onClick={() => setActiveCaptionTarget(account.id)}
                    className={`min-h-10 max-w-40 shrink-0 truncate border-b-2 px-3 text-[10px] font-bold ${activeCaptionTarget === account.id ? 'border-purple-custom text-purple-t' : 'border-transparent text-text3'}`}
                  >
                    {account.displayName}
                  </button>
                ))}
              </div>
              <textarea
                value={activeCaptionValue}
                onChange={(event) => updateCaption(event.target.value)}
                rows={12}
                maxLength={activeCaptionLimit}
                placeholder={activeCaptionTarget === 'base' ? 'Digite a legenda do post' : 'Deixe em branco para usar a legenda de Todos'}
                className="min-h-64 w-full resize-y bg-transparent px-4 py-3 text-sm leading-relaxed text-text-custom outline-none placeholder:text-text3"
                aria-label={activeCaptionTarget === 'base' ? 'Legenda para todos os perfis' : `Legenda para ${activeCaptionAccount?.displayName || 'perfil'}`}
              />
              <div className="flex items-center justify-between border-t border-border-custom px-4 py-2 text-[9px] text-text3">
                <span>{activeCaptionTarget === 'base' ? 'Legenda-base' : 'Personalização deste perfil'}</span>
                <span>{activeCaptionValue.length}/{activeCaptionLimit}</span>
              </div>
            </div>
            {activeIsStory && <p className="mt-2 text-[10px] text-amber-t">Stories do Instagram não usam legenda. O texto continua preservado para os outros canais.</p>}
          </section>
        </div>

        <div className="space-y-6 border-b border-border-custom p-4 md:p-6 min-[1100px]:border-b-0 min-[1100px]:border-r">
          <section>
            <p className="text-xs font-bold text-text-custom">2. Selecione os canais</p>
            <div className="mt-3 space-y-3">
              {selectedAccounts.length ? selectedAccounts.map((account) => {
                const currentFormat = account.provider === 'instagram'
                  ? getInstagramPublishingFormat(settings[account.id] || {})
                  : getFacebookPublishingFormat(settings[account.id] || {})
                const formats: PublishingFormat[] = account.provider === 'instagram'
                  ? ['feed', 'reel', 'story']
                  : ['feed', 'reel']
                return (
                  <div key={account.id} className="rounded-xl border border-border-custom bg-bg p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[10px] font-bold text-text-custom">{account.displayName}</p>
                        <p className="text-[9px] text-text3">{providerName(account)}</p>
                      </div>
                      <span className="rounded-full bg-surface2 px-2 py-1 text-[8px] font-black text-text2">{account.provider === 'instagram' ? 'IG' : 'FB'}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {formats.map((format) => (
                        <button
                          key={format}
                          type="button"
                          onClick={() => setPublishingFormat(account, format)}
                          aria-pressed={currentFormat === format}
                          className={`min-h-10 rounded-lg border px-2 text-[10px] font-bold transition-colors ${currentFormat === format ? 'border-purple-custom bg-purple-bg text-purple-t' : 'border-border2 text-text2 hover:bg-surface2'}`}
                        >
                          {FORMAT_LABELS[format]}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-[9px] text-text3">{formatDescription(currentFormat, media)}</p>
                  </div>
                )
              }) : (
                <div className="rounded-xl border border-dashed border-border2 p-5 text-center text-[10px] text-text3">Selecione um perfil para escolher Feed, Reels ou Stories.</div>
              )}
            </div>
            {selectedAccounts.some((account) => account.provider === 'facebook') && (
              <p className="mt-2 text-[9px] text-text3">Stories está disponível no Instagram profissional nesta fase.</p>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-bold text-text-custom">4. Mídias</p>
              <span className="text-[9px] text-text3">{media.filter((item) => item.mediaType === 'image').length} imagens, {media.filter((item) => item.mediaType === 'video').length} vídeos</span>
            </div>
            <label
              className="mt-3 flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border2 bg-bg p-5 text-center transition-colors hover:border-purple-custom"
              aria-live="polite"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                void uploadFiles(event.dataTransfer.files)
              }}
            >
              {uploading ? <Loader2 className="h-6 w-6 animate-spin text-purple-t" /> : <Upload className="h-6 w-6 text-purple-t" />}
              <span className="mt-3 text-xs font-bold text-text-custom">{uploading ? 'Enviando mídia…' : 'Imagens ou vídeos'}</span>
              <span className="mt-1 max-w-xs text-[10px] leading-relaxed text-text3">Clique ou arraste até 10 arquivos. Um arquivo para Reels e Stories.</span>
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
                disabled={uploading}
                onChange={(event) => {
                  void uploadFiles(event.target.files)
                  event.target.value = ''
                }}
                className="sr-only"
              />
            </label>
            {media.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 min-[1100px]:grid-cols-2">
                {media.map((item, index) => (
                  <div key={item.id} className="overflow-hidden rounded-lg border border-border-custom bg-bg">
                    <div className="relative aspect-video bg-surface2">
                      {item.mediaType === 'image' && (item.previewUrl || item.localPreview)
                        ? <img src={item.previewUrl || item.localPreview || ''} alt="" className="h-full w-full object-cover" />
                        : <div className="flex h-full items-center justify-center"><FileVideo className="h-7 w-7 text-text3" /></div>}
                      <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[8px] font-bold text-white">{index + 1}</span>
                    </div>
                    <div className="flex items-center justify-between p-1.5">
                      <div className="flex gap-0.5">
                        <button type="button" onClick={() => moveMedia(index, -1)} disabled={index === 0} className="rounded p-1 text-text3 hover:bg-surface2 disabled:opacity-25" aria-label="Mover mídia para trás"><ArrowUp className="h-3 w-3" /></button>
                        <button type="button" onClick={() => moveMedia(index, 1)} disabled={index === media.length - 1} className="rounded p-1 text-text3 hover:bg-surface2 disabled:opacity-25" aria-label="Mover mídia para frente"><ArrowDown className="h-3 w-3" /></button>
                      </div>
                      <button type="button" onClick={() => removeMedia(item)} className="rounded p-1 text-red-t hover:bg-red-bg" aria-label="Remover mídia"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <p className="text-xs font-bold text-text-custom">5. Data e horário da publicação</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="relative">
                <span className="sr-only">Data da publicação</span>
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text3" />
                <input
                  type="date"
                  value={scheduledDate}
                  min={toSaoPauloInput(new Date().toISOString()).slice(0, 10)}
                  onChange={(event) => setScheduledLocal(`${event.target.value}T${scheduledTime || '12:00'}`)}
                  className="min-h-11 w-full rounded-lg border border-border2 bg-bg pl-9 pr-2 text-xs text-text-custom"
                />
              </label>
              <label className="relative">
                <span className="sr-only">Horário da publicação</span>
                <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text3" />
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(event) => setScheduledLocal(`${scheduledDate}T${event.target.value}`)}
                  className="min-h-11 w-full rounded-lg border border-border2 bg-bg pl-9 pr-2 text-xs text-text-custom"
                />
              </label>
            </div>
            <p className="mt-2 text-[9px] text-text3">Fuso de Brasília · America/Sao_Paulo</p>
          </section>
        </div>

        <aside className="bg-surface2/40 p-4 md:p-6">
          <p className="text-xs font-bold text-text-custom">Preview</p>
          <div className="mt-4 overflow-hidden rounded-2xl border border-border-custom bg-surface shadow-sm">
            <div className="flex items-center gap-2 border-b border-border-custom p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface2 text-[9px] font-black">
                {previewAccount?.avatarUrl ? <img src={previewAccount.avatarUrl} alt="" className="h-full w-full object-cover" /> : previewAccount?.provider === 'facebook' ? 'FB' : 'IG'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] font-bold text-text-custom">{previewAccount?.displayName || 'Selecione um perfil'}</p>
                <p className="text-[9px] text-text3">{previewAccount ? `${FORMAT_LABELS[previewFormat]} · ${formatDescription(previewFormat, media)}` : 'Aguardando canal'}</p>
              </div>
            </div>
            <div className="flex aspect-square items-center justify-center bg-bg">
              {media[0]?.mediaType === 'image' && (media[0].previewUrl || media[0].localPreview)
                ? <img src={media[0].previewUrl || media[0].localPreview || ''} alt="" className="h-full w-full object-cover" />
                : media[0]?.mediaType === 'video'
                  ? <div className="text-center"><FileVideo className="mx-auto h-10 w-10 text-text3" /><p className="mt-2 text-[10px] text-text3">Vídeo selecionado</p></div>
                  : <div className="px-6 text-center"><Upload className="mx-auto h-8 w-8 text-text3" /><p className="mt-2 text-[10px] leading-relaxed text-text3">Adicione uma mídia para visualizar a publicação.</p></div>}
            </div>
            <div className="p-3">
              <p className="whitespace-pre-wrap text-[10px] leading-relaxed text-text2">
                {previewFormat === 'story' ? 'Stories não exibem legenda.' : previewCaption || 'Sua legenda aparecerá aqui.'}
              </p>
              {media.length > 1 && <p className="mt-2 text-[9px] font-bold text-purple-t">Carrossel · {media.length} mídias</p>}
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-border-custom bg-surface p-3">
            <p className="text-[9px] font-bold uppercase tracking-wider text-text3">Programação</p>
            <p className="mt-1 text-[10px] text-text2">
              {scheduledLocal.length === 16 ? (() => {
                try { return formatSaoPauloDate(saoPauloLocalToUtc(scheduledLocal)) } catch { return 'Data e horário inválidos' }
              })() : 'Escolha data e horário'}
            </p>
          </div>
        </aside>
      </div>

      {compatibilityIssues.length > 0 && (
        <div className="rounded-xl border border-amber-custom/20 bg-amber-bg p-4" role="alert">
          <p className="text-xs font-bold text-amber-t">Revise antes de publicar</p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-[10px] text-text2">
            {compatibilityIssues.map((issue) => <li key={issue}>{issue}</li>)}
          </ul>
        </div>
      )}

      <div className="sticky bottom-3 z-10 flex flex-col gap-2 rounded-xl border border-border2 bg-surface/95 p-3 shadow-2xl backdrop-blur sm:flex-row sm:items-center sm:justify-end" aria-live="polite">
        <button
          type="button"
          disabled={Boolean(submitting) || uploading || !selectedAccounts.length || compatibilityIssues.length > 0}
          onClick={() => void submit('now')}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border2 bg-surface px-5 text-xs font-bold text-text-custom hover:bg-surface2 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {submitting === 'now' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {submitting === 'now' ? 'Publicando…' : 'Publicar agora'}
        </button>
        <button
          type="button"
          disabled={Boolean(submitting) || uploading || !selectedAccounts.length || compatibilityIssues.length > 0}
          onClick={() => void submit('schedule')}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-purple-custom px-6 text-xs font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {submitting === 'schedule' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
          {submitting === 'schedule' ? 'Agendando…' : 'Agendar'}
        </button>
      </div>
    </div>
  )
}
