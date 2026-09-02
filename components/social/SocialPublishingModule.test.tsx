// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SocialPublishingModule from '@/components/social/SocialPublishingModule'
import type { SocialAccountsResponse } from '@/types/social'

const projectId = '11111111-1111-4111-8111-111111111111'

describe('social publishing authorization state', () => {
  it('keeps users inside CLAVE and offers official reauthorization when scopes are missing', async () => {
    const accounts: SocialAccountsResponse = {
      flags: { enabled: true, instagram: true, facebook: true },
      connectionStatus: 'reauthorization_required',
      authorizationUrl: `/api/instagram/connect?projectId=${projectId}&mode=oauth&purpose=publishing`,
      accounts: [],
    }
    vi.stubGlobal('fetch', vi.fn(async (request: RequestInfo | URL) => {
      const url = String(request)
      return new Response(JSON.stringify(url.startsWith('/api/social/accounts')
        ? accounts
        : { posts: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <SocialPublishingModule
          projectId={projectId}
          projectName="Projeto teste"
          view="novo-post"
          postId={null}
          onNavigate={vi.fn()}
        />
      </QueryClientProvider>,
    )

    expect(await screen.findByText('Autorize a publicação pela Meta')).toBeTruthy()
    const link = screen.getByRole('link', { name: 'Autorizar publicação' })
    expect(link.getAttribute('href')).toContain('purpose=publishing')
    expect(screen.getByText(/Analytics e seu histórico continuam intactos/)).toBeTruthy()
  })
})
