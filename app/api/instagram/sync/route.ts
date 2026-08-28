import { NextRequest, NextResponse } from 'next/server'
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
      .select('id, status')
      .eq('project_id', projectId)
      .maybeSingle()
    if (error) throw error
    if (!connection) return NextResponse.json({ error: 'Conecte uma conta primeiro.' }, { status: 404 })
    if (connection.status === 'syncing') {
      return NextResponse.json({ error: 'A conta já está sendo sincronizada.' }, { status: 409 })
    }

    const result = await syncInstagramConnection(connection.id, 'manual')
    const response: InstagramSyncResponse = { ok: true, ...result }
    return NextResponse.json(response)
  } catch (error) {
    const status = error instanceof InstagramAccessError ? error.status : 500
    const message = error instanceof Error ? error.message : 'Não foi possível sincronizar.'
    return NextResponse.json({ error: message }, { status })
  }
}
