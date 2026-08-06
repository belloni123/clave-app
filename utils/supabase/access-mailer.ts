import 'server-only'

import { createConfiguredSmtpMailer } from '@/utils/supabase/smtp-mailer'
import type { createAdminClient } from '@/utils/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>
type AccessEmailKind = 'invite' | 'reset'

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

export async function sendAccessCredentialsEmail({
  admin,
  email,
  name,
  temporaryPassword,
  actionLink,
  kind,
}: {
  admin: AdminClient
  email: string
  name: string
  temporaryPassword: string
  actionLink: string
  kind: AccessEmailKind
}) {
  const mailer = await createConfiguredSmtpMailer(admin)
  const isReset = kind === 'reset'
  const safeName = escapeHtml(name)
  const safeEmail = escapeHtml(email)
  const safePassword = escapeHtml(temporaryPassword)
  const safeActionLink = escapeHtml(actionLink)
  const subject = isReset
    ? 'Novas credenciais de acesso ao Clave'
    : 'Seu convite para o Clave'
  const intro = isReset
    ? 'Seu acesso ao Clave foi redefinido por um administrador. Entre com a senha temporária abaixo.'
    : 'Sua conta no Clave foi criada. Entre com a senha temporária abaixo.'
  const heading = isReset ? 'Seu acesso foi redefinido' : 'Seu acesso ao Clave'
  const buttonLabel = 'Entrar no Clave'

  try {
    await mailer.transport.sendMail({
      from: { name: mailer.senderName, address: mailer.senderEmail },
      to: email,
      subject,
      text: [
        `Olá, ${name}!`,
        '',
        intro,
        `E-mail: ${email}`,
        `Senha temporária: ${temporaryPassword}`,
        '',
        `${buttonLabel}: ${actionLink}`,
        '',
        'No primeiro acesso, o Clave pedirá que você crie uma senha pessoal.',
      ].join('\n'),
      html: `
        <!doctype html>
        <html lang="pt-BR">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>${heading}</title>
          </head>
          <body style="margin:0;padding:0;background:#f5f5f3;font-family:Arial,Helvetica,sans-serif;color:#171717;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f5f3;padding:32px 16px;">
              <tr>
                <td align="center">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e5e5;border-radius:10px;overflow:hidden;">
                    <tr>
                      <td style="height:5px;background:#f4c400;line-height:5px;font-size:5px;">&nbsp;</td>
                    </tr>
                    <tr>
                      <td style="padding:34px 36px 16px;font-size:24px;font-weight:700;letter-spacing:0;color:#171717;">CLAVE</td>
                    </tr>
                    <tr>
                      <td style="padding:8px 36px 32px;">
                        <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;font-weight:700;color:#171717;">${heading}</h1>
                        <p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#454545;">Olá, ${safeName}!</p>
                        <p style="margin:0 0 20px;font-size:16px;line-height:1.55;color:#454545;">${escapeHtml(intro)}</p>
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;background:#f5f5f3;border:1px solid #e5e5e5;border-radius:6px;">
                          <tr>
                            <td style="padding:16px;">
                              <p style="margin:0 0 8px;font-size:13px;line-height:1.4;color:#6b6b6b;"><strong style="color:#454545;">E-mail</strong><br />${safeEmail}</p>
                              <p style="margin:0;font-size:13px;line-height:1.4;color:#6b6b6b;"><strong style="color:#454545;">Senha temporária</strong><br /><span style="display:inline-block;margin-top:4px;padding:6px 8px;background:#ffffff;border:1px solid #dedede;border-radius:4px;font-family:monospace;font-size:14px;color:#171717;">${safePassword}</span></p>
                            </td>
                          </tr>
                        </table>
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 28px;">
                          <tr>
                            <td style="border-radius:6px;background:#1f6fbd;">
                              <a href="${safeActionLink}" style="display:inline-block;padding:13px 20px;border-radius:6px;color:#ffffff;font-size:15px;font-weight:700;line-height:1;text-decoration:none;">${buttonLabel}</a>
                            </td>
                          </tr>
                        </table>
                        <p style="margin:0;font-size:14px;line-height:1.55;color:#6b6b6b;">No primeiro acesso, o Clave pedir&aacute; que voc&ecirc; crie uma senha pessoal antes de abrir o dashboard.</p>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:#8a8a8a;">Clave &middot; Plataforma de gest&atilde;o de marketing</p>
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

export async function sendAccessLinkEmail({
  admin,
  email,
  name,
  actionLink,
}: {
  admin: AdminClient
  email: string
  name: string
  actionLink: string
}) {
  const mailer = await createConfiguredSmtpMailer(admin)
  const safeName = escapeHtml(name)
  const safeEmail = escapeHtml(email)
  const safeActionLink = escapeHtml(actionLink)

  try {
    await mailer.transport.sendMail({
      from: { name: mailer.senderName, address: mailer.senderEmail },
      to: email,
      subject: 'Acesse sua conta no Clave',
      text: [
        `Olá, ${name}!`,
        '',
        'Um administrador reenviou o acesso à sua conta no Clave.',
        `E-mail: ${email}`,
        '',
        `Entrar no Clave: ${actionLink}`,
        '',
        'Use sua senha atual. Se não lembrar dela, escolha “Esqueceu a senha?” na tela de login.',
      ].join('\n'),
      html: `
        <!doctype html>
        <html lang="pt-BR">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>Acesse sua conta no Clave</title>
          </head>
          <body style="margin:0;padding:0;background:#f5f5f3;font-family:Arial,Helvetica,sans-serif;color:#171717;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f5f3;padding:32px 16px;">
              <tr>
                <td align="center">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e5e5;border-radius:10px;overflow:hidden;">
                    <tr>
                      <td style="height:5px;background:#f4c400;line-height:5px;font-size:5px;">&nbsp;</td>
                    </tr>
                    <tr>
                      <td style="padding:34px 36px 16px;font-size:24px;font-weight:700;letter-spacing:0;color:#171717;">CLAVE</td>
                    </tr>
                    <tr>
                      <td style="padding:8px 36px 32px;">
                        <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;font-weight:700;color:#171717;">Seu acesso ao Clave</h1>
                        <p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#454545;">Olá, ${safeName}!</p>
                        <p style="margin:0 0 20px;font-size:16px;line-height:1.55;color:#454545;">Um administrador reenviou o caminho de acesso à sua conta.</p>
                        <p style="margin:0 0 24px;padding:16px;background:#f5f5f3;border:1px solid #e5e5e5;border-radius:6px;font-size:13px;line-height:1.5;color:#6b6b6b;"><strong style="color:#454545;">E-mail de acesso</strong><br />${safeEmail}</p>
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 28px;">
                          <tr>
                            <td style="border-radius:6px;background:#1f6fbd;">
                              <a href="${safeActionLink}" style="display:inline-block;padding:13px 20px;border-radius:6px;color:#ffffff;font-size:15px;font-weight:700;line-height:1;text-decoration:none;">Entrar no Clave</a>
                            </td>
                          </tr>
                        </table>
                        <p style="margin:0;font-size:14px;line-height:1.55;color:#6b6b6b;">Use sua senha atual. Se não lembrar dela, escolha <strong>Esqueceu a senha?</strong> na tela de login.</p>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:#8a8a8a;">Clave &middot; Plataforma de gest&atilde;o de marketing</p>
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
