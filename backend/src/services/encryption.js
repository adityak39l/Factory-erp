'use strict';

const crypto = require('crypto');
const { env } = require('../config/env');

/**
 * AES-256-GCM field level encryption for Aadhar numbers and bank account numbers.
 * Stored format: enc:v1:<iv-hex>:<authTag-hex>:<cipherText-hex>
 *
 * These values are decrypted only when the requesting user holds the
 * "view sensitive data" permission — everyone else sees a masked value.
 */

const PREFIX = 'enc:v1:';

function key() {
  return Buffer.from(env.encryptionKey, 'hex');
}

function encrypt(plainText) {
  if (plainText === null || plainText === undefined || plainText === '') return '';
  const text = String(plainText);
  if (text.startsWith(PREFIX)) return text; // already encrypted
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(cipherText) {
  if (!cipherText) return '';
  const value = String(cipherText);
  if (!value.startsWith(PREFIX)) return value; // legacy / plain value
  try {
    const [, , ivHex, tagHex, dataHex] = value.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]).toString('utf8');
  } catch (err) {
    return '';
  }
}

/** "123456789012" -> "XXXX XXXX 9012" (Aadhar style) */
function maskAadhar(plain) {
  if (!plain) return '';
  const digits = String(plain).replace(/\s+/g, '');
  if (digits.length <= 4) return '••••';
  return `XXXX XXXX ${digits.slice(-4)}`;
}

/** "50100123456789" -> "••••••6789" */
function maskAccount(plain) {
  if (!plain) return '';
  const value = String(plain);
  if (value.length <= 4) return '••••';
  return `••••••${value.slice(-4)}`;
}

module.exports = { encrypt, decrypt, maskAadhar, maskAccount, PREFIX };
