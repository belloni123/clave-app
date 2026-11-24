import { NextRequest, NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { updateSession } = vi.hoisted(() => ({ updateSession: vi.fn() }))

vi.mock('@/utils/supabase/middleware', () => ({ updateSession }))

import { proxy } from './proxy'

describe('canonical domain redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('APP_URL', 'https://assinaturas.agenciab16.com.br')
    updateSession.mockResolvedValue(NextResponse.next())
  })
  afterEach(() => vi.unstubAllEnvs())

  it('redirects the legacy hostname while preserving path and query string', async () => {
    const response = await proxy(
      new NextRequest('https://clave.agenciab16.com.br/auth/callback?code=example'),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'https://assinaturas.agenciab16.com.br/auth/callback?code=example',
    )
    expect(updateSession).not.toHaveBeenCalled()
  })

  it('uses the forwarded hostname behind the production reverse proxy', async () => {
    const response = await proxy(
      new NextRequest('http://localhost:3000/login?from=legacy', {
        headers: { 'x-forwarded-host': 'clave.agenciab16.com.br' },
      }),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'https://assinaturas.agenciab16.com.br/login?from=legacy',
    )
    expect(updateSession).not.toHaveBeenCalled()
  })

  it('continues the normal session flow on the canonical hostname', async () => {
    const request = new NextRequest('https://assinaturas.agenciab16.com.br/login')

    await proxy(request)

    expect(updateSession).toHaveBeenCalledWith(request)
  })

  it('keeps previously issued Zeclave form links working on the former host', async () => {
    const path = `/formularios/${'a'.repeat(43)}?embed=1`
    const response = await proxy(new NextRequest(`https://assinaturas.agenciab16.com.br${path}`))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(`https://useclave.com.br${path}`)
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(updateSession).not.toHaveBeenCalled()
  })

  it('keeps legacy form links on the legacy application', async () => {
    const request = new NextRequest('https://assinaturas.agenciab16.com.br/formularios/22222222-2222-4222-8222-222222222222')

    await proxy(request)

    expect(updateSession).toHaveBeenCalledWith(request)
  })
})
