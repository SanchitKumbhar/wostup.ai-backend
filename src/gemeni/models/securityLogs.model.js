const mongoose = require("mongoose");

const securityLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    sessionId: { type: mongoose.Schema.Types.ObjectId, default: null },
    eventType: {
      type: String,
      enum: [
        "LOGIN_SUCCESS",
        "LOGIN_FAILED",
        "LOGOUT",
        "SESSION_REVOKED",
        "SESSION_REVOKED_OTHERS",
        "PASSWORD_RESET",
        "EMAIL_VERIFIED",
        "2FA_ENABLED",
        "2FA_DISABLED",
      ],
      required: true,
    },
    deviceSummary: { type: String, default: null }, // e.g., "Chrome 126 on macOS"
    ipAddress: { type: String, default: null },
    details: { type: mongoose.Schema.Types.Mixed, default: {} }, // extra info
    createdAt: { type: Date, required: true, default: Date.now },
  },
  {
    collection: "security_logs",
    versionKey: false,
  }
);

securityLogSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.models.SecurityLog || mongoose.model("SecurityLog", securityLogSchema);