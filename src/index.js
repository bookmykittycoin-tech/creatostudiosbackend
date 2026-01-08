const express = require('express');
const app = express();
const cors = require("cors");
require('dotenv').config();
const db = require('./config/db');
const port =process.env.PORT || 3000;

const authRoutes = require('./routes/authRoutes');
const influencerRoute = require('./routes/influencerRoutes')
const campaignsRouter = require('./routes/campaignsRoutes')
const adminRoutes = require('./routes/adminRoutes')
const referralRoutes = require('./routes/referralRoutes');

app.use(express.json());

app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: "*", // allow all for now
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false // 🚨 MUST BE FALSE WITH "*"
  })
);

(async () => {
  try {
    const conn = await db.getConnection();
    console.log('✅ Database connected');
    conn.release();
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1); // stop app if DB is down
  }
})();

app.use('/v1/auth', authRoutes);
app.use('/v1/influencer', influencerRoute);
app.use('/v1/campaigns', campaignsRouter);
app.use('/v1/admin',adminRoutes);
app.use('/v1/referrals', referralRoutes); 
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});


module.exports = app;