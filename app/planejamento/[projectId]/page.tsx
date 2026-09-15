'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import FinancialPlanningWorkspace, { defaultPlanningData, PlanningData } from '@/components/modules/FinancialPlanningWorkspace'

export default function PublicPlanningPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [password, setPassword] = useState('')
  const [authorizedPassword, setAuthorizedPassword] = useState('')
  const [projectName, setProjectName] = useState('')
  const [planning, setPlanning] = useState<PlanningData | null>(null)
  const [needsPassword, setNeedsPassword] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (candidate = '') => {
    const response = await fetch(`/api/public-planning/${projectId}`, { headers: candidate ? { 'x-planning-password': candidate } : {} })
    const payload = await response.json()
    if (response.status === 401) { setNeedsPassword(true); if (candidate) setError('Senha incorreta'); return }
    if (!response.ok) { setError(payload.error || 'Não foi possível abrir o planejamento.'); return }
    setProjectName(payload.projectName); setPlanning(payload.planning || defaultPlanningData()); setAuthorizedPassword(candidate); setNeedsPassword(false)
  }, [projectId])
  useEffect(() => { const timer = setTimeout(() => { void load() }, 0); return () => clearTimeout(timer) }, [load])
  const unlock = (event: FormEvent) => { event.preventDefault(); setError(''); load(password) }
  const save = async (data: PlanningData, secret: string) => {
    const response = await fetch(`/api/public-planning/${projectId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(secret ? { 'x-planning-password': secret } : {}) }, body: JSON.stringify(data) })
    if (!response.ok) throw new Error('Não foi possível salvar o planejamento.')
  }

  if (needsPassword) return <main className="min-h-screen grid place-items-center bg-bg px-4"><form onSubmit={unlock} className="w-full max-w-sm bg-surface border border-border-custom rounded-2xl p-6 space-y-5"><div><p className="text-xs font-bold text-green-t uppercase">Clave</p><h1 className="text-xl font-bold text-text-custom mt-1">Planejamento de mídia</h1><p className="text-xs text-text2 mt-2">Digite a senha compartilhada pela Agência B16.</p></div><input autoFocus type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Senha" className="w-full px-3 py-2.5 border border-border2 rounded-lg bg-surface text-text-custom" />{error && <p className="text-xs text-red-t">{error}</p>}<button className="w-full py-2.5 bg-text-custom text-surface rounded-lg text-xs font-bold">Acessar</button></form></main>
  if (!planning) return <main className="min-h-screen grid place-items-center bg-bg text-sm text-text2">Carregando planejamento...</main>
  return <main className="min-h-screen bg-bg p-4 md:p-8"><div className="max-w-7xl mx-auto"><FinancialPlanningWorkspace projectId={projectId} projectName={projectName} initialData={planning} publicPassword={authorizedPassword} onPublicSave={save} /></div></main>
}
