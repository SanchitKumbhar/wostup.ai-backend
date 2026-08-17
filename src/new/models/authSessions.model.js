const mongoose = require("mongoose");

const authSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    sessionToken: { type: String, required: true, minlength: 32, maxlength: 512 },
    ipAddress: { type: String, default: null, maxlength: 64 },
    userAgent: { type: String, default: null, maxlength: 1024 },

    // New device-specific fields
    browser: { type: String, default: null },
    browserVersion: { type: String, default: null },
    os: { type: String, default: null },
    osVersion: { type: String, default: null },
    deviceType: { type: String, enum: ["desktop", "mobile", "tablet", "unknown"], default: "unknown" },
    clientFingerprint: { type: String, default: null }, // from X-Device-Fingerprint header

    // Additional metadata (optional)
    metadata: {
      screenResolution: { type: String, default: null },
      timezone: { type: String, default: null },
    },

    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    createdAt: { type: Date, required: true, default: Date.now },

    // Last activity timestamp (updated on each authenticated request)
    lastActiveAt: { type: Date, default: Date.now },
  },
  {
    collection: "auth_sessions",
    versionKey: false,
    timestamps: false,
  }
);

authSessionSchema.index({ sessionToken: 1 }, { unique: true });
authSessionSchema.index({ userId: 1, expiresAt: 1 });
authSessionSchema.index({ userId: 1, revokedAt: 1 }); // for listing active sessions

module.exports = mongoose.models.AuthSession || mongoose.model("AuthSession", authSessionSchema);