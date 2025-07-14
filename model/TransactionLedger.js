const mongoose = require('mongoose');

const transactionLedgerSchema = new mongoose.Schema({
  type: { type: String, required: true },
  clientName: { type: String, required: true },
  clientId: { type: mongoose.Schema.Types.ObjectId },
  operator: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  amount: { type: Number, required: true },
  paymentType: { type: String },
  date: { type: Date, default: Date.now },
  refNo: { type: String },
  notes: { type: String },
  branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' }
});

module.exports = mongoose.model('TransactionLedger', transactionLedgerSchema);
