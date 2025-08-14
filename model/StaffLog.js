const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const staffLogSchema = new Schema({
  user: { 
    type: Schema.Types.ObjectId,
    ref: 'User', 
    required: true 
  },
  branch: { 
    type: Schema.Types.ObjectId, 
    ref: 'Branch', 
    required: true 
  },
  status: { 
    type: String, 
    enum: ["Active", "Closed"], 
    default: "Active" 
  },
  signInTime: { type: Date, required: true, default: Date.now },
  signOutTime: { type: Date }
}, {
  timestamps: true
});

module.exports = mongoose.model('StaffLog', staffLogSchema);
