'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowRight,
  Camera,
  CheckCircle2,
  Loader2,
} from 'lucide-react'

interface InstagramAccountOption {
  pageId: string
  pageName: string
  instagramUserId: string
  username: string
  name: string | null
  accountType: string | null
  profilePictureUrl: string | null
  followersCount: number | null
  mediaCount: number | null
}

interface CallbackResponse {
  connected?: boolean
  projectId?: string
  accounts?: InstagramAccountOption[]
  error?: string
}

function formatNumber(value: number | null) {
  if (value === null) return 'Seguidores indisponíveis'
  return `${new Intl.NumberFormat('pt-BR', {
    notation: value >= 1_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value)} seguidores`
}

async function sendCallback(payload: Record<string, unknown>) {
  const response = await fetch('/api/instagram/callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await response.json() as CallbackResponse
  if (!response.ok) throw new Error(body.error || 'Não foi possível conectar o Instagram.')
  return body
}

function finishConnection(projectId?: string) {
  const params = new URLSearchParams({
    activeModule: 'instagram',
    instagram: 'connected',
  })
  if (projectId) params.set('projectId', projectId)
  window.location.replace(`/?${params.toString()}`)
}

export default function InstagramConnectPage() {
  const started = useRef(false)
  const oauthState = useRef('')
  const [accounts, setAccounts] = useState<InstagramAccountOption[]>([])
  const [selecting, setSelecting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (started.current) return
    started.current = true

    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const query = new URLSearchParams(window.location.search)
    const useBusinessToken = query.get('source') === 'business'
    const oauthError = fragment.get('error_description') || fragment.get('error')
    const returnedState = (useBusinessToken ? query.get('state') : fragment.get('state')) || ''
    const accessToken = fragment.get('access_token')
    window.history.replaceState(null, '', window.location.pathname)

    if (oauthError) {
      queueMicrotask(() => setError('A autorização foi cancelada ou recusada na Meta.'))
      return
    }
    if (!returnedState || (!useBusinessToken && !accessToken)) {
      queueMicrotask(() => setError(
        'A Meta não retornou uma autorização válida. Inicie a conexão novamente.',
      ))
      return
    }

    oauthState.current = returnedState
    void sendCallback({
      state: returnedState,
      accessToken,
      useBusinessToken,
    }).then((result) => {
      if (result.connected) {
        finishConnection(result.projectId)
        return
      }
      if (!result.accounts?.length) {
        throw new Error('Nenhuma conta do Instagram ficou disponível para seleção.')
      }
      setAccounts(result.accounts)
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : 'Não foi possível conectar o Instagram.')
    })
  }, [])

  const chooseAccount = async (account: InstagramAccountOption) => {
    setSelecting(account.instagramUserId)
    setError(null)
    try {
      const result = await sendCallback({
        state: oauthState.current,
        selectedInstagramUserId: account.instagramUserId,
      })
      if (!result.connected) throw new Error('A conta não pôde ser confirmada.')
      finishConnection(result.projectId)
    } catch (reason) {
      setSelecting(null)
      setError(reason instanceof Error ? reason.message : 'Não foi possível selecionar a conta.')
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f5f2] text-[#242321] flex items-center justify-center p-5">
      <section className="w-full max-w-2xl rounded-3xl border border-black/10 bg-white shadow-xl shadow-black/5 overflow-hidden">
        <div className="p-7 md:p-9 border-b border-black/8 bg-gradient-to-br from-white via-white to-[#f4ecff]">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#833AB4] via-[#E1306C] to-[#FCAF45] text-white flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Camera className="w-6 h-6" />
          </div>
          <p className="mt-6 text-[11px] uppercase tracking-[0.16em] font-bold text-purple-700">Clave · Instagram Analytics</p>
          <h1 className="mt-2 text-2xl md:text-3xl font-bold tracking-tight">Conectar Instagram profissional</h1>
          <p className="mt-3 text-sm leading-relaxed text-black/55 max-w-xl">
            A Meta está validando as permissões e procurando as contas profissionais disponíveis para a sua agência.
          </p>
        </div>

        <div className="p-7 md:p-9">
          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-red-800">Não foi possível concluir</p>
                  <p className="text-xs leading-relaxed text-red-700/80 mt-1">{error}</p>
                </div>
              </div>
              <Link href="/?activeModule=instagram" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2.5 text-xs font-bold text-white">
                Voltar ao Clave
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : accounts.length ? (
            <div>
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="w-5 h-5" />
                <p className="text-sm font-bold">Escolha o Instagram deste projeto</p>
              </div>
              <p className="text-xs text-black/50 mt-1.5">Cada projeto aceita uma conta. Você poderá trocar depois.</p>
              <div className="grid gap-3 mt-6">
                {accounts.map((account) => (
                  <button
                    key={account.instagramUserId}
                    type="button"
                    disabled={Boolean(selecting)}
                    onClick={() => chooseAccount(account)}
                    className="w-full rounded-2xl border border-black/10 p-4 flex items-center gap-4 text-left hover:border-purple-300 hover:bg-purple-50/40 transition-colors disabled:opacity-60"
                  >
                    <div
                      className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-200 to-orange-100 bg-cover bg-center flex items-center justify-center shrink-0"
                      style={account.profilePictureUrl ? { backgroundImage: `url(${account.profilePictureUrl})` } : undefined}
                    >
                      {!account.profilePictureUrl && <Camera className="w-5 h-5 text-purple-700" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold truncate">{account.name || account.username}</p>
                      <p className="text-xs text-black/50 truncate">@{account.username} · {formatNumber(account.followersCount)}</p>
                      <p className="text-[10px] text-black/40 mt-1 truncate">Disponível via: {account.pageName}</p>
                    </div>
                    {selecting === account.instagramUserId
                      ? <Loader2 className="w-5 h-5 animate-spin text-purple-700" />
                      : <ArrowRight className="w-5 h-5 text-black/30" />}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-10 text-center">
              <Loader2 className="w-8 h-8 text-purple-700 animate-spin mx-auto" />
              <p className="text-sm font-bold mt-5">Validando contas e permissões</p>
              <p className="text-xs text-black/45 mt-1.5">Isso pode levar alguns segundos.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
