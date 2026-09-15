'use client'

import { FormEvent, useEffect, useState } from 'react'
import { ExternalLink, KeyRound, Loader2, Sheet } from 'lucide-react'

interface PortalData { projectName: string; spreadsheets: Record<string, { url?: string; publicEditingConfirmed?: boolean }> }
const labels: Record<string, { title: string; description: string }> = {
  fixedClient: { title: 'Cliente fixo', description: 'Planejamento de mídia paga e metas.' },
  infoProduct: { title: 'Infoproduto', description: 'Planejamento de leads, CAC, CPL e vendas.' },
}

export default function PublicSpreadsheetsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const [projectId, setProjectId] = useState('')
  const [data, setData] = useState<PortalData | null>(null)
  const [password, setPassword] = useState('')
  const [requiresPassword, setRequiresPassword] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    params.then(({ projectId: id }) => {
      setProjectId(id)
      fetch(`/api/public-spreadsheets/${id}`).then(async (response) => {
        if (response.status === 401) { setRequiresPassword(true); return null }
        if (!response.ok) throw new Error('Não foi possível abrir este portal.')
        return response.json()
      }).then((payload) => payload && setData(payload)).catch((requestError) => setError(requestError.message)).finally(() => setLoading(false))
    })
  }, [params])

  const unlock = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError('')
    const response = await fetch(`/api/public-spreadsheets/${projectId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) })
    const payload = await response.json(); setLoading(false)
    if (!response.ok) { setError(payload.error || 'Não foi possível liberar o acesso.'); return }
    setData(payload); setRequiresPassword(false)
  }

  if (loading && !requiresPassword) return <main className="min-h-screen grid place-items-center bg-bg"><Loader2 className="w-6 h-6 animate-spin text-text2" /></main>
  if (requiresPassword && !data) return (
    <main className="min-h-screen grid place-items-center bg-bg px-4"><form onSubmit={unlock} className="w-full max-w-sm bg-surface border border-border-custom rounded-2xl p-6 shadow-sm space-y-5">
      <div className="w-11 h-11 rounded-xl bg-green-bg text-green-t grid place-items-center"><KeyRound className="w-5 h-5" /></div>
      <div><h1 className="text-lg font-bold text-text-custom">Central de Planilhas</h1><p className="text-xs text-text2 mt-1">Digite a senha compartilhada pela agência para acessar as planilhas do projeto.</p></div>
      <div><label className="text-[11px] font-bold text-text2 mb-1.5 block">Senha de acesso</label><input autoFocus type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full px-3 py-2.5 border border-border2 rounded-lg bg-surface text-text-custom outline-none" />{error && <p className="text-xs text-red-t mt-2">{error}</p>}</div>
      <button disabled={loading || !password} className="w-full py-2.5 rounded-lg bg-text-custom text-surface text-xs font-bold disabled:opacity-50">{loading ? 'Validando...' : 'Acessar planilhas'}</button>
    </form></main>
  )

  const available = Object.entries(data?.spreadsheets || {})
  return <main className="min-h-screen bg-bg px-4 py-12"><div className="max-w-3xl mx-auto space-y-6">
    <div><p className="text-xs font-bold text-green-t uppercase tracking-wider">Clave</p><h1 className="text-2xl font-bold text-text-custom mt-1">Central de Planilhas</h1><p className="text-sm text-text2 mt-1">{data?.projectName}</p></div>
    {available.length === 0 ? <div className="bg-surface border border-border-custom rounded-xl p-6 text-sm text-text2">As planilhas deste projeto ainda não foram liberadas pela agência.</div> : <div className="grid sm:grid-cols-2 gap-4">{available.map(([kind, spreadsheet]) => <a key={kind} href={spreadsheet.url} target="_blank" rel="noreferrer" className="bg-surface border border-border-custom rounded-xl p-5 hover:border-text3 transition-colors group"><Sheet className="w-5 h-5 text-green-t" /><h2 className="text-sm font-bold text-text-custom mt-4">{labels[kind]?.title || kind}</h2><p className="text-xs text-text2 mt-1">{labels[kind]?.description}</p><span className="text-xs font-semibold text-text-custom inline-flex items-center gap-1.5 mt-5">Abrir e preencher <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" /></span></a>)}</div>}
  </div></main>
}
