const { Worker } = require("bullmq");
const redisConnection = require("../redisConfig/bullmqRedisConnection");
const { GithubRepo, GithubPullRequest, GithubCommit } = require("../models");
const { queueName } = require("../queues/githubWebhook.queue");

async function processGithubWebhookJob(job) {
  const { eventType, payload } = job.data;

  if (!payload || !payload.repository) {
    return { skipped: true, reason: "No repository context in payload" };
  }

  const githubRepoId = payload.repository.id;
  const repo = await GithubRepo.findOne({ githubRepoId });

  if (!repo) {
    return { skipped: true, reason: `Repository ID ${githubRepoId} not tracked in system` };
  }

  // 1. Pull Request Events
  if (eventType === "pull_request" || payload.pull_request) {
    const pr = payload.pull_request;
    const action = payload.action;

    const isMerged = Boolean(pr.merged || (action === "closed" && pr.merged === true));
    const mergedAt = pr.merged_at ? new Date(pr.merged_at) : isMerged ? new Date() : null;

    const prDoc = await GithubPullRequest.findOneAndUpdate(
      { repoId: repo._id, githubPrId: pr.id },
      {
        $set: {
          number: pr.number,
          title: pr.title || "Untitled PR",
          state: pr.state || "open",
          merged: isMerged,
          mergedAt,
          authorLogin: pr.user?.login || "unknown",
          createdAtGh: new Date(pr.created_at || Date.now()),
          updatedAtGh: new Date(pr.updated_at || Date.now()),
          rawPayload: payload,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          repoId: repo._id,
          githubPrId: pr.id,
          createdAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after", runValidators: true }
    );

    return { processed: true, type: "pull_request", prId: prDoc._id };
  }

  // 2. Push / Commit Events
  if (eventType === "push" || payload.commits) {
    const commits = payload.commits || [];
    const savedCommits = [];

    for (const commit of commits) {
      const sha = commit.id || commit.sha;
      if (!sha) continue;

      const commitDoc = await GithubCommit.findOneAndUpdate(
        { repoId: repo._id, sha },
        {
          $set: {
            message: commit.message || "No commit message",
            authorLogin: commit.author?.username || commit.author?.name || "unknown",
            committedAt: new Date(commit.timestamp || Date.now()),
            rawPayload: commit,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            repoId: repo._id,
            sha,
            createdAt: new Date(),
          },
        },
        { upsert: true, returnDocument: "after", runValidators: true }
      );
      savedCommits.push(commitDoc._id);
    }

    return { processed: true, type: "push", commitsCount: savedCommits.length };
  }

  return { skipped: true, reason: `Event type ${eventType} not handled` };
}

const githubWebhookWorker = new Worker(queueName, processGithubWebhookJob, {
  connection: redisConnection,
  concurrency: 5,
});

githubWebhookWorker.on("completed", (job, result) => {
  console.log(`✅ GitHub Webhook Worker job ${job.id} completed:`, result);
});

githubWebhookWorker.on("failed", (job, err) => {
  console.error(`❌ GitHub Webhook Worker job ${job?.id} failed:`, err.message);
});

module.exports = githubWebhookWorker;
