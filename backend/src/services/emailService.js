'use strict';

const nodemailer = require('nodemailer');
const { env } = require('../config/env');

/**
 * Used only for the admin account-recovery OTP.
 * When SMTP is not configured (typical during local development) the OTP is
 * printed to the server console instead, so the flow is still testable.
 */
let transporter = null;

function getTransporter() {
  if (!env.smtp.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    });
  }
  return transporter;
}

async function sendMail({ to, subject, text, html }) {
  const tx = getTransporter();
  if (!tx) {
    if (!env.isTest) {
      // eslint-disable-next-line no-console
      console.log(
        `\n[email:not-configured] Would send to ${to}\n  Subject: ${subject}\n  ${text}\n`
      );
    }
    return { delivered: false, reason: 'SMTP not configured' };
  }
  await tx.sendMail({ from: env.smtp.from, to, subject, text, html });
  return { delivered: true };
}

async function sendPasswordResetOtp({ to, name, otp, expiresInMinutes }) {
  const subject = 'Trading Engineers DPR — password reset code';
  const text =
    `Hello ${name || 'Admin'},\n\n` +
    `Your password reset code is: ${otp}\n` +
    `It expires in ${expiresInMinutes} minutes.\n\n` +
    `If you did not request this, you can ignore this email.\n\n` +
    `Trading Engineers — Factory Management System`;
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;color:#05054A">
      <h2 style="color:#05054A;margin-bottom:4px">Trading Engineers</h2>
      <p style="color:#E28431;margin-top:0;font-weight:600">Factory Management System</p>
      <p>Hello ${name || 'Admin'},</p>
      <p>Your password reset code is:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px;color:#05054A">${otp}</p>
      <p>This code expires in ${expiresInMinutes} minutes.</p>
      <p style="color:#64748b;font-size:13px">If you did not request this, you can safely ignore this email.</p>
    </div>`;
  return sendMail({ to, subject, text, html });
}

module.exports = { sendMail, sendPasswordResetOtp, getTransporter };
