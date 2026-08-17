const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserProfile", // Updated
      required: true,
      index: true,
    },

    otp: {
      type: String,
      required: true,
    },

    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },

    verified: {
      type: Boolean,
      default: false,
    },
  },
  {
    collection: "auth_otps",
    timestamps: true,
  }
);

module.exports =
  mongoose.models.AuthOtp ||
  mongoose.model("AuthOtp", otpSchema);