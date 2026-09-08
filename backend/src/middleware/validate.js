'use strict';

const { ApiError } = require('../utils/ApiError');

/**
 * Zod-powered request validation.
 * Backend validation is always enforced, independently of the frontend.
 */
const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join('.') || source,
      message: issue.message,
    }));
    return next(ApiError.badRequest('Validation failed', details));
  }
  // Replace with the parsed (coerced, stripped) value.
  if (source === 'query') {
    req.validatedQuery = result.data;
  } else {
    req[source] = result.data;
  }
  return next();
};

module.exports = { validate };
