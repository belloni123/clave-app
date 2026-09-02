'use client'

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  LayoutList,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react'
import type {
  SocialAccountsResponse,
  SocialPostPublic,
} from '@/types/social'
import SocialCalendar from '@/components/social/SocialCalendar'
import SocialComposer from '@/components/social/SocialComposer'
import SocialStatusBadge from '@/components/social/SocialStatusBadge'
import { formatSaoPauloDate } from '@/utils/social/timezone'

export type InstagramPublishingView = 'novo-post' | 'agendamentos' | 'detalhes'

async function jsonFetch<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init)
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || 'Não foi possível concluir a operação.')
  return payload as T
}

export default function SocialPublishingModule({
  projectId,
  projectName,
  view,
  postId,
  onNavigate,
}: {
  projectId: string
  projectName: string
  view: InstagramPublishingView
  postId: string | null
  onNavigate: (view: 'analytics' | InstagramPublishingView, postId?: string | null) => void
}) {
  const [display, setDisplay] = useState<'list' | 'calendar'>('list')
  const [statusFilter, setStatusFilter] = useState('')
  const [providerFilter, setProviderFilter] = useState('')
  const [search, setSearch] = useState('')
  const [month, setMonth] = useState(() => new Date())
  const [actionError, setActionError] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)
  const [savedNotice, setSavedNotice] = useState<string | null>(null)

  const accountsQuery = useQuery({
    queryKey: ['social-accounts', projectId],
    queryFn: () => jsonFetch<SocialAccountsResponse>(`/api/social/accounts?projectId=${encodeURIComponent(projectId)}`),
    staleTime: 60_000,
  })
  const postsQuery = useQuery({
    queryKey: ['social-posts', projectId],
    queryFn: () => jsonFetch<{ posts: SocialPostPublic[] }>(`/api/social/posts?projectId=${encodeURIComponent(projectId)}`),
    staleTime: 15_000,
  })

  const posts = useMemo(() => postsQuery.data?.posts || [], [postsQuery.data?.posts])
  const filteredPosts = useMemo(() => posts.filter((post) => {
    if (statusFilter && post.status !== statusFilter) return false
    if (providerFilter && !post.targets.some((target) => target.provider === providerFilter)) return false
    const normalized = search.trim().toLocaleLowerCase('pt-BR')
    if (normalized && !`${post.internalTitle || ''} ${post.baseCaption}`.toLocaleLowerCase('pt-BR').includes(normalized)) return false
    return true
  }), [posts, providerFilter, search, statusFilter])

  const selectedPost = postId ? posts.find((post) => post.id === postId) || null : null
  const editingPost = view === 'novo-post' && postId ? selectedPost : null

  const cancelPost = async (id: string) => {
    if (!window.confirm('Cancelar os destinos ainda não publicados? O histórico concluído será preservado.')) return
    setActing(id)
    setActionError(null)
    try {
      await jsonFetch(`/api/social/posts/${id}?projectId=${encodeURIComponent(projectId)}`, { method: 'DELETE' })
      await postsQuery.refetch()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Falha ao cancelar.')
    } finally {
      setActing(null)
    }
  }

  const retryTarget = async (targetId: string) => {
    setActing(targetId)
    setActionError(null)
    try {
      await jsonFetch('/api/social/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, targetId }),
      })
      await postsQuery.refetch()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Falha na nova tentativa.')
    } finally {
      setActing(null)
    }
  }

  if (accountsQuery.isLoading || postsQuery.isLoading) {
    return <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-purple-t" /><span className="sr-only">Carregando publicações</span></div>
  }
  if (accountsQuery.error || postsQuery.error) {
    return (
      <div className="rounded-xl border border-red-t/20 bg-red-bg p-6 text-center">
        <AlertCircle className="mx-auto h-6 w-6 text-red-t" />
        <p className="mt-3 text-sm font-bold text-red-t">Não foi possível abrir as publicações</p>
        <p className="mt-1 text-xs text-text2">{accountsQuery.error?.message || postsQuery.error?.message}</p>
        <button type="button" onClick={() => { void accountsQuery.refetch(); void postsQuery.refetch() }} className="mt-4 rounded-lg border border-border2 px-4 py-2 text-xs font-bold">Tentar novamente</button>
      </div>
    )
  }

  const accountData = accountsQuery.data as SocialAccountsResponse
  const needsAuthorization = accountData.connectionStatus !== 'ready'

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 rounded-2xl border border-border-custom bg-surface p-4 md:flex-row md:items-center md:justify-between md:p-5">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={() => onNavigate('analytics')} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border2 text-text2 hover:bg-surface2" aria-label="Voltar ao Instagram Analytics"><ArrowLeft className="h-4 w-4" /></button>
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-text-custom">{view === 'novo-post' ? editingPost ? 'Editar publicação' : 'Agendar publicação' : view === 'detalhes' ? 'Detalhes da publicação' : 'Agendamentos'}</h2>
            <p className="truncate text-[10px] text-text3">Projeto: {projectName} · Fuso America/Sao_Paulo</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {view !== 'agendamentos' && <button type="button" onClick={() => onNavigate('agendamentos')} className="min-h-10 rounded-lg border border-border2 px-3 text-[10px] font-bold text-text-custom hover:bg-surface2"><CalendarDays className="mr-1.5 inline h-3.5 w-3.5" />Ver agendamentos</button>}
          {view !== 'novo-post' && <button type="button" onClick={() => onNavigate('novo-post')} className="min-h-10 rounded-lg bg-text-custom px-3 text-[10px] font-bold text-bg"><Plus className="mr-1.5 inline h-3.5 w-3.5" />Agendar post</button>}
        </div>
      </header>

      {actionError && <div className="rounded-xl border border-red-t/20 bg-red-bg p-3 text-xs text-red-t" role="alert">{actionError}</div>}
      {savedNotice && <div className="rounded-xl border border-green-custom/20 bg-green-bg p-3 text-xs text-green-t" role="status">{savedNotice} Você pode acompanhar cada destino nesta tela ou voltar ao Instagram Analytics.</div>}

      {needsAuthorization ? (
        <section className="rounded-2xl border border-amber-custom/20 bg-amber-bg p-6 text-center">
          <AlertCircle className="mx-auto h-7 w-7 text-amber-t" />
          <h3 className="mt-3 text-sm font-bold text-amber-t">Autorize a publicação pela Meta</h3>
          <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-text2">O Analytics e seu histórico continuam intactos. A Meta precisa liberar permissões adicionais para publicar no Instagram e nas Páginas do Facebook.</p>
          {accountData.authorizationUrl && <a href={accountData.authorizationUrl} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-amber-custom px-5 text-xs font-bold text-white">{accountData.connectionStatus === 'expired' ? 'Reconectar conta' : 'Autorizar publicação'}</a>}
        </section>
      ) : view === 'novo-post' ? (
        <SocialComposer
          projectId={projectId}
          accounts={accountData.accounts}
          editingPost={editingPost}
          onSaved={(post, publishedNow) => {
            void postsQuery.refetch()
            setSavedNotice(publishedNow
              ? 'A publicação foi registrada e o envio foi iniciado.'
              : post.status === 'draft'
                ? 'Rascunho salvo com segurança.'
                : `Publicação agendada para ${formatSaoPauloDate(post.scheduledAt)}.`)
            onNavigate('detalhes', post.id)
            if (publishedNow) void postsQuery.refetch()
          }}
        />
      ) : view === 'detalhes' ? (
        selectedPost ? (
          <section className="space-y-4 rounded-2xl border border-border-custom bg-surface p-4 md:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div><SocialStatusBadge status={selectedPost.status} /><h3 className="mt-3 text-lg font-bold text-text-custom">{selectedPost.internalTitle || 'Publicação sem título interno'}</h3><p className="mt-1 text-xs text-text3">{formatSaoPauloDate(selectedPost.scheduledAt || selectedPost.createdAt)}{selectedPost.authorName ? ` · por ${selectedPost.authorName}` : ''}</p></div>
              <div className="flex flex-wrap gap-2">
                {['draft', 'scheduled'].includes(selectedPost.status) && <button type="button" onClick={() => onNavigate('novo-post', selectedPost.id)} className="rounded-lg border border-border2 px-3 py-2 text-[10px] font-bold"><Pencil className="mr-1 inline h-3.5 w-3.5" />Editar</button>}
                {!['published', 'cancelled'].includes(selectedPost.status) && <button type="button" disabled={acting === selectedPost.id} onClick={() => void cancelPost(selectedPost.id)} className="rounded-lg border border-red-t/30 px-3 py-2 text-[10px] font-bold text-red-t"><Trash2 className="mr-1 inline h-3.5 w-3.5" />Cancelar restante</button>}
              </div>
            </div>
            {selectedPost.media.length > 0 && <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{selectedPost.media.map((media) => <div key={media.id} className="aspect-square overflow-hidden rounded-xl bg-surface2">{media.mediaType === 'image' && media.previewUrl ? <img src={media.previewUrl} alt={media.altText || ''} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-text3">Vídeo</div>}</div>)}</div>}
            <div className="rounded-xl bg-surface2/60 p-4"><p className="whitespace-pre-wrap text-sm leading-relaxed text-text-custom">{selectedPost.baseCaption || 'Sem legenda-base'}</p></div>
            <div className="space-y-3">
              {selectedPost.targets.map((target) => (
                <div key={target.id} className="flex flex-col gap-3 rounded-xl border border-border-custom p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-text-custom">{target.account?.displayName || target.provider}</p><p className="mt-1 text-[10px] text-text3">{target.lastErrorMessage || (target.publishedAt ? formatSaoPauloDate(target.publishedAt) : 'Aguardando processamento')}</p></div>
                  <SocialStatusBadge status={target.status} />
                  {target.remoteUrl && <a href={target.remoteUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-border2 p-2 text-text2" aria-label="Abrir publicação"><ExternalLink className="h-4 w-4" /></a>}
                  {target.status === 'failed' && <button type="button" disabled={acting === target.id} onClick={() => void retryTarget(target.id)} className="rounded-lg border border-border2 px-3 py-2 text-[10px] font-bold"><RotateCcw className="mr-1 inline h-3.5 w-3.5" />Tentar novamente</button>}
                </div>
              ))}
            </div>
          </section>
        ) : <div className="rounded-xl border border-border-custom bg-surface p-8 text-center text-xs text-text2">Publicação não encontrada.</div>
      ) : (
        <div className="space-y-4">
          <section className="flex flex-col gap-3 rounded-xl border border-border-custom bg-surface p-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text3" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar publicação" className="w-full rounded-lg border border-border2 bg-bg py-2.5 pl-9 pr-3 text-xs text-text-custom" /></div>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border border-border2 bg-bg px-3 py-2.5 text-xs text-text-custom"><option value="">Todos os status</option><option value="draft">Rascunhos</option><option value="scheduled">Agendados</option><option value="processing">Processando</option><option value="partially_published">Sucesso parcial</option><option value="published">Publicados</option><option value="failed">Falhas</option><option value="cancelled">Cancelados</option></select>
            <select value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)} className="rounded-lg border border-border2 bg-bg px-3 py-2.5 text-xs text-text-custom"><option value="">Todas as redes</option><option value="instagram">Instagram</option><option value="facebook">Facebook</option></select>
            <div className="flex rounded-lg border border-border2 bg-bg p-1"><button type="button" onClick={() => setDisplay('list')} className={`rounded p-1.5 ${display === 'list' ? 'bg-surface2 text-text-custom' : 'text-text3'}`} aria-label="Ver lista"><LayoutList className="h-4 w-4" /></button><button type="button" onClick={() => setDisplay('calendar')} className={`rounded p-1.5 ${display === 'calendar' ? 'bg-surface2 text-text-custom' : 'text-text3'}`} aria-label="Ver calendário"><CalendarDays className="h-4 w-4" /></button></div>
            <button type="button" onClick={() => void postsQuery.refetch()} className="rounded-lg border border-border2 p-2.5 text-text2" aria-label="Atualizar lista"><RefreshCw className={`h-4 w-4 ${postsQuery.isFetching ? 'animate-spin' : ''}`} /></button>
          </section>
          {display === 'calendar' ? <SocialCalendar posts={filteredPosts} month={month} onMonthChange={setMonth} onOpen={(id) => onNavigate('detalhes', id)} /> : (
            <section className="space-y-3">
              {filteredPosts.length ? filteredPosts.map((post) => (
                <article key={post.id} className="flex w-full flex-col gap-3 rounded-xl border border-border-custom bg-surface p-4 transition-colors hover:border-border2 sm:flex-row sm:items-center">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface2">{post.media[0]?.previewUrl && post.media[0].mediaType === 'image' ? <img src={post.media[0].previewUrl} alt="" className="h-full w-full object-cover" /> : <CalendarDays className="h-5 w-5 text-text3" />}</div>
                  <button type="button" onClick={() => onNavigate('detalhes', post.id)} className="min-w-0 flex-1 text-left focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-custom">
                    <p className="truncate text-xs font-bold text-text-custom">{post.internalTitle || post.baseCaption || 'Sem título'}</p>
                    <p className="mt-1 truncate text-[10px] text-text3">{post.authorName ? `por ${post.authorName}` : 'Autor indisponível'}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">{post.targets.map((target) => <span key={target.id} className="inline-flex items-center gap-1 rounded bg-surface2 px-1.5 py-1 text-[9px] text-text2"><span>{target.account?.displayName || target.provider}</span><SocialStatusBadge status={target.status} /></span>)}</div>
                  </button>
                  <div className="sm:text-right"><SocialStatusBadge status={post.status} /><p className="mt-1.5 text-[9px] text-text3">{formatSaoPauloDate(post.scheduledAt || post.createdAt)}</p></div>
                  <div className="flex shrink-0 gap-1.5">
                    {['draft', 'scheduled'].includes(post.status) && <button type="button" onClick={() => onNavigate('novo-post', post.id)} className="rounded-lg border border-border2 p-2 text-text2" aria-label="Editar publicação"><Pencil className="h-3.5 w-3.5" /></button>}
                    {!['published', 'cancelled'].includes(post.status) && <button type="button" disabled={acting === post.id} onClick={() => void cancelPost(post.id)} className="rounded-lg border border-red-t/20 p-2 text-red-t" aria-label="Cancelar publicação"><Trash2 className="h-3.5 w-3.5" /></button>}
                    {post.targets.find((target) => target.remoteUrl)?.remoteUrl && <a href={post.targets.find((target) => target.remoteUrl)?.remoteUrl || '#'} target="_blank" rel="noreferrer" className="rounded-lg border border-border2 p-2 text-text2" aria-label="Abrir publicação externa"><ExternalLink className="h-3.5 w-3.5" /></a>}
                  </div>
                </article>
              )) : <div className="rounded-xl border border-dashed border-border2 bg-surface p-10 text-center"><CheckCircle2 className="mx-auto h-6 w-6 text-text3" /><p className="mt-3 text-xs text-text2">Nenhuma publicação encontrada.</p></div>}
            </section>
          )}
        </div>
      )}
    </div>
  )
}
