const mongoose = require("mongoose");

const authAccountSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    provider: {
      type: String,
      enum: ["local", "google", "github", "microsoft"],
      required: true,
    },
    providerAccountId: { type: String, required: true, minlength: 1, maxlength: 320 },
    passwordHash: { type: String, default: null },
    passwordAlgo: { type: String, default: null },
  },
  {
    collection: "auth_accounts",
    timestamps: true,
  }
);

authAccountSchema.index({ provider: 1, providerAccountId: 1 }, { unique: true });
authAccountSchema.index({ userId: 1 });

module.exports = mongoose.models.AuthAccount || mongoose.model("AuthAccount", authAccountSchema);
