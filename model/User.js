// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  fullname: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },

  role: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role',
    required: true
  },

  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch'
  },

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
