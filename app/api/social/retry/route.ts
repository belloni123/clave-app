import { NextRequest, NextResponse } from 'next/server'
import { authorizeSocialProject } from '@/utils/social/access'
import { requireSocialPublishingEnabled } from '@/utils/social/config'
import { publicSocialError, SocialPublishingError } from '@/utils/social/errors'
import { retrySocialTarget } from '@/utils/social/posts'
import { runSocialPublisher } from '@/utils/social/scheduler'
import { assertUuid } from '@/utils/social/validation'
import { createAdminClient } from '@/utils/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    requireSocialPublishingEnabled()
    const body = await request.json().catch(() => ({})) as { projectId?: string; targetId?: string }
    const projectId = body.projectId?.trim() || ''
    const targetId = body.targetId?.trim() || ''
    await authorizeSocialProject(projectId, { requireManager: true })
    assertUuid(targetId, 'Destino')
    const postId = await retrySocialTarget(createAdminClient(), projectId, targetId)
    return NextResponse.json(await runSocialPublisher({ postId, limit: 1 }))
  } catch (error) {
    const status = error instanceof SocialPublishingError ? error.status : 500
    return NextResponse.json(publicSocialError(error), { status })
  }
}
