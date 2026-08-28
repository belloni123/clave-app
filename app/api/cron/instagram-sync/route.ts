import { NextRequest, NextResponse } from 'next/server'
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
    .select('id')
    .in('status', ['connected', 'error'])
    .order('last_synced_at', { ascending: true, nullsFirst: true })
    .limit(5)
  if (error) return NextResponse.json({ error: 'Falha ao listar conexões.' }, { status: 500 })

  const results = await Promise.allSettled(
    (connections || []).map((connection) => syncInstagramConnection(connection.id, 'cron')),
  )
  const succeeded = results.filter((result) => result.status === 'fulfilled').length
  return NextResponse.json({
    ok: true,
    attempted: results.length,
    succeeded,
    failed: results.length - succeeded,
  })
}
