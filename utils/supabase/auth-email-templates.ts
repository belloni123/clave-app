export const RECOVERY_EMAIL_SUBJECT = 'Redefina sua senha do Clave'

export const RECOVERY_EMAIL_TEMPLATE = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Redefina sua senha do Clave</title>
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
                <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;font-weight:700;color:#171717;">Vamos redefinir sua senha?</h1>
                <p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#454545;">Recebemos um pedido para criar uma nova senha para sua conta do Clave.</p>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.55;color:#6b6b6b;">Conta: {{ .Email }}</p>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 28px;">
                  <tr>
                    <td style="border-radius:6px;background:#1f6fbd;">
                      <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 20px;border-radius:6px;color:#ffffff;font-size:15px;font-weight:700;line-height:1;text-decoration:none;">Criar nova senha</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:#6b6b6b;">Se voc&ecirc; n&atilde;o solicitou esta altera&ccedil;&atilde;o, pode ignorar este e-mail com tranquilidade. Sua senha atual continuar&aacute; v&aacute;lida.</p>
                <p style="margin:0;font-size:14px;line-height:1.55;color:#6b6b6b;">Por seguran&ccedil;a, este link &eacute; pessoal e tem prazo de validade.</p>
              </td>
            </tr>
          </table>
          <p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:#8a8a8a;">Clave &middot; Plataforma de gest&atilde;o de marketing</p>
        </td>
      </tr>
    </table>
  </body>
</html>`
