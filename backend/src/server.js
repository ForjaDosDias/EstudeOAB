const express = require('express');
const cors = require('cors');
const pool = require('./db');
const { sendReengagementEmail } = require('./services/email.service');
const questionsRouter = require('./routes/questions');
const authRouter = require('./routes/auth');
const sessionsRouter = require('./routes/sessions');
const answersRouter = require('./routes/answers');
const statsRouter         = require('./routes/stats');
const adminRouter         = require('./routes/admin');
// const reportsRouter       = require('./routes/reports'); // desativado
const notificationsRouter = require('./routes/notifications');
const questionCommentsRouter = require('./routes/question-comments');
const paymentsRouter      = require('./routes/payments');
const coinsRouter         = require('./routes/coins');
const trilhasRouter       = require('./routes/trilhas');
const adsRouter           = require('./routes/ads');
const meRouter            = require('./routes/me');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api/auth', authRouter);
app.use('/api/questions', questionsRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/answers', answersRouter);
app.use('/api/stats',         statsRouter);
app.use('/api/admin',         adminRouter);
// app.use('/api/reports',       reportsRouter); // desativado
app.use('/api/notifications', notificationsRouter);
app.use('/api/question-comments', questionCommentsRouter);
app.use('/api/payments',      paymentsRouter);
app.use('/api/coins',         coinsRouter);
app.use('/api/trilhas',       trilhasRouter);
app.use('/api/ads',           adsRouter);
app.use('/api/me',            meRouter);

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'connected' });
  } catch {
    res.status(503).json({ ok: false, db: 'unavailable' });
  }
});

// Aguarda o banco antes de subir
async function waitForDb(retries = 20, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('SELECT 1');
      console.log('Database connected.');
      return;
    } catch {
      console.log(`Waiting for database... (${i + 1}/${retries})`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Could not connect to database after multiple retries.');
}

async function runReengagementJob() {
  try {
    const { rows } = await pool.query(`
      SELECT et.id, et.user_id, u.email
      FROM email_tokens et
      JOIN users u ON u.id = et.user_id
      WHERE et.type = 'verify_email'
        AND u.email_verified = FALSE
        AND et.used_at IS NULL
        AND et.expires_at < NOW()
        AND et.expires_at > NOW() - interval '48 hours'
        AND et.reengagement_sent_at IS NULL
    `);
    for (const row of rows) {
      try {
        const newToken = await pool.query(
          `INSERT INTO email_tokens (user_id, type, expires_at, reengagement_sent_at)
           VALUES ($1, 'verify_email', NOW() + interval '48 hours', NOW())
           RETURNING token`,
          [row.user_id]
        );
        await sendReengagementEmail(row.email, newToken.rows[0].token);
        await pool.query(
          'UPDATE email_tokens SET reengagement_sent_at = NOW() WHERE id = $1',
          [row.id]
        );
      } catch (err) {
        console.error('reengagement job error for user', row.user_id, err.message);
      }
    }
  } catch (err) {
    console.error('reengagement job query error:', err.message);
  }
}

waitForDb()
  .then(() => {
    app.listen(PORT, () => console.log(`Backend listening on port ${PORT}`));
    setInterval(runReengagementJob, 60 * 60 * 1000); // roda a cada 1h
  })
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
