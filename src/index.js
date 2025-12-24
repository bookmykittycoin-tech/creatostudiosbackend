const express = require('express');
const app = express();
const cors = require("cors");
require('dotenv').config();
const db = require('./config/db');
const port =process.env.PORT;

const authRoutes = require('./routes/authRoutes');
const influencerRoute = require('./routes/influencerRoutes')


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
// app.listen(port, () => {
//   console.log(`Example app listening on port ${port}`);
// });


module.exports = app;