const { Queue } = require("bullmq");
const redisConnection = require("../redisConfig/bullmqRedisConnection");

const queueName = "github-webhook-queue";

const githubWebhookQueue = new Queue(queueName, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: 1000,
  },
});

async function enqueueGithubWebhook(jobData) {
  const jobId = jobData.deliveryId || `gh-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  return githubWebhookQueue.add("process-github-webhook", jobData, { jobId });
}

module.exports = {
  queueName,
  githubWebhookQueue,
  enqueueGithubWebhook,
};
