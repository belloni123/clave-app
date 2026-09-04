import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { DELETE, GET, PATCH, POST } from './route'

const mock = vi.hoisted(() => ({
  getUser: vi.fn(), profile: vi.fn(), admin: vi.fn(), from: vi.fn(),
  updateUserById: vi.fn(), createUser: vi.fn(), getUserById: vi.fn(), deleteUser: vi.fn(), mail: vi.fn(), link: vi.fn(),
}))
vi.mock('@/utils/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mock.getUser }, from: mock.profile }) }))
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: () => { mock.admin(); return {
  from: mock.from, auth: { admin: { updateUserById: mock.updateUserById, createUser: mock.createUser, getUserById: mock.getUserById, deleteUser: mock.deleteUser } },
} } }))
vi.mock('@/utils/supabase/access-mailer', () => ({ sendAccessCredentialsEmail: mock.mail, sendAccessLinkEmail: mock.link }))

const projectA = '11111111-1111-4111-8111-111111111111'
const projectB = '22222222-2222-4222-8222-222222222222'
const grants = [{ projectId: projectA, level: 'editor', modules: ['comunicacao'] }, { projectId: projectB, level: 'viewer', modules: ['planejador'] }]
const writes: { table: string; value: unknown }[] = []
let actor: Record<string, unknown> | null
let member: Record<string, unknown> | null
let dbFailure: string | null
let memberships: unknown[]
function chain(data: unknown, error: unknown = null, table = '') {
  const value: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'is', 'ilike', 'order', 'limit', 'range', 'in', 'maybeSingle']) value[method] = () => value
  value.update = (row: unknown) => { writes.push({ table, value: row }); return chain({ id: member?.id }, dbFailure === table ? { message: 'failure' } : null) }
  value.upsert = (row: unknown) => { writes.push({ table, value: row }); return chain(null, dbFailure === table ? { message: 'failure' } : null) }
  value.then = (resolve: (result: unknown) => void) => Promise.resolve({ data, error }).then(resolve)
  return value
}
const request = (body: unknown, method = 'POST') => new NextRequest('https://useclave.com.br/api/agency-team', { method, body: JSON.stringify(body) })
beforeEach(() => {
  vi.resetAllMocks(); writes.length = 0; dbFailure = null; memberships = []
  actor = { id: 'operator', role: 'admin', agency_role: 'colaborador', agency_id: 'agency-a' }
  member = null
  mock.getUser.mockResolvedValue({ data: { user: { id: 'operator' } }, error: null })
  mock.profile.mockImplementation(() => chain(actor))
  mock.from.mockImplementation((table) => {
    if (table === 'projects') return chain([{ id: projectA, name: 'A', user_id: 'operator' }, { id: projectB, name: 'B', user_id: 'operator' }], null, table)
    if (table === 'profiles') return chain(member, null, table)
    return chain(memberships, null, table)
  })
  mock.createUser.mockResolvedValue({ data: { user: { id: 'new-user' } }, error: null })
  mock.getUserById.mockResolvedValue({ data: { user: { id: 'existing-user' } }, error: null })
  mock.updateUserById.mockResolvedValue({ error: null })
  mock.deleteUser.mockResolvedValue({ error: null })
})

describe('agency team authorization and grants', () => {
  it('rejects unauthenticated requests before using the admin client', async () => {
    mock.getUser.mockResolvedValue({ data: { user: null } })
    expect((await GET()).status).toBe(401)
    expect(mock.admin).not.toHaveBeenCalled()
  })
  it('rejects collaborators even if they can administer an individual project', async () => {
    actor = { ...actor, role: 'colab', agency_role: 'colaborador' }
    expect((await POST(request({ name: 'Ana', email: 'ana@example.com', accesses: grants }))).status).toBe(403)
    expect(mock.admin).not.toHaveBeenCalled()
  })
  it('rejects foreign projects before creating accounts or memberships', async () => {
    const response = await POST(request({ name: 'Ana', email: 'ana@example.com', accesses: [{ ...grants[0], projectId: '33333333-3333-4333-8333-333333333333' }] }))
    expect(response.status).toBe(403); expect(mock.createUser).not.toHaveBeenCalled(); expect(writes).toEqual([])
  })
  it('creates one account, atomically grants different modules in two projects and sends one invitation', async () => {
    const response = await POST(request({ name: 'Ana', email: 'ANA@example.com', accesses: grants }))
    expect(response.status).toBe(200)
    expect(mock.createUser).toHaveBeenCalledTimes(1); expect(mock.mail).toHaveBeenCalledTimes(1)
    const rows = writes.find((write) => write.table === 'project_users')?.value
    expect(rows).toMatchObject([
      { project_id: projectA, user_id: 'new-user', permission_level: 'editor', allowed_modules: ['comunicacao'], concedido_por: 'operator' },
      { project_id: projectB, user_id: 'new-user', permission_level: 'viewer', allowed_modules: ['planejador'], concedido_por: 'operator' },
    ])
    expect((await response.json()).temporaryPassword).toBeUndefined()
  })
  it('preserves existing profiles, password and projects outside the selection', async () => {
    member = { id: 'existing-user', agency_id: 'agency-a', role: 'colab', agency_role: 'colaborador' }
    memberships = [{ project_id: projectB, user_id: 'existing-user', permission_level: 'editor', allowed_modules: ['historias'] }]
    expect((await POST(request({ name: 'Ana', email: 'ana@example.com', accesses: [grants[0]] }))).status).toBe(200)
    expect(mock.createUser).not.toHaveBeenCalled()
    expect(writes).toHaveLength(1)
    expect(writes[0].value).toHaveLength(1)
    expect(mock.link).toHaveBeenCalledTimes(1)
  })
  it('rejects accounts of another agency', async () => {
    member = { id: 'other-user', agency_id: 'agency-b' }
    expect((await POST(request({ name: 'Ana', email: 'ana@example.com', accesses: grants }))).status).toBe(409)
    expect(writes).toEqual([])
  })
  it('does not pretend to restrict global administrators', async () => {
    member = { id: 'admin-user', role: 'admin', agency_id: 'agency-a' }
    expect((await PATCH(request({ userId: 'admin-user', accesses: [] }, 'PATCH'))).status).toBe(409)
    expect(writes).toEqual([])
  })
  it('revokes deselected projects in the same write and never sends mail on editing', async () => {
    member = { id: 'existing-user', nome: 'Ana', email: 'ana@example.com', role: 'colab' }
    memberships = [{ project_id: projectB, user_id: 'existing-user', permission_level: 'editor', allowed_modules: ['historias'] }]
    expect((await PATCH(request({ userId: 'existing-user', accesses: [grants[0]] }, 'PATCH'))).status).toBe(200)
    expect(writes).toHaveLength(1)
    expect(writes[0].value).toMatchObject([{ project_id: projectA, ativo: true }, { project_id: projectB, ativo: false }])
    expect(mock.mail).not.toHaveBeenCalled(); expect(mock.link).not.toHaveBeenCalled()
  })
  it('keeps saved grants and reports mail delivery failure without deleting the user', async () => {
    mock.mail.mockRejectedValue(new Error('SMTP unavailable'))
    const response = await POST(request({ name: 'Ana', email: 'ana@example.com', accesses: grants }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ saved: true, emailSent: false, warning: expect.any(String) })
    expect(mock.deleteUser).not.toHaveBeenCalled()
  })
  it('cleans up only the newly created account if writing the grants fails', async () => {
    dbFailure = 'project_users'
    expect((await POST(request({ name: 'Ana', email: 'ana@example.com', accesses: grants }))).status).toBe(500)
    expect(mock.deleteUser).toHaveBeenCalledWith('new-user'); expect(mock.mail).not.toHaveBeenCalled()
  })
  it.each([null, {}, { name: 'Ana', email: 'ana@example.com', accesses: [{ ...grants[0], modules: ['not-a-module'] }] }, { name: 'Ana', email: 'ana@example.com', accesses: [grants[0], grants[0]] }])('rejects invalid bodies without mutation', async (body) => {
    expect((await POST(request(body))).status).toBe(400); expect(writes).toEqual([])
  })
})


describe('account lifecycle', () => {
  beforeEach(() => { member = { id: 'person', email: 'ana@example.com', role: 'colab', agency_role: 'colaborador' } })
  it('blocks access without destroying saved memberships', async () => {
    const response = await PATCH(request({ userId: 'person', action: 'block' }, 'PATCH'))
    expect(response.status).toBe(200)
    expect(writes).toEqual([{ table: 'profiles', value: { blocked_at: expect.any(String) } }])
    expect(mock.updateUserById).toHaveBeenCalledWith('person', { ban_duration: '876000h' })
    expect(mock.deleteUser).not.toHaveBeenCalled()
  })
  it('unblocks login and restores existing permissions without recreating them', async () => {
    const response = await PATCH(request({ userId: 'person', action: 'unblock' }, 'PATCH'))
    expect(response.status).toBe(200)
    expect(mock.updateUserById).toHaveBeenCalledWith('person', { ban_duration: 'none' })
    expect(writes).toEqual([{ table: 'profiles', value: { blocked_at: null } }])
  })
  it('requires exact email confirmation before deletion', async () => {
    expect((await DELETE(request({ userId: 'person', confirmEmail: 'wrong@example.com' }, 'DELETE'))).status).toBe(400)
    expect(writes).toEqual([]); expect(mock.updateUserById).not.toHaveBeenCalled()
  })
  it('removes a confirmed account while preserving project and authorship records', async () => {
    expect((await DELETE(request({ userId: 'person', confirmEmail: 'ana@example.com' }, 'DELETE'))).status).toBe(200)
    expect(writes).toEqual([{ table: 'profiles', value: { blocked_at: expect.any(String), deleted_at: expect.any(String) } }])
    expect(mock.deleteUser).not.toHaveBeenCalled()
  })
  it.each(['block', 'unblock', 'delete'])('protects agency administrators from %s', async (action) => {
    member = { ...member, agency_role: 'admin' }
    expect((await PATCH(request({ userId: 'person', action }, 'PATCH'))).status).toBe(409)
    expect(writes).toEqual([])
  })
  it('rejects targets absent from the agency', async () => {
    member = null
    expect((await PATCH(request({ userId: 'foreign', action: 'block' }, 'PATCH'))).status).toBe(404)
    expect(writes).toEqual([])
  })
  it('keeps access closed when unbanning fails', async () => {
    mock.updateUserById.mockResolvedValue({ error: new Error('auth unavailable') })
    expect((await PATCH(request({ userId: 'person', action: 'unblock' }, 'PATCH'))).status).toBe(500)
    expect(writes).toEqual([])
  })
  it('reports auth synchronization failure after the durable block is saved', async () => {
    mock.updateUserById.mockResolvedValue({ error: new Error('auth unavailable') })
    const response = await PATCH(request({ userId: 'person', action: 'block' }, 'PATCH'))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ saved: true, warning: expect.any(String) })
    expect(writes).toHaveLength(1)
  })
  it('does not unban deleted accounts', async () => {
    member = { ...member, deleted_at: '2026-09-03' }
    expect((await PATCH(request({ userId: 'person', action: 'unblock' }, 'PATCH'))).status).toBe(409)
    expect(mock.updateUserById).not.toHaveBeenCalled()
  })
  it('does not grant access to a blocked account through a new invitation', async () => {
    member = { ...member, agency_id: 'agency-a', blocked_at: '2026-09-03' }
    expect((await POST(request({ name: 'Ana', email: 'ana@example.com', accesses: grants }))).status).toBe(409)
    expect(writes).toEqual([])
  })
})
