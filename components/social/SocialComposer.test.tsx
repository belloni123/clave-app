// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SocialComposer from '@/components/social/SocialComposer'
import type { SocialAccountPublic } from '@/types/social'
import { getSocialCapabilities } from '@/utils/social/capabilities'

vi.mock('@/utils/supabase/client', () => ({
  createClient: () => ({
    storage: {
      from: () => ({ uploadToSignedUrl: vi.fn() }),
    },
  }),
}))

const accounts: SocialAccountPublic[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    provider: 'instagram',
    externalAccountId: 'ig-1',
    accountType: 'instagram_business',
    displayName: 'Instagram Teste',
    username: 'instagram.teste',
    avatarUrl: null,
    status: 'connected',
    capabilities: getSocialCapabilities('instagram'),
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    provider: 'facebook',
    externalAccountId: 'page-1',
    accountType: 'facebook_page',
    displayName: 'Facebook Page Teste',
    username: null,
    avatarUrl: null,
    status: 'connected',
    capabilities: getSocialCapabilities('facebook'),
  },
]

describe('social composer channels', () => {
  it('shows the essential mLabs-style fields and provider-specific formats', () => {
    render(
      <SocialComposer
        projectId="33333333-3333-4333-8333-333333333333"
        accounts={accounts}
        onSaved={vi.fn()}
      />,
    )

    expect(screen.getByText('1. Selecione os perfis')).toBeTruthy()
    expect(screen.getByText('2. Selecione os canais')).toBeTruthy()
    expect(screen.getByText('3. Legenda')).toBeTruthy()
    expect(screen.getByText('4. Mídias')).toBeTruthy()
    expect(screen.getByText('5. Data e horário da publicação')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Feed' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Reels' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Stories' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Publicar agora' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Agendar' })).toBeTruthy()
    expect(screen.queryByText(/Criar legenda/)).toBeNull()
    expect(screen.queryByText(/Integrações/)).toBeNull()
    expect(screen.queryByText(/Editor/)).toBeNull()
    expect(screen.getByText(/PNG para Instagram é convertido automaticamente/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { expanded: false }))
    fireEvent.click(screen.getByRole('button', { name: /Facebook Page Teste/ }))
    expect(screen.getAllByRole('button', { name: 'Feed' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Reels' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Stories' })).toHaveLength(1)
    expect(screen.getByText('Stories está disponível no Instagram profissional nesta fase.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Instagram Teste Instagram profissional/ }))
    expect(screen.getByText('0/63206')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Stories' })).toBeNull()
  })
})
