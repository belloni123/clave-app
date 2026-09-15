import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'

const isValidPassword = (candidate: string) => {
  const expected = process.env.PUBLIC_SPREADSHEETS_PASSWORD || 'agenciab16'
  const candidateBuffer = Buffer.from(candidate)
  const expectedBuffer = Buffer.from(expected)
  return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer)
}

const loadPortal = async (projectId: string) => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceRoleKey || !supabaseUrl) throw new Error('Configuração do servidor incompleta')
  const admin = createSupabaseClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const [{ data: project, error: projectError }, { data: record, error: recordError }] = await Promise.all([
    admin.from('projects').select('id,name').eq('id', projectId).is('deleted_at', null).maybeSingle(),
    admin.from('text_fields').select('value').eq('project_id', projectId).eq('key', 'financial-spreadsheets').maybeSingle(),
  ])
  if (projectError || recordError) throw projectError || recordError
  if (!project) return null
  let spreadsheets: Record<string, { url?: string; publicEditingConfirmed?: boolean }> = {}
  try { spreadsheets = record?.value ? JSON.parse(record.value) : {} } catch { spreadsheets = {} }
  spreadsheets = Object.fromEntries(Object.entries(spreadsheets).filter(([, sheet]) => sheet?.url && sheet.publicEditingConfirmed))
  return { projectName: project.name, spreadsheets }
}

const authenticatedUserHasAccess = async (projectId: string) => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase.from('projects').select('id').eq('id', projectId).maybeSingle()
  return !!data
}

export async function GET(_request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params
  if (!(await authenticatedUserHasAccess(projectId))) return NextResponse.json({ requiresPassword: true }, { status: 401 })
  const portal = await loadPortal(projectId)
  return portal ? NextResponse.json(portal) : NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
}

export async function POST(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params
  const body = await request.json().catch(() => ({}))
  if (!isValidPassword(String(body.password || ''))) return NextResponse.json({ error: 'Senha incorreta' }, { status: 401 })
  const portal = await loadPortal(projectId)
  return portal ? NextResponse.json(portal) : NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
}
