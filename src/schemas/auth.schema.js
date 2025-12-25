const { z } = require('zod');

// Signin schema (ALL fields required)
const signinSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

// Signup schema (referralCode optional)
const signupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name is required'),

  email: z
    .string()
    .email('Valid email is required'),

  password: z
    .string()
    .min(6, 'Password must be at least 6 characters'),

phone: z
  .string()
  .trim()
  .regex(
    /^(?:\+91)?[6-9]\d{9}$/,
    'Invalid Indian phone number'
  ),


  address: z
    .string()
    .trim()
    .min(5, 'Address is required')
    .max(250, 'Address is too long'),

  referralCode: z
    .string()
    .trim()
    .min(4, 'Invalid referral code')
    .max(20, 'Invalid referral code')
    .optional()
    .nullable()
    .or(z.literal('')),
});



module.exports = {
  signupSchema,
  signinSchema,
};
