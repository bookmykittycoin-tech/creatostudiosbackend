// controllers/authController.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { signupSchema, signinSchema, adminSigninSchema } = require('../schemas/auth.schema');
const { STATUS_CODE } = require('../utils/statusCode');
const generateReferralCode = require('../utils/referralCode');
const crypto = require("crypto");
const sendEmail = require("../utils/mailer");
const emailOtps = require("../utils/emailOtpStore");

// ---------- DB QUERY HELPER (works with pool.execute / pool.query / db.execute / getConnection) ----------
async function runQuery(sql, params = []) {
  if (!db) throw new Error('DB module not found');

  // pool.execute or pool.query
  if (typeof db.execute === 'function') {
    return db.execute(sql, params);
  }
  if (db.pool && typeof db.pool.execute === 'function') {
    return db.pool.execute(sql, params);
  }
  if (db.pool && typeof db.pool.query === 'function') {
    return db.pool.query(sql, params);
  }
  if (typeof db.query === 'function') {
    return db.query(sql, params);
  }
  if (typeof db.getConnection === 'function') {
    const conn = await db.getConnection();
    try {
      const result = await conn.execute(sql, params);
      return result;
    } finally {
      if (conn && typeof conn.release === 'function') conn.release();
    }
  }

  throw new Error('Unsupported DB interface');
}

// ---------- SIGNUP ----------
const signup = async (req, res) => {
  const parsedBody = signupSchema.safeParse(req.body);

  if (!parsedBody.success) {
    return res.status(400).json({
      message: 'Invalid input',
      errors: parsedBody.error.errors,
    });
  }

  const { name, email, phone, address, password, referralCode } = parsedBody.data;

  // Using a connection for transactional work (if getConnection exists)
  let conn = null;
  let usingConn = false;

  try {
    if (db && typeof db.getConnection === 'function') {
      conn = await db.getConnection();
      usingConn = true;
      await conn.beginTransaction();
    }

    // 1. Duplicate user check
    const [existingUser] = usingConn
      ? await conn.execute('SELECT id FROM influencer WHERE email = ? OR phone = ?', [email, phone])
      : await runQuery('SELECT id FROM influencer WHERE email = ? OR phone = ?', [email, phone]);

    if (existingUser.length > 0) {
      if (usingConn) await conn.rollback();
      return res.status(409).json({ message: 'User already exists' });
    }

    // 2. Validate referral code
    let referrerId = null;
    if (referralCode) {
      const [referrer] = usingConn
        ? await conn.execute('SELECT id FROM influencer WHERE referral_code = ?', [referralCode])
        : await runQuery('SELECT id FROM influencer WHERE referral_code = ?', [referralCode]);

      if (!referrer.length) {
        if (usingConn) await conn.rollback();
        return res.status(400).json({ message: 'Invalid referral code' });
      }
      referrerId = referrer[0].id;
    }

    // 3. Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 4. Generate unique referral code
    let myReferralCode;
    while (true) {
      myReferralCode = generateReferralCode();
      const [rows] = usingConn
        ? await conn.execute('SELECT id FROM influencer WHERE referral_code = ?', [myReferralCode])
        : await runQuery('SELECT id FROM influencer WHERE referral_code = ?', [myReferralCode]);
      if (!rows.length) break;
    }

    // 5. Insert influencer
    const insertSql = `
      INSERT INTO influencer 
      (name, email, phone, address, password, referral_code, referred_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const insertParams = [name, email, phone, address, hashedPassword, myReferralCode, referralCode || null];

    const [result] = usingConn
      ? await conn.execute(insertSql, insertParams)
      : await runQuery(insertSql, insertParams);

    const newUserId = result.insertId;

    // 6. Referral conversion
    if (referrerId) {
      const refSql = `
        INSERT INTO referrals
          (referrer_id, referred_id, clicks, conversions, referral_reward)
        VALUES (?, ?, 0, 1, 0)
        ON DUPLICATE KEY UPDATE
          conversions = conversions + 1,
          updated_at = CURRENT_TIMESTAMP
      `;
      await (usingConn
        ? conn.execute(refSql, [referrerId, newUserId])
        : runQuery(refSql, [referrerId, newUserId]));
    }

    if (usingConn) await conn.commit();

    // 7. JWT
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET missing in environment');
      return res.status(500).json({ message: 'Server misconfiguration (JWT_SECRET missing)' });
    }

    const token = jwt.sign({ id: newUserId, email }, process.env.JWT_SECRET, { expiresIn: '7d' });

    return res.status(201).json({
      message: 'Signup successful',
      token,
      data: {
        id: newUserId,
        name,
        email,
        phone,
        referralCode: myReferralCode,
      },
    });
  } catch (error) {
    if (usingConn && conn) {
      try { await conn.rollback(); } catch (_) {}
    }
    console.error('SIGNUP ERROR:', error);
    if (process.env.NODE_ENV !== 'production') {
      return res.status(500).json({ message: 'Server error', error: error.message, stack: error.stack });
    }
    return res.status(500).json({ message: 'Server error' });
  } finally {
    try { if (conn && conn.release) conn.release(); } catch (_) {}
  }
};

// ---------- SIGNIN ----------
const signin = async (req, res) => {
  const parsedBody = signinSchema.safeParse(req.body);

  if (!parsedBody.success) {
    return res.status(STATUS_CODE.BAD_REQUEST).json({
      message: 'Invalid input values',
      errors: parsedBody.error.errors,
    });
  }

  const { email, password } = parsedBody.data;

  try {
    const [rows] = await runQuery(
      `SELECT id, name, email, phone, password, referral_code 
       FROM influencer 
       WHERE email = ?`,
      [email]
    );

    if (!rows || rows.length === 0) {
      return res.status(STATUS_CODE.UNAUTHORIZED).json({ message: 'Invalid email or password' });
    }

    const user = rows[0];

    if (!user.password) {
      console.warn('User has no password hash:', user.id);
      return res.status(STATUS_CODE.UNAUTHORIZED).json({ message: 'Invalid email or password' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(STATUS_CODE.UNAUTHORIZED).json({ message: 'Invalid email or password' });
    }

    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET missing in environment');
      return res.status(500).json({ message: 'Server misconfiguration (JWT_SECRET missing)' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });

    return res.status(STATUS_CODE.OK).json({
      message: 'Signin successful',
      token,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        referralCode: user.referral_code,
      },
    });
  } catch (error) {
    console.error('SIGNIN ERROR:', error);
    if (process.env.NODE_ENV !== 'production') {
      return res.status(500).json({ message: 'Something went wrong. Please try again later.', error: error.message, stack: error.stack });
    }
    return res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({ message: 'Something went wrong. Please try again later.' });
  }
};

// ---------- ADMIN SIGNIN ----------
const adminSignin = async (req, res) => {
  const parsedBody = adminSigninSchema.safeParse(req.body);

  if (!parsedBody.success) {
    return res.status(STATUS_CODE.BAD_REQUEST).json({
      message: 'Invalid input values',
      errors: parsedBody.error.errors,
    });
  }

  const { email, password } = parsedBody.data;

  try {
    const [rows] = await runQuery(
      `SELECT id, name, email, password, role 
       FROM admin 
       WHERE email = ?`,
      [email]
    );

    if (!rows || rows.length === 0) {
      return res.status(STATUS_CODE.UNAUTHORIZED).json({ message: 'Invalid email or password' });
    }

    const admin = rows[0];

    if (!admin.password) {
      return res.status(STATUS_CODE.UNAUTHORIZED).json({ message: 'Invalid email or password' });
    }

    const isPasswordValid = await bcrypt.compare(password, admin.password);

    if (!isPasswordValid) {
      return res.status(STATUS_CODE.UNAUTHORIZED).json({ message: 'Invalid email or password' });
    }

    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET missing in environment');
      return res.status(500).json({ message: 'Server misconfiguration (JWT_SECRET missing)' });
    }

    const token = jwt.sign({ id: admin.id, email: admin.email, role: admin.role || 'admin' }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });

    return res.status(STATUS_CODE.OK).json({
      message: 'Admin signin successful',
      token,
      data: { id: admin.id, name: admin.name, email: admin.email, role: admin.role },
    });
  } catch (error) {
    console.error('ADMIN SIGNIN ERROR:', error);
    if (process.env.NODE_ENV !== 'production') {
      return res.status(500).json({ message: 'Something went wrong.', error: error.message, stack: error.stack });
    }
    return res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({ message: 'Something went wrong. Please try again later.' });
  }
};

// ---------- EMAIL OTP ----------
const sendEmailOtp = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email is required' });

  const otp = crypto.randomInt(100000, 999999).toString();
  emailOtps.set(email, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });

  try {
    await sendEmail(
      email,
      'Your OTP for Creato Studios Verification',
      `<div style="font-family: Arial, sans-serif; background:#f7f7f7; padding:30px;">... OTP: ${otp} ...</div>`
    );
    return res.json({ success: true, message: 'OTP sent to email' });
  } catch (err) {
    console.error('EMAIL SEND ERROR:', err);
    if (process.env.NODE_ENV !== 'production') return res.status(500).json({ message: 'Failed to send OTP', error: err.message, stack: err.stack });
    return res.status(500).json({ message: 'Failed to send OTP' });
  }
};

const verifyEmailOtp = async (req, res) => {
  const { email, code } = req.body;
  const record = emailOtps.get(email);
  if (!record) return res.status(400).json({ message: 'OTP not found' });
  if (Date.now() > record.expiresAt) { emailOtps.delete(email); return res.status(400).json({ message: 'OTP expired' }); }
  if (record.otp !== code) return res.status(400).json({ message: 'Invalid OTP' });

  emailOtps.delete(email);
  if (!process.env.JWT_SECRET) return res.status(500).json({ message: 'Server misconfiguration (JWT_SECRET missing)' });

  const otpToken = jwt.sign({ email, purpose: 'email_otp' }, process.env.JWT_SECRET, { expiresIn: '10m' });
  return res.json({ success: true, message: 'Email verified', token: otpToken });
};

module.exports = { signup, signin, sendEmailOtp, verifyEmailOtp, adminSignin };
