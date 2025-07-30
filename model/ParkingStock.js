// models/ParkingStock.js
const mongoose = require("mongoose");
const { Schema, Types } = mongoose;

const parkingStockSchema = new Schema({
  parkingStore: {
    type: Types.ObjectId,
    ref: "ParkingStore",
    required: true
  },
  branch: {
    type: Types.ObjectId,
    ref: "Branch",
    required: true
  },
  product: {
    type: Types.ObjectId,
    ref: "Product",
    required: true
  },
  unitCode: { type: String, required: true },
  quantity: { type: Number, required: true },

  parkedBy: { type: Types.ObjectId, ref: "User" },
  parkedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("ParkingStock", parkingStockSchema);
