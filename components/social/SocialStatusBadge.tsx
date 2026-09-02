import type { SocialPostStatus, SocialTargetStatus } from '@/types/social'

const LABELS: Record<SocialPostStatus | SocialTargetStatus, string> = {
  draft: 'Rascunho',
  scheduled: 'Agendado',
  processing: 'Processando',
  partially_published: 'Sucesso parcial',
  published: 'Publicado',
  failed: 'Falhou',
  cancelled: 'Cancelado',
  claimed: 'Iniciando',
  uploading: 'Enviando',
  retrying: 'Nova tentativa',
  unknown: 'Verificação necessária',
}

export default function SocialStatusBadge({ status }: { status: SocialPostStatus | SocialTargetStatus }) {
  const tone = status === 'published'
    ? 'bg-green-bg text-green-t'
    : status === 'failed' || status === 'unknown'
      ? 'bg-red-bg text-red-t'
      : status === 'processing' || status === 'claimed' || status === 'uploading' || status === 'retrying'
        ? 'bg-amber-bg text-amber-t'
        : status === 'cancelled'
          ? 'bg-surface2 text-text3'
          : 'bg-purple-bg text-purple-t'
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${tone}`}>{LABELS[status]}</span>
}
