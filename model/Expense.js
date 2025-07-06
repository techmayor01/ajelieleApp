const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  title: {
    type: String
  },
  description: {
    type: String,
    trim: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExpenseCategory',
  },
  date: {
    type: Date,
    default: Date.now
  },
  amount: {
    type: Number,
    min: 0
  },
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch'
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

module.exports = mongoose.model('Expense', expenseSchema);
