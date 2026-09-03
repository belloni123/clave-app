'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Users, Plus, Search, ChevronLeft, Check, Loader2, X } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { PROJECT_MODULES, DEFAULT_PROJECT_MODULES } from '@/utils/module-access'
import { isAgencyAdmin, LEVEL_LABELS, parsePerson, parseAccesses, type PermissionLevel, type ProjectAccess, type TeamData, type TeamMember } from '@/utils/team/access'

const emptyData: TeamData = { projects: [], members: [], memberships: [] }
const fieldClass = 'w-full rounded-lg border border-border-custom bg-bg px-3 py-2 text-sm text-text-custom focus:outline-none focus:ring-2 focus:ring-amber-custom'
const secondaryClass = 'rounded-lg border border-border-custom px-3 py-2 text-sm hover:bg-surface2 disabled:opacity-50'
const primaryClass = 'inline-flex items-center justify-center gap-2 rounded-lg bg-[#F4C400] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50'
type Person = { key: number; name: string; email: string }
type Result = { email: string; ok: boolean; message: string }
const defaultPermission = (): Omit<ProjectAccess, 'projectId'> => ({ level: 'editor', modules: ['comunicacao', 'planejador'] })

function PermissionPicker({ value, onChange, label }: {
  value: Omit<ProjectAccess, 'projectId'>; onChange: (value: Omit<ProjectAccess, 'projectId'>) => void; label: string
}) {
  return <div className="space-y-3">
    <label className="block text-sm font-medium">Nível de acesso
      <select aria-label={`Nível de acesso ${label}`} className={`${fieldClass} mt-1`} value={value.level}
        onChange={(event) => onChange({ ...value, level: event.target.value as PermissionLevel })}>
        {Object.entries(LEVEL_LABELS).map(([key, text]) => <option key={key} value={key}>{text}</option>)}
      </select>
    </label>
    {value.level === 'admin' ? <p className="text-sm text-text2">Acesso total a este projeto, incluindo a gestão de usuários.</p> : <>
      <div className="flex items-center justify-between gap-2 text-sm"><span className="font-medium">Módulos liberados</span>
        <button type="button" className="text-amber-t" onClick={() => onChange({ ...value, modules: [...DEFAULT_PROJECT_MODULES] })}>Marcar todos os módulos</button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {PROJECT_MODULES.map((module) => <label key={module.key} className="flex items-center gap-2 text-sm text-text2">
          <input type="checkbox" className="accent-[#F4C400]" checked={value.modules.includes(module.key)} aria-label={`${module.name} ${label}`}
            onChange={(event) => onChange({ ...value, modules: event.target.checked ? [...value.modules, module.key] : value.modules.filter((key) => key !== module.key) })} />
          {module.name}
        </label>)}
      </div>
    </>}
  </div>
}

export default function EquipeModule() {
  const { profile } = useAppStore()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [projectSearch, setProjectSearch] = useState('')
  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list')
  const [editing, setEditing] = useState<TeamMember | null>(null)
  const [people, setPeople] = useState<Person[]>([{ key: 0, name: '', email: '' }])
  const [selected, setSelected] = useState<string[]>([])
  const [standard, setStandard] = useState(defaultPermission)
  const [overrides, setOverrides] = useState<Record<string, Omit<ProjectAccess, 'projectId'>>>({})
  const [review, setReview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const canManage = isAgencyAdmin(profile)
  const query = useQuery({
    queryKey: ['agency_team', profile?.agency_id], enabled: canManage,
    queryFn: async (): Promise<TeamData> => {
      const response = await fetch('/api/agency-team', { cache: 'no-store' })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Não foi possível carregar a equipe.')
      return body
    },
  })
  const data = query.data || emptyData
  const ownedIds = editing ? data.projects.filter((project) => project.user_id === editing.id).map((project) => project.id) : []
  const accesses: ProjectAccess[] = selected.map((projectId) => ({ projectId, ...(overrides[projectId] || standard) }))
  const previousIds = editing ? data.memberships.filter((access) => access.user_id === editing.id).map((access) => access.project_id) : []
  const revoked = data.projects.filter((project) => previousIds.includes(project.id) && !selected.includes(project.id))

  function open(member?: TeamMember) {
    setEditing(member || null)
    setMode(member ? 'edit' : 'create')
    setPeople([{ key: 0, name: '', email: '' }])
    setReview(false); setError(''); setResults([]); setProjectSearch(''); setStandard(defaultPermission())
    const existing = member ? data.memberships.filter((access) => access.user_id === member.id) : []
    const nextOverrides: typeof overrides = Object.fromEntries(existing.map((access) => [access.project_id, { level: access.permission_level, modules: access.allowed_modules }]))
    const owned = member ? data.projects.filter((project) => project.user_id === member.id) : []
    owned.forEach((project) => { nextOverrides[project.id] = { level: 'admin', modules: [...DEFAULT_PROJECT_MODULES] } })
    setSelected([...new Set([...existing.map((access) => access.project_id), ...owned.map((project) => project.id)])])
    setOverrides(nextOverrides)
  }

  function goToReview() {
    try {
      parseAccesses(accesses, mode === 'edit')
      if (mode === 'create') {
        const parsed = people.map(parsePerson)
        if (new Set(parsed.map((person) => person.email)).size !== parsed.length) throw new Error('Há e-mails repetidos na lista.')
      }
      setError(''); setReview(true)
    } catch (cause) { setError((cause as Error).message) }
  }

  async function save() {
    setBusy(true); setError(''); setResults([])
    const currentResults: Result[] = []
    const failed: Person[] = []
    try {
      const targets = mode === 'edit' ? [{ key: 0, name: editing?.nome || '', email: editing?.email || '' }] : people
      for (const person of targets) {
        try {
          const response = await fetch('/api/agency-team', {
            method: mode === 'edit' ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...person, userId: editing?.id, accesses }),
          })
          const body = await response.json()
          if (!response.ok) throw new Error(body.error || 'Não foi possível salvar.')
          currentResults.push({ email: person.email, ok: true, message: body.warning || (mode === 'edit' ? 'Permissões atualizadas.' : 'Acessos salvos e convite enviado.') })
        } catch (cause) {
          failed.push(person)
          currentResults.push({ email: person.email, ok: false, message: (cause as Error).message })
        }
        setResults([...currentResults])
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['agency_team'] }),
        queryClient.invalidateQueries({ queryKey: ['project_members'] }),
        queryClient.invalidateQueries({ queryKey: ['agency_profiles'] }),
        queryClient.invalidateQueries({ queryKey: ['project_access_audit'] }),
      ])
      if (failed.length === 0) { setMode('list'); setEditing(null); setReview(false) }
      else {
        if (mode === 'create') setPeople(failed)
        setReview(false)
        setError('Confira os resultados abaixo. Apenas as pessoas que falharam permanecem no formulário.')
      }
    } finally { setBusy(false) }
  }

  if (!canManage) return <p>Acesso exclusivo aos administradores da agência.</p>
  if (query.isLoading) return <p role="status">Carregando equipe e projetos…</p>
  if (query.isError) return <div role="alert" className="space-y-3"><p>{query.error.message}</p><button className={secondaryClass} onClick={() => query.refetch()}>Tentar novamente</button></div>

  return <div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="flex items-center gap-2 text-2xl font-semibold text-text-custom"><Users className="text-amber-t" />Equipe e acessos</h2>
        <p className="mt-2 text-sm text-text2">Gerencie os colaboradores e os projetos da agência em um só lugar.</p></div>
      {mode === 'list' ? <button className={primaryClass} onClick={() => open()} disabled={!data.projects.length}><Plus size={16} />Adicionar colaboradores</button>
        : <button className={secondaryClass} disabled={busy} onClick={() => { setMode('list'); setError(''); setResults([]) }}><ChevronLeft className="mr-1 inline" size={16} />Voltar à equipe</button>}
    </div>
    {error && <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-500">{error}</p>}
    {results.length > 0 && <div aria-live="polite" className="space-y-2 rounded-xl border border-border-custom bg-surface p-4">
      {results.map((result) => <p key={result.email} className={`text-sm ${result.ok ? 'text-text-custom' : 'text-red-500'}`}><strong>{result.email}</strong> — {result.message}</p>)}
    </div>}
    {mode === 'list' ? <>
      <div className="grid gap-3 sm:grid-cols-3">{[[data.members.length, 'pessoas cadastradas'], [data.projects.length, 'projetos disponíveis'], [data.memberships.length, 'vínculos ativos']].map(([count, label]) => <div key={label} className="rounded-xl border border-border-custom bg-surface p-4"><p className="text-2xl font-semibold">{count}</p><p className="text-sm text-text2">{label}</p></div>)}</div>
      {!data.projects.length && <p className="text-text2">Crie o primeiro projeto para liberar acessos à equipe.</p>}
      <div className="relative"><Search size={16} className="absolute left-3 top-3 text-text2" /><input aria-label="Buscar colaboradores" className={`${fieldClass} pl-9`} placeholder="Buscar por nome ou e-mail" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      <div className="divide-y divide-border-custom rounded-xl border border-border-custom bg-surface">
        {data.members.filter((member) => `${member.nome} ${member.email}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => (a.nome || '').localeCompare(b.nome || '')).map((member) => {
          const admin = isAgencyAdmin(member)
          const count = new Set([...data.memberships.filter((access) => access.user_id === member.id).map((access) => access.project_id), ...data.projects.filter((project) => project.user_id === member.id).map((project) => project.id)]).size
          return <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="font-medium">{member.nome || 'Sem nome'}</p><p className="break-all text-sm text-text2">{member.email}</p><p className="mt-1 text-xs text-text2">{admin ? 'Administrador · acesso total à agência' : `${count} projeto(s) com acesso`}</p></div>
            {!admin && <button className={secondaryClass} onClick={() => open(member)}>Gerenciar acessos<span className="sr-only"> de {member.nome || member.email}</span></button>}
          </div>
        })}
        {!data.members.some((member) => `${member.nome} ${member.email}`.toLowerCase().includes(search.toLowerCase())) && <p className="p-5 text-sm text-text2">Nenhum colaborador encontrado.</p>}
      </div>
    </> : <fieldset disabled={busy} className="min-w-0 space-y-5 disabled:opacity-80">
      {review ? <div className="space-y-5 rounded-xl border border-border-custom bg-surface p-5">
        <h3 className="text-lg font-semibold">Revise os acessos antes de salvar</h3>
        <p className="text-sm text-text2">{mode === 'edit' ? `${editing?.nome} (${editing?.email})` : people.map((person) => `${person.name} (${person.email})`).join(' · ')}</p>
        <p className="text-sm">{selected.length} projeto(s) selecionado(s){mode === 'create' ? ` para cada uma das ${people.length} pessoa(s). Um convite por pessoa.` : '.'}</p>
        <div className="space-y-3">{accesses.map((access) => <div key={access.projectId} className="rounded-lg border border-border-custom p-3"><p className="font-medium">{data.projects.find((project) => project.id === access.projectId)?.name} · {LEVEL_LABELS[access.level]}</p><p className="mt-1 text-sm text-text2">{access.level === 'admin' ? 'Todos os módulos e gestão de usuários' : PROJECT_MODULES.filter((module) => access.modules.includes(module.key)).map((module) => module.name).join(', ')}</p></div>)}</div>
        {revoked.length > 0 && <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm"><strong>Acesso será revogado em {revoked.length} projeto(s):</strong> {revoked.map((project) => project.name).join(', ')}</div>}
        {mode === 'create' && <p className="text-sm text-text2">Para e-mails já cadastrados, os projetos selecionados serão atualizados. Os demais acessos e a senha atual serão mantidos.</p>}
        <div className="flex gap-3"><button className={secondaryClass} onClick={() => setReview(false)}>Voltar e ajustar</button><button className={primaryClass} onClick={save}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}{busy ? 'Salvando…' : 'Confirmar e salvar acessos'}</button></div>
      </div> : <>
        <section className="space-y-4 rounded-xl border border-border-custom bg-surface p-5">
          <h3 className="text-lg font-semibold">{mode === 'edit' ? `Acessos de ${editing?.nome || editing?.email}` : '1. Quem vai receber acesso?'}</h3>
          {mode === 'create' ? <>
            <p className="text-sm text-text2">Cadastre várias pessoas com a mesma seleção de projetos. Depois, use “Gerenciar acessos” para personalizar cada colaborador.</p>
            {people.map((person, index) => <div key={person.key} className="flex items-start gap-2"><div className="grid flex-1 gap-3 sm:grid-cols-2">
              <label className="text-sm">Nome<input className={`${fieldClass} mt-1`} aria-label={`Nome do colaborador ${index + 1}`} autoComplete="off" maxLength={120} value={person.name} onChange={(event) => setPeople(people.map((item) => item.key === person.key ? { ...item, name: event.target.value } : item))} /></label>
              <label className="text-sm">E-mail<input type="email" className={`${fieldClass} mt-1`} aria-label={`E-mail do colaborador ${index + 1}`} autoComplete="off" maxLength={254} value={person.email} onChange={(event) => setPeople(people.map((item) => item.key === person.key ? { ...item, email: event.target.value } : item))} /></label>
            </div>{people.length > 1 && <button className={`${secondaryClass} mt-6`} aria-label={`Remover colaborador ${index + 1}`} onClick={() => setPeople(people.filter((item) => item.key !== person.key))}><X size={16} /></button>}</div>)}
            <button className={secondaryClass} disabled={people.length >= 50} onClick={() => setPeople([...people, { key: Math.max(...people.map((person) => person.key)) + 1, name: '', email: '' }])}>+ Adicionar outra pessoa</button>
          </> : <p className="text-sm text-text2">{editing?.email} · Desmarque um projeto para revogar o acesso. A senha permanece a mesma.</p>}
        </section>
        <section className="space-y-4 rounded-xl border border-border-custom bg-surface p-5">
          <h3 className="text-lg font-semibold">{mode === 'create' ? '2. Permissões padrão' : 'Permissões padrão para novos projetos selecionados'}</h3>
          <PermissionPicker value={standard} onChange={setStandard} label="padrão" />
          {mode === 'edit' && <button className={secondaryClass} onClick={() => setOverrides(Object.fromEntries(ownedIds.map((id) => [id, { level: 'admin', modules: [...DEFAULT_PROJECT_MODULES] }])))}>Aplicar este padrão a todos os projetos selecionados</button>}
        </section>
        <section className="space-y-4 rounded-xl border border-border-custom bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-semibold">{mode === 'create' ? '3. Projetos e exceções' : 'Projetos e permissões'} · {selected.length} selecionado(s)</h3>
            <div className="flex gap-3"><button className="text-sm text-amber-t" onClick={() => setSelected(data.projects.map((project) => project.id))}>Selecionar todos</button><button className="text-sm text-text2" onClick={() => setSelected(ownedIds)}>Desmarcar todos</button></div>
          </div>
          <p className="text-sm text-text2">A seleção inclui somente os projetos existentes. Projetos criados no futuro precisam ser liberados aqui.</p>
          <input className={fieldClass} aria-label="Buscar projetos" placeholder="Buscar projeto" value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} />
          <div className="space-y-3">{data.projects.filter((project) => project.name.toLowerCase().includes(projectSearch.toLowerCase())).map((project) => {
            const checked = selected.includes(project.id)
            const own = ownedIds.includes(project.id)
            return <div key={project.id} className={`rounded-lg border p-4 ${checked ? 'border-amber-custom/40' : 'border-border-custom'}`}>
              <div className="flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-3 font-medium"><input type="checkbox" className="accent-[#F4C400]" aria-label={`Acesso a ${project.name}`} checked={checked} disabled={own} onChange={(event) => setSelected(event.target.checked ? [...selected, project.id] : selected.filter((id) => id !== project.id))} />{project.name}</label>
                {checked && !own && <button className="text-sm text-amber-t" onClick={() => setOverrides((current) => {
                  const next = { ...current }
                  if (next[project.id]) delete next[project.id]
                  else next[project.id] = { ...standard, modules: [...standard.modules] }
                  return next
                })}>{overrides[project.id] ? 'Usar padrão' : 'Personalizar por projeto'}</button>}
              </div>
              {own ? <p className="mt-2 text-sm text-text2">Responsável pelo projeto · acesso total. Para restringir, transfira a responsabilidade.</p>
                : checked && (overrides[project.id] ? <div className="mt-4 border-t border-border-custom pt-4"><PermissionPicker value={overrides[project.id]} label={`em ${project.name}`} onChange={(value) => setOverrides({ ...overrides, [project.id]: value })} /></div>
                  : <p className="mt-2 text-sm text-text2">{LEVEL_LABELS[standard.level]} · {standard.level === 'admin' ? 'Todos os módulos' : `${standard.modules.length} módulo(s)`} · Permissão padrão</p>)}
            </div>
          })}</div>
        </section>
        <div className="flex justify-end"><button className={primaryClass} onClick={goToReview}>Revisar acessos</button></div>
      </>}
    </fieldset>}
  </div>
}
