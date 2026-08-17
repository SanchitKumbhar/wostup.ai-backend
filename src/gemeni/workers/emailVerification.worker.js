require("dotenv").config();

const { Worker } = require("bullmq");
const redisConnection = require("../redisConfig/bullmqRedisConnection");
const { sendVerificationEmail } = require("../services/emailVerificationService");
const { queueName } = require("../queues/emailVerificationQueue");

async function processVerificationEmailJob(job) {
  const { toEmail, toName, verificationUrl, expiresAt } = job.data || {};

  if (!toEmail || !verificationUrl || !expiresAt) {
    throw new Error("Invalid verification email job payload");
  }

  await sendVerificationEmail({
    toEmail,
    toName,
    verificationUrl,
    expiresAt: new Date(expiresAt),
  });
}

const { FailedQueueJob } = require("../models");

const verificationEmailWorker = new Worker(queueName, processVerificationEmailJob, {
  connection: redisConnection,
  concurrency: 5,
});

verificationEmailWorker.on("completed", (job) => {
  console.log(`Verification email job completed: ${job.id}`);
});

verificationEmailWorker.on("failed", async (job, error) => {
  const maxAttempts = job && job.opts && job.opts.attempts ? job.opts.attempts : 3;

  console.error(
    `Verification email job failed (Attempt ${job ? job.attemptsMade : "?"}/${maxAttempts}): ${job ? job.id : ""}`,
    error && error.message ? error.message : error
  );

  if (job && job.attemptsMade >= maxAttempts) {
    console.log(`⚠️ All ${maxAttempts} retries exhausted for job ${job.id}. Archiving failure to MongoDB...`);

    try {
      await FailedQueueJob.create({
        jobId: String(job.id),
        queueName: job.queueName || queueName,
        jobName: job.name || "send-verification-email",
        userId: job.data && job.data.userId ? job.data.userId : null,
        toEmail: job.data && job.data.toEmail ? job.data.toEmail : "unknown@example.com",
        toName: job.data && job.data.toName ? job.data.toName : "",
        verificationUrl: job.data && job.data.verificationUrl ? job.data.verificationUrl : "",
        jobData: job.data,
        failedReason: error && error.message ? error.message : String(error),
        errorStack: error && error.stack ? error.stack : "",
        attemptsMade: job.attemptsMade,
        status: "failed",
        failedAt: new Date(),
      });

      console.log(`✅ Job ${job.id} failure successfully archived in MongoDB.`);

      // Clean up from Redis RAM
      await job.remove();
      console.log(`✅ Job ${job.id} removed from Redis RAM.`);
    } catch (dbError) {
      console.error(`❌ Failed to store failed job ${job.id} into MongoDB:`, dbError.message);
    }
  }
});

module.exports = verificationEmailWorker;