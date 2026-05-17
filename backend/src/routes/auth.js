const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');

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

    res.json({ token: makeToken(user), user: publicUser(user) });
  } catch (err) {
    console.error('login error:', err.message);
    res.status(500).json({ error: 'Erro ao fazer login' });
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

module.exports = router;
