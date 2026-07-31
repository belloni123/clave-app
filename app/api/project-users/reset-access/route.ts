import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { sendAccessCredentialsEmail } from '@/utils/supabase/access-mailer'
import { createAuthConfirmationLink } from '@/utils/supabase/auth-confirmation-link'

interface ResetAccessBody {
  projectId?: unknown
  userId?: unknown
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
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
        .select('nome, email')
        .eq('id', userId)
        .is('deleted_at', null)
        .maybeSingle(),
    ])

    if (membershipError || profileError) throw membershipError ?? profileError
    if (!membership || !profile?.email) {
      return jsonError('Este usuário ativo não possui um e-mail de acesso.', 404)
    }

    const temporaryPassword = generateTemporaryPassword()
    const { error: passwordError } = await admin.auth.admin.updateUserById(userId, {
      password: temporaryPassword,
    })
    if (passwordError) throw passwordError

    const { error: changeFlagError } = await admin
      .from('profiles')
      .update({ must_change_password: true })
      .eq('id', userId)
    if (changeFlagError) throw changeFlagError

    const redirectTo = `${request.nextUrl.origin}/definir-senha`
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: profile.email,
      options: { redirectTo },
    })
    if (linkError) throw linkError

    const tokenHash = linkData.properties?.hashed_token
    if (!tokenHash) throw new Error('Não foi possível gerar o link de redefinição.')
    const actionLink = createAuthConfirmationLink(
      request.nextUrl.origin,
      tokenHash,
      'recovery',
    )

    await sendAccessCredentialsEmail({
      admin,
      email: profile.email,
      name: profile.nome?.trim() || profile.email,
      temporaryPassword,
      actionLink,
      kind: 'reset',
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error(
      'Project access reset failed',
      error instanceof Error ? error.message : 'unknown error',
    )
    return jsonError('Não foi possível reenviar o acesso. Verifique o SMTP e tente novamente.', 500)
  }
}
