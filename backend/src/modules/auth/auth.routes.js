'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('./auth.controller');
const { authenticate } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { z } = require('../../utils/validators');
const { env } = require('../../config/env');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: env.isTest ? 10000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please try again in a few minutes.' },
});

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Login ID is required'),
  password: z.string().min(1, 'Password is required'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

const forgotSchema = z.object({
  identifier: z.string().trim().min(1, 'Login ID or email is required'),
});

const resetSchema = z.object({
  identifier: z.string().trim().min(1, 'Login ID or email is required'),
  otp: z.string().trim().min(4, 'Reset code is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

router.post('/login', loginLimiter, validate(loginSchema), controller.login);
router.get('/me', authenticate, controller.me);
router.post(
  '/change-password',
  authenticate,
  validate(changePasswordSchema),
  controller.changePassword
);
router.post('/forgot-password', loginLimiter, validate(forgotSchema), controller.forgotPassword);
router.post('/reset-password', loginLimiter, validate(resetSchema), controller.resetPassword);

module.exports = router;
