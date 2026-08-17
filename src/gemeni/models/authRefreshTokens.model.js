const mongoose = require("mongoose");

const authRefreshTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    tokenHash: { type: String, required: true, minlength: 32, maxlength: 512 },
    sessionId: { type: mongoose.Schema.Types.ObjectId, default: null },
    expiresAt: { type: Date, required: true },
    rotatedFromTokenId: { type: mongoose.Schema.Types.ObjectId, default: null },
    revokedAt: { type: Date, default: null },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  {
    collection: "auth_refresh_tokens",
    versionKey: false,
    timestamps: false,
  }
);

authRefreshTokenSchema.index({ tokenHash: 1 }, { unique: true });
authRefreshTokenSchema.index({ userId: 1, expiresAt: 1 });

module.exports =
  mongoose.models.AuthRefreshToken || mongoose.model("AuthRefreshToken", authRefreshTokenSchema);
