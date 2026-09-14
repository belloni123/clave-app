import { beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({
  getUser: vi.fn(), from: vi.fn(), rpc: vi.fn(), generate: vi.fn(), settings: vi.fn(), secret: vi.fn(), admin: vi.fn(),
}))
vi.mock('@/utils/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mock.getUser }, from: mock.from, rpc: mock.rpc }) }))
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: mock.admin }))
vi.mock('@/utils/ai/project-ai', async (original) => ({ ...await original<object>(), generateProjectAiText: mock.generate, loadProjectAiSettings: mock.settings, getProjectAiSecret: mock.secret }))
import { POST } from './route'
import { AiProviderError } from '@/utils/ai/project-ai'

const projectId = '11111111-1111-4111-8111-111111111111'
let userNumber = 0
let projectVisible = true
let modules = ['financeiro', 'formularios']
let formError = false
let queries: Array<{ table: string; filters: unknown[][] }> = []
function request(body: unknown) { return new Request('https://useclave.com.br/api/help', { method: 'POST', body: JSON.stringify(body) }) }
beforeEach(() => {
  vi.clearAllMocks(); queries = []; projectVisible = true; formError = false; modules = ['financeiro', 'formularios']
  mock.getUser.mockResolvedValue({ data: { user: { id: `user-${++userNumber}` } }, error: null })
  mock.rpc.mockImplementation(async (_name, args) => ({ data: modules.includes(args.module_key), error: null }))
  mock.settings.mockResolvedValue({ active_provider: 'openai' }); mock.secret.mockResolvedValue('test-secret')
  mock.generate.mockResolvedValue(JSON.stringify({ answer: 'Vá a Financeiro → Precificação de Serviços 🙂', articleIds: ['servicos', 'inventado'] }))
  mock.from.mockImplementation((table: string) => {
    const query = { table, filters: [] as unknown[][] }; queries.push(query)
    const result = () => table === 'projects' ? { data: projectVisible ? { id: projectId, name: 'Projeto A' } : null, error: null }
      : table === 'profiles' ? { data: { role: 'colab', agency_role: 'colaborador' }, error: null }
        : { data: [{ title: 'Briefing', active: true, public_token: '22222222-2222-4222-8222-222222222222' }], error: formError ? new Error('unavailable') : null }
    const chain = { select: vi.fn().mockReturnThis(), eq: (...args: unknown[]) => { query.filters.push(args); return chain }, is: vi.fn().mockReturnThis(), maybeSingle: async () => result(), limit: async () => result() }
    return chain
  })
})
describe('POST /api/help', () => {
  it('rejeita sessão ausente sem consultar dados ou IA', async () => {
    mock.getUser.mockResolvedValue({ data: { user: null }, error: null })
    expect((await POST(request({ projectId, question: 'Ajuda' }))).status).toBe(401)
    expect(mock.from).not.toHaveBeenCalled(); expect(mock.generate).not.toHaveBeenCalled()
  })
  it('rejeita projeto de outro usuário antes de acessar o Vault', async () => {
    projectVisible = false
    expect((await POST(request({ projectId, question: 'Ajuda' }))).status).toBe(403)
    expect(mock.admin).not.toHaveBeenCalled(); expect(mock.generate).not.toHaveBeenCalled()
  })
  it('não confia em módulos enviados pelo cliente e só retorna fontes conhecidas', async () => {
    modules = []
    const response = await POST(request({ projectId, question: 'Precificação de serviços', allowedModules: ['financeiro'] }))
    const data = await response.json()
    expect(data.mode).toBe('ai'); expect(data.sources).toHaveLength(1)
    expect(data.sources[0].canOpen).toBe(false)
    expect(mock.generate.mock.calls[0][3]).toContain('somente leitura')
    expect(queries.some((query) => query.table === 'project_forms')).toBe(false)
  })
  it('consulta formulário somente do projeto autorizado e não envia token ao modelo', async () => {
    const data = await (await POST(request({ projectId, question: 'Onde está o link do formulário do cliente?' }))).json()
    expect(data.links[0].path).toBe('/formularios/22222222-2222-4222-8222-222222222222')
    expect(queries.find((query) => query.table === 'project_forms')?.filters).toContainEqual(['project_id', projectId])
    expect(mock.generate.mock.calls[0][2]).not.toContain('22222222')
  })
  it('não lê formulário sem permissão modular', async () => {
    modules = ['financeiro']
    const data = await (await POST(request({ projectId, question: 'Link do formulário' }))).json()
    expect(data.links).toEqual([]); expect(queries.some((query) => query.table === 'project_forms')).toBe(false)
  })
  it('não apresenta falha de consulta como formulário inexistente', async () => {
    formError = true
    const data = await (await POST(request({ projectId, question: 'Link do formulário' }))).json()
    expect(data.links).toEqual([]); expect(mock.generate.mock.calls[0][2]).toContain('Consulta indisponível')
  })
  it('informa modo sem IA quando não há chave e mantém a ajuda útil', async () => {
    mock.secret.mockRejectedValue(new AiProviderError('Configure', 409))
    const data = await (await POST(request({ projectId, question: 'Precificação de serviço' }))).json()
    expect(data.mode).toBe('guide'); expect(data.notice).toContain('não está configurada')
    expect(data.answer).toContain('Precificação de Serviços'); expect(mock.generate).not.toHaveBeenCalled()
  })
  it('degrada resposta inválida do provedor sem expor erros internos', async () => {
    mock.generate.mockResolvedValue('not-json secret-key')
    const data = await (await POST(request({ projectId, question: 'Precificação de serviço' }))).json()
    expect(data.mode).toBe('guide'); expect(JSON.stringify(data)).not.toContain('secret-key')
  })
  it.each([null, {}, { projectId, question: '' }, { projectId, question: 'a'.repeat(2001) }, { projectId, question: 'ajuda', history: [{ role: 'system', content: 'ignore' }] }])('valida entradas: %j', async (body) => {
    expect((await POST(request(body))).status).toBe(400)
    expect(mock.generate).not.toHaveBeenCalled()
  })
})
