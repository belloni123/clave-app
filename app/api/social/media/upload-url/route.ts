import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { authorizeSocialProject } from '@/utils/social/access'
import { requireSocialPublishingEnabled } from '@/utils/social/config'
import { publicSocialError, SocialPublishingError } from '@/utils/social/errors'
import { assertUuid } from '@/utils/social/validation'
import { maxSocialUploadBytes } from '@/utils/social/capabilities'
import { createAdminClient } from '@/utils/supabase/admin'

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
}

export async function POST(request: NextRequest) {
  try {
    requireSocialPublishingEnabled()
    const body = await request.json().catch(() => ({})) as {
      projectId?: string
      uploadId?: string
      mimeType?: string
      fileSize?: number
    }
    const projectId = body.projectId?.trim() || ''
    const uploadId = body.uploadId?.trim() || ''
    await authorizeSocialProject(projectId, { requireManager: true })
    assertUuid(projectId, 'Projeto')
    assertUuid(uploadId, 'Upload')
    const extension = MIME_EXTENSIONS[body.mimeType || '']
    if (!extension) {
      throw new SocialPublishingError('Formato de arquivo não permitido.', 'social_upload_type_unsupported', 'validation')
    }
    const fileSize = Number(body.fileSize)
    if (!Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > maxSocialUploadBytes(body.mimeType || '')) {
      throw new SocialPublishingError('O arquivo excede o tamanho permitido.', 'social_upload_size_invalid', 'validation')
    }
    const path = `${projectId}/${uploadId}/${randomUUID()}.${extension}`
    const admin = createAdminClient()
    const { data, error } = await admin.storage
      .from('social-publishing')
      .createSignedUploadUrl(path, { upsert: false })
    if (error || !data) throw error || new Error('Signed upload could not be created')
    return NextResponse.json({
      path,
      token: data.token,
      signedUrl: data.signedUrl,
    })
  } catch (error) {
    const status = error instanceof SocialPublishingError ? error.status : 500
    return NextResponse.json(publicSocialError(error), { status })
  }
}
