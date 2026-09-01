import 'server-only'

import { authorizeInstagramProject, InstagramAccessError } from '@/utils/instagram/access'
import { SocialPublishingError } from '@/utils/social/errors'

export async function authorizeSocialProject(
  projectId: string,
  options: { requireManager?: boolean } = {},
) {
  try {
    return await authorizeInstagramProject(projectId, {
      requireManager: options.requireManager,
    })
  } catch (error) {
    if (error instanceof InstagramAccessError) {
      throw new SocialPublishingError(
        error.message,
        error.status === 401 ? 'social_unauthenticated' : 'social_forbidden',
        'authorization',
        error.status,
      )
    }
    throw error
  }
}
