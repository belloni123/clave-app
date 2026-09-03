import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import {
  sendAccessCredentialsEmail,
  sendAccessLinkEmail,
} from '@/utils/supabase/access-mailer'
import { getPublicAppOrigin } from '@/utils/http/public-app-origin'

interface ResetAccessBody {
  projectId?: unknown
  userId?: unknown
  action?: unknown
  temporaryPassword?: unknown
  sendEmail?: unknown
}

type AccessAction = 'change_password' | 'resend_link' | 'legacy_reset'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function jsonError(message: string, status: number, details?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...details }, { status })
}

function generateTemporaryPassword() {
  return randomBytes(18).toString('base64url')
}

export async function POST(request: NextRequest) {
  let body: ResetAccessBody
  try {
    body = await request.json() as ResetAccessBody
  } catch {
    return jsonError('Corpo da requisição inválido.', 400)
  }

  const projectId = typeof body.projectId === 'string' ? body.projectId : ''
  const userId = typeof body.userId === 'string' ? body.userId : ''
  if (!UUID_PATTERN.test(projectId) || !UUID_PATTERN.test(userId)) {
    return jsonError('Usuário ou projeto inválido.', 400)
  }

  let action: AccessAction
  if (body.action === 'change_password' || body.action === 'resend_link') {
    action = body.action
  } else if (body.action === undefined) {
    // Compatibilidade com a interface anterior durante um deploy gradual.
    action = 'legacy_reset'
  } else {
    return jsonError('Ação de acesso inválida.', 400)
  }

  const requestedPassword = typeof body.temporaryPassword === 'string'
    ? body.temporaryPassword
    : ''
  if (
    action === 'change_password'
    && (requestedPassword.length < 8 || requestedPassword.length > 72)
  ) {
    return jsonError('A senha temporária deve ter entre 8 e 72 caracteres.', 400)
  }
  const sendEmail = action === 'legacy_reset' || body.sendEmail === true

  const supabase = await createClient()
  const {
    data: { user: actor },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !actor) return jsonError('Não autorizado.', 401)

  const { data: canManage, error: permissionError } = await supabase.rpc(
    'user_can_administer_project',
    { proj_id: projectId, usr_id: actor.id },
  )
  if (permissionError) {
    console.error('Project reset access permission check failed', permissionError)
    return jsonError('Não foi possível validar a permissão.', 500)
  }
  if (!canManage) return jsonError('Você não pode gerenciar os acessos deste projeto.', 403)

  try {
    const admin = createAdminClient()
    const [{ data: membership, error: membershipError }, { data: profile, error: profileError }] = await Promise.all([
      admin
        .from('project_users')
        .select('id')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .eq('ativo', true)
        .maybeSingle(),
      admin
        .from('profiles')
        .select('nome, email, blocked_at')
        .eq('id', userId)
        .is('deleted_at', null)
        .maybeSingle(),
    ])

    if (membershipError || profileError) throw membershipError ?? profileError
    if (!membership || !profile?.email) {
      return jsonError('Este usuário ativo não possui um e-mail de acesso.', 404)
    }

    if (profile.blocked_at) return jsonError('Desbloqueie a pessoa em Equipe e acessos antes de redefinir o acesso.', 409)

    const actionLink = new URL('/login', getPublicAppOrigin(request)).toString()

    if (action === 'resend_link') {
      await sendAccessLinkEmail({
        admin,
        email: profile.email,
        name: profile.nome?.trim() || profile.email,
        actionLink,
      })
      return NextResponse.json({ ok: true, action })
    }

    const temporaryPassword = action === 'legacy_reset'
      ? generateTemporaryPassword()
      : requestedPassword
    const { error: passwordError } = await admin.auth.admin.updateUserById(userId, {
      password: temporaryPassword,
    })
    if (passwordError) throw passwordError

    const { error: changeFlagError } = await admin
      .from('profiles')
      .update({ must_change_password: true })
      .eq('id', userId)
    if (changeFlagError) throw changeFlagError

    if (sendEmail) {
      try {
        await sendAccessCredentialsEmail({
          admin,
          email: profile.email,
          name: profile.nome?.trim() || profile.email,
          temporaryPassword,
          actionLink,
          kind: 'reset',
        })
      } catch (emailError) {
        console.error(
          'Project access password email failed',
          emailError instanceof Error ? emailError.message : 'unknown error',
        )
        return jsonError(
          'A senha foi alterada, mas o e-mail não pôde ser enviado. Reenvie o link de acesso separadamente.',
          502,
          { passwordChanged: true },
        )
      }
    }

    return NextResponse.json({ ok: true, action })
  } catch (error) {
    console.error(
      'Project access management failed',
      error instanceof Error ? error.message : 'unknown error',
    )
    return jsonError(
      action === 'resend_link'
        ? 'Não foi possível reenviar o link. Verifique o SMTP e tente novamente.'
        : 'Não foi possível alterar a senha. Tente novamente.',
      500,
    )
  }
}
