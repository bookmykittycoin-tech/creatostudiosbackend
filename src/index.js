// src/index.js — Hostinger-ready
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const db = require('./config/db'); // mysql pool or helper module
const app = express();

// Use a safe PORT fallback so the app won't crash if HOSTINGER doesn't set it immediately
const PORT = process.env.PORT || 3000;

// ---------- MIDDLEWARE ----------
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

// Simple request logger (helpful in Hostinger logs)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// ---------- HEALTH CHECK ----------
app.get('/', (req, res) => res.status(200).send('Backend is live'));
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// ---------- NON-FATAL DB TEST ----------
async function testDbConnection() {
  try {
    if (db && typeof db.testConnection === 'function') {
      const ok = await db.testConnection();
      if (ok) console.log('✅ Database connected (via testConnection)');
      return true;
    }
    if (db && typeof db.getConnection === 'function') {
      const conn = await db.getConnection();
      if (conn && typeof conn.release === 'function') conn.release();
      console.log('✅ Database connected (via getConnection)');
      return true;
    }
    if (db && db.pool && typeof db.pool.getConnection === 'function') {
      const conn = await db.pool.getConnection();
      if (conn && typeof conn.release === 'function') conn.release();
      console.log('✅ Database connected (via pool.getConnection)');
      return true;
    }
    if (db && typeof db.query === 'function') {
      await db.query('SELECT 1');
      console.log('✅ Database connected (via query)');
      return true;
    }
    console.warn('⚠️ DB export not recognized; skipping auto DB test.');
    return false;
  } catch (err) {
    console.error('❌ Database connection failed (non-fatal):', err && err.message ? err.message : err);
    return false;
  }
}

// Start DB test but do NOT crash the process if it fails
testDbConnection().catch((e) => console.error('Unexpected DB test error:', e));

// ---------- DB TEST ROUTE ----------
app.get('/db-test', async (req, res) => {
  try {
    if (db && db.pool && typeof db.pool.query === 'function') {
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
    return res.status(500).json({ db: 'unsupported_db_export' });
  } catch (err) {
    console.error('DB test error:', err);
    return res.status(500).json({ db: 'failed', error: err && err.message ? err.message : String(err) });
  }
});

// ---------- SAFE ROUTE LOADER ----------
function safeRequireRoute(path) {
  try {
    const mod = require(path);
    // If module returns a function (factory), try invoking with common params
    if (typeof mod === 'function') {
      try {
        const maybeRouter = mod({ app, db, express: require('express') });
        if (maybeRouter && (typeof maybeRouter === 'function' || maybeRouter.stack)) return maybeRouter;
      } catch (e) {
        // If factory invocation fails, fall back to checking the export itself
        console.warn(`Route factory at ${path} threw when invoked:`, e && e.message ? e.message : e);
      }
    }
    const candidate = mod.default || mod;
    if (candidate && (typeof candidate === 'function' || candidate.stack)) {
      return candidate;
    }
    throw new Error('Route module not a router or factory');
  } catch (err) {
    console.error(`Failed to load route ${path}:`, err && err.message ? err.message : err);
    const router = require('express').Router();
    router.use((req, res) => res.status(500).json({ message: 'Route temporarily unavailable' }));
    return router;
  }
}

// ---------- MOUNT ROUTES ----------
app.use('/v1/auth', safeRequireRoute('./routes/authRoutes'));
app.use('/v1/influencer', safeRequireRoute('./routes/influencerRoutes'));
app.use('/v1/campaigns', safeRequireRoute('./routes/campaignsRoutes'));
app.use('/v1/admin', safeRequireRoute('./routes/adminRoutes'));
app.use('/v1/referrals', safeRequireRoute('./routes/referralRoutes'));

// ---------- 404 ----------
app.use((req, res) => res.status(404).json({ message: 'Not Found' }));

// ---------- ERROR HANDLER ----------
app.use((err, req, res, next) => {
  console.error('🔥 Unhandled error:', err && (err.stack || err));
  const payload = { message: err && err.message ? err.message : 'Something went wrong. Please try again later.' };
  if (process.env.NODE_ENV !== 'production') payload.stack = err && err.stack ? err.stack : undefined;
  res.status(err && err.status ? err.status : 500).json(payload);
});

// ---------- GLOBAL PROCESS HANDLERS ----------
process.on('unhandledRejection', (reason, promise) => console.error('Unhandled Rejection:', reason, promise));
process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err));

// ---------- GRACEFUL SHUTDOWN ----------
async function closeDbPoolIfPossible() {
  try {
    if (db && db.pool && typeof db.pool.end === 'function') {
      await db.pool.end();
      console.log('✅ DB pool closed');
    } else if (db && typeof db.end === 'function') {
      await db.end();
      console.log('✅ DB closed');
    }
  } catch (err) {
    console.error('Error closing DB pool:', err);
  }
}

let serverInstance = null;
async function gracefulShutdown(signal) {
  console.log(`Received ${signal}. Graceful shutdown start...`);
  try {
    if (serverInstance && typeof serverInstance.close === 'function') {
      serverInstance.close(() => console.log('HTTP server closed'));
    }
    await closeDbPoolIfPossible();
  } catch (err) {
    console.error('Error during shutdown:', err);
  } finally {
    setTimeout(() => {
      console.log('Exit after graceful shutdown timeout');
      process.exit(0);
    }, 1000);
  }
}
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// ---------- START SERVER ----------
serverInstance = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Export app (still ok to export)
module.exports = app;
