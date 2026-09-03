import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { readJsonBody } from '@/utils/http/read-json-body'
import { getPublicAppOrigin } from '@/utils/http/public-app-origin'
import { sendAccessCredentialsEmail, sendAccessLinkEmail } from '@/utils/supabase/access-mailer'
import { isAgencyAdmin, membershipChanges, parseAccesses, parsePerson, type TeamMembership } from '@/utils/team/access'

class TeamError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}
const respond = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { 'Cache-Control': 'no-store' },
})
function failure(error: unknown) {
  if (error instanceof TeamError) return respond({ error: error.message }, error.status)
  console.error('Agency team operation failed', error instanceof Error ? error.name : 'Database error')
  return respond({ error: 'Não foi possível concluir. Atualize a lista e tente novamente.' }, 500)
}

async function authorize() {
  const client = await createClient()
  const { data: { user }, error: authError } = await client.auth.getUser()
  if (authError || !user) throw new TeamError('Não autorizado.', 401)
  const { data: profile, error } = await client.from('profiles')
    .select('id, role, agency_role, agency_id').eq('id', user.id).is('deleted_at', null).maybeSingle()
  if (error) throw error
  if (!isAgencyAdmin(profile) || !profile?.agency_id) {
    throw new TeamError('Somente administradores da agência podem gerenciar a equipe.', 403)
  }
  return { actorId: user.id, agencyId: profile.agency_id as string, admin: createAdminClient() }
}
type Context = Awaited<ReturnType<typeof authorize>>

async function listProjects({ admin, agencyId }: Context) {
  const { data, error } = await admin.from('projects').select('id, name, user_id')
    .eq('agency_id', agencyId).is('deleted_at', null).order('name').limit(501)
  if (error) throw error
  if (data.length > 500) throw new TeamError('A agência excede o limite de 500 projetos desta operação.')
  return data
}

async function listMemberships(context: Context, projectIds: string[], userId?: string) {
  if (!projectIds.length) return []
  const result: TeamMembership[] = []
  for (let page = 0; ; page += 1) {
    let query = context.admin.from('project_users')
      .select('project_id, user_id, permission_level, allowed_modules')
      .in('project_id', projectIds).eq('ativo', true).order('id').range(page * 1000, page * 1000 + 999)
    if (userId) query = query.eq('user_id', userId)
    const { data, error } = await query
    if (error) throw error
    result.push(...data as TeamMembership[])
    if (data.length < 1000) return result
  }
}

export async function GET() {
  try {
    const context = await authorize()
    const projects = await listProjects(context)
    const members = []
    for (let page = 0; ; page += 1) {
      const { data, error } = await context.admin.from('profiles')
        .select('id, nome, email, role, agency_role').eq('agency_id', context.agencyId)
        .is('deleted_at', null).order('id').range(page * 1000, page * 1000 + 999)
      if (error) throw error
      members.push(...data)
      if (data.length < 1000) break
    }
    const memberships = await listMemberships(context, projects.map((project) => project.id))
    return respond({ projects, members, memberships })
  } catch (error) { return failure(error) }
}

async function readBody(request: Request) {
  try {
    const body = await readJsonBody(request, 128 * 1024)
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error()
    return body as Record<string, unknown>
  } catch { throw new TeamError('Requisição inválida ou muito grande.') }
}

async function save(request: NextRequest, replace: boolean) {
  try {
    const context = await authorize()
    const body = await readBody(request)
    let accesses
    try { accesses = parseAccesses(body.accesses, replace) }
    catch (error) { throw new TeamError((error as Error).message) }
    const projects = await listProjects(context)
    const projectIds = projects.map((project) => project.id)
    if (accesses.some((access) => !projectIds.includes(access.projectId))) {
      throw new TeamError('Um dos projetos não pertence à sua agência ou foi removido.', 403)
    }
    const { admin, actorId, agencyId } = context
    let targetId: string
    let name: string
    let email: string
    let temporaryPassword: string | null = null
    let createdId: string | null = null

    if (replace) {
      if (typeof body.userId !== 'string') throw new TeamError('Colaborador inválido.')
      const { data: member, error } = await admin.from('profiles')
        .select('id, nome, email, role, agency_role').eq('id', body.userId)
        .eq('agency_id', agencyId).is('deleted_at', null).maybeSingle()
      if (error) throw error
      if (!member) throw new TeamError('Colaborador não encontrado.', 404)
      if (isAgencyAdmin(member)) throw new TeamError('Administradores já possuem acesso total à agência.', 409)
      targetId = member.id
      name = member.nome || ''
      email = member.email || ''
    } else {
      let person
      try { person = parsePerson(body) } catch (error) { throw new TeamError((error as Error).message) }
      name = person.name
      email = person.email
      // Escape LIKE metacharacters; never allow wildcard emails to match another account.
      const escapedEmail = email.replace(/[\\%_]/g, '\\$&')
      const { data: existing, error: lookupError } = await admin.from('profiles')
        .select('id, agency_id, role, agency_role, deleted_at').ilike('email', escapedEmail).maybeSingle()
      if (lookupError) throw lookupError
      if (existing && (existing.agency_id !== agencyId || existing.deleted_at)) {
        throw new TeamError('Este e-mail não está disponível para cadastro nesta agência.', 409)
      }
      if (existing && isAgencyAdmin(existing)) throw new TeamError('Este administrador já possui acesso total.', 409)
      if (existing) {
        const { data, error } = await admin.auth.admin.getUserById(existing.id)
        if (error || !data.user) throw new TeamError('A conta precisa de recuperação de acesso antes de continuar.', 409)
        // Existing accounts retain their password, role and name.
        targetId = existing.id
      } else {
        temporaryPassword = randomBytes(18).toString('base64url')
        const { data, error } = await admin.auth.admin.createUser({
          email, password: temporaryPassword, email_confirm: true, user_metadata: { nome: name },
        })
        if (error || !data.user) throw new TeamError('Não foi possível cadastrar este e-mail. Se já possui conta, recupere o acesso.', 409)
        targetId = data.user.id
        createdId = targetId
      }
    }

    let saved = false
    try {
      if (createdId) {
        const { error } = await admin.from('profiles').upsert({
          id: targetId, nome: name, email, role: 'colab', agency_role: 'colaborador',
          agency_id: agencyId, must_change_password: true, deleted_at: null,
        }, { onConflict: 'id' })
        if (error) throw error
      }
      const previous = await listMemberships(context, projectIds, targetId)
      const owned = projects.filter((project) => project.user_id === targetId)
      if (owned.some((project) => {
        const access = accesses.find((item) => item.projectId === project.id)
        return (replace || access) && access?.level !== 'admin'
      })) throw new TeamError('O responsável por um projeto mantém acesso total. Transfira a responsabilidade antes de restringir.', 409)
      const changes = membershipChanges(accesses, previous, targetId, actorId, replace)
      if (changes.length) {
        const { error } = await admin.from('project_users').upsert(changes, { onConflict: 'project_id,user_id' })
        if (error) throw error
      }
      saved = true
    } finally {
      if (createdId && !saved) {
        const { error } = await admin.auth.admin.deleteUser(createdId)
        if (error) console.error('Failed to clean up new team account')
      }
    }

    let emailSent = false
    // Editing permissions never sends an invitation. New grants send one per person, after all projects are saved.
    if (!replace) {
      try {
        const actionLink = new URL('/login', getPublicAppOrigin(request)).toString()
        if (temporaryPassword) {
          await sendAccessCredentialsEmail({ admin, email, name, temporaryPassword, actionLink, kind: 'invite' })
        } else {
          await sendAccessLinkEmail({ admin, email, name, actionLink })
        }
        emailSent = true
      } catch { /* Keep saved access and make mail failure visible, without deleting the account. */ }
    }
    return respond({ userId: targetId, email, saved: true, emailSent,
      warning: !replace && !emailSent ? 'Acessos salvos, mas o e-mail não foi enviado. Reenvie pela Central de acesso.' : null })
  } catch (error) { return failure(error) }
}
export async function POST(request: NextRequest) { return save(request, false) }
export async function PATCH(request: NextRequest) { return save(request, true) }
