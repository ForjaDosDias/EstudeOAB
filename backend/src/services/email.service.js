const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM || 'noreply@aprovanoab.com.br';
const APP_URL = process.env.APP_URL || 'https://aprovanoab.com.br';

async function sendVerificationEmail(to, token) {
  const link = `${APP_URL}/verificar-email?token=${token}`;
  await resend.emails.send({
    from: FROM,
    to: [to],
    subject: 'Confirme seu e-mail — EstudeOAB',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#1a1a2e">Bem-vindo ao EstudeOAB!</h2>
        <p>Clique no botão abaixo para confirmar seu e-mail e começar a estudar.</p>
        <a href="${link}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
          Confirmar e-mail
        </a>
        <p style="color:#6b7280;font-size:13px;margin-top:24px">
          O link expira em 24 horas. Se você não criou uma conta, ignore este e-mail.
        </p>
      </div>
    `,
  });
}

async function sendReengagementEmail(to, token) {
  const link = `${APP_URL}/verificar-email?token=${token}`;
  await resend.emails.send({
    from: FROM,
    to: [to],
    subject: 'Ainda não confirmou seu e-mail? Veja o que está te esperando',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#1a1a2e">Seu acesso ao EstudeOAB está esperando por você</h2>
        <p>Você criou uma conta mas ainda não confirmou seu e-mail. Confirme agora para acessar questões reais do Exame de Ordem.</p>
        <a href="${link}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
          Confirmar e-mail
        </a>
        <p style="color:#6b7280;font-size:13px;margin-top:24px">
          O link expira em 48 horas. Se você não criou uma conta, ignore este e-mail.
        </p>
      </div>
    `,
  });
}

async function sendResetEmail(to, token) {
  const link = `${APP_URL}/redefinir-senha?token=${token}`;
  await resend.emails.send({
    from: FROM,
    to: [to],
    subject: 'Redefinição de senha — EstudeOAB',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#1a1a2e">Redefinir senha</h2>
        <p>Recebemos uma solicitação para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha.</p>
        <a href="${link}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
          Redefinir senha
        </a>
        <p style="color:#6b7280;font-size:13px;margin-top:24px">
          O link expira em 1 hora. Se você não solicitou a redefinição, ignore este e-mail — sua senha permanece a mesma.
        </p>
      </div>
    `,
  });
}

module.exports = { sendVerificationEmail, sendReengagementEmail, sendResetEmail };
