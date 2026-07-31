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
    ? 'Seu acesso ao Clave foi redefinido por um administrador.'
    : 'Sua conta no Clave foi criada.'
  const buttonLabel = isReset ? 'Definir nova senha' : 'Ativar minha conta'

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
        'Por segurança, o Clave exigirá a troca dessa senha no próximo acesso.',
      ].join('\n'),
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#202124;max-width:560px">
          <h2>${isReset ? 'Seu acesso foi redefinido' : 'Seu convite para o Clave'}</h2>
          <p>Olá, ${safeName}!</p>
          <p>${escapeHtml(intro)} Use os dados abaixo somente para o próximo acesso:</p>
          <p><strong>E-mail:</strong> ${safeEmail}<br />
          <strong>Senha temporária:</strong> <code>${safePassword}</code></p>
          <p><a href="${safeActionLink}" style="display:inline-block;background:#534ab7;color:#fff;padding:10px 16px;text-decoration:none;border-radius:6px">${buttonLabel}</a></p>
          <p>Por segurança, o Clave exigirá a troca dessa senha no próximo acesso.</p>
        </div>
      `,
    })
  } finally {
    mailer.transport.close()
  }
}
