const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { signupSchema, signinSchema } = require('../schemas/auth.schema');
const { STATUS_CODE } = require('../utils/statusCode');
const generateReferralCode = require('../utils/referralCode');
const crypto = require("crypto");
const sendEmail = require("../utils/mailer");
const emailOtps = require("../utils/emailOtpStore");


const signup = async (req, res) => {
  const parsedBody = signupSchema.safeParse(req.body);

  if (!parsedBody.success) {
    return res.status(400).json({
      message: 'Invalid input',
      errors: parsedBody.error.errors,
    });
  }

  const { name, email, phone, address, password, referralCode } = parsedBody.data;

  try {
    // 1️⃣ Check duplicate user
    const [existingUser] = await db.execute(
      'SELECT id FROM influencer WHERE email = ? OR phone = ?',
      [email, phone]
    );

    if (existingUser.length > 0) {
      return res.status(409).json({
        message: 'User already exists',
      });
    }

    // 2️⃣ Validate referral code (if provided)
    let referrerId = null;

    if (referralCode) {
      const [referrer] = await db.execute(
        'SELECT id FROM influencer WHERE referral_code = ?',
        [referralCode]
      );

      if (referrer.length === 0) {
        return res.status(400).json({
          message: 'Invalid referral code',
        });
      }

      referrerId = referrer[0].id;
    }

    // 3️⃣ Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 4️⃣ Generate unique referral code
    let myReferralCode;
    let isUnique = false;

    while (!isUnique) {
      myReferralCode = generateReferralCode();
      const [rows] = await db.execute(
        'SELECT id FROM influencer WHERE referral_code = ?',
        [myReferralCode]
      );
      if (rows.length === 0) isUnique = true;
    }

    // 5️⃣ Insert new user
    const [result] = await db.execute(
      `INSERT INTO influencer 
       (name, email, phone, address, password, referral_code, referred_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        email,
        phone,
        address,
        hashedPassword,
        myReferralCode,
        referralCode || null,
      ]
    );

    const newUserId = result.insertId;

    // 6️⃣ TRACKING LOGIC (🔥 IMPORTANT PART)
    if (referrerId) {
      await db.execute(
        `
        INSERT INTO tracking (influencer_id, campaign_id, clicks, conversions)
        VALUES (?, 1, 1, 1)
        ON DUPLICATE KEY UPDATE
          clicks = clicks + 1,
          conversions = conversions + 1,
          updated_at = CURRENT_TIMESTAMP
        `,
        [referrerId]
      );
    }

    // 7️⃣ JWT Token
    const token = jwt.sign(
      { id: newUserId, email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

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
    console.error('SIGNUP ERROR:', error);
    return res.status(500).json({
      message: 'Server error',
    });
  }
};






const signin = async (req, res) => {
  // 1️⃣ Validate input
  const parsedBody = signinSchema.safeParse(req.body);

  if (!parsedBody.success) {
    return res.status(STATUS_CODE.BAD_REQUEST).json({
      message: 'Invalid input values',
      errors: parsedBody.error.errors,
    });
  }

  const { email, password } = parsedBody.data;

  try {
    // 2️⃣ Find user by email
    const [rows] = await db.execute(
      `SELECT id, name, email, phone, password, referral_code 
       FROM influencer 
       WHERE email = ?`,
      [email]
    );

    if (rows.length === 0) {
      return res.status(STATUS_CODE.UNAUTHORIZED).json({
        message: 'Invalid email or password',
      });
    }

    const user = rows[0];

    // 3️⃣ Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(STATUS_CODE.UNAUTHORIZED).json({
        message: 'Invalid email or password',
      });
    }

    // 4️⃣ Generate JWT (Bearer token)
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      }
    );

    // 5️⃣ Success response (NO password)
    return res.status(STATUS_CODE.OK).json({
      message: 'Signin successful',
      token, // 👈 Bearer token
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

    return res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({
      message: 'Something went wrong. Please try again later.',
    });
  }
};





const sendEmailOtp = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  const otp = crypto.randomInt(100000, 999999).toString();

  emailOtps.set(email, {
    otp,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });

await sendEmail(
  email,
  "Your OTP for Creato Studios Verification",
  `
  <div style="font-family: Arial, sans-serif; background:#f7f7f7; padding:30px;">
    <div style="max-width:500px; margin:auto; background:#ffffff; padding:25px; border-radius:8px;">
      
      <h2 style="color:#111; margin-bottom:10px;">Book My Kitty – Email Verification</h2>
      
      <p style="font-size:15px; color:#333;">
        Hello,
      </p>

      <p style="font-size:15px; color:#333;">
        Your One-Time Password (OTP) for verifying your email address is:
      </p>

      <div style="
        font-size:28px;
        font-weight:bold;
        letter-spacing:6px;
        text-align:center;
        margin:20px 0;
        color:#000;
      ">
        ${otp}
      </div>

      <p style="font-size:14px; color:#555;">
        This OTP is valid for <b>5 minutes</b>. Please do not share it with anyone.
      </p>

      <hr style="margin:20px 0; border:none; border-top:1px solid #eee;" />

      <p style="font-size:12px; color:#777;">
        If you did not request this verification, please ignore this email.
      </p>

      <p style="font-size:12px; color:#777; margin-top:10px;">
        — Team <b>Creato Studios</b>
      </p>

    </div>
  </div>
  `
);


  return res.json({
    success: true,
    message: "OTP sent to email",
  });
};


const verifyEmailOtp = async (req, res) => {
  const { email, code } = req.body;

  const record = emailOtps.get(email);

  if (!record) {
    return res.status(400).json({ message: "OTP not found" });
  }

  if (Date.now() > record.expiresAt) {
    emailOtps.delete(email);
    return res.status(400).json({ message: "OTP expired" });
  }

  if (record.otp !== code) {
    return res.status(400).json({ message: "Invalid OTP" });
  }

  emailOtps.delete(email);

  const otpToken = jwt.sign(
    { email, purpose: "email_otp" },
    process.env.JWT_SECRET,
    { expiresIn: "10m" }
  );

  return res.json({
    success: true,
    message: "Email verified",
    token: otpToken,
  });
};



module.exports = { signup,signin,sendEmailOtp, verifyEmailOtp };
