import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'

const validPassword = (candidate: string) => {
  const expected = process.env.PUBLIC_PLANNING_PASSWORD || 'agenciab16'
  const a = Buffer.from(candidate), b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
const admin = () => createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
const load = async (projectId: string) => {
  const db = admin()
  const [{ data: project }, { data: row }] = await Promise.all([
    db.from('projects').select('id,name').eq('id', projectId).is('deleted_at', null).maybeSingle(),
    db.from('text_fields').select('value').eq('project_id', projectId).eq('key', 'native-financial-planning').maybeSingle(),
  ])
  if (!project) return null
  let planning = null
  try { planning = row?.value ? JSON.parse(row.value) : null } catch { planning = null }
  return { projectName: project.name, planning }
}
const authorizedMember = async (projectId: string) => {
  const db = await createClient(); const { data: { user } } = await db.auth.getUser()
  if (!user) return false
  const { data } = await db.from('projects').select('id').eq('id', projectId).maybeSingle()
  return !!data
}
const hasAccess = async (request: NextRequest, projectId: string) => (await authorizedMember(projectId)) || validPassword(request.headers.get('x-planning-password') || '')

export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  if (!(await hasAccess(request, projectId))) return NextResponse.json({ requiresPassword: true }, { status: 401 })
  const result = await load(projectId)
  return result ? NextResponse.json(result) : NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
}
export async function PUT(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  if (!(await hasAccess(request, projectId))) return NextResponse.json({ error: 'Senha incorreta' }, { status: 401 })
  const body = await request.json().catch(() => null)
  if (!body || JSON.stringify(body).length > 100000) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  const db = admin()
  const { error } = await db.from('text_fields').upsert({ project_id: projectId, key: 'native-financial-planning', value: JSON.stringify(body) }, { onConflict: 'project_id,key' })
  return error ? NextResponse.json({ error: 'Não foi possível salvar' }, { status: 500 }) : NextResponse.json({ ok: true })
}
