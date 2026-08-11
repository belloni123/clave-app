import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import {
  getPublicForm,
  getSubmissionByToken,
} from '@/utils/forms/client-briefing-server'

const BUCKET = 'briefing-references'
const MAX_FILE_SIZE = 8 * 1024 * 1024
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

function hasExpectedImageSignature(bytes: Buffer, mimeType: string) {
  if (mimeType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  }
  if (mimeType === 'image/png') {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    return bytes.length >= png.length && png.every((value, index) => bytes[index] === value)
  }
  if (mimeType === 'image/webp') {
    return bytes.length >= 12
      && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
      && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  }
  return false
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > MAX_FILE_SIZE + 200_000) return jsonError('A imagem ultrapassa 8 MB.', 413)

  const { token } = await params
  const data = await request.formData()
  const responseToken = data.get('responseToken')
  const questionId = data.get('questionId')
  const file = data.get('file')

  if (typeof responseToken !== 'string' || questionId !== 'identity_reference_files') {
    return jsonError('Dados do anexo inválidos.', 400)
  }
  if (!(file instanceof File)) return jsonError('Selecione uma imagem válida.', 400)
  if (!ALLOWED_TYPES[file.type] || file.size <= 0 || file.size > MAX_FILE_SIZE) {
    return jsonError('Use uma imagem JPG, PNG ou WebP com no máximo 8 MB.', 400)
  }

  const admin = createAdminClient()
  try {
    const form = await getPublicForm(admin, token)
    if (!form || !form.active) return jsonError('Formulário indisponível.', 404)
    const submission = await getSubmissionByToken(admin, form.id, responseToken)
    if (!submission || !['draft', 'waiting'].includes(submission.status)) return jsonError('Resposta editável não encontrada.', 404)

    const { count, error: countError } = await admin
      .from('project_form_attachments')
      .select('id', { count: 'exact', head: true })
      .eq('submission_id', submission.id)
    if (countError) throw countError
    if ((count ?? 0) >= 5) return jsonError('Você já enviou o limite de 5 imagens.', 409)

    const extension = ALLOWED_TYPES[file.type]
    const storagePath = `${form.project_id}/${submission.id}/${randomUUID()}.${extension}`
    const bytes = Buffer.from(await file.arrayBuffer())
    if (!hasExpectedImageSignature(bytes, file.type)) {
      return jsonError('O conteúdo do arquivo não corresponde a uma imagem JPG, PNG ou WebP válida.', 400)
    }
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, bytes, { contentType: file.type, upsert: false })
    if (uploadError) throw uploadError

    const { data: attachment, error: insertError } = await admin
      .from('project_form_attachments')
      .insert({
        submission_id: submission.id,
        project_id: form.project_id,
        question_id: questionId,
        storage_path: storagePath,
        original_name: file.name.slice(0, 240),
        mime_type: file.type,
        size_bytes: file.size,
      })
      .select('id, question_id, original_name, mime_type, size_bytes, created_at')
      .single()

    if (insertError) {
      await admin.storage.from(BUCKET).remove([storagePath])
      throw insertError
    }
    return NextResponse.json({ attachment })
  } catch (error) {
    console.error('Briefing attachment upload failed', error)
    return jsonError('Não foi possível enviar a imagem agora.', 500)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  let body: { responseToken?: unknown; attachmentId?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonError('Corpo da requisição inválido.', 400)
  }

  if (typeof body.responseToken !== 'string' || typeof body.attachmentId !== 'string') {
    return jsonError('Dados do anexo inválidos.', 400)
  }

  const admin = createAdminClient()
  try {
    const form = await getPublicForm(admin, token)
    if (!form || !form.active) return jsonError('Formulário indisponível.', 404)
    const submission = await getSubmissionByToken(admin, form.id, body.responseToken)
    if (!submission || !['draft', 'waiting'].includes(submission.status)) return jsonError('Resposta editável não encontrada.', 404)

    const { data: attachment, error: readError } = await admin
      .from('project_form_attachments')
      .select('id, storage_path')
      .eq('id', body.attachmentId)
      .eq('submission_id', submission.id)
      .maybeSingle()
    if (readError) throw readError
    if (!attachment) return jsonError('Anexo não encontrado.', 404)

    const { error: storageError } = await admin.storage
      .from(BUCKET)
      .remove([attachment.storage_path])
    if (storageError) throw storageError

    const { error: deleteError } = await admin
      .from('project_form_attachments')
      .delete()
      .eq('id', attachment.id)
    if (deleteError) throw deleteError

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Briefing attachment removal failed', error)
    return jsonError('Não foi possível remover a imagem agora.', 500)
  }
}
