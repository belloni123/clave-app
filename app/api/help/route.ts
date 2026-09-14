import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { readJsonBody, RequestBodyTooLargeError } from '@/utils/http/read-json-body'
import { parseProjectId, ProjectAiAccessError } from '@/utils/ai/project-ai-auth'
import { AiProviderError, generateProjectAiText, getProjectAiSecret, loadProjectAiSettings, parseJsonObject } from '@/utils/ai/project-ai'
import { PROJECT_MODULES, type AppModuleKey } from '@/utils/module-access'
import { HELP_ARTICLES, HELP_SYSTEM_PROMPT, HELP_VERSION, findHelpArticles, normalizeHelpText } from '@/utils/help/knowledge'
import { acquireHelpSlot } from '@/utils/help/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: Request) {
  let release: (() => void) | null = null
  try {
    const body = await readJsonBody(request, 24_000) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') return json({ error: 'Mensagem inválida.' }, 400)
    const projectId = parseProjectId(body.projectId)
    if (typeof body.question !== 'string' || !body.question.trim() || body.question.length > 2_000) {
      return json({ error: 'Escreva uma dúvida de até 2.000 caracteres.' }, 400)
    }
    const question = body.question.trim()
    const history = Array.isArray(body.history) ? body.history.slice(-6).map((item: unknown) => {
      const message = item as Record<string, unknown> | null
      if (!message || !['user', 'assistant'].includes(String(message.role)) || typeof message.content !== 'string' || message.content.length > 3_000) {
        throw new ProjectAiAccessError('Histórico inválido.', 400)
      }
      return { role: message.role, content: message.content }
    }) : []
    const client = await createClient()
    const { data: { user }, error: userError } = await client.auth.getUser()
    if (userError || !user) return json({ error: 'Entre novamente no Clave para conversar.' }, 401)
    // RLS verifies real membership and excludes projects invisible to this user.
    const { data: project, error: projectError } = await client.from('projects').select('id,name').eq('id', projectId).is('deleted_at', null).maybeSingle()
    if (projectError || !project) return json({ error: 'Você não tem acesso a este projeto.' }, 403)
    const checks = await Promise.all(PROJECT_MODULES.map(async (module) => {
      const { data, error } = await client.rpc('user_has_project_module_access', { proj_id: projectId, module_key: module.key, usr_id: user.id })
      if (error) throw new ProjectAiAccessError('Não consegui conferir suas permissões. Tente novamente.', 503)
      return data === true ? module.key : null
    }))
    const allowed: AppModuleKey[] = ['home', ...checks.filter((key): key is NonNullable<typeof key> => key !== null)]
    const { data: profile, error: profileError } = await client.from('profiles').select('role,agency_role,agency_id,blocked_at,deleted_at').eq('id', user.id).maybeSingle()
    if (profileError) throw new ProjectAiAccessError('Não consegui conferir seu perfil.', 503)
    if (!profile || profile.blocked_at || profile.deleted_at) return json({ error: 'Seu acesso não está ativo. Fale com o administrador.' }, 403)
    if (profile?.role === 'admin' || profile?.agency_role === 'admin') allowed.push('equipe', 'candidaturas', 'monitoramento', 'configuracoes')
    release = acquireHelpSlot(user.id)
    if (!release) return json({ error: 'Vamos com calma 🙂 Aguarde um pouco antes de enviar outra pergunta. O limite é de 12 por minuto e 100 por dia.' }, 429)

    // Fixed, minimal, read-only query. No arbitrary SQL, tools or private answers sent to the model.
    let formState = 'Não consultado: a pergunta não solicitou formulário.'
    const links: Array<{ label: string; path: string }> = []
    const formQuestion = /formular|briefing.*cliente|link.*cliente/.test(normalizeHelpText(question + ' ' + history.map((item) => item.content).join(' ')))
    if (formQuestion && allowed.includes('formularios')) {
      const { data: forms, error } = await client.from('project_forms').select('title,public_token,active').eq('project_id', projectId).eq('kind', 'client_briefing').limit(5)
      formState = error ? 'Consulta indisponível; oriente conferir na tela Formulários.' : !forms?.length ? 'Ainda não há formulário visível para este usuário.' : 'Formulários encontrados: ' + JSON.stringify(forms.map((form) => ({ title: String(form.title).slice(0, 160), active: form.active })))
      if (!error) for (const form of forms ?? []) {
        if (form.active && typeof form.public_token === 'string' && /^[0-9a-f-]{36}$/i.test(form.public_token)) links.push({ label: String(form.title).slice(0, 160), path: `/formularios/${form.public_token}` })
      }
    } else if (formQuestion) formState = 'Sem permissão para Formulários; não consultado.'

    const sourcesFor = (ids: string[]) => HELP_ARTICLES.filter((article) => ids.includes(article.id)).slice(0, 3).map((article) => ({ id: article.id, title: article.title, module: article.module, canOpen: allowed.includes(article.module) }))
    try {
      const admin = createAdminClient()
      const settings = await loadProjectAiSettings(admin, projectId)
      const provider = settings?.active_provider ?? 'openai'
      const key = await getProjectAiSecret(admin, settings, provider)
      const output = await generateProjectAiText(provider, key, JSON.stringify({
        baseDeAjuda: HELP_ARTICLES,
        contexto: { projectName: String(project.name).slice(0, 160), allowedModules: allowed, currentModule: allowed.includes(body.currentModule as AppModuleKey) ? body.currentModule : 'home', formState, verifiedLinkCount: links.length },
        historicoNaoConfiavel: history, pergunta: question,
      }), HELP_SYSTEM_PROMPT)
      const result = parseJsonObject<{ answer?: unknown; articleIds?: unknown }>(output)
      if (typeof result.answer !== 'string' || !result.answer.trim() || result.answer.length > 8_000) throw new AiProviderError('Resposta inválida.')
      return json({ answer: result.answer, sources: sourcesFor(Array.isArray(result.articleIds) ? result.articleIds.filter((id): id is string => typeof id === 'string') : []), links, mode: 'ai', version: HELP_VERSION })
    } catch (error) {
      // Honest fallback: the guide remains useful, but is never presented as an AI answer.
      const articles = findHelpArticles(question)
      const notice = error instanceof AiProviderError && error.status === 409
        ? 'A IA deste projeto ainda não está configurada. Um administrador pode configurar OpenAI ou Claude no Banco de histórias. Enquanto isso, aqui está a ajuda do Clave.'
        : 'A IA não conseguiu responder agora. Você pode tentar novamente; enquanto isso, consulte a ajuda do Clave abaixo.'
      return json({ answer: articles.length ? articles.map((article) => `${article.title}\n${article.body}`).join('\n\n') : 'Ainda não encontrei um guia para essa dúvida. Diga o nome da tela e o que você está tentando fazer 🙂', notice, sources: sourcesFor(articles.map((article) => article.id)), links, mode: 'guide', version: HELP_VERSION })
    }
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return json({ error: 'Sua mensagem ficou grande demais. Envie uma dúvida mais curta.' }, 413)
    if (error instanceof SyntaxError) return json({ error: 'Mensagem inválida.' }, 400)
    if (error instanceof ProjectAiAccessError) return json({ error: error.message }, error.status)
    return json({ error: 'Não consegui abrir a ajuda agora. Tente novamente em instantes.' }, 500)
  } finally { release?.() }
}
