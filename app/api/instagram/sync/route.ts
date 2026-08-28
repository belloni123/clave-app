import { after, NextRequest, NextResponse } from 'next/server'
import { authorizeInstagramProject, InstagramAccessError } from '@/utils/instagram/access'
import { syncInstagramConnection } from '@/utils/instagram/server'
import { createAdminClient } from '@/utils/supabase/admin'
import type { InstagramSyncResponse } from '@/types/instagram'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as { projectId?: string }
    const projectId = body.projectId?.trim() || ''
    await authorizeInstagramProject(projectId)
    const admin = createAdminClient()
    const { data: connection, error } = await admin
      .from('instagram_connections')
      .select('id, status, updated_at')
      .eq('project_id', projectId)
      .maybeSingle()
    if (error) throw error
    if (!connection) return NextResponse.json({ error: 'Conecte uma conta primeiro.' }, { status: 404 })
    const syncingIsRecent = connection.status === 'syncing'
      && Date.now() - new Date(connection.updated_at).getTime() < 15 * 60 * 1_000
    if (syncingIsRecent) {
      return NextResponse.json({ error: 'A conta já está sendo sincronizada.' }, { status: 409 })
    }

    after(async () => {
      try {
        await syncInstagramConnection(connection.id, 'manual')
      } catch (syncError) {
        console.error('Instagram manual sync failed', {
          connectionId: connection.id,
          message: syncError instanceof Error ? syncError.message : 'unknown',
        })
      }
    })
    const response: InstagramSyncResponse = { ok: true, queued: true }
    return NextResponse.json(response, { status: 202 })
  } catch (error) {
    const status = error instanceof InstagramAccessError ? error.status : 500
    const message = error instanceof Error ? error.message : 'Não foi possível sincronizar.'
    return NextResponse.json({ error: message }, { status })
  }
}
