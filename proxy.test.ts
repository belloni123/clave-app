import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { updateSession } = vi.hoisted(() => ({ updateSession: vi.fn() }))

vi.mock('@/utils/supabase/middleware', () => ({ updateSession }))

import { proxy } from './proxy'

describe('canonical domain redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateSession.mockResolvedValue(NextResponse.next())
  })

  it('redirects the legacy hostname while preserving path and query string', async () => {
    const response = await proxy(
      new NextRequest('https://clave.agenciab16.com.br/auth/callback?code=example'),
    )

    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe(
      'https://useclave.com.br/auth/callback?code=example',
    )
    expect(updateSession).not.toHaveBeenCalled()
  })

  it('continues the normal session flow on the canonical hostname', async () => {
    const request = new NextRequest('https://useclave.com.br/login')

    await proxy(request)

    expect(updateSession).toHaveBeenCalledWith(request)
  })
})
