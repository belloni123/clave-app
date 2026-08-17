import 'server-only'

import type {
  AppErrorEventCategory,
  AppErrorEventSeverity,
  AppErrorEventSource,
} from '@/types/app-error-event'
import { createConfiguredSmtpMailer } from '@/utils/supabase/smtp-mailer'
import type { createAdminClient } from '@/utils/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

const DEFAULT_ALERT_RECIPIENT = 'felipe@agenciab16.com.br'
const PRODUCTION_APP_ORIGIN = 'https://clave.agenciab16.com.br'

const CATEGORY_LABELS: Record<AppErrorEventCategory, string> = {
  public_briefing: 'Briefing público',
  expert_application: 'Candidatura',
  briefing_attachment: 'Anexo do briefing',
  client_runtime: 'Navegador',
}

const SEVERITY_LABELS: Record<AppErrorEventSeverity, string> = {
  warning: 'Atenção',
  error: 'Erro',
  critical: 'Erro crítico',
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return entities[character]
  })
}

function alertRecipient() {
  const configured = process.env.ERROR_ALERT_EMAIL?.trim().toLowerCase()
  const recipient = configured || DEFAULT_ALERT_RECIPIENT
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    throw new Error('O destinatário dos alertas de erro é inválido.')
  }
  return recipient
}

function monitoringUrl() {
  try {
    return new URL('/', process.env.APP_URL || PRODUCTION_APP_ORIGIN).toString()
  } catch {
    return PRODUCTION_APP_ORIGIN
  }
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'America/Sao_Paulo',
  }).format(value)
}

export async function sendErrorAlertEmail({
  admin,
  referenceCode,
  severity,
  source,
  category,
  operation,
  message,
  technicalMessage,
  projectId,
  leadEmail,
  pagePath,
  httpStatus,
  occurredAt,
}: {
  admin: AdminClient
  referenceCode: string
  severity: AppErrorEventSeverity
  source: AppErrorEventSource
  category: AppErrorEventCategory
  operation: string
  message: string
  technicalMessage: string | null
  projectId: string | null
  leadEmail: string | null
  pagePath: string | null
  httpStatus: number | null
  occurredAt: Date
}) {
  const recipient = alertRecipient()
  const mailer = await createConfiguredSmtpMailer(admin)
  const { data: project } = projectId
    ? await admin.from('projects').select('name').eq('id', projectId).maybeSingle()
    : { data: null }
  const projectName = project && typeof project.name === 'string' ? project.name : null
  const link = monitoringUrl()
  const severityLabel = SEVERITY_LABELS[severity]
  const categoryLabel = CATEGORY_LABELS[category]
  const sourceLabel = source === 'browser' ? 'Navegador' : 'Servidor'
  const occurredLabel = formatDate(occurredAt)
  const detailRows = [
    ['Código', referenceCode],
    ['Severidade', severityLabel],
    ['Origem', `${categoryLabel} · ${sourceLabel}`],
    ['Horário', occurredLabel],
    ['Projeto', projectName || projectId || 'Não identificado'],
    ['Lead', leadEmail || 'Não identificado'],
    ['Página', pagePath || 'Não identificada'],
    ['Operação', operation],
    ['HTTP', httpStatus ? String(httpStatus) : 'Não informado'],
  ]

  try {
    await mailer.transport.sendMail({
      from: { name: mailer.senderName, address: mailer.senderEmail },
      to: recipient,
      subject: `[Clave] ${severityLabel} registrado · ${referenceCode}`,
      text: [
        `O Clave registrou uma nova ocorrência (${referenceCode}).`,
        '',
        ...detailRows.map(([label, value]) => `${label}: ${value}`),
        '',
        `Resumo: ${message}`,
        technicalMessage ? `Detalhe técnico: ${technicalMessage}` : '',
        '',
        `Acesse Administração > Monitoramento: ${link}`,
      ].filter(Boolean).join('\n'),
      html: `
        <!doctype html>
        <html lang="pt-BR">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>Nova ocorrência no Clave</title>
          </head>
          <body style="margin:0;padding:0;background:#f5f5f3;font-family:Arial,Helvetica,sans-serif;color:#171717;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f5f3;padding:32px 16px;">
              <tr>
                <td align="center">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e5e5;border-radius:10px;overflow:hidden;">
                    <tr><td style="height:5px;background:#f4c400;line-height:5px;font-size:5px;">&nbsp;</td></tr>
                    <tr><td style="padding:30px 34px 12px;font-size:24px;font-weight:700;color:#171717;">CLAVE</td></tr>
                    <tr>
                      <td style="padding:8px 34px 32px;">
                        <p style="margin:0 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;color:#a33a35;">${escapeHtml(severityLabel)}</p>
                        <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;color:#171717;">Uma nova ocorrência foi registrada</h1>
                        <p style="margin:0 0 22px;font-size:15px;line-height:1.55;color:#555555;">O visitante continua vendo apenas uma mensagem amigável. Os detalhes abaixo são exclusivos da equipe administrativa.</p>
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 22px;border:1px solid #e5e5e5;border-radius:6px;">
                          ${detailRows.map(([label, value], index) => `
                            <tr>
                              <td style="width:120px;padding:10px 12px;border-bottom:${index === detailRows.length - 1 ? '0' : '1px solid #eeeeee'};font-size:12px;font-weight:700;color:#6b6b6b;">${escapeHtml(label)}</td>
                              <td style="padding:10px 12px;border-bottom:${index === detailRows.length - 1 ? '0' : '1px solid #eeeeee'};font-size:13px;color:#202020;word-break:break-word;">${escapeHtml(value)}</td>
                            </tr>
                          `).join('')}
                        </table>
                        <p style="margin:0 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;color:#777777;">Resumo</p>
                        <p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:#333333;">${escapeHtml(message)}</p>
                        ${technicalMessage ? `<p style="margin:0 0 24px;padding:12px;background:#f7f7f6;border-radius:6px;font-family:monospace;font-size:12px;line-height:1.5;color:#555555;word-break:break-word;">${escapeHtml(technicalMessage)}</p>` : '<div style="height:12px;"></div>'}
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                          <tr>
                            <td style="border-radius:6px;background:#1f6fbd;">
                              <a href="${escapeHtml(link)}" style="display:inline-block;padding:13px 20px;border-radius:6px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">Abrir monitoramento</a>
                            </td>
                          </tr>
                        </table>
                        <p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:#777777;">No Clave, acesse <strong>Administração &gt; Monitoramento</strong> e procure pelo código ${escapeHtml(referenceCode)}.</p>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:18px 0 0;font-size:12px;color:#8a8a8a;">Clave &middot; Alerta operacional automático</p>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
    })
  } finally {
    mailer.transport.close()
  }
}
