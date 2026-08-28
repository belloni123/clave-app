import { NextRequest, NextResponse } from 'next/server'
import { authorizeInstagramProject, InstagramAccessError } from '@/utils/instagram/access'
import { createAdminClient } from '@/utils/supabase/admin'

export async function DELETE(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('projectId')?.trim() || ''
  try {
    await authorizeInstagramProject(projectId, { requireManager: true })
    const admin = createAdminClient()
    const { data: connection, error: loadError } = await admin
      .from('instagram_connections')
      .select('id, token_secret_id')
      .eq('project_id', projectId)
      .maybeSingle()
    if (loadError) throw loadError
    if (!connection) return NextResponse.json({ ok: true })

    const { error: deleteError } = await admin
      .from('instagram_connections')
      .delete()
      .eq('id', connection.id)
    if (deleteError) throw deleteError

    if (connection.token_secret_id) {
      const { error } = await admin.rpc('delete_instagram_token', {
        p_secret_id: connection.token_secret_id,
      })
      if (error) console.error('Instagram Vault secret cleanup failed', error.message)
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    const status = error instanceof InstagramAccessError ? error.status : 500
    const message = error instanceof Error ? error.message : 'Não foi possível desconectar a conta.'
    return NextResponse.json({ error: message }, { status })
  }
}
