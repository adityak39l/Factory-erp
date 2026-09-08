'use strict';

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { env } = require('../config/env');
const { ApiError, asyncHandler } = require('../utils/ApiError');

function signToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

/** Verifies the bearer token and loads the live user (so permission changes apply instantly). */
const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) throw ApiError.unauthorized('Authentication token missing');

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch (err) {
    throw ApiError.unauthorized(
      err.name === 'TokenExpiredError' ? 'Session expired, please sign in again' : 'Invalid token'
    );
  }

  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('Account no longer exists');
  if (!user.isActive) throw ApiError.forbidden('This login has been disabled by the administrator');

  req.user = user;
  next();
});

/** Admin-only routes. */
function requireAdmin(req, res, next) {
  if (!req.user) return next(ApiError.unauthorized());
  if (req.user.role !== 'admin') {
    return next(ApiError.forbidden('Only the administrator can perform this action'));
  }
  return next();
}

module.exports = { authenticate, requireAdmin, signToken };
