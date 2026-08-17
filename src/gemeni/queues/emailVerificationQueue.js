const { Queue } = require("bullmq");
const redisConnection = require("../redisConfig/bullmqRedisConnection");

const queueName = "email-verification";

const emailVerificationQueue = new Queue(queueName, {
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

async function enqueueVerificationEmail(jobData) {
  return emailVerificationQueue.add("send-verification-email", jobData);
}

module.exports = {
  queueName,
  enqueueVerificationEmail,
  emailVerificationQueue,
};