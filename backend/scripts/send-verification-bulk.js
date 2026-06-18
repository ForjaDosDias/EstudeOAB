/**
 * Envia e-mail de verificação para todos os usuários com email_verified = false.
 * Executa uma única vez: cria tokens, envia e-mails, reporta resultado.
 *
 * Uso:
 *   docker exec estudeoab-backend-1 node scripts/send-verification-bulk.js
 *
 * Em caso de falha parcial, pode ser rodado novamente com segurança —
 * usuários que já têm token ativo são pulados.
 */

const { Pool } = require('pg');
const { Resend } = require('resend');

const pool   = new Pool({ connectionString: process.env.DATABASE_URL });
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM   = process.env.RESEND_FROM   || 'noreply@aprovadonaoab.com.br';
const APP_URL = process.env.APP_URL      || 'https://aprovadonaoab.com.br';

const DELAY_MS = 300; // respeita rate limit do Resend

async function run() {
  // Busca usuários sem verificação e sem token ativo já criado
  const { rows: users } = await pool.query(`
    SELECT u.id, u.email, u.nome
    FROM users u
    WHERE u.email_verified = false
      AND NOT EXISTS (
        SELECT 1 FROM email_tokens et
        WHERE et.user_id = u.id
          AND et.type = 'verify_email'
          AND et.used_at IS NULL
          AND et.expires_at > NOW()
      )
    ORDER BY u.id
  `);

  console.log(`Encontrados ${users.length} usuário(s) para notificar.\n`);

  let ok = 0, fail = 0;

  for (const user of users) {
    try {
      const { rows } = await pool.query(
        `INSERT INTO email_tokens (user_id, type, expires_at)
         VALUES ($1, 'verify_email', NOW() + interval '7 days')
         RETURNING token`,
        [user.id]
      );
      const token = rows[0].token;
      const link  = `${APP_URL}/verificar-email?token=${token}`;

      await resend.emails.send({
        from: FROM,
        to: [user.email],
        subject: 'Confirme seu e-mail para continuar acessando o Aprovado OAB',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
            <h2 style="color:#1a1a2e">Olá${user.nome ? ', ' + user.nome.split(' ')[0] : ''}!</h2>
            <p>
              Adicionamos verificação de e-mail ao Aprovado OAB para manter sua conta segura.
              Clique no botão abaixo para confirmar seu acesso.
            </p>
            <a href="${link}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
              Confirmar meu e-mail
            </a>
            <p style="color:#6b7280;font-size:13px;margin-top:24px">
              O link expira em 7 dias. Se você não reconhece esta conta, ignore este e-mail.
            </p>
          </div>
        `,
      });

      console.log(`✓ [${user.id}] ${user.email}`);
      ok++;
    } catch (err) {
      console.error(`✕ [${user.id}] ${user.email} — ${err.message}`);
      fail++;
    }

    // pausa entre envios
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log(`\nConcluído: ${ok} enviados, ${fail} falhas.`);
  await pool.end();
}

run().catch(err => {
  console.error('Erro fatal:', err.message);
  process.exit(1);
});
