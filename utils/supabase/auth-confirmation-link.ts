type ConfirmationType = 'invite' | 'recovery'

export function createAuthConfirmationLink(
  origin: string,
  tokenHash: string,
  type: ConfirmationType,
) {
  const url = new URL('/auth/confirm', origin)
  url.searchParams.set('token_hash', tokenHash)
  url.searchParams.set('type', type)
  url.searchParams.set('next', '/definir-senha')
  return url.toString()
}
