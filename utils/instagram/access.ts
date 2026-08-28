import 'server-only'

import { createClient } from '@/utils/supabase/server'

export class InstagramAccessError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'InstagramAccessError'
  }
}

export async function authorizeInstagramProject(
  projectId: string,
  options: { requireManager?: boolean } = {},
) {
  if (!projectId) throw new InstagramAccessError('Projeto não informado.', 400)

  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    throw new InstagramAccessError('Sessão expirada. Entre novamente.', 401)
  }

  const functionName = options.requireManager
    ? 'user_can_administer_project'
    : 'user_has_project_module_access'
  const parameters = options.requireManager
    ? { proj_id: projectId, usr_id: user.id }
    : { proj_id: projectId, module_key: 'instagram', usr_id: user.id }

  const { data: allowed, error: accessError } = await supabase.rpc(
    functionName,
    parameters,
  )

  if (accessError) {
    console.error('Instagram project authorization failed', accessError.message)
    throw new InstagramAccessError('Não foi possível validar o acesso ao projeto.', 500)
  }
  if (!allowed) {
    throw new InstagramAccessError('Você não tem permissão para acessar o Instagram deste projeto.', 403)
  }

  return { user, supabase }
}
