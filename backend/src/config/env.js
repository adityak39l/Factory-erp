'use strict';

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const bool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isTest: process.env.NODE_ENV === 'test',
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 5000),

  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/trading_engineers_dpr',

  jwtSecret: process.env.JWT_SECRET || 'insecure_dev_secret_change_me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',

  // 32 bytes hex. A deterministic dev default keeps local setup frictionless,
  // but the server refuses to boot in production without a real key (see validateEnv).
  encryptionKey:
    process.env.ENCRYPTION_KEY ||
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',

  seed: {
    username: process.env.SEED_ADMIN_USERNAME || 'admin',
    password: process.env.SEED_ADMIN_PASSWORD || 'Admin@12345',
    name: process.env.SEED_ADMIN_NAME || 'System Administrator',
    email: process.env.SEED_ADMIN_EMAIL || 'admin@tradingengineers.com',
  },

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: bool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'Trading Engineers DPR <no-reply@tradingengineers.com>',
  },
};

/**
 * Fails fast on misconfiguration that would silently weaken security in production.
 */
function validateEnv() {
  const problems = [];

  if (!/^[0-9a-fA-F]{64}$/.test(env.encryptionKey)) {
    problems.push('ENCRYPTION_KEY must be exactly 64 hexadecimal characters (32 bytes).');
  }

  if (env.isProduction) {
    if (env.jwtSecret === 'insecure_dev_secret_change_me' || env.jwtSecret.length < 32) {
      problems.push('JWT_SECRET must be set to a strong value (>= 32 chars) in production.');
    }
    if (
      env.encryptionKey ===
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    ) {
      problems.push('ENCRYPTION_KEY must not use the example value in production.');
    }
  }

  if (problems.length) {
    throw new Error(`Invalid environment configuration:\n - ${problems.join('\n - ')}`);
  }
}

module.exports = { env, validateEnv };
