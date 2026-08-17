const mongoose = require("mongoose");

const githubCommitSchema = new mongoose.Schema(
  {
    repoId: { type: mongoose.Schema.Types.ObjectId, ref: "GithubRepo", required: true, index: true },
    sha: { type: String, required: true },
    message: { type: String, required: true },
    authorLogin: { type: String, default: "unknown" },
    committedAt: { type: Date, required: true },
    rawPayload: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    collection: "github_commits",
    timestamps: true,
  }
);

githubCommitSchema.index({ repoId: 1, sha: 1 }, { unique: true });

module.exports =
  mongoose.models.GithubCommit || mongoose.model("GithubCommit", githubCommitSchema);
