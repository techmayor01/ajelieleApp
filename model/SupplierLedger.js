const mongoose = require('mongoose');

const supplierLedgerSchema = new mongoose.Schema({
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: true
  },
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true
  },
  type: {
    type: String,
    enum: ['credit', 'debit'],
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
  }
}, { timestamps: true });

module.exports = mongoose.model('SupplierLedger', supplierLedgerSchema);
