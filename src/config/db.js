const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

module.exports = {
  pool,
  async testConnection() {
    try {
      const conn = await pool.getConnection();
      conn.release();
      console.log('✅ MySQL connected');
      return true;
    } catch (err) {
      console.error('❌ MySQL connection failed:', err.message);
      return false;
    }
  }
};
