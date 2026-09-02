import { NextRequest, NextResponse } from 'next/server'
import { authorizeSocialProject } from '@/utils/social/access'
import { requireSocialPublishingEnabled } from '@/utils/social/config'
import { publicSocialError, SocialPublishingError } from '@/utils/social/errors'
import { assertUuid } from '@/utils/social/validation'
import { createAdminClient } from '@/utils/supabase/admin'

export async function DELETE(request: NextRequest) {
  try {
    requireSocialPublishingEnabled()
    const body = await request.json().catch(() => ({})) as {
      projectId?: string
      storagePath?: string
    }
    const projectId = body.projectId?.trim() || ''
    const storagePath = body.storagePath?.trim() || ''
    await authorizeSocialProject(projectId, { requireManager: true })
    assertUuid(projectId, 'Projeto')
    if (!storagePath.startsWith(`${projectId}/`) || !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/.test(storagePath)) {
      throw new SocialPublishingError('Caminho de mídia inválido.', 'social_invalid_media_path', 'validation')
    }
    const admin = createAdminClient()
    const { data: referenced, error: referenceError } = await admin
      .from('social_post_media')
      .select('id')
      .eq('project_id', projectId)
      .eq('storage_path', storagePath)
      .maybeSingle()
    if (referenceError) throw referenceError
    if (referenced) {
      throw new SocialPublishingError(
        'A mídia ainda pertence a uma publicação.',
        'social_media_still_referenced',
        'validation',
        409,
      )
    }
    const { error } = await admin.storage.from('social-publishing').remove([storagePath])
    if (error) throw error
    return NextResponse.json({ removed: true })
  } catch (error) {
    const status = error instanceof SocialPublishingError ? error.status : 500
    return NextResponse.json(publicSocialError(error), { status })
  }
}
