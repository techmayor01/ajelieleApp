const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  customer_name: { type: String, required: true },
  mobile: { type: String },
  address: { type: String },

  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true
  },

  credit_limit: { type: Number, default: 0 },
  total_debt: { type: Number, default: 0 },
  remaining_amount: { type: Number, default: 0 },

  sales_type: {
    type: String,
    enum: ['cash', 'credit']
  },

  cash_sales_count: { type: Number, default: 0 },
  credit_sales_count: { type: Number, default: 0 },
  order_count: { type: Number, default: 0 },
  sales_amount: { type: Number, default: 0 },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Customer', customerSchema);
