const express = require('express');
const cors = require('cors');
const pool = require('./db');
const questionsRouter = require('./routes/questions');
const authRouter = require('./routes/auth');
const sessionsRouter = require('./routes/sessions');
const answersRouter = require('./routes/answers');
const statsRouter  = require('./routes/stats');
const adminRouter  = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/questions', questionsRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/answers', answersRouter);
app.use('/api/stats',  statsRouter);
app.use('/api/admin', adminRouter);

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

waitForDb()
  .then(() => {
    app.listen(PORT, () => console.log(`Backend listening on port ${PORT}`));
  })
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
