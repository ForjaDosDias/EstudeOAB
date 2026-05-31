const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');
const { sendVerificationEmail, sendResetEmail } = require('../services/email.service');

const router = express.Router();
const SALT_ROUNDS = 12;
const TOKEN_TTL = '7d';

function makeToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

function publicUser(row) {
  return {
    id:               row.id,
    email:            row.email,
    nome:             row.nome,
    role:             row.role,
    edicao:           row.edicao,
    minutosDia:       row.minutos_dia,
    area_segunda_fase: row.area_segunda_fase,
    dataProva:        row.data_prova,
    xp:               row.xp,
    streak:           row.streak,
  };
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email, password, nome, edicao, minutosDia, area_segunda_fase, dataProva } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Senha deve ter no mínimo 8 caracteres' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email inválido' });
  }

  try {
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, nome, edicao, minutos_dia, area_segunda_fase, data_prova)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        email.toLowerCase().trim(),
        hash,
        nome?.trim() || null,
        edicao || 'XLI',
        minutosDia || 30,
        area_segunda_fase || 'civil',
        dataProva || null,
      ]
    );
    const user = result.rows[0];

    const tokenResult = await pool.query(
      `INSERT INTO email_tokens (user_id, type, expires_at)
       VALUES ($1, 'verify_email', NOW() + interval '24 hours')
       RETURNING token`,
      [user.id]
    );
    await sendVerificationEmail(user.email, tokenResult.rows[0].token).catch(
      (err) => console.error('send verification email error:', err.message)
    );

    res.status(201).json({ token: makeToken(user), user: publicUser(user) });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Este email já está cadastrado' });
    }
    console.error('register error:', err.message);
    res.status(500).json({ error: 'Erro ao criar conta' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [
      email.toLowerCase().trim(),
    ]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    if (!user.email_verified) {
      const tokenRow = await pool.query(
        `SELECT expires_at FROM email_tokens
         WHERE user_id = $1 AND type = 'verify_email' AND used_at IS NULL
         ORDER BY expires_at DESC LIMIT 1`,
        [user.id]
      );
      const expired = !tokenRow.rows[0] || tokenRow.rows[0].expires_at < new Date();
      return res.status(403).json({
        code: 'EMAIL_NOT_VERIFIED',
        tokenExpired: expired,
        error: 'Confirme seu e-mail antes de entrar',
      });
    }

    res.json({ token: makeToken(user), user: publicUser(user) });
  } catch (err) {
    console.error('login error:', err.message);
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

// GET /api/auth/verify-email?token=
router.get('/verify-email', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token não informado' });

  try {
    const result = await pool.query(
      `SELECT id, user_id, expires_at, used_at FROM email_tokens
       WHERE token = $1 AND type = 'verify_email'`,
      [token]
    );
    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: 'Token inválido' });
    if (row.used_at) return res.status(400).json({ error: 'Token já utilizado', code: 'TOKEN_USED' });
    if (row.expires_at < new Date()) return res.status(400).json({ error: 'Token expirado', code: 'TOKEN_EXPIRED' });

    await pool.query('UPDATE email_tokens SET used_at = NOW() WHERE id = $1', [row.id]);
    await pool.query('UPDATE users SET email_verified = TRUE WHERE id = $1', [row.user_id]);

    res.json({ ok: true });
  } catch (err) {
    console.error('verify-email error:', err.message);
    res.status(500).json({ error: 'Erro ao verificar e-mail' });
  }
});

// POST /api/auth/resend-verification
router.post('/resend-verification', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email é obrigatório' });

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [
      email.toLowerCase().trim(),
    ]);
    const user = userResult.rows[0];

    if (!user) return res.json({ ok: true }); // não vaza existência

    if (user.email_verified) {
      return res.status(400).json({ error: 'E-mail já verificado', code: 'ALREADY_VERIFIED' });
    }

    await pool.query(
      `UPDATE email_tokens SET used_at = NOW()
       WHERE user_id = $1 AND type = 'verify_email' AND used_at IS NULL`,
      [user.id]
    );

    const tokenResult = await pool.query(
      `INSERT INTO email_tokens (user_id, type, expires_at)
       VALUES ($1, 'verify_email', NOW() + interval '24 hours')
       RETURNING token`,
      [user.id]
    );

    await sendVerificationEmail(user.email, tokenResult.rows[0].token);
    res.json({ ok: true });
  } catch (err) {
    console.error('resend-verification error:', err.message);
    res.status(500).json({ error: 'Erro ao reenviar e-mail' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email é obrigatório' });

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [
      email.toLowerCase().trim(),
    ]);
    const user = userResult.rows[0];

    if (user) {
      await pool.query(
        `UPDATE email_tokens SET used_at = NOW()
         WHERE user_id = $1 AND type = 'reset_password' AND used_at IS NULL`,
        [user.id]
      );
      const tokenResult = await pool.query(
        `INSERT INTO email_tokens (user_id, type, expires_at)
         VALUES ($1, 'reset_password', NOW() + interval '1 hour')
         RETURNING token`,
        [user.id]
      );
      await sendResetEmail(user.email, tokenResult.rows[0].token);
    }

    // sempre 200 para não vazar existência de e-mail
    res.json({ ok: true });
  } catch (err) {
    console.error('forgot-password error:', err.message);
    res.status(500).json({ error: 'Erro ao processar solicitação' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token) return res.status(400).json({ error: 'Token não informado' });
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Senha deve ter no mínimo 8 caracteres' });
  }

  try {
    const result = await pool.query(
      `SELECT id, user_id, expires_at, used_at FROM email_tokens
       WHERE token = $1 AND type = 'reset_password'`,
      [token]
    );
    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: 'Token inválido' });
    if (row.used_at) return res.status(400).json({ error: 'Token já utilizado', code: 'TOKEN_USED' });
    if (row.expires_at < new Date()) return res.status(400).json({ error: 'Token expirado', code: 'TOKEN_EXPIRED' });

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, row.user_id]);
    await pool.query('UPDATE email_tokens SET used_at = NOW() WHERE id = $1', [row.id]);

    res.json({ ok: true });
  } catch (err) {
    console.error('reset-password error:', err.message);
    res.status(500).json({ error: 'Erro ao redefinir senha' });
  }
});

// GET /api/auth/me  (valida token e retorna usuário atualizado)
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.userId]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json(publicUser(result.rows[0]));
  } catch (err) {
    console.error('me error:', err.message);
    res.status(500).json({ error: 'Erro ao buscar usuário' });
  }
});

// PATCH /api/auth/profile  (atualiza nome, email e/ou senha)
router.patch('/profile', requireAuth, async (req, res) => {
  const { nome, email, senhaAtual, novaSenha } = req.body;

  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.userId]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const setCols = [];
    const vals    = [];

    if (nome !== undefined) {
      if (!nome.trim()) return res.status(400).json({ error: 'Nome não pode estar vazio' });
      setCols.push(`nome = $${vals.length + 1}`);
      vals.push(nome.trim());
    }

    if (email !== undefined) {
      const emailNorm = email.toLowerCase().trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
        return res.status(400).json({ error: 'E-mail inválido' });
      }
      if (emailNorm !== user.email) {
        const dup = await pool.query(
          'SELECT id FROM users WHERE email = $1 AND id != $2',
          [emailNorm, user.id]
        );
        if (dup.rows.length > 0) return res.status(409).json({ error: 'Este e-mail já está em uso' });
      }
      setCols.push(`email = $${vals.length + 1}`);
      vals.push(emailNorm);
    }

    if (novaSenha !== undefined) {
      if (!senhaAtual) return res.status(400).json({ error: 'Informe a senha atual' });
      if (novaSenha.length < 8) return res.status(400).json({ error: 'Nova senha deve ter no mínimo 8 caracteres' });
      const valid = await bcrypt.compare(senhaAtual, user.password_hash);
      if (!valid) return res.status(401).json({ error: 'Senha atual incorreta' });
      const hash = await bcrypt.hash(novaSenha, SALT_ROUNDS);
      setCols.push(`password_hash = $${vals.length + 1}`);
      vals.push(hash);
    }

    if (setCols.length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });

    vals.push(user.id);
    const updated = await pool.query(
      `UPDATE users SET ${setCols.join(', ')} WHERE id = $${vals.length} RETURNING *`,
      vals
    );

    const updatedUser = updated.rows[0];
    res.json({ user: publicUser(updatedUser), token: makeToken(updatedUser) });
  } catch (err) {
    console.error('profile update error:', err.message);
    res.status(500).json({ error: 'Erro ao atualizar perfil' });
  }
});

module.exports = router;
