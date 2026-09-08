'use strict';

const mongoose = require('mongoose');
const { TIME_RE } = require('../services/timeCalculation');

/**
 * Day / Night shift definitions. Timings are admin-configurable.
 *
 * `effectiveFrom` keeps history honest: a DPR from August is always evaluated
 * against the shift timing that was in force in August, even if the admin
 * changes shift hours in September. Editing timings creates a NEW version row
 * rather than mutating the old one (see the shifts module).
 */
const shiftSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      enum: {
        values: ['Day', 'Night'],
        message: 'Shift must be either Day or Night',
      },
    },
    startTime: {
      type: String,
      required: [true, 'Shift start time is required'],
      match: [TIME_RE, 'Start time must be in HH:MM 24-hour format'],
    },
    endTime: {
      type: String,
      required: [true, 'Shift end time is required'],
      match: [TIME_RE, 'End time must be in HH:MM 24-hour format'],
    },
    effectiveFrom: { type: Date, required: true, default: () => new Date(0) },
    isCurrent: { type: Boolean, default: true, index: true },
    note: { type: String, trim: true, default: '', maxlength: 200 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

shiftSchema.index({ name: 1, effectiveFrom: -1 });

module.exports = mongoose.model('Shift', shiftSchema);
