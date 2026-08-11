const { Queue } = require("bullmq");
const connection = require("../redisConfig/bullmqRedisConnection");

const stuckTaskQueue = new Queue("STUCK_TASK_WORKER", { connection });

async function scheduleStuckCheck(task) {
  const jobId = `stuck-check-${task._id}`;
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
    delayMs = 12 * 60 * 60 * 1000;
  } else {
    delayMs = Math.round(remainingMs * 0.5);
    delayMs = Math.max(delayMs, 60 * 60 * 1000);
    delayMs = Math.min(delayMs, 7 * 24 * 60 * 60 * 1000);
  }

  await stuckTaskQueue.add(
    "check-stuck",
    { taskId: task._id, expectedStatus: task.status },
    { delay: delayMs, jobId, removeOnComplete: true, removeOnFail: false }
  );
}

module.exports = { stuckTaskQueue, scheduleStuckCheck };