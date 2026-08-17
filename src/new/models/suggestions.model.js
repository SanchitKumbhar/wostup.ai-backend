const mongoose = require("mongoose");

const scopeSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["person", "task", "project"],
      required: true,
    },
    id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
  },
  { _id: false }
);

const suggestionSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    risk_category: {
      type: String,
      required: true,
      enum: [
        "Cross-Project Conflict",
        "Dependency Conflict",
        "Milestone Mismatch",
        "Due-Date Clustering",
        "Stuck Task",        // NEW
        "Overload",          // NEW
      ],
    },
    risk_score: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
      default: 0.9,
    },
    scope: {
      type: scopeSchema,
      required: true,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    phrased_text: {
      type: String,
      default: null,
    },
    validated: {
      type: Boolean,
      default: false,
    },
    model_version: {
      type: String,
      default: "conflict_v1",
    },
    // NEW: lifecycle status for suggestions (used by stuck task detector)
    status: {
      type: String,
      enum: ["active", "resolved", "dismissed"],
      default: "active",
    },
  },
  {
    collection: "suggestions",
    timestamps: true,
  }
);

// Compound unique index for upserts by workspace, category, and scope
suggestionSchema.index(
  {
    workspaceId: 1,
    risk_category: 1,
    "scope.type": 1,
    "scope.id": 1,
  },
  { unique: true }
);

// Index for quick workspace & category filtering
suggestionSchema.index({ workspaceId: 1, risk_category: 1, createdAt: -1 });

module.exports =
  mongoose.models.Suggestion || mongoose.model("Suggestion", suggestionSchema);