// src/index.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const db = require('./config/db'); // mysql pool or helper module

const app = express();

// Use a safe PORT fallback so the app doesn't crash if HOSTINGER doesn't set it immediately
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

// Simple request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// ---------- HEALTH CHECK ----------
app.get('/', (req, res) => {
  res.status(200).send('Backend is live');
});
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// ---------- DB TESTER (NON-FATAL) ----------
async function testDbConnection() {
  try {
    // Pattern 1: module exports testConnection()
    if (db && typeof db.testConnection === 'function') {
      const ok = await db.testConnection();
      if (ok) console.log('✅ Database connected (via testConnection)');
      return true;
    }

    // Pattern 2: module exports getConnection()
    if (db && typeof db.getConnection === 'function') {
      const conn = await db.getConnection();
      if (conn && typeof conn.release === 'function') conn.release();
      console.log('✅ Database connected (via getConnection)');
      return true;
    }

    // Pattern 3: module exports { pool }
    if (db && db.pool && typeof db.pool.getConnection === 'function') {
      const conn = await db.pool.getConnection();
      if (conn && typeof conn.release === 'function') conn.release();
      console.log('✅ Database connected (via pool.getConnection)');
      return true;
    }

    // Pattern 4: module itself is a pool with .query
    if (db && typeof db.query === 'function') {
      await db.query('SELECT 1');
      console.log('✅ Database connected (via query)');
      return true;
    }

    console.warn('⚠️ DB module export not recognized; skipping automatic DB test.');
    return false;
  } catch (err) {
    console.error('❌ Database connection failed:', err && err.message ? err.message : err);
    return false;
  }
}

// Kick off non-blocking DB test (do not await on startup)
testDbConnection().catch((e) => console.error('Unexpected DB test error:', e));

// ---------- DB-TEST ROUTE ----------
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

// ---------- SAFE ROUTE LOADING (supports router or factory) ----------
function safeRequireRoute(path) {
  try {
    const mod = require(path);

    // If module exports a function, call it with { app, db, express } and expect a router back
    if (typeof mod === 'function') {
      try {
        const maybeRouter = mod({ app, db, express });
        // If the factory returned a router (or middleware), use it; otherwise return original export
        if (maybeRouter && (typeof maybeRouter === 'function' || maybeRouter.stack)) {
          return maybeRouter;
        }
      } catch (e) {
        console.warn(`Route factory at ${path} threw when invoked:`, e && e.message ? e.message : e);
        // fallthrough to try using the original export if it's a router
      }
    }

    // If module is an object with default, try default
    const candidate = mod.default || mod;
    // If candidate looks like an Express router/middleware, return it
    if (candidate && (typeof candidate === 'function' || candidate.stack)) {
      return candidate;
    }

    // Otherwise fallback to safe stub
    throw new Error('Route module not a router or factory');
  } catch (err) {
    console.error(`Failed to load route ${path}:`, err && err.message ? err.message : err);
    const expressRouter = require('express').Router();
    expressRouter.use((req, res) => {
      res.status(500).json({ message: 'Route temporarily unavailable' });
    });
    return expressRouter;
  }
}

// Mount routes
app.use('/v1/auth', safeRequireRoute('./routes/authRoutes'));
app.use('/v1/influencer', safeRequireRoute('./routes/influencerRoutes'));
app.use('/v1/campaigns', safeRequireRoute('./routes/campaignsRoutes'));
app.use('/v1/admin', safeRequireRoute('./routes/adminRoutes'));
app.use('/v1/referrals', safeRequireRoute('./routes/referralRoutes'));

// ---------- 404 HANDLER ----------
app.use((req, res) => {
  res.status(404).json({ message: 'Not Found' });
});

// ---------- ERROR HANDLER ----------
app.use((err, req, res, next) => {
  console.error('🔥 ERROR:', err && (err.stack || err));
  const payload = {
    message: err && err.message ? err.message : 'Something went wrong. Please try again later.'
  };
  if (process.env.NODE_ENV !== 'production') {
    payload.stack = err && err.stack ? err.stack : undefined;
  }
  res.status(err && err.status ? err.status : 500).json(payload);
});

// ---------- GLOBAL PROCESS HANDLERS (LOG ONLY) ----------
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // DO NOT exit in shared hosting; host will manage restarts when necessary
});

// ---------- GRACEFUL SHUTDOWN ----------
async function closeDbPoolIfPossible() {
  try {
    // mysql2 pool has .end()
    if (db && db.pool && typeof db.pool.end === 'function') {
      await db.pool.end();
      console.log('✅ DB pool closed');
      return;
    }
    // if module itself is pool
    if (db && typeof db.end === 'function') {
      await db.end();
      console.log('✅ DB closed');
    }
  } catch (err) {
    console.error('Error closing DB pool:', err);
  }
}

let serverInstance = null;
async function gracefulShutdown(signal) {
  console.log(`Received ${signal}. Starting graceful shutdown...`);
  try {
    if (serverInstance && typeof serverInstance.close === 'function') {
      serverInstance.close(() => {
        console.log('HTTP server closed');
      });
    }
    await closeDbPoolIfPossible();
  } catch (err) {
    console.error('Error during graceful shutdown:', err);
  } finally {
    // Allow process to exit naturally; on many hosts calling process.exit is discouraged
    setTimeout(() => {
      console.log('Exiting process after graceful shutdown timeout');
      // it's OK to exit here as a last resort
      process.exit(0);
    }, 1000);
  }
}
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// ---------- START SERVER WHEN RUN DIRECTLY (HOSTINGER) ----------
if (require.main === module) {
  serverInstance = app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}

// Export app for serverless platforms (Vercel) or tests
module.exports = app;
