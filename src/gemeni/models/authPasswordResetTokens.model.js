const mongoose = require("mongoose");

const authPasswordResetTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    tokenHash: { type: String, required: true, minlength: 32, maxlength: 512 },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  {
    collection: "auth_password_reset_tokens",
    versionKey: false,
    timestamps: false,
  }
);

authPasswordResetTokenSchema.index({ tokenHash: 1 }, { unique: true });

module.exports =
  mongoose.models.AuthPasswordResetToken ||
  mongoose.model("AuthPasswordResetToken", authPasswordResetTokenSchema);
