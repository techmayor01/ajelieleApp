const mongoose = require("mongoose");

const priceAdjustmentSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },
  variants: [
    {
      unitCode: { type: String, required: true },
      oldPrice: { type: Number, required: true },
      newPrice: { type: Number, required: true }
    }
  ],
  notes: String,
  adjustedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("PriceAdjustment", priceAdjustmentSchema);
