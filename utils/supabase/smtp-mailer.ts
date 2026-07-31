import 'server-only'

import nodemailer from 'nodemailer'
import type { createAdminClient } from '@/utils/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

interface SmtpSettingsRow {
  smtp_host: string
  smtp_port: number
  smtp_security: 'ssl' | 'starttls'
  smtp_user: string | null
  smtp_sender_name: string
  smtp_sender_email: string | null
  smtp_password_secret_id: string | null
}

export interface SmtpMailer {
  senderName: string
  senderEmail: string
  transport: nodemailer.Transporter
}

export async function createConfiguredSmtpMailer(admin: AdminClient): Promise<SmtpMailer> {
  const { data: settings, error: settingsError } = await admin
    .from('smtp_settings')
    .select(
      'smtp_host, smtp_port, smtp_security, smtp_user, smtp_sender_name, smtp_sender_email, smtp_password_secret_id',
    )
    .eq('id', true)
    .maybeSingle()

  if (settingsError) throw new Error('Não foi possível carregar a configuração SMTP.')

  const row = settings as SmtpSettingsRow | null
  if (
    !row
    || !row.smtp_user
    || !row.smtp_sender_email
    || !row.smtp_password_secret_id
  ) {
    throw new Error('Configure e teste o SMTP antes de enviar convites.')
  }

  const { data: password, error: passwordError } = await admin.rpc(
    'get_smtp_secret',
    { p_secret_id: row.smtp_password_secret_id },
  )

  if (passwordError || typeof password !== 'string' || password.length === 0) {
    throw new Error('Não foi possível recuperar a senha SMTP protegida.')
  }

  return {
    senderName: row.smtp_sender_name,
    senderEmail: row.smtp_sender_email,
    transport: nodemailer.createTransport({
      host: row.smtp_host,
      port: row.smtp_port,
      secure: row.smtp_security === 'ssl',
      requireTLS: row.smtp_security === 'starttls',
      auth: { user: row.smtp_user, pass: password },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
    }),
  }
}
