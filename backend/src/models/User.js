'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { PERMISSION_KEYS, emptyPermissions, fullPermissions } = require('../utils/permissions');

const permissionFields = PERMISSION_KEYS.reduce((acc, key) => {
  acc[key] = { type: Boolean, default: false };
  return acc;
}, {});

/**
 * Admin (super admin) and Operator logins.
 * Only an admin can create operators or change anybody's permissions.
 */
const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Login ID is required'],
      unique: true,
      trim: true,
      lowercase: true,
      minlength: [3, 'Login ID must be at least 3 characters'],
      maxlength: [40, 'Login ID must be at most 40 characters'],
      match: [/^[a-z0-9._-]+$/i, 'Login ID may contain letters, numbers, dot, underscore and hyphen only'],
    },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 80 },
    role: { type: String, enum: ['admin', 'operator'], required: true, default: 'operator' },

    // Recovery email — used only for the admin forgot-password flow.
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
      validate: {
        validator: (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        message: 'Recovery email is not a valid email address',
      },
    },

    permissions: { type: permissionFields, default: () => emptyPermissions() },

    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },

    // Password reset (admin recovery)
    resetOtpHash: { type: String, default: null, select: false },
    resetOtpExpiresAt: { type: Date, default: null, select: false },
    resetOtpAttempts: { type: Number, default: 0, select: false },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

userSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(plain, 10);
};

userSchema.methods.verifyPassword = function verifyPassword(plain) {
  if (!this.passwordHash) return Promise.resolve(false);
  return bcrypt.compare(plain, this.passwordHash);
};

/** Admin implicitly holds every permission; operators hold exactly what was ticked. */
userSchema.methods.effectivePermissions = function effectivePermissions() {
  if (this.role === 'admin') return fullPermissions();
  const perms = emptyPermissions();
  PERMISSION_KEYS.forEach((key) => {
    perms[key] = Boolean(this.permissions?.[key]);
  });
  return perms;
};

userSchema.methods.can = function can(permissionKey) {
  if (this.role === 'admin') return true;
  return Boolean(this.permissions?.[permissionKey]);
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    username: this.username,
    name: this.name,
    role: this.role,
    email: this.email,
    isActive: this.isActive,
    permissions: this.effectivePermissions(),
    lastLoginAt: this.lastLoginAt,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
