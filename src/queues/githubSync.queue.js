const { Queue } = require("bullmq");
const redisConnection = require("../redisConfig/bullmqRedisConnection");

const githubSyncQueueName = "GithubSyncQueue";
const githubSyncQueue = new Queue(githubSyncQueueName, { connection: redisConnection });

async function enqueueGithubSync(data) {
  await githubSyncQueue.add("sync-repo", data, {
    removeOnComplete: true,
    removeOnFail: false,
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
  });
}

module.exports = {
  githubSyncQueueName,
  githubSyncQueue,
  enqueueGithubSync,
};
