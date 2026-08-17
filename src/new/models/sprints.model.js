const mongoose = require("mongoose");

const sprintSchema = new mongoose.Schema(
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
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 120,
    },
    goal: {
      type: String,
      default: "",
      maxlength: 2000,
    },
    status: {
      type: String,
      enum: ["future", "active", "completed"],
      default: "future",
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    collection: "sprints",
    timestamps: true,
  }
);

sprintSchema.index({ workspaceId: 1, projectId: 1, status: 1 });
sprintSchema.index({ projectId: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.models.Sprint || mongoose.model("Sprint", sprintSchema);