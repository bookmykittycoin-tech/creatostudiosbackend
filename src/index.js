// src/index.js
const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();

const db = require('./config/db'); // supports multiple export patterns (pool, getConnection, testConnection)

// Use a safe PORT fallback so the app doesn't crash if HOSTINGER doesn't set it immediately
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false
  })
);

// Health check (MANDATORY for hosters/proxies)
app.get('/', (req, res) => {
  res.status(200).send('Backend is live');
});

// DB connection check (NON-FATAL) — logs error but keeps process alive
async function testDbConnection() {
  try {
    // 1) If db provides a helper function
    if (db && typeof db.testConnection === 'function') {
      const ok = await db.testConnection();
      if (ok) console.log('✅ Database connected (via testConnection)');
      return;
    }

    // 2) If db provides getConnection()
    if (db && typeof db.getConnection === 'function') {
      const conn = await db.getConnection();
      if (conn && typeof conn.release === 'function') conn.release();
      console.log('✅ Database connected (via getConnection)');
      return;
    }

    // 3) If db exports pool (mysql2/promise style)
    if (db && db.pool && typeof db.pool.getConnection === 'function') {
      const conn = await db.pool.getConnection();
      if (conn && typeof conn.release === 'function') conn.release();
      console.log('✅ Database connected (via pool)');
      return;
    }

    // 4) If db itself is a pool (module.exports = pool)
    if (db && typeof db.getConnection === 'undefined' && typeof db.pool === 'undefined' && typeof db.query === 'function') {
      // This is unlikely, but try a simple query if .query exists
      try {
        await db.query('SELECT 1');
        console.log('✅ Database connected (via query)');
        return;
      } catch (err) {
        // continue to fallback
      }
    }

    console.warn('⚠️ DB module does not export testConnection/getConnection/pool in expected ways. Skipping DB auto-test.');
  } catch (err) {
    console.error('❌ Database connection failed:', err && err.message ? err.message : err);
    // Keep process alive on shared hosting — do not exit
  }
}

// Kick off the DB test but do not block startup
testDbConnection().catch((e) => {
  console.error('❌ Unexpected error during DB test:', e);
});

// Lightweight DB test route for manual checks
app.get('/db-test', async (req, res) => {
  try {
    // Use the pool/query pattern safely based on what's available
    if (db && typeof db.pool !== 'undefined' && typeof db.pool.query === 'function') {
      const [rows] = await db.pool.query('SELECT 1 AS ok');
      return res.json({ db: 'connected', rows });
    }

    if (db && typeof db.query === 'function') {
      const [rows] = await db.query('SELECT 1 AS ok');
      return res.json({ db: 'connected', rows });
    }

    if (db && typeof db.getConnection === 'function') {
      const conn = await db.getConnection();
      const [rows] = await conn.query('SELECT 1 AS ok');
      conn.release();
      return res.json({ db: 'connected', rows });
    }

    return res.status(500).json({ db: 'unsupported db export, see server logs' });
  } catch (err) {
    console.error('DB test error:', err);
    return res.status(500).json({ db: 'failed', error: err && err.message ? err.message : String(err) });
  }
});

// Require routes (ensure each route file exports an Express router)
app.use('/v1/auth', require('./routes/authRoutes'));
app.use('/v1/influencer', require('./routes/influencerRoutes'));
app.use('/v1/campaigns', require('./routes/campaignsRoutes'));
app.use('/v1/admin', require('./routes/adminRoutes'));
app.use('/v1/referrals', require('./routes/referralRoutes'));

// Basic error handler (shows stack in non-production for debugging)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack
  });
});

// Global process handlers (logs + keep process predictable)
// NOTE: do not call process.exit in these on shared hosting
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // No process.exit here on Hostinger; host will handle restarts if needed.
});

// Graceful shutdown: close DB pool if provided
async function gracefulShutdown(signal) {
  console.log(`Received ${signal}. Graceful shutdown starting...`);
  try {
    if (db && typeof db.pool !== 'undefined' && typeof db.pool.end === 'function') {
      await db.pool.end();
      console.log('✅ DB pool closed');
    }
  } catch (err) {
    console.error('Error while closing DB pool:', err);
  } finally {
    // Allow process to exit naturally
    process.exit(0);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Start server
const server = app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});

module.exports = app;
