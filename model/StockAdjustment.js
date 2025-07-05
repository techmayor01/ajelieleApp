const mongoose = require("mongoose");

const stockAdjustmentSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },
  variants: [
    {
      unitCode: { 
        type: String,
        required: true
      },
      adjustmentType: { 
        type: String, 
        enum: ['increase', 'decrease'],
        required: true
      },
      quantity: {
        type: Number,
        required: true
      }
    }
  ],
  notes: String,
  adjustedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User", 
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("StockAdjustment", stockAdjustmentSchema);
