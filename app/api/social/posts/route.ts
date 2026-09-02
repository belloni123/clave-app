import { NextRequest, NextResponse } from 'next/server'
import type { SocialPostInput } from '@/types/social'
import { authorizeSocialProject } from '@/utils/social/access'
import { requireSocialPublishingEnabled } from '@/utils/social/config'
import { publicSocialError, SocialPublishingError } from '@/utils/social/errors'
import { addSocialMediaPreviews, createSocialPost, getSocialPosts } from '@/utils/social/posts'
import { runSocialPublisher } from '@/utils/social/scheduler'
import { createAdminClient } from '@/utils/supabase/admin'

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('projectId')?.trim() || ''
  try {
    requireSocialPublishingEnabled()
    await authorizeSocialProject(projectId, { requireManager: true })
    const admin = createAdminClient()
    const posts = await getSocialPosts(admin, projectId, {
      status: request.nextUrl.searchParams.get('status') || undefined,
      provider: request.nextUrl.searchParams.get('provider') || undefined,
      search: request.nextUrl.searchParams.get('search') || undefined,
    })
    return NextResponse.json({ posts: await addSocialMediaPreviews(admin, posts) })
  } catch (error) {
    const status = error instanceof SocialPublishingError ? error.status : 500
    return NextResponse.json(publicSocialError(error), { status })
  }
}

export async function POST(request: NextRequest) {
  try {
    requireSocialPublishingEnabled()
    const input = await request.json() as SocialPostInput
    const { user } = await authorizeSocialProject(input?.projectId || '', { requireManager: true })
    const admin = createAdminClient()
    let post = await createSocialPost(admin, user.id, input)
    const delivery = input.publishNow && !input.saveAsDraft
      ? await runSocialPublisher({ postId: post.id, limit: post.targets.length })
      : null
    if (delivery) {
      const [updatedPost] = await getSocialPosts(admin, input.projectId, { postId: post.id })
      if (updatedPost) post = updatedPost
    }
    return NextResponse.json({ post, delivery }, { status: 201 })
  } catch (error) {
    const status = error instanceof SocialPublishingError ? error.status : 500
    return NextResponse.json(publicSocialError(error), { status })
  }
}
