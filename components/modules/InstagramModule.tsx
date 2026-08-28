'use client'

import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAppStore } from '@/store/useAppStore'
import type {
  InstagramDailyMetric,
  InstagramDashboardResponse,
  InstagramMediaMetric,
} from '@/types/instagram'
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Check,
  ChevronRight,
  Eye,
  Film,
  Heart,
  Camera as InstagramIcon,
  Link2,
  Loader2,
  MousePointerClick,
  Play,
  RefreshCw,
  Settings2,
  Sparkles,
  TrendingUp,
  Unplug,
  UserPlus,
  Users,
  X,
} from 'lucide-react'

const PERIODS = [7, 30, 90] as const
type Period = (typeof PERIODS)[number]
type NumericMetric = Exclude<keyof InstagramDailyMetric, 'date'>

function formatNumber(value: number | null, compact = true) {
  if (value === null || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('pt-BR', {
    notation: compact && Math.abs(value) >= 1_000 ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 1 : 0,
  }).format(value)
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—'
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

function formatRelativeDate(value: string | null) {
  if (!value) return 'Ainda não sincronizado'
  const diffMinutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000))
  if (diffMinutes < 1) return 'Agora mesmo'
  if (diffMinutes < 60) return `Há ${diffMinutes} min`
  const hours = Math.floor(diffMinutes / 60)
  if (hours < 24) return `Há ${hours}h`
  return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function dateAtNoon(value: string) {
  return new Date(`${value}T12:00:00`)
}

function startDate(days: number, offset = 0) {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - days - offset + 1)
  return date
}

function sumMetric(rows: InstagramDailyMetric[], metric: NumericMetric) {
  const values = rows.map((row) => row[metric]).filter((value): value is number => value !== null)
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null
}

function percentChange(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

function followersGrowth(rows: InstagramDailyMetric[]) {
  const values = rows.map((row) => row.followers).filter((value): value is number => value !== null)
  if (values.length < 2) return null
  return values[values.length - 1] - values[0]
}

async function fetchDashboard(projectId: string, days: Period) {
  const response = await fetch(`/api/instagram/dashboard?projectId=${encodeURIComponent(projectId)}&days=${days}`)
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar o painel.')
  return payload as InstagramDashboardResponse
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-[10px] text-text3">Sem comparação</span>
  const positive = value >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${positive ? 'text-green-t' : 'text-red-t'}`}>
      {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {Math.abs(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
    </span>
  )
}

function MetricCard({
  label,
  value,
  helper,
  delta,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  helper: string
  delta: number | null
  icon: React.ComponentType<{ className?: string }>
  tone: string
}) {
  return (
    <div className="bg-surface border border-border-custom rounded-xl p-4 min-w-0 shadow-sm hover:border-border2 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${tone}`}>
          <Icon className="w-4.5 h-4.5" />
        </div>
        <Delta value={delta} />
      </div>
      <p className="text-[10px] uppercase tracking-[0.08em] font-bold text-text3 mt-4">{label}</p>
      <p className="text-[24px] leading-none font-bold tracking-tight text-text-custom mt-1.5">{value}</p>
      <p className="text-[10px] text-text3 mt-2 truncate">{helper}</p>
    </div>
  )
}

function TrendChart({ rows }: { rows: InstagramDailyMetric[] }) {
  const width = 760
  const height = 250
  const pad = { left: 14, right: 14, top: 18, bottom: 32 }
  const points = rows.length > 1 ? rows : rows.length === 1 ? [rows[0], rows[0]] : []
  const reach = points.map((row) => row.reach ?? 0)
  const views = points.map((row) => row.views ?? 0)
  const max = Math.max(...reach, ...views, 1)
  const x = (index: number) => pad.left + (index / Math.max(1, points.length - 1)) * (width - pad.left - pad.right)
  const y = (value: number) => pad.top + (1 - value / max) * (height - pad.top - pad.bottom)
  const path = (values: number[]) => values.map((value, index) => `${index ? 'L' : 'M'} ${x(index)} ${y(value)}`).join(' ')
  const area = `${path(views)} L ${x(points.length - 1)} ${height - pad.bottom} L ${x(0)} ${height - pad.bottom} Z`

  if (!rows.length) {
    return (
      <div className="h-[250px] flex flex-col items-center justify-center text-center">
        <BarChart3 className="w-8 h-8 text-text3 mb-3" />
        <p className="text-xs text-text2">O gráfico aparecerá após a primeira sincronização.</p>
      </div>
    )
  }

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto min-h-[220px]" role="img" aria-label="Evolução de alcance e visualizações">
        <defs>
          <linearGradient id="instagramArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
          <line key={ratio} x1={pad.left} x2={width - pad.right} y1={y(max * ratio)} y2={y(max * ratio)} stroke="currentColor" className="text-border-custom" strokeWidth="1" />
        ))}
        <path d={area} fill="url(#instagramArea)" />
        <path d={path(views)} fill="none" stroke="#8B5CF6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d={path(reach)} fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="5 5" />
        {points.map((row, index) => index % Math.max(1, Math.floor(points.length / 5)) === 0 || index === points.length - 1 ? (
          <text key={`${row.date}-${index}`} x={x(index)} y={height - 8} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'} fill="currentColor" className="text-text3" fontSize="10">
            {dateAtNoon(row.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
          </text>
        ) : null)}
      </svg>
    </div>
  )
}

function formatLabel(media: InstagramMediaMetric) {
  const value = (media.mediaProductType || media.mediaType || 'POST').toUpperCase()
  if (value === 'REELS' || value === 'REEL') return 'Reel'
  if (value === 'CAROUSEL_ALBUM') return 'Carrossel'
  if (value === 'STORY') return 'Story'
  if (value === 'VIDEO') return 'Vídeo'
  return 'Post'
}

function MediaCard({ media, rank }: { media: InstagramMediaMetric; rank: number }) {
  const imageUrl = media.thumbnailUrl || media.mediaUrl
  const views = media.insights?.views ?? media.insights?.plays ?? null
  return (
    <a href={media.permalink || '#'} target={media.permalink ? '_blank' : undefined} rel="noreferrer" className="group bg-surface2/60 border border-border-custom rounded-xl overflow-hidden min-w-0 hover:border-border2 hover:-translate-y-0.5 transition-all">
      <div className="aspect-[4/5] relative bg-gradient-to-br from-purple-custom/30 via-coral-custom/20 to-amber-custom/30 bg-cover bg-center" style={imageUrl ? { backgroundImage: `url(${JSON.stringify(imageUrl).slice(1, -1)})` } : undefined}>
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
        <span className="absolute top-2.5 left-2.5 w-6 h-6 rounded-full bg-black/65 text-white text-[10px] font-bold flex items-center justify-center backdrop-blur-sm">{rank}</span>
        <span className="absolute top-2.5 right-2.5 px-2 py-1 rounded-full bg-black/65 text-white text-[9px] font-semibold flex items-center gap-1 backdrop-blur-sm">
          {formatLabel(media) === 'Reel' ? <Play className="w-3 h-3" /> : <Film className="w-3 h-3" />}
          {formatLabel(media)}
        </span>
        <div className="absolute left-3 right-3 bottom-3 flex items-center justify-between gap-2 text-white">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold"><Eye className="w-3.5 h-3.5" />{formatNumber(views)}</span>
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold"><Heart className="w-3.5 h-3.5" />{formatNumber(media.insights?.likes ?? media.likeCount)}</span>
        </div>
      </div>
      <div className="p-3">
        <p className="text-[11px] text-text-custom line-clamp-2 min-h-[34px] leading-relaxed">{media.caption || 'Conteúdo sem legenda'}</p>
        <div className="flex items-center gap-3 mt-3 text-[9px] text-text3">
          <span>Alcance {formatNumber(media.insights?.reach ?? null)}</span>
          <span>•</span>
          <span>{new Date(media.postedAt).toLocaleDateString('pt-BR')}</span>
        </div>
      </div>
    </a>
  )
}

function LoadingPanel() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-28 bg-surface border border-border-custom rounded-2xl" />
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-36 bg-surface border border-border-custom rounded-xl" />)}
      </div>
      <div className="h-80 bg-surface border border-border-custom rounded-xl" />
    </div>
  )
}

function EmptyState({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-purple-custom/20 bg-surface p-6 md:p-9">
        <div className="absolute -right-20 -top-24 w-72 h-72 rounded-full bg-purple-custom/15 blur-3xl" />
        <div className="absolute right-24 -bottom-32 w-64 h-64 rounded-full bg-coral-custom/10 blur-3xl" />
        <div className="relative max-w-2xl">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#833AB4] via-[#E1306C] to-[#FCAF45] flex items-center justify-center shadow-lg shadow-purple-custom/20">
            <InstagramIcon className="w-6 h-6 text-white" />
          </div>
          <p className="text-[10px] font-bold tracking-[0.15em] text-purple-t uppercase mt-6">Instagram Analytics</p>
          <h3 className="text-2xl md:text-3xl font-bold tracking-tight text-text-custom mt-2 leading-tight">Transforme conteúdo em decisões.</h3>
          <p className="text-sm text-text2 leading-relaxed mt-3 max-w-xl">Conecte a conta profissional deste projeto para acompanhar crescimento, alcance, visualizações e os conteúdos que mais movimentam a audiência.</p>
          {canManage ? (
            <a href={`/api/instagram/connect?projectId=${encodeURIComponent(projectId)}`} className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 rounded-lg bg-text-custom text-bg text-xs font-bold hover:opacity-90 transition-opacity shadow-sm">
              <InstagramIcon className="w-4 h-4" />
              Conectar Instagram
              <ChevronRight className="w-4 h-4" />
            </a>
          ) : (
            <div className="inline-flex items-center gap-2 mt-6 px-4 py-2.5 rounded-lg bg-amber-bg text-amber-t text-xs font-semibold">
              <AlertCircle className="w-4 h-4" />
              Peça a um administrador para conectar a conta.
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { icon: TrendingUp, title: 'Crescimento contínuo', text: 'Histórico diário de seguidores e evolução por período.' },
          { icon: Activity, title: 'Performance completa', text: 'Alcance, views, interações e taxa de engajamento.' },
          { icon: Sparkles, title: 'Conteúdo que funciona', text: 'Ranking visual de posts, Reels, carrosséis e Stories.' },
        ].map(({ icon: Icon, title, text }) => (
          <div key={title} className="bg-surface border border-border-custom rounded-xl p-5">
            <Icon className="w-5 h-5 text-purple-t" />
            <h4 className="text-xs font-bold text-text-custom mt-4">{title}</h4>
            <p className="text-[11px] text-text2 leading-relaxed mt-1.5">{text}</p>
          </div>
        ))}
      </div>

      <div className="bg-surface2/60 border border-border-custom rounded-xl p-4 flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="w-8 h-8 rounded-lg bg-green-bg text-green-t flex items-center justify-center shrink-0"><Check className="w-4 h-4" /></div>
        <div>
          <p className="text-xs font-semibold text-text-custom">Conexão oficial e segura</p>
          <p className="text-[10px] text-text2 mt-0.5">A senha nunca passa pelo Clave. É necessário um perfil Comercial ou Criador de conteúdo.</p>
        </div>
      </div>
    </div>
  )
}

export default function InstagramModule() {
  const { activeProjectId, getActiveProject, showToast } = useAppStore()
  const [period, setPeriod] = useState<Period>(30)
  const [syncing, setSyncing] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const activeProject = getActiveProject()

  const query = useQuery({
    queryKey: ['instagram-dashboard', activeProjectId, period],
    queryFn: () => fetchDashboard(activeProjectId!, period),
    enabled: Boolean(activeProjectId),
    staleTime: 60_000,
  })

  const analytics = useMemo(() => {
    const daily = query.data?.daily || []
    const currentStart = startDate(period)
    const previousStart = startDate(period * 2)
    const current = daily.filter((row) => dateAtNoon(row.date) >= currentStart)
    const previous = daily.filter((row) => {
      const date = dateAtNoon(row.date)
      return date >= previousStart && date < currentStart
    })
    const currentReach = sumMetric(current, 'reach')
    const currentViews = sumMetric(current, 'views')
    const currentInteractions = sumMetric(current, 'totalInteractions')
    const latestFollowers = [...current].reverse().find((row) => row.followers !== null)?.followers
      ?? query.data?.connection?.followersCount
      ?? null
    const growth = followersGrowth(current)
    const engagement = currentReach && currentInteractions !== null
      ? (currentInteractions / currentReach) * 100
      : null
    const previousReach = sumMetric(previous, 'reach')
    const previousViews = sumMetric(previous, 'views')
    const previousInteractions = sumMetric(previous, 'totalInteractions')
    const previousEngagement = previousReach && previousInteractions !== null
      ? (previousInteractions / previousReach) * 100
      : null
    return {
      current,
      previous,
      latestFollowers,
      growth,
      growthRate: growth !== null && latestFollowers && latestFollowers - growth > 0
        ? (growth / (latestFollowers - growth)) * 100
        : null,
      reach: currentReach,
      views: currentViews,
      interactions: currentInteractions,
      engagement,
      reachDelta: percentChange(currentReach, previousReach),
      viewsDelta: percentChange(currentViews, previousViews),
      interactionsDelta: percentChange(currentInteractions, previousInteractions),
      engagementDelta: percentChange(engagement, previousEngagement),
    }
  }, [period, query.data])

  const rankedMedia = useMemo(() => [...(query.data?.media || [])].sort((a, b) => {
    const aScore = a.insights?.views ?? a.insights?.plays ?? a.insights?.reach ?? 0
    const bScore = b.insights?.views ?? b.insights?.plays ?? b.insights?.reach ?? 0
    return bScore - aScore
  }), [query.data?.media])

  const formatDistribution = useMemo(() => {
    const groups = new Map<string, { count: number; views: number }>()
    rankedMedia.forEach((media) => {
      const label = formatLabel(media)
      const current = groups.get(label) || { count: 0, views: 0 }
      current.count += 1
      current.views += media.insights?.views ?? media.insights?.plays ?? 0
      groups.set(label, current)
    })
    const totalViews = Array.from(groups.values()).reduce((sum, item) => sum + item.views, 0)
    return Array.from(groups.entries())
      .map(([label, value]) => ({ ...value, label, share: totalViews ? value.views / totalViews * 100 : 0 }))
      .sort((a, b) => b.views - a.views)
  }, [rankedMedia])

  const handleSync = async () => {
    if (!activeProjectId) return
    setSyncing(true)
    try {
      const response = await fetch('/api/instagram/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProjectId }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Falha na sincronização.')
      await query.refetch()
      showToast('Instagram atualizado com sucesso')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Falha na sincronização.', 'err')
    } finally {
      setSyncing(false)
    }
  }

  const handleDisconnect = async () => {
    if (!activeProjectId) return
    setDisconnecting(true)
    try {
      const response = await fetch(`/api/instagram/connection?projectId=${encodeURIComponent(activeProjectId)}`, { method: 'DELETE' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Falha ao desconectar.')
      setShowSettings(false)
      await query.refetch()
      showToast('Conta do Instagram desconectada')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Falha ao desconectar.', 'err')
    } finally {
      setDisconnecting(false)
    }
  }

  if (!activeProjectId) {
    return <div className="bg-surface border border-border-custom rounded-xl p-8 text-center"><InstagramIcon className="w-8 h-8 text-text3 mx-auto" /><p className="text-sm font-semibold mt-4">Selecione um projeto</p><p className="text-xs text-text2 mt-1">O Instagram é conectado individualmente em cada projeto.</p></div>
  }
  if (query.isLoading) return <LoadingPanel />
  if (query.error) {
    return <div className="bg-red-bg border border-red-t/20 rounded-xl p-6 text-center"><AlertCircle className="w-7 h-7 text-red-t mx-auto" /><p className="text-sm font-semibold text-red-t mt-3">Não foi possível abrir o painel</p><p className="text-xs text-text2 mt-1">{query.error.message}</p><button onClick={() => query.refetch()} className="mt-4 px-4 py-2 rounded-md border border-border2 text-xs font-semibold">Tentar novamente</button></div>
  }
  if (!query.data?.connection) return <EmptyState projectId={activeProjectId} canManage={Boolean(query.data?.canManage)} />

  const { connection } = query.data
  const best = rankedMedia[0]
  const statusError = connection.status === 'error' || connection.status === 'expired'
  const topFormat = formatDistribution[0]

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden bg-surface border border-border-custom rounded-2xl p-4 md:p-5 shadow-sm">
        <div className="absolute -top-20 right-12 w-52 h-52 rounded-full bg-purple-custom/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#833AB4] via-[#E1306C] to-[#FCAF45] p-[2px] shrink-0">
              <div className="w-full h-full rounded-[14px] bg-surface bg-cover bg-center flex items-center justify-center" style={connection.profilePictureUrl ? { backgroundImage: `url(${JSON.stringify(connection.profilePictureUrl).slice(1, -1)})` } : undefined}>
                {!connection.profilePictureUrl && <InstagramIcon className="w-6 h-6 text-purple-t" />}
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="text-base font-bold text-text-custom truncate">{connection.name || connection.username}</h3>
                <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full bg-purple-bg text-purple-t text-[9px] font-bold uppercase tracking-wide">{connection.accountType || 'Profissional'}</span>
              </div>
              <p className="text-xs text-text2 mt-0.5 truncate">@{connection.username} · {formatNumber(connection.followersCount, false)} seguidores</p>
              <p className="text-[10px] text-text3 mt-1 flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full ${statusError ? 'bg-red-t' : 'bg-green-custom'}`} />{statusError ? 'Atenção necessária' : 'Dados conectados'} · {formatRelativeDate(connection.lastSyncedAt)}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center p-1 rounded-lg bg-surface2 border border-border-custom">
              {PERIODS.map((value) => <button key={value} onClick={() => setPeriod(value)} className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${period === value ? 'bg-surface text-text-custom shadow-sm' : 'text-text3 hover:text-text2'}`}>{value} dias</button>)}
            </div>
            <button onClick={handleSync} disabled={syncing} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border2 text-[10px] font-bold text-text-custom hover:bg-surface2 disabled:opacity-60 transition-colors">
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Atualizando' : 'Atualizar'}
            </button>
            {query.data.canManage && <button onClick={() => setShowSettings(true)} className="w-8 h-8 rounded-lg border border-border2 flex items-center justify-center text-text2 hover:bg-surface2 hover:text-text-custom"><Settings2 className="w-4 h-4" /></button>}
          </div>
        </div>
      </section>

      {statusError && (
        <div className="bg-amber-bg border border-amber-custom/20 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-t shrink-0" />
          <div className="flex-1"><p className="text-xs font-bold text-amber-t">A sincronização precisa de atenção</p><p className="text-[10px] text-text2 mt-0.5">{connection.lastError || 'Reconecte a conta para continuar atualizando os dados.'}</p></div>
          {query.data.canManage && <a href={`/api/instagram/connect?projectId=${encodeURIComponent(activeProjectId)}`} className="px-3 py-2 rounded-md bg-amber-custom text-white text-[10px] font-bold text-center">Reconectar</a>}
        </div>
      )}

      <section className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <MetricCard label="Seguidores" value={formatNumber(analytics.latestFollowers)} helper={analytics.growth === null ? 'Histórico em formação' : `${analytics.growth >= 0 ? '+' : ''}${formatNumber(analytics.growth, false)} no período`} delta={analytics.growthRate} icon={Users} tone="bg-purple-bg text-purple-t" />
        <MetricCard label="Crescimento" value={formatPercent(analytics.growthRate)} helper={`Últimos ${period} dias`} delta={analytics.growthRate} icon={TrendingUp} tone="bg-green-bg text-green-t" />
        <MetricCard label="Alcance" value={formatNumber(analytics.reach)} helper="Contas únicas alcançadas" delta={analytics.reachDelta} icon={UserPlus} tone="bg-blue-bg text-blue-t" />
        <MetricCard label="Visualizações" value={formatNumber(analytics.views)} helper="Todas as exibições" delta={analytics.viewsDelta} icon={Eye} tone="bg-coral-bg text-coral-t" />
        <MetricCard label="Interações" value={formatNumber(analytics.interactions)} helper="Curtidas, comentários e mais" delta={analytics.interactionsDelta} icon={Heart} tone="bg-red-bg text-red-t" />
        <MetricCard label="Engajamento" value={formatPercent(analytics.engagement)} helper="Interações por alcance" delta={analytics.engagementDelta} icon={Activity} tone="bg-amber-bg text-amber-t" />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.75fr)] gap-4">
        <div className="bg-surface border border-border-custom rounded-xl p-4 md:p-5 shadow-sm min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
            <div><h4 className="text-xs font-bold text-text-custom">Evolução da audiência</h4><p className="text-[10px] text-text3 mt-1">Alcance e visualizações ao longo do período</p></div>
            <div className="flex items-center gap-4 text-[10px] text-text2"><span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-purple-custom" />Visualizações</span><span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-green-custom" />Alcance</span></div>
          </div>
          <TrendChart rows={analytics.current} />
        </div>

        <div className="bg-surface border border-border-custom rounded-xl p-4 md:p-5 shadow-sm">
          <div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-purple-t" /><h4 className="text-xs font-bold text-text-custom">Leitura rápida</h4></div>
          <div className="space-y-3 mt-5">
            {[
              analytics.reachDelta === null ? 'Sincronize diariamente para comparar o alcance.' : `O alcance ${analytics.reachDelta >= 0 ? 'cresceu' : 'caiu'} ${Math.abs(analytics.reachDelta).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% contra o período anterior.`,
              topFormat ? `${topFormat.label} concentra ${formatPercent(topFormat.share)} das visualizações dos conteúdos.` : 'Os formatos de destaque aparecerão após a coleta dos conteúdos.',
              best ? `O melhor conteúdo alcançou ${formatNumber(best.insights?.reach ?? null)} contas.` : 'Publique conteúdo para formar seu ranking de performance.',
            ].map((text, index) => (
              <div key={text} className="flex gap-3"><span className="w-5 h-5 rounded-full bg-purple-bg text-purple-t text-[9px] font-bold flex items-center justify-center shrink-0">{index + 1}</span><p className="text-[11px] text-text2 leading-relaxed">{text}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.42fr)] gap-4">
        <div className="bg-surface border border-border-custom rounded-xl p-4 md:p-5 shadow-sm min-w-0">
          <div className="flex items-center justify-between mb-4"><div><h4 className="text-xs font-bold text-text-custom">Conteúdos de destaque</h4><p className="text-[10px] text-text3 mt-1">Ordenados por visualizações e alcance</p></div><span className="text-[10px] text-text3">{rankedMedia.length} conteúdos</span></div>
          {rankedMedia.length ? <div className="grid grid-cols-2 md:grid-cols-3 gap-3">{rankedMedia.slice(0, 6).map((media, index) => <MediaCard key={media.id} media={media} rank={index + 1} />)}</div> : <div className="py-16 text-center"><Film className="w-7 h-7 text-text3 mx-auto" /><p className="text-xs text-text2 mt-3">Nenhum conteúdo encontrado neste período.</p></div>}
        </div>

        <div className="space-y-4">
          <div className="bg-surface border border-border-custom rounded-xl p-4 md:p-5 shadow-sm">
            <h4 className="text-xs font-bold text-text-custom">Performance por formato</h4><p className="text-[10px] text-text3 mt-1">Participação nas visualizações</p>
            <div className="space-y-4 mt-5">
              {formatDistribution.length ? formatDistribution.map((item) => (
                <div key={item.label}><div className="flex items-center justify-between text-[10px] mb-1.5"><span className="font-semibold text-text2">{item.label}</span><span className="text-text3">{formatPercent(item.share)}</span></div><div className="h-1.5 bg-surface2 rounded-full overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-purple-custom to-coral-custom" style={{ width: `${Math.max(3, item.share)}%` }} /></div><p className="text-[9px] text-text3 mt-1.5">{formatNumber(item.views)} views · {item.count} conteúdos</p></div>
              )) : <p className="text-[11px] text-text3 py-6 text-center">Dados em formação</p>}
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-bg/70 to-coral-bg/40 border border-purple-custom/15 rounded-xl p-5">
            <div className="w-8 h-8 rounded-lg bg-purple-custom text-white flex items-center justify-center"><MousePointerClick className="w-4 h-4" /></div>
            <p className="text-xs font-bold text-text-custom mt-4">Ações no perfil</p>
            <div className="grid grid-cols-2 gap-3 mt-3"><div><p className="text-lg font-bold text-text-custom">{formatNumber(sumMetric(analytics.current, 'profileViews'))}</p><p className="text-[9px] text-text3">Visitas ao perfil</p></div><div><p className="text-lg font-bold text-text-custom">{formatNumber(sumMetric(analytics.current, 'profileLinksTaps'))}</p><p className="text-[9px] text-text3">Cliques em links</p></div></div>
          </div>
        </div>
      </section>

      <footer className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between text-[9px] text-text3 px-1 pb-2"><span className="flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" />Dados orgânicos fornecidos pela API oficial da Meta</span><span>Projeto: {activeProject?.name}</span></footer>

      {showSettings && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowSettings(false) }}>
          <div className="w-full max-w-md bg-surface border border-border2 rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-border-custom flex items-center justify-between"><div><h4 className="text-sm font-bold text-text-custom">Configurar Instagram</h4><p className="text-[10px] text-text3 mt-1">@{connection.username}</p></div><button onClick={() => setShowSettings(false)} className="w-8 h-8 rounded-lg hover:bg-surface2 flex items-center justify-center text-text3"><X className="w-4 h-4" /></button></div>
            <div className="p-5 space-y-3">
              <a href={`/api/instagram/connect?projectId=${encodeURIComponent(activeProjectId)}`} className="w-full flex items-center gap-3 p-3 rounded-xl border border-border-custom hover:bg-surface2 transition-colors"><div className="w-9 h-9 rounded-lg bg-purple-bg text-purple-t flex items-center justify-center"><RefreshCw className="w-4 h-4" /></div><div className="text-left flex-1"><p className="text-xs font-bold text-text-custom">Reconectar ou trocar conta</p><p className="text-[10px] text-text3 mt-0.5">Abre novamente a autorização da Meta</p></div><ChevronRight className="w-4 h-4 text-text3" /></a>
              <button onClick={handleDisconnect} disabled={disconnecting} className="w-full flex items-center gap-3 p-3 rounded-xl border border-red-t/20 hover:bg-red-bg transition-colors disabled:opacity-60"><div className="w-9 h-9 rounded-lg bg-red-bg text-red-t flex items-center justify-center">{disconnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unplug className="w-4 h-4" />}</div><div className="text-left"><p className="text-xs font-bold text-red-t">Desconectar Instagram</p><p className="text-[10px] text-text3 mt-0.5">Remove a conexão e o histórico deste projeto</p></div></button>
            </div>
            <div className="px-5 py-3 bg-surface2/50 border-t border-border-custom flex items-center gap-2 text-[9px] text-text3"><Link2 className="w-3.5 h-3.5" />Uma conta por projeto</div>
          </div>
        </div>
      )}
    </div>
  )
}
