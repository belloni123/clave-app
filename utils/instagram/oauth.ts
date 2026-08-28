import 'server-only'

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto'
import type { NextRequest } from 'next/server'

export const INSTAGRAM_OAUTH_COOKIE = 'clave_instagram_oauth'
export const INSTAGRAM_PENDING_COOKIE = 'clave_instagram_pending'
export const INSTAGRAM_OAUTH_MAX_AGE_SECONDS = 15 * 60

export interface InstagramOAuthState {
  state: string
  projectId: string
  userId: string
  redirectUri: string
  source: 'business' | 'oauth'
  createdAt: number
}

export interface InstagramPendingAuthorization {
  accessToken: string
  tokenExpiresAt: string | null
  grantedScopes: string[]
  source: 'business' | 'oauth'
  createdAt: number
}

export function encodeInstagramOAuthState(value: InstagramOAuthState) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

export function readInstagramOAuthState(request: NextRequest): InstagramOAuthState | null {
  const value = request.cookies.get(INSTAGRAM_OAUTH_COOKIE)?.value
  if (!value) return null

  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as InstagramOAuthState
    if (
      !parsed.state
      || !parsed.projectId
      || !parsed.userId
      || !parsed.redirectUri
      || !['business', 'oauth'].includes(parsed.source)
      || !parsed.createdAt
    ) {
      return null
    }
    if (Date.now() - parsed.createdAt > INSTAGRAM_OAUTH_MAX_AGE_SECONDS * 1_000) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function pendingCookieKey() {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) {
    throw new Error('A proteção temporária do Instagram não foi configurada.')
  }
  return createHash('sha256').update(`clave-instagram-oauth:${secret}`).digest()
}

export function sealInstagramPendingAuthorization(value: InstagramPendingAuthorization) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', pendingCookieKey(), iv)
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, encrypted]).toString('base64url')
}

export function readInstagramPendingAuthorization(
  request: NextRequest,
): InstagramPendingAuthorization | null {
  const value = request.cookies.get(INSTAGRAM_PENDING_COOKIE)?.value
  if (!value) return null

  try {
    const payload = Buffer.from(value, 'base64url')
    if (payload.length <= 28) return null
    const iv = payload.subarray(0, 12)
    const authTag = payload.subarray(12, 28)
    const encrypted = payload.subarray(28)
    const decipher = createDecipheriv('aes-256-gcm', pendingCookieKey(), iv)
    decipher.setAuthTag(authTag)
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8')
    const parsed = JSON.parse(decrypted) as InstagramPendingAuthorization
    if (
      !parsed.accessToken
      || (parsed.tokenExpiresAt !== null && typeof parsed.tokenExpiresAt !== 'string')
      || !Array.isArray(parsed.grantedScopes)
      || !['business', 'oauth'].includes(parsed.source)
      || !parsed.createdAt
    ) {
      return null
    }
    if (Date.now() - parsed.createdAt > INSTAGRAM_OAUTH_MAX_AGE_SECONDS * 1_000) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function instagramOAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: INSTAGRAM_OAUTH_MAX_AGE_SECONDS,
  }
}
