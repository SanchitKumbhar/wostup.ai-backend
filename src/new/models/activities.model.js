const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    action: { type: String, required: true, minlength: 1, maxlength: 200 },
    target: { type: String, required: true, minlength: 1, maxlength: 300 },
    type: { type: String, enum: ["task", "comment", "milestone", "update"], required: true },
    timestamp: { type: Date, required: true, default: Date.now },
  },
  {
    collection: "activities",
    versionKey: false,
  }
);

activitySchema.index({ workspaceId: 1, timestamp: -1 });

module.exports = mongoose.models.Activity || mongoose.model("Activity", activitySchema);
