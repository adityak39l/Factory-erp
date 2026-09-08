'use strict';

const mongoose = require('mongoose');

/**
 * Declared non-working days. DPR entry is blocked on these dates and they are
 * never counted as absence.
 */
const holidaySchema = new mongoose.Schema(
  {
    date: { type: Date, required: [true, 'Holiday date is required'], unique: true },
    description: {
      type: String,
      required: [true, 'Holiday description is required'],
      trim: true,
      maxlength: 120,
    },
    type: {
      type: String,
      enum: ['Weekly Off', 'Festival', 'Maintenance', 'Other'],
      default: 'Festival',
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// `unique: true` on `date` already creates the index — no separate declaration needed.

module.exports = mongoose.model('Holiday', holidaySchema);
