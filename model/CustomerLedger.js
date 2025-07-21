const mongoose = require('mongoose');

const customerLedgerSchema = new mongoose.Schema({
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true
  },
  type: {
    type: String,
    enum: ['credit-sales', 'payment', 'paid-sales'],
    required: true
  },
  refNo: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  amount: {
    type: Number,
    default: 0
  },
  paid: {
    type: Number,
    default: 0
  },
  Balance: {
    type: Number,
    default: 0
  },
    status: {
    type: String,
    enum: ['normal', 'edited', 'deleted'],
    default: 'normal'
  }
}, { timestamps: true });

module.exports = mongoose.model('CustomerLedger', customerLedgerSchema);
