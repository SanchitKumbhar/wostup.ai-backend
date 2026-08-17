const mongoose = require("mongoose");

const epicSchema = new mongoose.Schema(
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
      maxlength: 180,
    },
    summary: {
      type: String,
      default: "",
      maxlength: 500,
    },
    description: {
      type: String,
      default: "",
      maxlength: 4000,
    },
    color: {
      type: String,
      default: "#8B5CF6", // Violet default to match Wostup design
    },
    status: {
      type: String,
      enum: ["To Do", "In Progress", "Done"],
      default: "To Do",
    },
    startDate: {
      type: Date,
      default: null,
    },
    dueDate: {
      type: Date,
      default: null,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    collection: "epics",
    timestamps: true,
  }
);

epicSchema.index({ workspaceId: 1, projectId: 1, status: 1 });

module.exports = mongoose.models.Epic || mongoose.model("Epic", epicSchema);