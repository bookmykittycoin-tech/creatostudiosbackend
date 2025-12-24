const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { signupSchema, signinSchema } = require('../schemas/auth.schema');
const { STATUS_CODE } = require('../utils/statusCode');
const generateReferralCode = require('../utils/referralCode');

const signup = async (req, res) => {
  const parsedBody = signupSchema.safeParse(req.body);

  if (!parsedBody.success) {
    return res.status(STATUS_CODE.BAD_REQUEST).json({
      message: 'Please enter valid input values.',
      errors: parsedBody.error.errors,
    });
  }

  const { name, email, phone, address, password, referralCode } = parsedBody.data;

  try {
    const [existingUser] = await db.execute(
      'SELECT id FROM influencer WHERE email = ? OR phone = ?',
      [email, phone]
    );

    if (existingUser.length > 0) {
      return res.status(STATUS_CODE.CONFLICT).json({
        message: 'User already exists with this email or phone.',
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

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

    const token = jwt.sign(
      { id: result.insertId, email },
      process.env.JWT_SECRET || 'super_secret_key_change_this',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.status(STATUS_CODE.CREATED).json({
      message: 'Signup successful',
      token,
      data: {
        id: result.insertId,
        name,
        email,
        phone,
        address,
        referralCode: myReferralCode,
      },
    });

  } catch (error) {
    console.error('SIGNUP ERROR:', error);

    return res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({
      message: 'Something went wrong. Please try again later.',
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




module.exports = { signup,signin };
