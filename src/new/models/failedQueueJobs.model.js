const mongoose = require("mongoose");

const failedQueueJobSchema = new mongoose.Schema(
  {
    jobId: { type: String, required: true, index: true },
    queueName: { type: String, required: true, index: true },
    jobName: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    toEmail: { type: String, required: true, index: true },
    toName: { type: String },
    verificationUrl: { type: String },
    jobData: { type: mongoose.Schema.Types.Mixed },
    failedReason: { type: String, required: true },
    errorStack: { type: String },
    attemptsMade: { type: Number, required: true },
    status: {
      type: String,
      enum: ["failed", "retried", "resolved"],
      default: "failed",
      index: true,
    },
    failedAt: { type: Date, default: Date.now, index: true },
    resolvedAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("FailedQueueJob", failedQueueJobSchema);
