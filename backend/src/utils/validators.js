'use strict';

const { z } = require('zod');
const { TIME_RE } = require('../services/timeCalculation');
const { DATE_RE } = require('./dates');

const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid identifier');

const optionalObjectId = z
  .union([objectId, z.literal(''), z.null()])
  .optional()
  .transform((v) => (v === '' || v === null ? null : v));

const timeString = z.string().regex(TIME_RE, 'Time must be in HH:MM 24-hour format');
const dateString = z.string().regex(DATE_RE, 'Date must be in YYYY-MM-DD format');

const mobile = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, 'Mobile number must be a valid 10-digit Indian number');

const ifsc = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'IFSC must look like SBIN0001234');

const aadhar = z
  .string()
  .trim()
  .regex(/^\d{12}$/, 'Aadhar number must be exactly 12 digits');

const accountNo = z
  .string()
  .trim()
  .regex(/^\d{6,20}$/, 'Bank account number must be 6-20 digits');

/** Optional-but-validated-when-present string field. */
const optionalString = (schema) =>
  z
    .union([schema, z.literal('')])
    .optional()
    .transform((v) => (v === undefined ? '' : v));

const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
  search: z.string().trim().optional().default(''),
  sortBy: z.string().trim().optional().default(''),
  sortDir: z.enum(['asc', 'desc']).optional().default('asc'),
});

module.exports = {
  z,
  objectId,
  optionalObjectId,
  timeString,
  dateString,
  mobile,
  ifsc,
  aadhar,
  accountNo,
  optionalString,
  paginationQuery,
};
