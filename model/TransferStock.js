const mongoose = require("mongoose");

const stockTransferSchema = new mongoose.Schema({
  branch_from: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
    required: true
  },
  branch_to: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
    required: true
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },
  unitCode: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true
  },
  invoice_number: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  notes: {
    type: String
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("TransferStock", stockTransferSchema);
