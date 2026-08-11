import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { getPublicAppOrigin } from '@/utils/http/public-app-origin'
import { buildStrategicSummary, getServiceType } from '@/utils/forms/client-briefing'
import { readJsonBody, RequestBodyTooLargeError } from '@/utils/http/read-json-body'
import {
  createResponseToken,
  createProjectFormRateLimitKey,
  getPublicForm,
  getSubmissionByToken,
  hashResponseToken,
  normalizeBriefingAnswers,
  syncBriefingToProject,
  validateBriefingForSubmission,
} from '@/utils/forms/client-briefing-server'

export const dynamic = 'force-dynamic'

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const admin = createAdminClient()

  try {
    const form = await getPublicForm(admin, token)
    if (!form || !form.active) return jsonError('Formulário não encontrado ou indisponível.', 404)
    const { data: project, error: projectError } = await admin
      .from('projects')
      .select('name, deleted_at')
      .eq('id', form.project_id)
      .maybeSingle()

    if (projectError) throw projectError
    if (!project || project.deleted_at) return jsonError('Este formulário não está mais disponível.', 404)

    const responseToken = request.nextUrl.searchParams.get('resposta') || ''
    const submission = responseToken
      ? await getSubmissionByToken(admin, form.id, responseToken)
      : null

    if (responseToken && !submission) {
      return jsonError('O link para continuar é inválido ou expirou.', 404)
    }

    const { data: attachments, error: attachmentsError } = submission
      ? await admin
          .from('project_form_attachments')
          .select('id, question_id, original_name, mime_type, size_bytes, created_at')
          .eq('submission_id', submission.id)
          .order('created_at', { ascending: true })
      : { data: [], error: null }

    if (attachmentsError) throw attachmentsError

    return NextResponse.json({
      form: {
        title: form.title,
        projectName: project.name,
        version: form.version,
      },
      response: {
        token: submission ? responseToken : null,
        status: submission?.status ?? null,
        answers: submission?.answers ?? {},
        currentStep: submission?.current_step ?? 0,
        attachments: attachments ?? [],
        submittedAt: submission?.submitted_at ?? null,
      },
    }, {
      headers: {
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    })
  } catch (error) {
    console.error('Public project form load failed', error)
    return jsonError('Não foi possível carregar o formulário agora.', 500)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  let body: {
    action?: unknown
    responseToken?: unknown
    answers?: unknown
    currentStep?: unknown
  }

  try {
    body = await readJsonBody(request, 300_000) as typeof body
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return jsonError('O formulário ultrapassou o limite permitido.', 413)
    }
    return jsonError('Corpo da requisição inválido.', 400)
  }

  const action = body.action === 'submit' ? 'submit' : 'save'
  const responseToken = typeof body.responseToken === 'string' ? body.responseToken : ''
  const currentStep = Number.isInteger(body.currentStep)
    ? Math.max(0, Math.min(Number(body.currentStep), 20))
    : 0

  let answers
  try {
    answers = normalizeBriefingAnswers(body.answers)
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Respostas inválidas.', 400)
  }

  const admin = createAdminClient()

  try {
    const form = await getPublicForm(admin, token)
    if (!form || !form.active) return jsonError('Formulário não encontrado ou indisponível.', 404)
    const origin = getPublicAppOrigin(request)

    let submission = responseToken
      ? await getSubmissionByToken(admin, form.id, responseToken)
      : null
    let activeResponseToken = responseToken

    if (responseToken && !submission) {
      return jsonError('O link para continuar é inválido ou expirou.', 404)
    }
    if (submission && !['draft', 'waiting'].includes(submission.status)) {
      return jsonError('Este briefing já foi enviado e não pode mais ser alterado.', 409)
    }

    const serviceType = getServiceType(answers)
    if (!submission) {
      const { data: allowed, error: rateError } = await admin.rpc(
        'consume_project_form_rate_limit',
        {
          rate_key: createProjectFormRateLimitKey(request, form.id),
          max_attempts: 20,
        },
      )
      if (rateError) throw rateError
      if (!allowed) {
        return jsonError('Muitas respostas foram iniciadas recentemente. Aguarde um pouco antes de tentar novamente.', 429)
      }

      activeResponseToken = createResponseToken()
      const { data: created, error: createError } = await admin
        .from('project_form_submissions')
        .insert({
          form_id: form.id,
          project_id: form.project_id,
          response_token_hash: hashResponseToken(activeResponseToken),
          answers,
          service_type: serviceType,
          current_step: currentStep,
        })
        .select('*')
        .single()

      if (createError) throw createError
      submission = created
    } else {
      const { data: updated, error: updateError } = await admin
        .from('project_form_submissions')
        .update({
          answers,
          service_type: serviceType,
          current_step: currentStep,
          last_saved_at: new Date().toISOString(),
        })
        .eq('id', submission.id)
        .select('*')
        .single()

      if (updateError) throw updateError
      submission = updated
    }

    if (action === 'submit') {
      const missing = validateBriefingForSubmission(answers)
      if (missing.length > 0) {
        return NextResponse.json({
          error: 'Revise os campos indicados antes de enviar.',
          missing,
          responseToken: activeResponseToken,
          resumeUrl: `${origin}/formularios/${token}?resposta=${encodeURIComponent(activeResponseToken)}`,
        }, { status: 422 })
      }

      let mapping = { mapped: [] as string[], skipped: [] as string[] }
      try {
        mapping = await syncBriefingToProject(admin, form.project_id, answers)
      } catch (mappingError) {
        console.error('Project briefing field sync failed', mappingError)
        mapping.skipped.push('O espelhamento automático falhou e precisa ser revisado pela equipe.')
      }

      const { error: submitError } = await admin
        .from('project_form_submissions')
        .update({
          status: 'received',
          strategic_summary: buildStrategicSummary(answers),
          mapped_fields: mapping.mapped,
          skipped_fields: mapping.skipped,
          submitted_at: new Date().toISOString(),
          last_saved_at: new Date().toISOString(),
        })
        .eq('id', submission.id)

      if (submitError) throw submitError
    }

    return NextResponse.json({
      ok: true,
      submitted: action === 'submit',
      responseToken: activeResponseToken,
      resumeUrl: `${origin}/formularios/${token}?resposta=${encodeURIComponent(activeResponseToken)}`,
    })
  } catch (error) {
    console.error('Public project form save failed', error)
    return jsonError('Não foi possível salvar o formulário agora.', 500)
  }
}
