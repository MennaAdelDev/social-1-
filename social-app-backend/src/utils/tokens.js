const jwt = require('jsonwebtoken');
const env = require('../config/env');
const RefreshToken = require('../models/RefreshToken');
const { randomToken, sha256 } = require('./crypto');

const signAccessToken = (userId) =>
  jwt.sign({ sub: String(userId) }, env.JWT_ACCESS_SECRET, { expiresIn: env.ACCESS_TOKEN_TTL });

// Refresh token = opaque random string; only its hash is stored in the DB.
async function createRefreshToken(userId, req, family = randomToken(16)) {
  const token = randomToken(48);
  await RefreshToken.create({
    user: userId,
    tokenHash: sha256(token),
    family,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400000),
    userAgent: req.headers['user-agent'],
    ip: req.ip,
  });
  return token;
}

async function issueTokens(user, req, family) {
  return {
    accessToken: signAccessToken(user._id),
    accessTokenExpiresIn: env.ACCESS_TOKEN_TTL,
    refreshToken: await createRefreshToken(user._id, req, family),
  };
}

const revokeAllUserTokens = (userId) =>
  RefreshToken.updateMany({ user: userId, revokedAt: null }, { revokedAt: new Date() });

module.exports = { signAccessToken, issueTokens, revokeAllUserTokens };
