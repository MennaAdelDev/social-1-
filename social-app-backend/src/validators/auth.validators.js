const { z } = require('zod');

const email = z.string().trim().toLowerCase().email();
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');
const username = z
  .string().trim().toLowerCase().min(3).max(30)
  .regex(/^[a-z0-9_.]+$/, 'Only letters, numbers, "_" and "." are allowed');

exports.username = username;
exports.password = password;

exports.register = z.object({
  name: z.string().trim().min(1).max(60),
  username,
  email,
  password,
});
exports.verifyEmail = z.object({ token: z.string().min(10) });
exports.emailOnly = z.object({ email });
exports.login = z.object({
  identifier: z.string().trim().toLowerCase().min(3), // email or username
  password: z.string().min(1),
});
exports.refresh = z.object({ refreshToken: z.string().min(10) });
exports.resetPassword = z.object({
  email,
  otp: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits'),
  newPassword: password,
});
exports.google = z.object({ idToken: z.string().min(10) });
