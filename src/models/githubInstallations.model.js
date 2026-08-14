const mongoose = require("mongoose");

const githubInstallationSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    installationId: { type: Number, required: true, unique: true },
    accountLogin: { type: String, required: true, trim: true },
    accountType: { type: String, enum: ["User", "Organization"], default: "User" },
    installedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["active", "removed"], default: "active" },
  },
  {
    collection: "github_installations",
    timestamps: true,
  }
);

githubInstallationSchema.index({ workspaceId: 1, status: 1 });

module.exports =
  mongoose.models.GithubInstallation ||
  mongoose.model("GithubInstallation", githubInstallationSchema);
