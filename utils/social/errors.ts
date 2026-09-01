export type SocialErrorKind = 'validation' | 'authorization' | 'retryable' | 'permanent' | 'unknown'

export class SocialPublishingError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly kind: SocialErrorKind,
    readonly status = 400,
    readonly retryAfterSeconds?: number,
  ) {
    super(message)
    this.name = 'SocialPublishingError'
  }
}

export function publicSocialError(error: unknown) {
  if (error instanceof SocialPublishingError) {
    return { error: error.message, code: error.code }
  }
  return {
    error: 'Não foi possível concluir a operação. Tente novamente ou use o código de suporte.',
    code: 'social_unexpected_error',
  }
}

export function safeErrorDetails(error: unknown) {
  if (error instanceof SocialPublishingError) {
    return {
      code: error.code,
      message: error.message,
      kind: error.kind,
      status: error.status,
      retryAfterSeconds: error.retryAfterSeconds,
    }
  }
  return {
    code: 'social_unexpected_error',
    message: 'Erro inesperado ao processar publicação.',
    kind: 'unknown' as const,
    status: 500,
  }
}
