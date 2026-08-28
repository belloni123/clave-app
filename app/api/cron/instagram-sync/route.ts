import { after, NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { syncInstagramConnection } from '@/utils/instagram/server'

export async function POST(request: NextRequest) {
  const configuredSecret = process.env.CRON_SECRET?.trim()
  const suppliedSecret = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!configuredSecret || suppliedSecret !== configuredSecret) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: connections, error } = await admin
    .from('instagram_connections')
    .select('id, status, updated_at')
    .in('status', ['connected', 'error', 'syncing'])
    .order('last_synced_at', { ascending: true, nullsFirst: true })
    .limit(20)
  if (error) return NextResponse.json({ error: 'Falha ao listar conexões.' }, { status: 500 })

  const eligibleConnections = (connections || [])
    .filter((connection) => (
      connection.status !== 'syncing'
      || Date.now() - new Date(connection.updated_at).getTime() >= 15 * 60 * 1_000
    ))
    .slice(0, 2)
  after(async () => {
    for (const connection of eligibleConnections) {
      try {
        await syncInstagramConnection(connection.id, 'cron')
      } catch (syncError) {
        console.error('Instagram cron sync failed', {
          connectionId: connection.id,
          message: syncError instanceof Error ? syncError.message : 'unknown',
        })
      }
    }
  })
  return NextResponse.json({
    ok: true,
    queued: eligibleConnections.length,
  }, { status: 202 })
}
