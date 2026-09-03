import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { updateSession } from './middleware'
const mock = vi.hoisted(() => ({ getUser: vi.fn(), profile: vi.fn(), signOut: vi.fn() }))
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({
  auth: { getUser: mock.getUser, signOut: mock.signOut },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mock.profile }) }) }),
}) }))
beforeEach(() => {
  vi.resetAllMocks()
  mock.getUser.mockResolvedValue({ data: { user: { id: 'user' } } })
  mock.profile.mockResolvedValue({ data: { id: 'user', blocked_at: null, deleted_at: null }, error: null })
  mock.signOut.mockResolvedValue({ error: null })
})
describe('account request guard', () => {
  it('allows active accounts', async () => {
    expect((await updateSession(new NextRequest('https://example.com/api/calendar/events'))).status).toBe(200)
  })
  it('denies service-backed API routes when the Data API rejects an old token', async () => {
    mock.profile.mockResolvedValue({ data: null, error: { code: '42501' } })
    expect((await updateSession(new NextRequest('https://example.com/api/calendar/events'))).status).toBe(403)
  })
  it('signs out and redirects a blocked browser session', async () => {
    mock.profile.mockResolvedValue({ data: { blocked_at: '2026-09-03' }, error: null })
    const response = await updateSession(new NextRequest('https://example.com/'))
    expect(response.headers.get('location')).toBe('https://example.com/login')
    expect(mock.signOut).toHaveBeenCalledOnce()
  })
  it('keeps public requests available without an authenticated account', async () => {
    mock.getUser.mockResolvedValue({ data: { user: null } })
    expect((await updateSession(new NextRequest('https://example.com/api/public/forms/token'))).status).toBe(200)
    expect(mock.profile).not.toHaveBeenCalled()
  })
})
