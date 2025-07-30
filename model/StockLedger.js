const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const variantLedgerSchema = new Schema({
  unitCode: {
    type: String,
    required: true
  },
  stock_in: {
    type: Number,
    default: 0
  },
  stock_out: {
    type: Number,
    default: 0
  },
  balance: {
    type: Number,
    required: true
  },
  cost_price: {
    type: Number,
    default: 0
  },
  total_sales: {
    type: Number,
    default: 0
  }
}, { _id: false });

const stockLedgerSchema = new Schema({
  date: {
    type: Date,
    required: true
  },
  product: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  customer: {
    type: String
  },
  variants: [variantLedgerSchema],
  operator: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  branch: {
    type: Schema.Types.ObjectId,
    ref: 'Branch',
    required: true
  },
  particular: {
    type: String,
    required: true
  },
  stock_ID: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['normal', 'edited', 'deleted'],
    default: 'normal'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('StockLedger', stockLedgerSchema);
