const mongoose = require("mongoose");

const authEmailVerificationTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    tokenHash: { type: String, required: true, minlength: 32, maxlength: 512 },
    expiresAt: { type: Date, required: true },
    verifiedAt: { type: Date, default: null },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  {
    collection: "auth_email_verification_tokens",
    versionKey: false,
    timestamps: false,
  }
);

authEmailVerificationTokenSchema.index({ tokenHash: 1 }, { unique: true });
authEmailVerificationTokenSchema.index({ userId: 1, createdAt: -1 });
authEmailVerificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports =
  mongoose.models.AuthEmailVerificationToken ||
  mongoose.model("AuthEmailVerificationToken", authEmailVerificationTokenSchema);
