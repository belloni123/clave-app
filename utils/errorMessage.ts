interface SupabaseErrorLike {
  code?: string
  message?: string
}

const KNOWN_MESSAGES: Record<string, string> = {
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'Email not confirmed': 'Confirme seu e-mail antes de entrar.',
  'User already registered': 'Já existe uma conta com esse e-mail.',
  'User already exists': 'Já existe uma conta com esse e-mail.',
}

const KNOWN_CODES: Record<string, string> = {
  '23505': 'Já existe um registro com esses dados.',
  '23503': 'Não é possível concluir: há outros dados vinculados a este registro.',
  '42501': 'Você não tem permissão para realizar esta ação.',
  '22P02': 'Os dados enviados são inválidos.',
  'PGRST116': 'Registro não encontrado.',
}

function isSupabaseErrorLike(err: unknown): err is SupabaseErrorLike {
  return typeof err === 'object' && err !== null && ('code' in err || 'message' in err)
}

/**
 * Traduz erros técnicos (Supabase/Postgres/rede) para uma mensagem em
 * português segura para exibir ao usuário final. Sempre loga o erro
 * original no console para debug.
 */
export function friendlyErrorMessage(err: unknown, fallback = 'Ocorreu um erro. Tente novamente.'): string {
  console.error(err)

  if (isSupabaseErrorLike(err)) {
    if (err.code && KNOWN_CODES[err.code]) return KNOWN_CODES[err.code]
    if (err.message && KNOWN_MESSAGES[err.message]) return KNOWN_MESSAGES[err.message]
  }

  return fallback
}
