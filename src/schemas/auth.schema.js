const { z } = require('zod');

// Signin schema (ALL fields required)
const signinSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

// Signup schema (referralCode optional)
const signupSchema = z.object({
  name: z.string().trim().min(2, 'Name is required'),

  email: z.string().email('Valid email is required'),

  password: z.string().min(6, 'Password must be at least 6 characters'),

  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Invalid phone number'),

  referralCode: z
    .string()
    .trim()
    .min(4, 'Invalid referral code')
    .max(20, 'Invalid referral code')
    .optional()
    .or(z.literal('')),
});

module.exports = {
  signupSchema,
  signinSchema,
};
