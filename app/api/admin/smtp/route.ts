import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const runtime = 'nodejs'

const SMTP_EDITOR_EMAILS = new Set([
  'felipe@agenciab16.com.br',
  'contato@agenciab16.com.br',
])

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const HOST_PATTERN = /^[a-zA-Z0-9.-]+$/

interface SmtpSettingsRow {
  id: boolean
  domain: string | null
  support_whatsapp: string | null
  tutorial_url: string | null
  smtp_host: string
  smtp_port: number
  smtp_security: 'ssl' | 'starttls'
  smtp_user: string | null
  smtp_sender_name: string
  smtp_sender_email: string | null
  smtp_password_secret_id: string | null
  auth_configured_at: string | null
  last_tested_at: string | null
  last_test_status: boolean | null
  last_test_error: string | null
  updated_by: string | null
  updated_at: string
}

interface ProfileRow {
  role: string | null
  agency_role: string | null
}

interface SmtpPayload {
  operation?: unknown
  domain?: unknown
  supportWhatsapp?: unknown
  tutorialUrl?: unknown
  smtpHost?: unknown
  smtpPort?: unknown
  smtpSecurity?: unknown
  smtpUser?: unknown
  smtpPassword?: unknown
  smtpSenderName?: unknown
  smtpSenderEmail?: unknown
}

interface SmtpConfig {
  domain: string
  supportWhatsapp: string
  tutorialUrl: string
  smtpHost: string
  smtpPort: 465 | 587
  smtpSecurity: 'ssl' | 'starttls'
  smtpUser: string
  smtpPassword?: string
  smtpSenderName: string
  smtpSenderEmail: string
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

function isSystemAdmin(profile: ProfileRow | null): boolean {
  return profile?.role === 'admin' || profile?.agency_role === 'admin'
}

function isAllowedEditor(email: string | null | undefined): boolean {
  return Boolean(email && SMTP_EDITOR_EMAILS.has(email.trim().toLowerCase()))
}

function toNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function rowToConfig(row: SmtpSettingsRow | null): SmtpConfig {
  return {
    domain: row?.domain ?? '',
    supportWhatsapp: row?.support_whatsapp ?? '',
    tutorialUrl: row?.tutorial_url ?? '',
    smtpHost: row?.smtp_host ?? 'smtp.gmail.com',
    smtpPort: row?.smtp_port === 587 ? 587 : 465,
    smtpSecurity: row?.smtp_security === 'starttls' ? 'starttls' : 'ssl',
    smtpUser: row?.smtp_user ?? '',
    smtpSenderName: row?.smtp_sender_name ?? 'Clave',
    smtpSenderEmail: row?.smtp_sender_email ?? '',
  }
}

function parseUrl(value: unknown, label: string, optional = true): string {
  const normalized = toNullableString(value) ?? ''
  if (optional && normalized.length === 0) return ''
  if (normalized.length > 500) throw new Error(`${label} muito longo.`)

  try {
    const url = new URL(normalized)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('protocol')
    }
  } catch {
    throw new Error(`${label} deve ser uma URL http(s) válida.`)
  }

  return normalized
}

function parseConfig(body: SmtpPayload, fallback: SmtpConfig): SmtpConfig {
  const domain = body.domain === undefined
    ? fallback.domain
    : parseUrl(body.domain, 'O domínio')
  const supportWhatsapp = body.supportWhatsapp === undefined
    ? fallback.supportWhatsapp
    : toNullableString(body.supportWhatsapp) ?? ''
  const tutorialUrl = body.tutorialUrl === undefined
    ? fallback.tutorialUrl
    : parseUrl(body.tutorialUrl, 'O tutorial')
  const smtpHost = body.smtpHost === undefined
    ? fallback.smtpHost
    : toNullableString(body.smtpHost) ?? ''
  const smtpUser = body.smtpUser === undefined
    ? fallback.smtpUser
    : toNullableString(body.smtpUser) ?? ''
  const smtpSenderName = body.smtpSenderName === undefined
    ? fallback.smtpSenderName
    : toNullableString(body.smtpSenderName) ?? ''
  const smtpSenderEmail = body.smtpSenderEmail === undefined
    ? fallback.smtpSenderEmail
    : toNullableString(body.smtpSenderEmail) ?? ''
  const smtpSecurity = body.smtpSecurity === undefined
    ? fallback.smtpSecurity
    : body.smtpSecurity
  const rawPort = body.smtpPort === undefined ? fallback.smtpPort : body.smtpPort
  const smtpPort = typeof rawPort === 'number'
    ? rawPort
    : typeof rawPort === 'string' && rawPort.trim().length > 0
      ? Number(rawPort)
      : NaN

  if (!smtpHost || smtpHost.length > 253 || !HOST_PATTERN.test(smtpHost)) {
    throw new Error('Informe um servidor SMTP válido.')
  }
  if (smtpPort !== 465 && smtpPort !== 587) {
    throw new Error('A porta SMTP deve ser 465 (SSL) ou 587 (STARTTLS).')
  }
  if (smtpSecurity !== 'ssl' && smtpSecurity !== 'starttls') {
    throw new Error('Escolha SSL ou STARTTLS para a segurança SMTP.')
  }
  if (!smtpUser || smtpUser.length > 254) {
    throw new Error('Informe o usuário SMTP.')
  }
  if (!smtpSenderName || smtpSenderName.length > 120) {
    throw new Error('Informe um nome de remetente de até 120 caracteres.')
  }
  if (!EMAIL_PATTERN.test(smtpSenderEmail) || smtpSenderEmail.length > 254) {
    throw new Error('Informe um e-mail de remetente válido.')
  }
  if (supportWhatsapp.length > 40) {
    throw new Error('O contato de suporte é muito longo.')
  }

  let smtpPassword: string | undefined
  if (body.smtpPassword !== undefined) {
    if (typeof body.smtpPassword !== 'string' || body.smtpPassword.length > 512) {
      throw new Error('A senha SMTP é inválida.')
    }
    smtpPassword = body.smtpPassword
  }

  return {
    domain,
    supportWhatsapp,
    tutorialUrl,
    smtpHost,
    smtpPort: smtpPort as 465 | 587,
    smtpSecurity,
    smtpUser,
    smtpPassword,
    smtpSenderName,
    smtpSenderEmail,
  }
}

function serializeSettings(
  row: SmtpSettingsRow,
  canEdit: boolean,
  managementApiConfigured: boolean,
) {
  return {
    domain: row.domain ?? '',
    supportWhatsapp: row.support_whatsapp ?? '',
    tutorialUrl: row.tutorial_url ?? '',
    smtpHost: row.smtp_host,
    smtpPort: row.smtp_port,
    smtpSecurity: row.smtp_security,
    smtpUser: row.smtp_user ?? '',
    smtpSenderName: row.smtp_sender_name,
    smtpSenderEmail: row.smtp_sender_email ?? '',
    hasPassword: Boolean(row.smtp_password_secret_id),
    authConfiguredAt: row.auth_configured_at,
    lastTestedAt: row.last_tested_at,
    lastTestStatus: row.last_test_status,
    lastTestError: row.last_test_error,
    canEdit,
    managementApiConfigured,
  }
}

function projectRefFromEnvironment(): string | null {
  const explicit = process.env.SUPABASE_PROJECT_REF?.trim()
  if (explicit) return explicit

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) return null

  try {
    const hostname = new URL(supabaseUrl).hostname
    const ref = hostname.split('.')[0]
    return ref || null
  } catch {
    return null
  }
}

async function syncSupabaseAuth(config: SmtpConfig, password: string) {
  const accessToken = process.env.SUPABASE_MANAGEMENT_ACCESS_TOKEN?.trim()
  const projectRef = projectRefFromEnvironment()

  if (!accessToken || !projectRef) {
    throw new Error(
      'Configure SUPABASE_MANAGEMENT_ACCESS_TOKEN no Coolify antes de sincronizar o SMTP do Supabase Auth. Não envie esse token pelo chat.',
    )
  }

  const response = await fetch(
    `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/config/auth`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        external_email_enabled: true,
        smtp_admin_email: config.smtpSenderEmail,
        smtp_host: config.smtpHost,
        smtp_port: config.smtpPort,
        smtp_user: config.smtpUser,
        smtp_pass: password,
        smtp_sender_name: config.smtpSenderName,
      }),
      cache: 'no-store',
    },
  )

  if (!response.ok) {
    throw new Error(
      `O Supabase Auth recusou a configuração SMTP (HTTP ${response.status}).`,
    )
  }
}

function smtpFailureMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error
    ? (error as { code?: unknown }).code
    : null
  if (typeof code === 'string' && code.length > 0 && code.length < 30) {
    return `Falha ao testar o SMTP (${code}). Verifique servidor, porta, usuário e senha.`
  }
  return 'Falha ao testar o SMTP. Verifique servidor, porta, segurança, usuário e senha.'
}

async function getAuthorizedActor() {
  const supabase = await createClient()
  const {
    data: { user: actor },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !actor) return { error: jsonError('Não autorizado.', 401) }

  const admin = createAdminClient()
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role, agency_role')
    .eq('id', actor.id)
    .maybeSingle()

  if (profileError) {
    console.error('SMTP admin profile lookup failed', profileError.message)
    return { error: jsonError('Não foi possível validar o administrador.', 500) }
  }
  if (!isSystemAdmin(profile)) {
    return { error: jsonError('A configuração SMTP é exclusiva para administradores.', 403) }
  }

  return {
    actor,
    admin,
    canEdit: isAllowedEditor(actor.email),
  }
}

async function loadSettings(
  admin: ReturnType<typeof createAdminClient>,
): Promise<{ data: SmtpSettingsRow | null; error: string | null }> {
  const { data, error } = await admin
    .from('smtp_settings')
    .select('*')
    .eq('id', true)
    .maybeSingle()

  if (error) return { data: null, error: error.message }
  return { data: data as SmtpSettingsRow | null, error: null }
}

async function writeAudit(
  admin: ReturnType<typeof createAdminClient>,
  action: 'save' | 'test',
  actorId: string,
  actorEmail: string,
  details: Record<string, unknown>,
) {
  const { error } = await admin.from('smtp_settings_audit').insert({
    action,
    actor_id: actorId,
    actor_email: actorEmail,
    details,
  })
  if (error) {
    console.error('SMTP audit insert failed', error.message)
  }
}

export async function GET() {
  try {
    const authorized = await getAuthorizedActor()
    if ('error' in authorized) return authorized.error

    const loaded = await loadSettings(authorized.admin)
    if (loaded.error) {
      console.error('SMTP settings lookup failed', loaded.error)
      return jsonError('Não foi possível carregar as configurações SMTP.', 500)
    }
    if (!loaded.data) return jsonError('Configuração SMTP não encontrada.', 404)

    return NextResponse.json({
      settings: serializeSettings(
        loaded.data,
        authorized.canEdit,
        Boolean(process.env.SUPABASE_MANAGEMENT_ACCESS_TOKEN?.trim()),
      ),
    })
  } catch (error) {
    console.error('SMTP settings GET failed', error)
    return jsonError('Não foi possível carregar as configurações SMTP.', 500)
  }
}

export async function POST(request: NextRequest) {
  let body: SmtpPayload
  try {
    body = await request.json() as SmtpPayload
  } catch {
    return jsonError('Corpo da requisição inválido.', 400)
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonError('Corpo da requisição inválido.', 400)
  }

  const operation = body.operation === 'test' ? 'test' : body.operation === 'save' ? 'save' : null
  if (!operation) return jsonError('Operação SMTP inválida.', 400)

  try {
    const authorized = await getAuthorizedActor()
    if ('error' in authorized) return authorized.error
    if (!authorized.canEdit) {
      return jsonError(
        'Somente felipe@agenciab16.com.br e contato@agenciab16.com.br podem alterar o SMTP.',
        403,
      )
    }

    const loaded = await loadSettings(authorized.admin)
    if (loaded.error) {
      console.error('SMTP settings lookup failed', loaded.error)
      return jsonError('Não foi possível carregar as configurações SMTP.', 500)
    }
    if (!loaded.data) return jsonError('Configuração SMTP não encontrada.', 404)

    const fallback = rowToConfig(loaded.data)
    let config: SmtpConfig
    try {
      config = parseConfig(body, fallback)
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : 'Configuração SMTP inválida.', 400)
    }

    let password = config.smtpPassword
    if (!password) {
      if (!loaded.data.smtp_password_secret_id) {
        return jsonError('Informe a senha de aplicativo do Google Workspace.', 400)
      }
      const { data: storedPassword, error: secretError } = await authorized.admin.rpc(
        'get_smtp_secret',
        { p_secret_id: loaded.data.smtp_password_secret_id },
      )
      if (secretError || typeof storedPassword !== 'string' || storedPassword.length === 0) {
        console.error('SMTP Vault read failed', secretError?.message ?? 'empty secret')
        return jsonError('Não foi possível recuperar a senha SMTP protegida.', 500)
      }
      password = storedPassword
    }

    if (operation === 'test') {
      const transport = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpSecurity === 'ssl',
        requireTLS: config.smtpSecurity === 'starttls',
        auth: { user: config.smtpUser, pass: password },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 10_000,
      })

      try {
        await transport.verify()
        await transport.sendMail({
          from: `${config.smtpSenderName} <${config.smtpSenderEmail}>`,
          to: authorized.actor.email ?? config.smtpSenderEmail,
          subject: 'Teste de SMTP - Clave',
          text: 'O SMTP do Clave foi testado com sucesso.',
        })

        const testedAt = new Date().toISOString()
        await authorized.admin
          .from('smtp_settings')
          .update({
            last_tested_at: testedAt,
            last_test_status: true,
            last_test_error: null,
          })
          .eq('id', true)
        await writeAudit(authorized.admin, 'test', authorized.actor.id, authorized.actor.email ?? '', {
          status: 'success',
          smtpHost: config.smtpHost,
          smtpPort: config.smtpPort,
          smtpSecurity: config.smtpSecurity,
          recipient: authorized.actor.email,
        })

        return NextResponse.json({ ok: true, message: 'Teste enviado para o e-mail do administrador.' })
      } catch (error) {
        const failure = smtpFailureMessage(error)
        console.error('SMTP test failed', error && typeof error === 'object' && 'code' in error
          ? (error as { code?: unknown }).code
          : 'unknown')
        await authorized.admin
          .from('smtp_settings')
          .update({
            last_tested_at: new Date().toISOString(),
            last_test_status: false,
            last_test_error: failure,
          })
          .eq('id', true)
        await writeAudit(authorized.admin, 'test', authorized.actor.id, authorized.actor.email ?? '', {
          status: 'failure',
          smtpHost: config.smtpHost,
          smtpPort: config.smtpPort,
          smtpSecurity: config.smtpSecurity,
          error: failure,
        })
        return jsonError(failure, 502)
      } finally {
        transport.close()
      }
    }

    if (!process.env.SUPABASE_MANAGEMENT_ACCESS_TOKEN?.trim()) {
      return jsonError(
        'Configure SUPABASE_MANAGEMENT_ACCESS_TOKEN no Coolify antes de sincronizar o SMTP do Supabase Auth. Não envie esse token pelo chat.',
        503,
      )
    }

    let secretId = loaded.data.smtp_password_secret_id
    if (config.smtpPassword) {
      const { data: updatedSecretId, error: secretError } = await authorized.admin.rpc(
        'set_smtp_secret',
        {
          p_secret_id: secretId,
          p_secret_value: config.smtpPassword,
        },
      )
      if (secretError || typeof updatedSecretId !== 'string') {
        console.error('SMTP Vault write failed', secretError?.message ?? 'empty secret id')
        return jsonError('Não foi possível proteger a senha SMTP no Supabase Vault.', 500)
      }
      secretId = updatedSecretId
      password = config.smtpPassword
    }

    await syncSupabaseAuth(config, password)

    const { data: saved, error: saveError } = await authorized.admin
      .from('smtp_settings')
      .upsert({
        id: true,
        domain: config.domain || null,
        support_whatsapp: config.supportWhatsapp || null,
        tutorial_url: config.tutorialUrl || null,
        smtp_host: config.smtpHost,
        smtp_port: config.smtpPort,
        smtp_security: config.smtpSecurity,
        smtp_user: config.smtpUser,
        smtp_sender_name: config.smtpSenderName,
        smtp_sender_email: config.smtpSenderEmail,
        smtp_password_secret_id: secretId,
        auth_configured_at: new Date().toISOString(),
        updated_by: authorized.actor.id,
      }, { onConflict: 'id' })
      .select('*')
      .single()

    if (saveError || !saved) {
      console.error('SMTP settings save failed', saveError?.message ?? 'empty row')
      return jsonError('O SMTP foi sincronizado, mas não foi possível salvar os metadados.', 500)
    }

    await writeAudit(authorized.admin, 'save', authorized.actor.id, authorized.actor.email ?? '', {
      status: 'success',
      smtpHost: config.smtpHost,
      smtpPort: config.smtpPort,
      smtpSecurity: config.smtpSecurity,
      smtpSenderName: config.smtpSenderName,
      smtpSenderEmail: config.smtpSenderEmail,
    })

    return NextResponse.json({
      ok: true,
      message: 'SMTP salvo e sincronizado com o Supabase Auth.',
      settings: serializeSettings(saved as SmtpSettingsRow, true, true),
    })
  } catch (error) {
    console.error('SMTP settings POST failed', error)
    const message = error instanceof Error && error.message.includes('SUPABASE_MANAGEMENT_ACCESS_TOKEN')
      ? error.message
      : 'Não foi possível concluir a operação SMTP.'
    return jsonError(message, message.includes('SUPABASE_MANAGEMENT_ACCESS_TOKEN') ? 503 : 500)
  }
}
