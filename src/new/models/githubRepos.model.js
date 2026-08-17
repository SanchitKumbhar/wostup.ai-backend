const mongoose = require("mongoose");

const githubRepoSchema = new mongoose.Schema(
  {
    installationId: { type: Number, required: true, index: true },
    githubRepoId: { type: Number, required: true, unique: true },
    fullName: { type: String, required: true, trim: true },
    private: { type: Boolean, default: false },
    defaultBranch: { type: String, default: "main" },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", default: null, index: true },
    attachedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  {
    collection: "github_repos",
    timestamps: true,
  }
);

githubRepoSchema.index({ installationId: 1, projectId: 1 });

module.exports =
  mongoose.models.GithubRepo || mongoose.model("GithubRepo", githubRepoSchema);
