import { NextRequest, NextResponse } from 'next/server'
import {
  AiProviderError,
  isAiProvider,
  loadProjectAiSettings,
  verifyProviderKey,
} from '@/utils/ai/project-ai'
import {
  authorizeProjectAi,
  parseProjectId,
  ProjectAiAccessError,
} from '@/utils/ai/project-ai-auth'
import { readJsonBody, RequestBodyTooLargeError } from '@/utils/http/read-json-body'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface SettingsBody {
  projectId?: unknown
  operation?: unknown
  provider?: unknown
  apiKey?: unknown
}

function errorResponse(error: unknown) {
  if (error instanceof RequestBodyTooLargeError) {
    return NextResponse.json({ error: 'A solicitação ficou grande demais.' }, { status: 413 })
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: 'A solicitação é inválida.' }, { status: 400 })
  }
  if (error instanceof ProjectAiAccessError || error instanceof AiProviderError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  return NextResponse.json({ error: 'Não foi possível atualizar a IA do projeto.' }, { status: 500 })
}

function serializeSettings(
  row: Awaited<ReturnType<typeof loadProjectAiSettings>>,
  canManage: boolean,
) {
  return {
    activeProvider: row?.active_provider ?? 'openai',
    openai: {
      configured: Boolean(row?.openai_secret_id),
      hint: row?.openai_key_hint ?? null,
      verifiedAt: row?.openai_verified_at ?? null,
    },
    anthropic: {
      configured: Boolean(row?.anthropic_secret_id),
      hint: row?.anthropic_key_hint ?? null,
      verifiedAt: row?.anthropic_verified_at ?? null,
    },
    canManage,
    updatedAt: row?.updated_at ?? null,
  }
}

export async function GET(request: NextRequest) {
  try {
    const projectId = parseProjectId(request.nextUrl.searchParams.get('projectId'))
    const authorized = await authorizeProjectAi(projectId)
    const settings = await loadProjectAiSettings(authorized.admin, projectId)
    return NextResponse.json(serializeSettings(settings, authorized.canManage), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request, 8_000) as SettingsBody
    const projectId = parseProjectId(body.projectId)
    const provider = body.provider
    const operation = typeof body.operation === 'string' ? body.operation : ''

    if (!isAiProvider(provider)) {
      return NextResponse.json({ error: 'Provedor de IA inválido.' }, { status: 400 })
    }

    const authorized = await authorizeProjectAi(projectId, true)
    const current = await loadProjectAiSettings(authorized.admin, projectId)

    if (operation === 'save_key') {
      const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
      if (apiKey.length < 20 || apiKey.length > 500) {
        return NextResponse.json({ error: 'Informe uma chave de API válida.' }, { status: 400 })
      }

      await verifyProviderKey(provider, apiKey)
      const { error: saveError } = await authorized.admin.rpc(
        'configure_project_ai_provider',
        {
          p_project_id: projectId,
          p_provider: provider,
          p_secret_value: apiKey,
          p_updated_by: authorized.user.id,
        },
      )
      if (saveError) throw new Error('AI settings save failed')
    } else if (operation === 'select_provider') {
      const isConfigured = provider === 'openai'
        ? Boolean(current?.openai_secret_id)
        : Boolean(current?.anthropic_secret_id)
      if (!isConfigured) {
        return NextResponse.json({ error: 'Cadastre a chave antes de selecionar este provedor.' }, { status: 409 })
      }

      const { error: selectError } = await authorized.admin
        .from('project_ai_settings')
        .update({ active_provider: provider, updated_by: authorized.user.id })
        .eq('project_id', projectId)
      if (selectError) throw new Error('AI provider selection failed')
    } else if (operation === 'delete_key') {
      const { error: deleteError } = await authorized.admin.rpc(
        'remove_project_ai_provider',
        {
          p_project_id: projectId,
          p_provider: provider,
          p_updated_by: authorized.user.id,
        },
      )
      if (deleteError) throw new Error('AI key delete failed')
    } else {
      return NextResponse.json({ error: 'Operação inválida.' }, { status: 400 })
    }

    const saved = await loadProjectAiSettings(authorized.admin, projectId)
    return NextResponse.json({
      ok: true,
      settings: serializeSettings(saved, authorized.canManage),
    })
  } catch (error) {
    return errorResponse(error)
  }
}
