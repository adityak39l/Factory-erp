'use strict';

const mongoose = require('mongoose');

/** Teams only exist inside departments where hasTeams = true (e.g. Welding). */
const teamSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Team name is required'], trim: true, maxlength: 60 },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: [true, 'Team must belong to a department'],
      index: true,
    },
    description: { type: String, trim: true, default: '', maxlength: 200 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

teamSchema.index(
  { department: 1, name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } }
);

module.exports = mongoose.model('Team', teamSchema);
