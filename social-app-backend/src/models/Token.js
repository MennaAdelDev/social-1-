const mongoose = require('mongoose');

// One-time tokens: email verification (secure link) and password reset (OTP)
const tokenSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['verify_email', 'reset_password'], required: true },
  tokenHash: { type: String, required: true, index: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
});
tokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Token', tokenSchema);
