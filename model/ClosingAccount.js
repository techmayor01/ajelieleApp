const mongoose = require('mongoose');

const ClosingAccountSchema = new mongoose.Schema({
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true
  },
  totalSales: {
    type: Number,
    default: 0
  },
  totalDebtorsPayment: {
    type: Number,
    default: 0
  },
  totalCreditSales: {
    type: Number,
    default: 0
  },
  balance: {
    type: Number,
    default: 0
  },
  totalExpenses: {
    type: Number,
    default: 0
  },
  closingBalance: {
    type: Number,
    default: 0
  },
  date: {
    type: Date,
    required: true,
    default: () => new Date().setHours(0, 0, 0, 0) // sets it to the start of the day
  }
}, { timestamps: true });


module.exports = mongoose.model('ClosingAccount', ClosingAccountSchema);
