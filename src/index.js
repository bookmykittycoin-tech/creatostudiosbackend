const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const db = require('./config/db'); // ensure this exports getConnection()

// Use a safe PORT fallback so the app doesn't crash if HOSTINGER doesn't set it immediately
const port = process.env.PORT || 3000;

// middleware
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

// health check (MANDATORY for hosters/proxies)
app.get('/', (req, res) => {
  res.status(200).send('Backend is live');
});

// DB connection check (NON-FATAL) — logs error but keeps process alive
(async () => {
  try {
    const conn = await db.getConnection();
    console.log('✅ Database connected');
    if (conn && conn.release) conn.release();
  } catch (err) {
    console.error('❌ Database connection failed:', err && err.message ? err.message : err);
    // don't exit the process on shared hosting — keep app alive for debugging and health checks
  }
})();

// routes — ensure these files export an Express router: module.exports = router;
app.use('/v1/auth', require('./routes/authRoutes'));
app.use('/v1/influencer', require('./routes/influencerRoutes'));
app.use('/v1/campaigns', require('./routes/campaignsRoutes'));
app.use('/v1/admin', require('./routes/adminRoutes'));
app.use('/v1/referrals', require('./routes/referralRoutes')); // fixed syntax

// basic error handler (useful for catching route errors)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// global process handlers (logs + keep process predictable)
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // do not call process.exit here on shared hosting; log and let host restart if needed
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});

module.exports = app;
