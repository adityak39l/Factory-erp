'use strict';

const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Department name is required'],
      trim: true,
      maxlength: 80,
    },
    // Optional Hindi label — the factory's working sheet is in Hindi.
    nameHindi: { type: String, trim: true, default: '', maxlength: 80 },
    code: { type: String, trim: true, uppercase: true, default: '', maxlength: 16 },
    description: { type: String, trim: true, default: '', maxlength: 300 },

    /** Only departments that actually need sub-teams (e.g. Welding -> Team A/B/C). */
    hasTeams: { type: Boolean, default: false },

    /**
     * The Helper pool. Employees in a helper-pool department can be logged against
     * ANY other department's DPR for a given day (cross-assignment).
     */
    isHelperPool: { type: Boolean, default: false },

    /**
     * Default for new employees of this department: do their DPR entries need a
     * work description + quantity? False for support departments (guards, kitchen).
     */
    requiresWorkQtyByDefault: { type: Boolean, default: true },

    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

departmentSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

module.exports = mongoose.model('Department', departmentSchema);
