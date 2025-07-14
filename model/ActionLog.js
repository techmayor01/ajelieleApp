const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const actionLogSchema = new Schema({
  action: {
    type: String,
    enum: ['edit', 'delete'],
    required: true
  },
  operator: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  branch: {
    type: Schema.Types.ObjectId,
    ref: 'Branch',
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  particulars: {
    type: String,
    required: true
  },
  targetModel: {
    type: String,
    required: true
  },
  targetId: {
    type: Schema.Types.ObjectId,
    required: true
  },
  before: {
    type: Schema.Types.Mixed,
    default: null
  },
  after: {
    type: Schema.Types.Mixed,
    default: null
  }
});

module.exports = mongoose.model('ActionLog', actionLogSchema);
