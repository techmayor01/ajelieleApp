const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const staffLogSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  role: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Role",
    required: true
  },
  signInTime: { type: Date, required: true, default: Date.now },
  signOutTime: { type: Date }
});

module.exports = mongoose.model('StaffLog', staffLogSchema);
