const { OAuth2Client } = require('google-auth-library');
const env = require('../config/env');
const User = require('../models/User');
const Token = require('../models/Token');
const RefreshToken = require('../models/RefreshToken');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sha256, randomToken, randomOtp, safeEqual } = require('../utils/crypto');
const { issueTokens, revokeAllUserTokens } = require('../utils/tokens');
const { sendVerificationEmail, sendResetOtpEmail } = require('../utils/email');

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID || undefined);

async function sendVerification(user) {
  await Token.deleteMany({ user: user._id, type: 'verify_email' });
  const raw = randomToken(32);
  await Token.create({
    user: user._id, type: 'verify_email', tokenHash: sha256(raw),
    expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
  });
  await sendVerificationEmail(user, raw);
}

// ---------- Registration & email verification ----------
exports.register = asyncHandler(async (req, res) => {
  const { name, username, email, password } = req.body;
  const exists = await User.findOne({ $or: [{ email }, { username }] }).select('email');
  if (exists) {
    throw new ApiError(409, exists.email === email ? 'Email already in use' : 'Username already taken');
  }
  const user = await User.create({ name, username, email, password });
  try {
    await sendVerification(user);
  } catch (e) {
    console.error('Failed to send verification email:', e.message);
  }
  res.status(201).json({
    success: true,
    message: 'Registered successfully. Check your email to verify your account.',
    data: { user },
  });
});

exports.verifyEmail = asyncHandler(async (req, res) => {
  const token = await Token.findOne({
    type: 'verify_email', tokenHash: sha256(req.query.token || req.body.token), expiresAt: { $gt: new Date() },
  });
  if (!token) throw new ApiError(400, 'Invalid or expired verification link');
  await User.updateOne({ _id: token.user }, { isEmailVerified: true });
  await Token.deleteMany({ user: token.user, type: 'verify_email' });
  res.json({ success: true, message: 'Email verified successfully. You can now log in.' });
});

exports.resendVerification = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (user && !user.isEmailVerified) {
    await sendVerification(user).catch((e) => console.error(e.message));
  }
  res.json({ success: true, message: 'If the account exists and is unverified, an email was sent.' });
});

// ---------- Login / sessions ----------
exports.login = asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;
  const user = await User.findOne({
    $or: [{ email: identifier }, { username: identifier }],
  }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, 'Invalid credentials');
  }
  if (!user.isEmailVerified) throw new ApiError(403, 'Please verify your email first');

  const tokens = await issueTokens(user, req);
  res.json({ success: true, data: { user, ...tokens } });
});

// Rotation + reuse detection: a refresh token can be used once.
exports.refresh = asyncHandler(async (req, res) => {
  const hash = sha256(req.body.refreshToken);
  const current = await RefreshToken.findOneAndUpdate(
    { tokenHash: hash, revokedAt: null, expiresAt: { $gt: new Date() } },
    { revokedAt: new Date() }
  );
  if (!current) {
    const reused = await RefreshToken.findOne({ tokenHash: hash });
    if (reused) await RefreshToken.updateMany({ family: reused.family, revokedAt: null }, { revokedAt: new Date() });
    throw new ApiError(401, 'Invalid refresh token');
  }
  const user = await User.findById(current.user);
  if (!user) throw new ApiError(401, 'User no longer exists');
  const tokens = await issueTokens(user, req, current.family);
  res.json({ success: true, data: tokens });
});

exports.logout = asyncHandler(async (req, res) => {
  await RefreshToken.updateOne(
    { tokenHash: sha256(req.body.refreshToken), revokedAt: null },
    { revokedAt: new Date() }
  );
  res.json({ success: true, message: 'Logged out' });
});

exports.logoutAll = asyncHandler(async (req, res) => {
  await revokeAllUserTokens(req.user._id);
  res.json({ success: true, message: 'Logged out from all devices' });
});

// ---------- Password reset (OTP) ----------
exports.forgotPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (user) {
    await Token.deleteMany({ user: user._id, type: 'reset_password' });
    const otp = randomOtp();
    await Token.create({
      user: user._id, type: 'reset_password', tokenHash: sha256(otp),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });
    await sendResetOtpEmail(user, otp).catch((e) => console.error(e.message));
  }
  // Same response either way (no account enumeration)
  res.json({ success: true, message: 'If the email exists, a reset code was sent.' });
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = req.body;
  const user = await User.findOne({ email });
  const token = user && (await Token.findOne({
    user: user._id, type: 'reset_password', expiresAt: { $gt: new Date() },
  }));
  if (!token) throw new ApiError(400, 'Invalid or expired code');

  if (token.attempts >= MAX_OTP_ATTEMPTS) {
    await token.deleteOne();
    throw new ApiError(429, 'Too many wrong attempts, request a new code');
  }
  if (!safeEqual(token.tokenHash, sha256(otp))) {
    token.attempts += 1;
    await token.save();
    throw new ApiError(400, 'Invalid or expired code');
  }

  user.password = newPassword;
  user.isEmailVerified = true; // they proved ownership of the mailbox
  await user.save();
  await Token.deleteMany({ user: user._id, type: 'reset_password' });
  await revokeAllUserTokens(user._id);
  res.json({ success: true, message: 'Password updated. Please log in.' });
});

// ---------- Google OAuth 2.0 (ID token flow) ----------
async function uniqueUsername(base) {
  const clean = base.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20) || 'user';
  for (let i = 0; i < 5; i += 1) {
    const candidate = i === 0 ? clean : `${clean}${Math.floor(1000 + Math.random() * 9000)}`;
    if (!(await User.exists({ username: candidate }))) return candidate.padEnd(3, '0');
  }
  return `${clean}${Date.now().toString().slice(-6)}`;
}

exports.googleLogin = asyncHandler(async (req, res) => {
  if (!env.GOOGLE_CLIENT_ID) throw new ApiError(501, 'Google sign-in is not configured');

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: req.body.idToken, audience: env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    throw new ApiError(401, 'Invalid Google token');
  }
  if (!payload.email || !payload.email_verified) throw new ApiError(401, 'Google email not verified');

  const email = payload.email.toLowerCase();
  let user = await User.findOne({ $or: [{ googleId: payload.sub }, { email }] }).select('+googleId');
  if (!user) {
    user = await User.create({
      name: payload.name || email.split('@')[0],
      username: await uniqueUsername(email.split('@')[0]),
      email, googleId: payload.sub, avatar: payload.picture || '', isEmailVerified: true,
    });
  } else if (!user.googleId) {
    user.googleId = payload.sub;
    user.isEmailVerified = true;
    await user.save();
  }
  const tokens = await issueTokens(user, req);
  res.json({ success: true, data: { user, ...tokens } });
});
