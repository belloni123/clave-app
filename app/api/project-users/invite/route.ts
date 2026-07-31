import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { sendAccessCredentialsEmail } from '@/utils/supabase/access-mailer'
import {
  DEFAULT_PROJECT_MODULES,
  isProjectModuleKey,
  type ProjectModuleKey,
} from '@/utils/module-access'

type AccountRole = 'client' | 'colab'
type PermissionLevel = 'viewer' | 'editor' | 'admin'

interface InviteProjectUserBody {
  projectId?: unknown
  name?: unknown
  email?: unknown
  accountRole?: unknown
  permissionLevel?: unknown
  modules?: unknown
  temporaryPassword?: unknown
}

type ParsedInviteProjectUser =
  | { ok: false; error: string }
  | {
      ok: true
      projectId: string
      name: string
      email: string
      accountRole: AccountRole
      permissionLevel: PermissionLevel
      modules: ProjectModuleKey[]
      temporaryPassword: string | null
    }

interface ProfileLookup {
  id: string
  role: string
  agency_role: string | null
  agency_id: string | null
  email: string | null
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

function parseBody(body: InviteProjectUserBody): ParsedInviteProjectUser {
  const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const accountRole = body.accountRole
  const permissionLevel = body.permissionLevel
  const modules = Array.isArray(body.modules)
    ? [...new Set(body.modules.filter((module): module is ProjectModuleKey =>
      typeof module === 'string' && isProjectModuleKey(module),
    ))]
    : []
  const temporaryPassword = typeof body.temporaryPassword === 'string'
    ? body.temporaryPassword
    : ''

  if (!UUID_PATTERN.test(projectId)) {
    return { ok: false, error: 'Projeto inválido.' }
  }
  if (name.length < 2 || name.length > 120) {
    return { ok: false, error: 'Informe um nome entre 2 e 120 caracteres.' }
  }
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return { ok: false, error: 'Informe um e-mail válido.' }
  }
  if (temporaryPassword.length > 0 && (temporaryPassword.length < 8 || temporaryPassword.length > 72)) {
    return { ok: false, error: 'A senha temporária deve ter entre 8 e 72 caracteres.' }
  }
  if (accountRole !== 'client' && accountRole !== 'colab') {
    return { ok: false, error: 'Tipo de usuário inválido.' }
  }
  if (
    permissionLevel !== 'viewer'
    && permissionLevel !== 'editor'
    && permissionLevel !== 'admin'
  ) {
    return { ok: false, error: 'Nível de acesso inválido.' }
  }
  if (permissionLevel !== 'admin' && modules.length === 0) {
    return { ok: false, error: 'Selecione pelo menos um módulo.' }
  }
  if (
    Array.isArray(body.modules)
    && modules.length !== new Set(body.modules).size
  ) {
    return { ok: false, error: 'A lista de módulos contém um valor inválido.' }
  }

  return {
    ok: true,
    projectId,
    name,
    email,
    accountRole: accountRole as AccountRole,
    permissionLevel: permissionLevel as PermissionLevel,
    modules,
    temporaryPassword: temporaryPassword.length > 0 ? temporaryPassword : null,
  }
}

function generateTemporaryPassword() {
  return randomBytes(18).toString('base64url')
}

async function findAuthUserByEmail(
  email: string,
  admin: ReturnType<typeof createAdminClient>,
): Promise<User | null> {
  const perPage = 1000

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw error

    const match = data.users.find(
      (candidate) => candidate.email?.toLowerCase() === email,
    )
    if (match) return match
    if (data.users.length < perPage) return null
  }

  throw new Error('Não foi possível concluir a busca da conta.')
}

async function findProfileByEmail(
  email: string,
  admin: ReturnType<typeof createAdminClient>,
): Promise<ProfileLookup | null> {
  const pageSize = 1000

  for (let page = 0; page < 20; page += 1) {
    const from = page * pageSize
    const { data, error } = await admin
      .from('profiles')
      .select('id, role, agency_role, agency_id, email')
      .not('email', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) throw error

    const match = data.find(
      (candidate) => candidate.email?.toLowerCase() === email,
    )
    if (match) return match
    if (data.length < pageSize) return null
  }

  throw new Error('Não foi possível concluir a busca do perfil.')
}

export async function POST(request: NextRequest) {
  let body: InviteProjectUserBody

  try {
    body = await request.json() as InviteProjectUserBody
  } catch {
    return jsonError('Corpo da requisição inválido.', 400)
  }

  const parsed = parseBody(body)
  if (!parsed.ok) return jsonError(parsed.error, 400)

  const supabase = await createClient()
  const {
    data: { user: actor },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !actor) {
    return jsonError('Não autorizado.', 401)
  }

  const { data: canManage, error: permissionError } = await supabase.rpc(
    'user_can_administer_project',
    { proj_id: parsed.projectId, usr_id: actor.id },
  )

  if (permissionError) {
    console.error('Project user permission check failed', permissionError)
    return jsonError('Não foi possível validar a permissão.', 500)
  }
  if (!canManage) {
    return jsonError('Você não pode gerenciar os acessos deste projeto.', 403)
  }

  let invitedUserId: string | null = null

  try {
    const admin = createAdminClient()
    const { data: project, error: projectError } = await admin
      .from('projects')
      .select('id, agency_id')
      .eq('id', parsed.projectId)
      .is('deleted_at', null)
      .maybeSingle()

    if (projectError) throw projectError
    if (!project) return jsonError('Projeto não encontrado.', 404)

    const existingProfile = await findProfileByEmail(parsed.email, admin)
    if (
      existingProfile?.agency_id
      && project.agency_id
      && existingProfile.agency_id !== project.agency_id
    ) {
      return jsonError('Este e-mail já pertence a outra agência.', 409)
    }

    let targetUserId = existingProfile?.id ?? null
    let invited = false
    let temporaryPasswordForInvite: string | null = null

    if (!targetUserId) {
      const existingAuthUser = await findAuthUserByEmail(parsed.email, admin)

      if (existingAuthUser) {
        if (parsed.temporaryPassword) {
          return jsonError(
            'Este e-mail já possui uma conta. A senha temporária só pode ser definida em um novo convite.',
            409,
          )
        }
        targetUserId = existingAuthUser.id
      } else {
        temporaryPasswordForInvite = parsed.temporaryPassword ?? generateTemporaryPassword()
        const { data: createData, error: createError } =
          await admin.auth.admin.createUser({
            email: parsed.email,
            password: temporaryPasswordForInvite,
            email_confirm: true,
            user_metadata: { nome: parsed.name },
          })

        if (createError) throw createError
        if (!createData.user) {
          throw new Error('O provedor de autenticação não retornou o usuário.')
        }

        targetUserId = createData.user.id
        invitedUserId = createData.user.id
        invited = true
      }
    }

    const profileRole =
      existingProfile?.role === 'admin' ? 'admin' : parsed.accountRole
    const agencyRole =
      existingProfile?.agency_role === 'admin'
      || existingProfile?.agency_role === 'gestor'
        ? existingProfile.agency_role
        : 'colaborador'

    const { error: profileError } = await admin
      .from('profiles')
      .upsert({
        id: targetUserId,
        nome: parsed.name,
        email: parsed.email,
        role: profileRole,
        agency_role: agencyRole,
        agency_id: project.agency_id,
        deleted_at: null,
        ...(temporaryPasswordForInvite ? { must_change_password: true } : {}),
      }, { onConflict: 'id' })

    if (profileError) throw profileError

    const allowedModules =
      parsed.permissionLevel === 'admin'
        ? DEFAULT_PROJECT_MODULES
        : parsed.modules

    const { error: accessError } = await admin
      .from('project_users')
      .upsert({
        project_id: parsed.projectId,
        user_id: targetUserId,
        permission_level: parsed.permissionLevel,
        allowed_modules: allowedModules,
        ativo: true,
        concedido_por: actor.id,
        revogado_em: null,
      }, { onConflict: 'project_id,user_id' })

    if (accessError) throw accessError

    if (invited && temporaryPasswordForInvite) {
      await sendAccessCredentialsEmail({
        admin,
        email: parsed.email,
        name: parsed.name,
        temporaryPassword: temporaryPasswordForInvite,
        actionLink: new URL('/login', request.nextUrl.origin).toString(),
        kind: 'invite',
      })
    }

    return NextResponse.json({
      invited,
      userId: targetUserId,
      modules: allowedModules,
    })
  } catch (error) {
    if (invitedUserId) {
      try {
        const cleanupAdmin = createAdminClient()
        await cleanupAdmin.auth.admin.deleteUser(invitedUserId)
      } catch (cleanupError) {
        console.error('Failed to roll back invited user', cleanupError)
      }
    }

    const message =
      error instanceof Error ? error.message : 'Erro desconhecido ao criar acesso.'
    console.error('Project user invitation failed', error)
    return jsonError(message, 500)
  }
}
