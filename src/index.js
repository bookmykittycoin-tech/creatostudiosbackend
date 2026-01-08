const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();

const db = require('./config/db'); // mysql pool

// ✅ IMPORTANT: fallback port
const PORT = process.env.PORT || 3000;

// -------------------- MIDDLEWARE --------------------
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

// -------------------- HEALTH CHECK --------------------
app.get('/', (req, res) => {
  res.status(200).send('Backend is live');
});

// -------------------- DATABASE (NON-BLOCKING) --------------------
(async () => {
  try {
    const conn = await db.getConnection();
    console.log('✅ Database connected');
    conn.release();
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    // ❗ DO NOT EXIT PROCESS ON HOSTINGER
  }
})();

// -------------------- ROUTES --------------------
app.use('/v1/auth', require('./routes/authRoutes'));
app.use('/v1/influencer', require('./routes/influencerRoutes'));
app.use('/v1/campaigns', require('./routes/campaignsRoutes'));
app.use('/v1/admin', require('./routes/adminRoutes'));
app.use('/v1/referrals', require('./routes/referralRoutes'));

// -------------------- ERROR HANDLER --------------------
app.use((err, req, res, next) => {
  console.error('🔥 ERROR:', err);
  res.status(500).json({
    message: 'Something went wrong. Please try again later.'
  });
});

// -------------------- START SERVER --------------------
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
module.exports = app;