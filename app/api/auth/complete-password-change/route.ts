import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

interface PasswordChangeBody {
  password?: unknown
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(request: NextRequest) {
  let body: PasswordChangeBody
  try {
    body = await request.json() as PasswordChangeBody
  } catch {
    return jsonError('Corpo da requisição inválido.', 400)
  }

  const password = typeof body.password === 'string' ? body.password : ''
  if (password.length < 8 || password.length > 72) {
    return jsonError('A senha deve ter entre 8 e 72 caracteres.', 400)
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) return jsonError('Não autorizado.', 401)

  try {
    const { error: passwordError } = await supabase.auth.updateUser({ password })

    if (passwordError) throw passwordError

    const admin = createAdminClient()
    const { error: profileError } = await admin
      .from('profiles')
      .update({ must_change_password: false })
      .eq('id', user.id)

    if (profileError) throw profileError

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error(
      'Password change completion failed',
      error instanceof Error ? error.message : 'unknown error',
    )
    return jsonError('Não foi possível concluir a troca da senha.', 500)
  }
}
