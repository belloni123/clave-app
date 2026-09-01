// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import InstagramModule from '@/components/modules/InstagramModule'
import { useAppStore } from '@/store/useAppStore'
import type { InstagramDashboardResponse } from '@/types/instagram'

const projectId = '11111111-1111-4111-8111-111111111111'

function response(canManage: boolean, enabled: boolean): InstagramDashboardResponse {
  return {
    canManage,
    canUseBusinessAccounts: false,
    socialPublishing: { enabled, instagram: enabled, facebook: enabled },
    days: 30,
    connection: {
      id: 'connection-1',
      projectId,
      instagramUserId: 'ig-1',
      username: 'clave',
      name: 'CLAVE',
      accountType: 'BUSINESS',
      profilePictureUrl: null,
      followersCount: 100,
      mediaCount: 2,
      status: 'connected',
      connectedAt: '2029-01-01T00:00:00.000Z',
      lastSyncedAt: '2029-01-01T00:00:00.000Z',
      lastError: null,
    },
    daily: [],
    summary: { current: null, previous: null },
    media: [],
  }
}

async function renderModule(payload: InstagramDashboardResponse) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={queryClient}><InstagramModule /></QueryClientProvider>)
  await screen.findByText('@clave · 100 seguidores')
}

describe('Instagram Analytics publishing entry point', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
    useAppStore.setState({
      activeProjectId: projectId,
      projects: [{
        id: projectId,
        name: 'Projeto seguro',
        color: '#000000',
        level: 'pro',
        user_id: 'user-1',
        created_at: '2029-01-01T00:00:00.000Z',
      }],
    })
  })

  it('places Agendar post before the analytics period filters for managers', async () => {
    await renderModule(response(true, true))
    const schedule = screen.getByRole('button', { name: /Agendar post/i })
    const sevenDays = screen.getByRole('button', { name: '7 dias' })
    expect(schedule.compareDocumentPosition(sevenDays) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText('Evolução da audiência')).toBeTruthy()
  })

  it('does not expose publishing to users without management permission', async () => {
    await renderModule(response(false, true))
    expect(screen.queryByRole('button', { name: /Agendar post/i })).toBeNull()
    expect(screen.getByText('Evolução da audiência')).toBeTruthy()
  })

  it('keeps the entry point hidden while the server feature flag is off', async () => {
    await renderModule(response(true, false))
    expect(screen.queryByRole('button', { name: /Agendar post/i })).toBeNull()
  })
})
