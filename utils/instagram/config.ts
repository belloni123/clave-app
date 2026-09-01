export interface MetaAppEnvironment {
  [key: string]: string | undefined
  META_APP_ID?: string
  INSTAGRAM_APP_ID?: string
  INSTAGRAM_APP_SECRET?: string
  META_APP_ACCESS_TOKEN?: string
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

function secretFromAppAccessToken(appId: string, appAccessToken: string) {
  const separator = appAccessToken.indexOf('|')
  if (separator <= 0) return ''

  const tokenAppId = appAccessToken.slice(0, separator).trim()
  const tokenSecret = appAccessToken.slice(separator + 1).trim()
  return tokenAppId === appId ? tokenSecret : ''
}

export function resolveMetaAppId(
  environment: MetaAppEnvironment = process.env,
) {
  const canonicalAppId = clean(environment.META_APP_ID)
  const legacyAppId = clean(environment.INSTAGRAM_APP_ID)

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

  return appId
}

export function resolveMetaAppCredentials(
  environment: MetaAppEnvironment = process.env,
) {
  const appId = resolveMetaAppId(environment)
  const configuredAppAccessToken = clean(environment.META_APP_ACCESS_TOKEN)
  const appSecret = secretFromAppAccessToken(appId, configuredAppAccessToken)
    || clean(environment.INSTAGRAM_APP_SECRET)

  if (!appSecret) {
    throw new MetaAppConfigurationError(
      'A chave secreta do aplicativo da Meta não foi configurada.',
      'missing_app_secret',
    )
  }

  return { appId, appSecret }
}

export function resolveMetaAppAccessToken(
  environment: MetaAppEnvironment = process.env,
) {
  const appId = resolveMetaAppId(environment)
  const configuredToken = clean(environment.META_APP_ACCESS_TOKEN)
  if (configuredToken) return { appId, appAccessToken: configuredToken }

  const appSecret = clean(environment.INSTAGRAM_APP_SECRET)
  if (!appSecret) {
    throw new MetaAppConfigurationError(
      'Configure META_APP_ACCESS_TOKEN ou a chave secreta do aplicativo da Meta.',
      'missing_app_secret',
    )
  }

  return { appId, appAccessToken: `${appId}|${appSecret}` }
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
