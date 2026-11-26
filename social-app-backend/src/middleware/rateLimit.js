const rateLimit = require('express-rate-limit');

const make = (windowMs, max, message) =>
  rateLimit({
    windowMs, max, standardHeaders: true, legacyHeaders: false,
    message: { success: false, message },
  });

exports.globalLimiter = make(15 * 60 * 1000, 300, 'Too many requests, try again later');
exports.authLimiter = make(15 * 60 * 1000, 30, 'Too many attempts, try again later');
exports.otpLimiter = make(60 * 60 * 1000, 5, 'Too many code requests, try again later');
