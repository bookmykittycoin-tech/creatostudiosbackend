const express = require('express');
const app = express();
const cors = require("cors");
require('dotenv').config();
const db = require('./config/db');

const authRoutes = require('./routes/authRoutes');
const influencerRoute = require('./routes/influencerRoutes');

// ✅ CORS FIRST
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false
  })
);

// ✅ Handle preflight
app.options("*", cors());

// ✅ Body parsers AFTER CORS
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ DB check
(async () => {
  try {
    const conn = await db.getConnection();
    console.log('✅ Database connected');
    conn.release();
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
  }
})();

// ✅ Routes
app.use('/v1/auth', authRoutes);
app.use('/v1/influencer', influencerRoute);

module.exports = app;
