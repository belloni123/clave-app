'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, KeyRound, Save, ShieldCheck, Trash2 } from 'lucide-react'
import type { AiProvider } from '@/utils/ai/project-ai'

interface ProviderStatus {
  configured: boolean
  hint: string | null
  verifiedAt: string | null
}

export interface ProjectAiSettingsData {
  activeProvider: AiProvider
  openai: ProviderStatus
  anthropic: ProviderStatus
  canManage: boolean
  updatedAt: string | null
}

interface ProjectAiSettingsProps {
  projectId: string
  showToast: (message: string, type?: 'info' | 'err') => void
}

async function readResponse<T>(response: Response) {
  const data = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar a IA do projeto.')
  return data
}

export function useProjectAiSettings(projectId: string | null) {
  return useQuery({
    queryKey: ['project-ai-settings', projectId],
    queryFn: async () => {
      const response = await fetch(`/api/ai/settings?projectId=${encodeURIComponent(projectId!)}`, {
        cache: 'no-store',
      })
      return readResponse<ProjectAiSettingsData>(response)
    },
    enabled: Boolean(projectId),
    staleTime: 30_000,
  })
}

export default function ProjectAiSettings({ projectId, showToast }: ProjectAiSettingsProps) {
  const queryClient = useQueryClient()
  const settingsQuery = useProjectAiSettings(projectId)
  const settings = settingsQuery.data
  const [selectedProviderOverride, setSelectedProvider] = useState<AiProvider | null>(null)
  const [openaiKey, setOpenaiKey] = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')

  const mutation = useMutation({
    mutationFn: async (payload: {
      operation: 'save_key' | 'select_provider' | 'delete_key'
      provider: AiProvider
      apiKey?: string
    }) => {
      const response = await fetch('/api/ai/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, ...payload }),
      })
      return readResponse<{ settings?: ProjectAiSettingsData }>(response)
    },
    onSuccess: (data, variables) => {
      if (data.settings) {
        queryClient.setQueryData(['project-ai-settings', projectId], data.settings)
      } else {
        queryClient.invalidateQueries({ queryKey: ['project-ai-settings', projectId] })
      }
      setOpenaiKey('')
      setAnthropicKey('')
      const message = variables.operation === 'delete_key'
        ? 'Chave removida do projeto.'
        : variables.operation === 'select_provider'
          ? 'Provedor de conteúdo atualizado.'
          : 'Chave validada e protegida no projeto.'
      showToast(message)
    },
    onError: (error: Error) => showToast(error.message, 'err'),
  })

  if (settingsQuery.isLoading) {
    return <div className="h-20 animate-pulse rounded bg-surface2" />
  }
  if (!settings) {
    return (
      <div className="text-[11px] text-red-t">
        Não foi possível carregar a configuração de IA deste projeto.
      </div>
    )
  }

  const selectedProvider = selectedProviderOverride ?? settings.activeProvider
  const provider = settings[selectedProvider]
  const apiKey = selectedProvider === 'openai' ? openaiKey : anthropicKey
  const setApiKey = selectedProvider === 'openai' ? setOpenaiKey : setAnthropicKey
  const providerName = selectedProvider === 'openai' ? 'OpenAI' : 'Claude'

  return (
    <section className="space-y-3 border-b border-border-custom pb-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-green-t" />
          <div>
            <h5 className="text-[11px] font-bold text-text-custom">IA deste projeto</h5>
            <p className="text-[9px] text-text3">Chaves protegidas e consumo separado.</p>
          </div>
        </div>
        <span className="text-[9px] font-semibold text-text2">
          Conteúdo: {settings.activeProvider === 'openai' ? 'OpenAI' : 'Claude'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded border border-border-custom bg-surface2 p-1">
        {(['openai', 'anthropic'] as const).map((item) => {
          const configured = settings[item].configured
          return (
            <button
              key={item}
              type="button"
              onClick={() => setSelectedProvider(item)}
              className={`flex min-h-8 items-center justify-center gap-1.5 rounded px-2 text-[10px] font-semibold transition-colors ${
                selectedProvider === item
                  ? 'bg-surface text-text-custom shadow-sm'
                  : 'text-text2 hover:text-text-custom'
              }`}
            >
              {configured ? <CheckCircle2 className="h-3 w-3 text-green-t" /> : <KeyRound className="h-3 w-3" />}
              <span>{item === 'openai' ? 'OpenAI' : 'Claude'}</span>
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-between gap-3 text-[10px]">
        <span className={provider.configured ? 'text-green-t' : 'text-text3'}>
          {provider.configured ? `Configurada •••• ${provider.hint}` : 'Chave não cadastrada'}
        </span>
        {provider.configured && settings.activeProvider !== selectedProvider && settings.canManage && (
          <button
            type="button"
            onClick={() => mutation.mutate({ operation: 'select_provider', provider: selectedProvider })}
            disabled={mutation.isPending}
            className="font-semibold text-blue-t hover:underline disabled:opacity-50"
          >
            Usar no conteúdo
          </button>
        )}
      </div>

      {settings.canManage ? (
        <div className="space-y-2">
          <label className="sr-only" htmlFor={`api-key-${selectedProvider}`}>
            Chave de API {providerName}
          </label>
          <div className="flex gap-2">
            <input
              id={`api-key-${selectedProvider}`}
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={provider.configured ? `Substituir chave ${providerName}` : `Cole a chave ${providerName}`}
              className="min-w-0 flex-1 rounded border border-border2 bg-surface px-3 py-2 text-[10px] text-text-custom outline-none focus:border-text-custom"
            />
            <button
              type="button"
              onClick={() => mutation.mutate({
                operation: 'save_key',
                provider: selectedProvider,
                apiKey,
              })}
              disabled={mutation.isPending || apiKey.trim().length < 20}
              title="Validar e salvar chave"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-text-custom text-surface disabled:opacity-40"
            >
              <Save className="h-3.5 w-3.5" />
            </button>
            {provider.configured && (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Remover a chave ${providerName} deste projeto?`)) {
                    mutation.mutate({ operation: 'delete_key', provider: selectedProvider })
                  }
                }}
                disabled={mutation.isPending}
                title="Remover chave"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-red-t/30 text-red-t hover:bg-red-bg disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      ) : (
        <p className="text-[9px] text-text3">Somente administradores do projeto alteram as chaves.</p>
      )}
    </section>
  )
}
