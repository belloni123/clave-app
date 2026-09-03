import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST, PUT, DELETE } from './route'
const mock = vi.hoisted(() => ({ rpc: vi.fn(), google: vi.fn(), write: vi.fn() }))
vi.mock('@/utils/google-calendar', () => ({ getGoogleAccessToken: mock.google }))
vi.mock('@/utils/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'viewer' } } }) }, rpc: mock.rpc,
  from: () => ({
    select: () => ({ eq: () => ({ single: async () => ({ data: { project_id: 'project', gcal_event_id: 'google-event' } }) }) }),
    insert: mock.write, update: mock.write,
  }),
}) }))
beforeEach(() => { vi.clearAllMocks(); mock.rpc.mockImplementation(async (name) => ({ data: name === 'user_has_project_module_access', error: null })) })
describe('read-only calendar access', () => {
  it.each([['POST', POST], ['PUT', PUT], ['DELETE', DELETE]] as const)('blocks %s before any Google Calendar side effect', async (method, handler) => {
    const request = new NextRequest('https://clave.agenciab16.com.br/api/calendar/events', { method, body: JSON.stringify({ id: 'event', project_id: 'project', title: 'Test', date: '2026-09-10', type: 'test' }) })
    const response = await handler(request)
    expect(response.status).toBe(403)
    expect(mock.google).not.toHaveBeenCalled()
    expect(mock.write).not.toHaveBeenCalled()
  })
})
