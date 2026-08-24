import 'server-only'

import type { createAdminClient } from '@/utils/supabase/admin'

export const AI_PROVIDERS = ['openai', 'anthropic'] as const
export type AiProvider = (typeof AI_PROVIDERS)[number]

type AdminClient = ReturnType<typeof createAdminClient>

export interface ProjectAiSettingsRow {
  project_id: string
  active_provider: AiProvider
  openai_secret_id: string | null
  openai_key_hint: string | null
  openai_verified_at: string | null
  anthropic_secret_id: string | null
  anthropic_key_hint: string | null
  anthropic_verified_at: string | null
  updated_at: string
}

interface OpenAiResponse {
  output_text?: unknown
  output?: Array<{
    content?: Array<{ type?: string; text?: unknown }>
  }>
}

interface AnthropicResponse {
  content?: Array<{ type?: string; text?: unknown }>
}

export class AiProviderError extends Error {
  status: number

  constructor(message: string, status = 502) {
    super(message)
    this.name = 'AiProviderError'
    this.status = status
  }
}

export function isAiProvider(value: unknown): value is AiProvider {
  return typeof value === 'string' && AI_PROVIDERS.includes(value as AiProvider)
}

export async function loadProjectAiSettings(
  admin: AdminClient,
  projectId: string,
): Promise<ProjectAiSettingsRow | null> {
  const { data, error } = await admin
    .from('project_ai_settings')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle()

  if (error) throw new Error('Não foi possível carregar a configuração de IA do projeto.')
  return data as ProjectAiSettingsRow | null
}

export async function getProjectAiSecret(
  admin: AdminClient,
  settings: ProjectAiSettingsRow | null,
  provider: AiProvider,
): Promise<string> {
  const secretId = provider === 'openai'
    ? settings?.openai_secret_id
    : settings?.anthropic_secret_id

  if (!secretId) {
    const label = provider === 'openai' ? 'OpenAI' : 'Claude'
    throw new AiProviderError(`Configure a chave ${label} deste projeto antes de continuar.`, 409)
  }

  const { data, error } = await admin.rpc('get_project_ai_secret', {
    p_secret_id: secretId,
  })

  if (error || typeof data !== 'string' || data.length < 8) {
    throw new Error('Não foi possível recuperar a chave de IA protegida.')
  }

  return data
}

function providerFailure(provider: AiProvider, status: number) {
  const label = provider === 'openai' ? 'OpenAI' : 'Claude'
  if (status === 401 || status === 403) {
    return new AiProviderError(`A chave ${label} foi recusada. Atualize a chave do projeto.`, 401)
  }
  if (status === 429) {
    return new AiProviderError(`O limite ou o saldo da ${label} foi atingido. Consulte a conta do provedor.`, 429)
  }
  return new AiProviderError(`A ${label} não conseguiu concluir a solicitação agora.`, 502)
}

export async function verifyProviderKey(provider: AiProvider, apiKey: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)

  try {
    const response = provider === 'openai'
      ? await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: controller.signal,
          cache: 'no-store',
        })
      : await fetch('https://api.anthropic.com/v1/models?limit=1', {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          signal: controller.signal,
          cache: 'no-store',
        })

    if (!response.ok) throw providerFailure(provider, response.status)
  } catch (error) {
    if (error instanceof AiProviderError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AiProviderError('O provedor demorou demais para validar a chave.', 504)
    }
    throw new AiProviderError('Não foi possível validar a chave com o provedor.', 502)
  } finally {
    clearTimeout(timeout)
  }
}

function readOpenAiText(data: OpenAiResponse): string {
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim()
  }

  return (data.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
    .map((item) => item.text as string)
    .join('\n')
    .trim()
}

function readAnthropicText(data: AnthropicResponse): string {
  return (data.content ?? [])
    .filter((item) => item.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text as string)
    .join('\n')
    .trim()
}

export async function generateProjectAiText(
  provider: AiProvider,
  apiKey: string,
  prompt: string,
): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 90_000)

  try {
    const response = provider === 'openai'
      ? await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-5.4-mini',
            input: prompt,
            max_output_tokens: 4_000,
          }),
          signal: controller.signal,
          cache: 'no-store',
        })
      : await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-5',
            max_tokens: 4_000,
            messages: [{ role: 'user', content: prompt }],
          }),
          signal: controller.signal,
          cache: 'no-store',
        })

    if (!response.ok) throw providerFailure(provider, response.status)
    const data = await response.json() as OpenAiResponse | AnthropicResponse
    const text = provider === 'openai'
      ? readOpenAiText(data as OpenAiResponse)
      : readAnthropicText(data as AnthropicResponse)

    if (!text) throw new AiProviderError('A IA não retornou conteúdo utilizável.', 502)
    return text
  } catch (error) {
    if (error instanceof AiProviderError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AiProviderError('A geração demorou demais. Tente novamente.', 504)
    }
    throw new AiProviderError('Não foi possível concluir a geração de conteúdo.', 502)
  } finally {
    clearTimeout(timeout)
  }
}

export function parseJsonObject<T>(value: string): T {
  const normalized = value
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  try {
    return JSON.parse(normalized) as T
  } catch {
    const start = normalized.indexOf('{')
    const end = normalized.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(normalized.slice(start, end + 1)) as T
    }
    throw new AiProviderError('A IA respondeu em um formato inesperado. Tente novamente.', 502)
  }
}
