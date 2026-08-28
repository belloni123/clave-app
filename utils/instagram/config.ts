export interface MetaAppEnvironment {
  [key: string]: string | undefined
  META_APP_ID?: string
  INSTAGRAM_APP_ID?: string
  INSTAGRAM_APP_SECRET?: string
}

type MetaAppConfigurationErrorCode =
  | 'missing_app_id'
  | 'missing_app_secret'
  | 'conflicting_app_ids'
  | 'invalid_app_credentials'

export class MetaAppConfigurationError extends Error {
  readonly code: MetaAppConfigurationErrorCode

  constructor(
    message: string,
    code: MetaAppConfigurationErrorCode,
  ) {
    super(message)
    this.name = 'MetaAppConfigurationError'
    this.code = code
  }
}

function clean(value: string | undefined) {
  return value?.trim() || ''
}

export function resolveMetaAppCredentials(
  environment: MetaAppEnvironment = process.env,
) {
  const canonicalAppId = clean(environment.META_APP_ID)
  const legacyAppId = clean(environment.INSTAGRAM_APP_ID)
  const appSecret = clean(environment.INSTAGRAM_APP_SECRET)

  if (canonicalAppId && legacyAppId && canonicalAppId !== legacyAppId) {
    throw new MetaAppConfigurationError(
      'META_APP_ID e INSTAGRAM_APP_ID apontam para aplicativos diferentes.',
      'conflicting_app_ids',
    )
  }

  const appId = canonicalAppId || legacyAppId
  if (!appId) {
    throw new MetaAppConfigurationError(
      'O ID do aplicativo da Meta não foi configurado.',
      'missing_app_id',
    )
  }
  if (!appSecret) {
    throw new MetaAppConfigurationError(
      'A chave secreta do aplicativo da Meta não foi configurada.',
      'missing_app_secret',
    )
  }

  return { appId, appSecret }
}

export function normalizeMetaCredentialError(error: unknown) {
  if (
    error instanceof Error
    && /(?:client|app)[ _-]?secret|validating client secret|appsecret_proof/i.test(error.message)
  ) {
    return new MetaAppConfigurationError(
      'O ID e a chave secreta do aplicativo da Meta não correspondem. Revise as credenciais no servidor.',
      'invalid_app_credentials',
    )
  }
  return error
}
