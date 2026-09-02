import { NextRequest, NextResponse } from 'next/server'
import type { SocialPostInput } from '@/types/social'
import { authorizeSocialProject } from '@/utils/social/access'
import { requireSocialPublishingEnabled } from '@/utils/social/config'
import { publicSocialError, SocialPublishingError } from '@/utils/social/errors'
import {
  cancelSocialPost,
  addSocialMediaPreviews,
  getSocialPosts,
  updateSocialPost,
} from '@/utils/social/posts'
import { assertUuid } from '@/utils/social/validation'
import { runSocialPublisher } from '@/utils/social/scheduler'
import { createAdminClient } from '@/utils/supabase/admin'

interface Context { params: Promise<{ postId: string }> }

export async function GET(request: NextRequest, context: Context) {
  const projectId = request.nextUrl.searchParams.get('projectId')?.trim() || ''
  try {
    requireSocialPublishingEnabled()
    await authorizeSocialProject(projectId, { requireManager: true })
    const { postId } = await context.params
    assertUuid(postId, 'Publicação')
    const admin = createAdminClient()
    const [post] = await getSocialPosts(admin, projectId, { postId })
    if (!post) throw new SocialPublishingError('Publicação não encontrada.', 'social_post_not_found', 'validation', 404)
    const [withPreview] = await addSocialMediaPreviews(admin, [post])
    return NextResponse.json({ post: withPreview })
  } catch (error) {
    const status = error instanceof SocialPublishingError ? error.status : 500
    return NextResponse.json(publicSocialError(error), { status })
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    requireSocialPublishingEnabled()
    const input = await request.json() as SocialPostInput
    await authorizeSocialProject(input?.projectId || '', { requireManager: true })
    const { postId } = await context.params
    assertUuid(postId, 'Publicação')
    const admin = createAdminClient()
    let post = await updateSocialPost(admin, postId, input)
    const delivery = input.publishNow && !input.saveAsDraft
      ? await runSocialPublisher({ postId, limit: post.targets.length })
      : null
    if (delivery) {
      const [updatedPost] = await getSocialPosts(admin, input.projectId, { postId })
      if (updatedPost) post = updatedPost
    }
    return NextResponse.json({ post, delivery })
  } catch (error) {
    const status = error instanceof SocialPublishingError ? error.status : 500
    return NextResponse.json(publicSocialError(error), { status })
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const projectId = request.nextUrl.searchParams.get('projectId')?.trim() || ''
  try {
    requireSocialPublishingEnabled()
    await authorizeSocialProject(projectId, { requireManager: true })
    const { postId } = await context.params
    assertUuid(postId, 'Publicação')
    return NextResponse.json({
      post: await cancelSocialPost(createAdminClient(), projectId, postId),
    })
  } catch (error) {
    const status = error instanceof SocialPublishingError ? error.status : 500
    return NextResponse.json(publicSocialError(error), { status })
  }
}
