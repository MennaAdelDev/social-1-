const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

module.exports = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) throw new ApiError(401, 'Authentication required');

  const payload = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET);
  const user = await User.findById(payload.sub);
  if (!user) throw new ApiError(401, 'User no longer exists');
  if (user.passwordChangedAt && user.passwordChangedAt.getTime() / 1000 > payload.iat) {
    throw new ApiError(401, 'Password changed, please log in again');
  }
  req.user = user;
  next();
});
