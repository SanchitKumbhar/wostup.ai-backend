const mongoose = require("mongoose");

const githubPullRequestSchema = new mongoose.Schema(
  {
    repoId: { type: mongoose.Schema.Types.ObjectId, ref: "GithubRepo", required: true, index: true },
    githubPrId: { type: Number, required: true },
    number: { type: Number, required: true },
    title: { type: String, required: true, trim: true },
    state: { type: String, required: true },
    merged: { type: Boolean, default: false },
    mergedAt: { type: Date, default: null },
    authorLogin: { type: String, required: true },
    createdAtGh: { type: Date, required: true },
    updatedAtGh: { type: Date, required: true },
    rawPayload: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    collection: "github_pull_requests",
    timestamps: true,
  }
);

githubPullRequestSchema.index({ repoId: 1, githubPrId: 1 }, { unique: true });
githubPullRequestSchema.index({ repoId: 1, updatedAtGh: -1, _id: -1 });

module.exports =
  mongoose.models.GithubPullRequest ||
  mongoose.model("GithubPullRequest", githubPullRequestSchema);
