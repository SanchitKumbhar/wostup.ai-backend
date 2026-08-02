const { Worker } = require("bullmq");
const IORedis = require("ioredis");
const Task = require("../models/Task");
const StuckSuggestion = require("../models/StuckSuggestion");

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

const stuckTaskWorker = new Worker(
  "STUCK_TASK_WORKER",
  async (job) => {
    const { taskId, expectedStatus } = job.data;
    const task = await Task.findById(taskId);

    if (!task) return;

    // Verify the task is still in the same problematic state
    if (
      task.status === expectedStatus &&
      ["blocked", "waiting-review"].includes(task.status)
    ) {
      const now = new Date();
      const statusEntered = task.statusEnteredAt || task.updatedAt;
      const dwellHours = Math.round(
        (now - new Date(statusEntered)) / (1000 * 60 * 60)
      );

      // Create a stuck suggestion
      await StuckSuggestion.create({
        workspaceId: task.workspaceId,
        projectId: task.projectId,
        riskCategory: "Stuck Task",
        scope: { type: "task", id: task._id },
        message: `Task "${task.title}" has been stuck in '${task.status}' state for ${dwellHours} hours.`,
        details: {
          status: task.status,
          dwellHours,
          dueDate: task.dueDate,
        },
        status: "active",
      });

      // Optional: trigger real‑time notification here (e.g., via email, Slack)
      console.log(`[STUCK TASK DETECTED] Task ID: ${task._id} | Status: ${task.status}`);
    }
  },
  { connection }
);

module.exports = stuckTaskWorker;