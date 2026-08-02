const mongoose = require("mongoose");

const stuckSuggestionSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Workspace",
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Project",
    },
    riskCategory: {
      type: String,
      enum: ["Stuck Task", "Overload"],
      default: "Stuck Task",
    },
    scope: {
      type: {
        type: String,
        enum: ["task"],
        default: "task",
      },
      id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: "Task",
      },
    },
    message: {
      type: String,
      required: true,
    },
    details: {
      status: { type: String },
      dwellHours: { type: Number },
      dueDate: { type: Date },
    },
    status: {
      type: String,
      enum: ["active", "resolved", "dismissed"],
      default: "active",
    },
  },
  {
    timestamps: true,
    collection: "stuck_suggestions",
  }
);

module.exports =
  mongoose.models.StuckSuggestion ||
  mongoose.model("StuckSuggestion", stuckSuggestionSchema);