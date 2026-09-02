import { NextRequest, NextResponse } from 'next/server'
import { authorizeSocialProject } from '@/utils/social/access'
import { discoverSocialAccounts } from '@/utils/social/accounts'
import { requireSocialPublishingEnabled } from '@/utils/social/config'
import { publicSocialError, SocialPublishingError } from '@/utils/social/errors'

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('projectId')?.trim() || ''
  try {
    requireSocialPublishingEnabled()
    await authorizeSocialProject(projectId, { requireManager: true })
    return NextResponse.json(await discoverSocialAccounts(projectId))
  } catch (error) {
    const status = error instanceof SocialPublishingError
      ? error.status
      : error instanceof Error && 'status' in error && typeof error.status === 'number'
        ? error.status
        : 500
    return NextResponse.json(publicSocialError(error), { status })
  }
}
