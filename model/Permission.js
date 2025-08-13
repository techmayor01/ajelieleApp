const mongoose = require("mongoose");

const permissionSchema = new mongoose.Schema(
  {
    module: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Permission", permissionSchema);
