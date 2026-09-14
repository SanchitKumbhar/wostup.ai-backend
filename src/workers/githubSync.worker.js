const { Worker } = require("bullmq");
const redisConnection = require("../redisConfig/bullmqRedisConnection");
const { GithubRepo, GithubPullRequest, GithubCommit, GithubInstallation } = require("../models");
const { githubSyncQueueName, githubSyncQueue } = require("../queues/githubSync.queue");
const { getInstallationOctokit } = require("../services/githubApp.service");

async function syncGithubRepo(repoId) {
  const repo = await GithubRepo.findById(repoId);
  if (!repo || !repo.projectId || !repo.installationId) return;

  const installation = await GithubInstallation.findOne({ installationId: repo.installationId });
  if (!installation || installation.status !== "active") return;

  const octokit = getInstallationOctokit(repo.installationId);
  const [owner, repoName] = repo.fullName.split("/");

  // 1. Sync Commits
  const lastCommit = await GithubCommit.findOne({ repoId: repo._id }).sort({ committedAt: -1 });
  let sinceParam = undefined;
  if (lastCommit) {
    const sinceDate = new Date(lastCommit.committedAt.getTime() + 1000);
    sinceParam = sinceDate.toISOString();
  }

  let page = 1;
  let hasMoreCommits = true;
  while (hasMoreCommits) {
    try {
      const { data: commits } = await octokit.repos.listCommits({
        owner,
        repo: repoName,
        per_page: 100,
        page,
        since: sinceParam,
      });

      if (!commits || commits.length === 0) {
        hasMoreCommits = false;
        break;
      }

      for (const commitData of commits) {
        const sha = commitData.sha;
        if (!sha) continue;
        await GithubCommit.findOneAndUpdate(
          { repoId: repo._id, sha },
          {
            $set: {
              message: commitData.commit.message || "No commit message",
              authorLogin: commitData.author?.login || commitData.commit.author?.name || "unknown",
              committedAt: new Date(commitData.commit.author?.date || Date.now()),
              rawPayload: commitData,
              updatedAt: new Date(),
            },
            $setOnInsert: {
              repoId: repo._id,
              sha,
              createdAt: new Date(),
            },
          },
          { upsert: true }
        );
      }
      if (commits.length < 100) hasMoreCommits = false;
      page++;
    } catch (err) {
      console.error(`Error syncing commits for ${repo.fullName}:`, err.message);
      hasMoreCommits = false;
    }
  }

  // 2. Sync PRs
  const lastPr = await GithubPullRequest.findOne({ repoId: repo._id }).sort({ updatedAtGh: -1 });
  
  page = 1;
  let hasMorePrs = true;
  while (hasMorePrs) {
    try {
      const { data: prs } = await octokit.pulls.list({
        owner,
        repo: repoName,
        state: "all",
        sort: "updated",
        direction: "desc",
        per_page: 100,
        page,
      });

      if (!prs || prs.length === 0) {
        hasMorePrs = false;
        break;
      }

      let reachedOldPrs = false;
      for (const pr of prs) {
        const prUpdatedAt = new Date(pr.updated_at);
        if (lastPr && prUpdatedAt <= lastPr.updatedAtGh) {
          const existing = await GithubPullRequest.findOne({ repoId: repo._id, githubPrId: pr.id });
          if (existing && existing.updatedAtGh.getTime() >= prUpdatedAt.getTime()) {
             reachedOldPrs = true;
          }
        }

        const isMerged = Boolean(pr.merged_at);
        await GithubPullRequest.findOneAndUpdate(
          { repoId: repo._id, githubPrId: pr.id },
          {
            $set: {
              number: pr.number,
              title: pr.title || "Untitled PR",
              state: pr.state || "open",
              merged: isMerged,
              mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
              authorLogin: pr.user?.login || "unknown",
              createdAtGh: new Date(pr.created_at || Date.now()),
              updatedAtGh: prUpdatedAt,
              rawPayload: pr,
              updatedAt: new Date(),
            },
            $setOnInsert: {
              repoId: repo._id,
              githubPrId: pr.id,
              createdAt: new Date(),
            },
          },
          { upsert: true }
        );
      }
      
      if (reachedOldPrs || prs.length < 100) {
        hasMorePrs = false;
      }
      page++;
    } catch (err) {
      console.error(`Error syncing PRs for ${repo.fullName}:`, err.message);
      hasMorePrs = false;
    }
  }
}

const githubSyncWorker = new Worker(
  githubSyncQueueName,
  async (job) => {
    if (job.name === "sync-repo") {
      const { repoId } = job.data;
      await syncGithubRepo(repoId);
    } else if (job.name === "sync-all-repos") {
      const attachedRepos = await GithubRepo.find({ projectId: { $ne: null } });
      for (const repo of attachedRepos) {
        await githubSyncQueue.add("sync-repo", { repoId: repo._id }, { removeOnComplete: true });
      }
    }
  },
  {
    connection: redisConnection,
    concurrency: 5,
  }
);

githubSyncWorker.on("completed", (job) => {
  console.log(`✅ Github Sync Worker completed job ${job.id} (${job.name})`);
});

githubSyncWorker.on("failed", (job, err) => {
  console.error(`❌ Github Sync Worker failed job ${job?.id} (${job?.name}):`, err.message);
});

module.exports = githubSyncWorker;
