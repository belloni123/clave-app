// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import EquipeModule from './EquipeModule'
import { useAppStore } from '@/store/useAppStore'
const a = '11111111-1111-4111-8111-111111111111'
const b = '22222222-2222-4222-8222-222222222222'
const member = { id: 'collaborator', nome: 'Ana', email: 'ana@example.com', role: 'colab', agency_role: 'colaborador' }
const data = {
  projects: [{ id: a, name: 'Cliente Alfa', user_id: 'operator' }, { id: b, name: 'Cliente Beta', user_id: 'operator' }],
  members: [member, { ...member, id: 'operator', nome: 'Admin', email: 'admin@example.com', role: 'admin' }],
  memberships: [{ project_id: a, user_id: member.id, permission_level: 'editor', allowed_modules: ['comunicacao'] }, { project_id: b, user_id: member.id, permission_level: 'viewer', allowed_modules: ['planejador'] }],
}
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  useAppStore.setState({ profile: { id: 'operator', role: 'admin', plan: 'pro', max_projects: 50, agency_id: 'agency' } })
  fetchMock = vi.fn().mockImplementation(async (_url, options) => ({ ok: true, json: async () => options?.method ? { saved: true, emailSent: true } : data }))
  vi.stubGlobal('fetch', fetchMock)
})
function mount() { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><EquipeModule /></QueryClientProvider>) }
async function start() {
  mount(); fireEvent.click(await screen.findByRole('button', { name: 'Adicionar colaboradores' }))
  fireEvent.change(screen.getByLabelText('Nome do colaborador 1'), { target: { value: 'Bruna' } })
  fireEvent.change(screen.getByLabelText('E-mail do colaborador 1'), { target: { value: 'bruna@example.com' } })
}
describe('central team access flow', () => {
  it('submits one request per person with multiple projects and a project-specific exception', async () => {
    await start()
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar todos' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Personalizar por projeto' })[1])
    fireEvent.change(screen.getByLabelText('Nível de acesso em Cliente Beta'), { target: { value: 'viewer' } })
    fireEvent.click(screen.getByLabelText('Comunicação em Cliente Beta'))
    fireEvent.click(screen.getByRole('button', { name: 'Revisar acessos' }))
    expect(screen.getByText('Cliente Beta · Visualização')).toBeTruthy()
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method)).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e salvar acessos' }))
    await waitFor(() => expect(fetchMock.mock.calls.filter((call) => call[1]?.method)).toHaveLength(1))
    const sent = JSON.parse(fetchMock.mock.calls.find((call) => call[1]?.method)![1].body)
    expect(sent.accesses).toEqual([
      { projectId: a, level: 'editor', modules: ['comunicacao', 'planejador'] },
      { projectId: b, level: 'viewer', modules: ['planejador'] },
    ])
    await screen.findByRole('button', { name: 'Adicionar colaboradores' })
  })
  it('shows revocations in review before saving the remaining project', async () => {
    mount(); fireEvent.click(await screen.findByRole('button', { name: 'Gerenciar acessos de Ana' }))
    fireEvent.click(screen.getByLabelText('Acesso a Cliente Beta'))
    fireEvent.click(screen.getByRole('button', { name: 'Revisar acessos' }))
    expect(screen.getByText('Acesso será revogado em 1 projeto(s):')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e salvar acessos' }))
    await waitFor(() => expect(fetchMock.mock.calls.filter((call) => call[1]?.method)).toHaveLength(1))
    const call = fetchMock.mock.calls.find((call) => call[1]?.method)!
    expect(call[1].method).toBe('PATCH')
    expect(JSON.parse(call[1].body).accesses).toEqual([{ projectId: a, level: 'editor', modules: ['comunicacao'] }])
    await screen.findByRole('button', { name: 'Adicionar colaboradores' })
  })
  it('prevents duplicate emails and does not save until review is confirmed', async () => {
    await start()
    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar outra pessoa' }))
    fireEvent.change(screen.getByLabelText('Nome do colaborador 2'), { target: { value: 'Outra pessoa' } })
    fireEvent.change(screen.getByLabelText('E-mail do colaborador 2'), { target: { value: 'BRUNA@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar todos' }))
    fireEvent.click(screen.getByRole('button', { name: 'Revisar acessos' }))
    expect(screen.getByRole('alert').textContent).toContain('e-mails repetidos')
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method)).toHaveLength(0)
  })
  it('does not load the agency directory for ordinary collaborators', () => {
    useAppStore.setState({ profile: { id: 'collaborator', role: 'colab', plan: 'free', max_projects: 2 } })
    mount(); expect(screen.getByText('Acesso exclusivo aos administradores da agência.')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('keeps only failed people for retry after a partial batch failure', async () => {
    await start()
    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar outra pessoa' }))
    fireEvent.change(screen.getByLabelText('Nome do colaborador 2'), { target: { value: 'Carla' } })
    fireEvent.change(screen.getByLabelText('E-mail do colaborador 2'), { target: { value: 'carla@example.com' } })
    fetchMock.mockImplementation(async (_url, options) => {
      if (!options?.method) return { ok: true, json: async () => data }
      const failed = JSON.parse(options.body).email === 'carla@example.com'
      return { ok: !failed, json: async () => failed ? { error: 'E-mail indisponível' } : { saved: true } }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar todos' }))
    fireEvent.click(screen.getByRole('button', { name: 'Revisar acessos' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e salvar acessos' }))
    await waitFor(() => expect((screen.getByLabelText('E-mail do colaborador 1') as HTMLInputElement).value).toBe('carla@example.com'))
    expect(screen.queryByLabelText('E-mail do colaborador 2')).toBeNull()
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method)).toHaveLength(2)
  })
})


describe('account lifecycle controls', () => {
  it('confirms block and does not expose destructive controls for administrators', async () => {
    mount(); fireEvent.click(await screen.findByRole('button', { name: 'Bloquear Ana' }))
    expect(screen.queryByRole('button', { name: 'Excluir Admin' })).toBeNull()
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method)).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar bloqueio' }))
    await waitFor(() => expect(fetchMock.mock.calls.filter((call) => call[1]?.method)).toHaveLength(1))
    expect(JSON.parse(fetchMock.mock.calls.find((call) => call[1]?.method)![1].body)).toMatchObject({ userId: 'collaborator', action: 'block' })
    await screen.findByText(/Colaborador bloqueado/)
  })
  it('requires typing the email and allows cancellation without deleting', async () => {
    mount(); fireEvent.click(await screen.findByRole('button', { name: 'Excluir Ana' }))
    expect((screen.getByRole('button', { name: 'Confirmar exclusão' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method)).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Excluir Ana' }))
    fireEvent.change(screen.getByLabelText('E-mail para confirmar exclusão'), { target: { value: 'ana@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
    await waitFor(() => expect(fetchMock.mock.calls.filter((call) => call[1]?.method)).toHaveLength(1))
    const call = fetchMock.mock.calls.find((call) => call[1]?.method)!
    expect(call[1].method).toBe('DELETE')
    expect(JSON.parse(call[1].body)).toMatchObject({ confirmEmail: 'ana@example.com' })
    await screen.findByText(/Colaborador excluído/)
  })
})
