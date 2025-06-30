const mongoose = require('mongoose');

const unitSchema = new mongoose.Schema({
  unit_name: { type: String },
  productCount: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['Active', 'Inactive'],
    default: 'Active'
  },
  createdAt: { type: Date, default: Date.now }
});

const Unit = mongoose.model('Unit', unitSchema);

module.exports = Unit;