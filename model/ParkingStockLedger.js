const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const parkingVariantLedgerSchema = new Schema({
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
  }
}, { _id: false });

const parkingStockLedgerSchema = new Schema({
  date: {
    type: Date,
    default: Date.now
  },
  parkingStore: {
    type: Schema.Types.ObjectId,
    ref: 'ParkingStore',
    required: true
  },
  product: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  variants: [parkingVariantLedgerSchema],
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
  particulars: {
    type: String,
    required: true
  },
}, {
  timestamps: true
});

module.exports = mongoose.model('ParkingStockLedger', parkingStockLedgerSchema);
