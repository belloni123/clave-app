import { DEFAULT_PROJECT_MODULES, isProjectModuleKey, type ProjectModuleKey } from '@/utils/module-access'

export type PermissionLevel = 'viewer' | 'editor' | 'admin'
export type ProjectAccess = { projectId: string; level: PermissionLevel; modules: ProjectModuleKey[] }
export type TeamProject = { id: string; name: string; user_id: string }
export type TeamMember = {
  id: string; nome: string | null; email: string | null; role: string; agency_role: string | null
}
export type TeamMembership = {
  project_id: string; user_id: string; permission_level: PermissionLevel; allowed_modules: ProjectModuleKey[]
}
export type TeamData = { projects: TeamProject[]; members: TeamMember[]; memberships: TeamMembership[] }
export const LEVEL_LABELS: Record<PermissionLevel, string> = {
  viewer: 'Visualização', editor: 'Edição', admin: 'Administrador do projeto',
}
export const isAgencyAdmin = (profile: { role?: string | null; agency_role?: string | null } | null) =>
  Boolean(profile && (profile.role === 'admin' || profile.agency_role === 'admin'))

export function parseAccesses(value: unknown, allowEmpty = false): ProjectAccess[] {
  if (!Array.isArray(value) || value.length > 500 || (!allowEmpty && value.length === 0)) {
    throw new Error('Selecione entre 1 e 500 projetos.')
  }
  const seen = new Set<string>()
  return value.map((access) => {
    if (!access || typeof access !== 'object') throw new Error('Acesso inválido.')
    const { projectId, level, modules } = access
    if (typeof projectId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId) || seen.has(projectId)) {
      throw new Error('Projeto inválido ou repetido.')
    }
    seen.add(projectId)
    if (!['viewer', 'editor', 'admin'].includes(level)) throw new Error('Nível de acesso inválido.')
    if (!Array.isArray(modules) || modules.some((key) => typeof key !== 'string' || !isProjectModuleKey(key))) {
      throw new Error('Módulos inválidos.')
    }
    if (level !== 'admin' && modules.length === 0) throw new Error('Selecione pelo menos um módulo em cada projeto.')
    return { projectId, level, modules: level === 'admin' ? [...DEFAULT_PROJECT_MODULES] : [...new Set<ProjectModuleKey>(modules)] }
  })
}

export function parsePerson(value: unknown): { name: string; email: string } {
  if (!value || typeof value !== 'object') throw new Error('Colaborador inválido.')
  const person = value as Record<string, unknown>
  const name = typeof person.name === 'string' ? person.name.trim() : ''
  const email = typeof person.email === 'string' ? person.email.trim().toLowerCase() : ''
  if (name.length < 2 || name.length > 120) throw new Error('Informe um nome entre 2 e 120 caracteres.')
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um e-mail válido.')
  return { name, email }
}

// One upsert writes all grants/revocations for this person atomically.
export function membershipChanges(
  accesses: ProjectAccess[], previous: TeamMembership[], userId: string, actorId: string, replace: boolean,
) {
  const selected = new Set(accesses.map((access) => access.projectId))
  return [
    ...accesses.map((access) => ({
      project_id: access.projectId, user_id: userId, permission_level: access.level,
      allowed_modules: access.modules, ativo: true, concedido_por: actorId, revogado_em: null as string | null,
    })),
    ...(replace ? previous.filter((access) => !selected.has(access.project_id)).map((access) => ({
      project_id: access.project_id, user_id: userId, permission_level: access.permission_level,
      allowed_modules: access.allowed_modules, ativo: false, concedido_por: actorId, revogado_em: new Date().toISOString(),
    })) : []),
  ]
}
