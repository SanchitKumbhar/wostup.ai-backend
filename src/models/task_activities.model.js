const mongoose = require("mongoose");

const taskActivitySchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    action: {
      type: String,
      enum: ["CREATED", "STATUS_UPDATED", "POINTS_UPDATED", "DELETED"],
      required: true,
    },
    pointsDelta: {
      type: Number,
      default: 0, // Scope impact (+pts for created/increased, -pts for deleted/reduced)
    },
    remainingDelta: {
      type: Number,
      default: 0, // Remaining burndown impact (-pts when done, +pts when reopened)
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Only need immutable createdAt
  }
);

// Compound index for high-speed burndown aggregations
taskActivitySchema.index({ projectId: 1, createdAt: 1 });

module.exports =
  mongoose.models.TaskActivity || mongoose.model("TaskActivity", taskActivitySchema);