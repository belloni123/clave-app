import 'server-only'

import { createAdminClient } from '@/utils/supabase/admin'
import { createClient } from '@/utils/supabase/server'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export class ProjectAiAccessError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ProjectAiAccessError'
    this.status = status
  }
}

export function parseProjectId(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value.trim())) {
    throw new ProjectAiAccessError('Projeto inválido.', 400)
  }
  return value.trim()
}

export async function authorizeProjectAi(projectId: string, requireAdmin = false) {
  const client = await createClient()
  const { data: { user }, error: userError } = await client.auth.getUser()

  if (userError || !user) {
    throw new ProjectAiAccessError('Faça login para continuar.', 401)
  }

  const { data: hasModule, error: moduleError } = await client.rpc(
    'user_has_project_module_access',
    { proj_id: projectId, module_key: 'historias', usr_id: user.id },
  )

  if (moduleError || !hasModule) {
    throw new ProjectAiAccessError('Você não tem acesso ao Banco de histórias deste projeto.', 403)
  }

  const { data: canManage, error: manageError } = await client.rpc(
    'user_can_administer_project',
    { proj_id: projectId, usr_id: user.id },
  )

  if (manageError) {
    throw new ProjectAiAccessError('Não foi possível validar sua permissão no projeto.', 500)
  }
  if (requireAdmin && !canManage) {
    throw new ProjectAiAccessError('Somente administradores do projeto podem alterar as chaves de IA.', 403)
  }

  return {
    user,
    canManage: Boolean(canManage),
    admin: createAdminClient(),
  }
}
