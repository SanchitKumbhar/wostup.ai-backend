const mongoose = require("mongoose");

const workspaceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 150 },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
    description: { type: String, trim: true, maxlength: 500, default: "" },
    settings: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    collection: "workspaces",
    timestamps: true,
  }
);

module.exports = mongoose.models.Workspace || mongoose.model("Workspace", workspaceSchema);
