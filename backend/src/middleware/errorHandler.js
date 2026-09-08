'use strict';

const { env } = require('../config/env');
const { ApiError } = require('../utils/ApiError');

function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} does not exist`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Something went wrong';
  let details = err.details;

  // Mongoose validation -> readable field errors
  if (err.name === 'ValidationError' && err.errors) {
    statusCode = 400;
    details = Object.entries(err.errors).map(([field, e]) => ({ field, message: e.message }));
    message = 'Validation failed';
  }

  // Duplicate key
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyPattern || {})[0] || 'value';
    const friendly = {
      username: 'That login ID is already taken',
      employeeId: 'That employee ID already exists',
      name: 'A record with that name already exists',
      date: 'A record already exists for that date',
    };
    message = friendly[field] || `Duplicate ${field}`;
    if (err.keyPattern?.employee && err.keyPattern?.date) {
      message = 'A DPR entry already exists for this employee on this date';
    }
  }

  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid identifier: ${err.value}`;
  }

  if (statusCode >= 500 && !env.isTest) {
    // eslint-disable-next-line no-console
    console.error('[error]', err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(details ? { details } : {}),
    ...(env.isProduction ? {} : { stack: statusCode >= 500 ? err.stack : undefined }),
  });
}

module.exports = { notFoundHandler, errorHandler };
