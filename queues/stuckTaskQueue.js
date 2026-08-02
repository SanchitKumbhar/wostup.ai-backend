const { Queue } = require("bullmq");
const IORedis = require("ioredis");

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

const stuckTaskQueue = new Queue("STUCK_TASK_WORKER", { connection });

/**
 * Schedules (or cancels) a stuck‑detection job for a given task.
 * - If status is not 'blocked' or 'waiting-review', removes any pending job.
 * - Otherwise computes delay = 50% of remaining time, with guardrails.
 */
async function scheduleStuckCheck(task) {
  const jobId = `stuck-check-${task._id}`;

  // Cancel if task is no longer in a stuck‑sensitive state
  if (!["blocked", "waiting-review"].includes(task.status)) {
    const existingJob = await stuckTaskQueue.getJob(jobId);
    if (existingJob) await existingJob.remove();
    return;
  }

  const now = Date.now();
  const due = new Date(task.dueDate).getTime();
  const remainingMs = due - now;

  let delayMs;
  if (remainingMs <= 0) {
    // Already overdue → fallback 12h
    delayMs = 12 * 60 * 60 * 1000;
  } else {
    // 50% of remaining buffer
    delayMs = Math.round(remainingMs * 0.5);
    // Clamp: min 1h, max 7d
    delayMs = Math.max(delayMs, 60 * 60 * 1000);
    delayMs = Math.min(delayMs, 7 * 24 * 60 * 60 * 1000);
  }

  // Upsert the delayed job (replace if already exists)
  await stuckTaskQueue.add(
    "check-stuck",
    { taskId: task._id, expectedStatus: task.status },
    {
      delay: delayMs,
      jobId,
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
}

module.exports = { stuckTaskQueue, scheduleStuckCheck };