const mongoose = require('mongoose');

const salesLedgerSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  product_name: {
    type: String,
    required: true
  },
  sales_type: {
  type: String,
  enum: ['cash', 'credit'],
  required: true
},
  sale_date: {
    type: Date,
    required: true
  },
  unit: {
    type: String,
    required: true
  },
  unit_price: {
    type: Number,
    required: true
  },
  quantity_sold: {
    type: Number,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },
  customer_name: {
    type: String
  },
  receipt_no: {
    type: String,
    required: true
  },
  instock_qty: {
    type: Number,
    required: true
  },
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true
  },
  operator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('SalesLedger', salesLedgerSchema);
