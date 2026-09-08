'use strict';

const mongoose = require('mongoose');

/**
 * Single-document system configuration, editable by the admin.
 * Nothing here is hard-coded in the application.
 */
const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'system', unique: true },

    company: {
      name: { type: String, default: 'Trading Engineers' },
      addressLine1: { type: String, default: '' },
      addressLine2: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      pincode: { type: String, default: '' },
      phone: { type: String, default: '' },
      email: { type: String, default: '' },
      gstin: { type: String, default: '' },
    },

    attendance: {
      /**
       * 0 = Sunday … 6 = Saturday. Days that are automatically non-working.
       * Empty by default — every day is a working day unless the admin either
       * lists a weekly-off day here, or declares a specific date as a Holiday.
       * Nothing is a holiday unless the admin explicitly says so.
       */
      weeklyOffDays: { type: [Number], default: [] },
      /** Minutes of lateness tolerated before an entry is flagged late. */
      graceMinutes: { type: Number, default: 15, min: 0, max: 120 },
      /** Count configured weekly-off days as holidays in attendance maths. */
      treatWeeklyOffAsHoliday: { type: Boolean, default: false },
    },

    dpr: {
      /** Block DPR entry for dates further back than this many days (0 = no limit). */
      backdateLimitDays: { type: Number, default: 7, min: 0, max: 365 },
      allowFutureDates: { type: Boolean, default: false },
      defaultQtyUnit: { type: String, default: 'Nos' },
    },

    security: {
      sessionTimeoutMinutes: { type: Number, default: 720, min: 15, max: 10080 },
      passwordMinLength: { type: Number, default: 8, min: 6, max: 64 },
      passwordRequireNumber: { type: Boolean, default: true },
      passwordRequireUppercase: { type: Boolean, default: false },
      maxLoginAttempts: { type: Number, default: 10, min: 3, max: 50 },
    },

    notifications: {
      emailEnabled: { type: Boolean, default: false },
      notifyOnAbsence: { type: Boolean, default: true },
      notifyOnIncompleteDpr: { type: Boolean, default: true },
      dailySummaryTime: { type: String, default: '19:00' },
    },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

/** Always returns the single settings document, creating defaults on first call. */
settingsSchema.statics.getSettings = async function getSettings() {
  let doc = await this.findOne({ key: 'system' });
  if (!doc) doc = await this.create({ key: 'system' });
  return doc;
};

module.exports = mongoose.model('Settings', settingsSchema);
