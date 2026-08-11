const { Worker } = require("bullmq");
const IORedis = require("ioredis");
const { Task, Suggestion, Project } = require("../models"); // 1. Added Project model
const aiNotificationQueue = require("../queues/aiNotificationQueue"); // 2. Import AI Notification Queue

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

const stuckTaskWorker = new Worker(
  "STUCK_TASK_WORKER",
  async (job) => {
    const { taskId, expectedStatus } = job.data;
    const task = await Task.findById(taskId);

    if (!task) return;

    // Check if task is still in the problematic status
    if (task.status === expectedStatus && ["blocked", "waiting-review"].includes(task.status)) {
      const now = new Date();
      const statusEntered = task.statusEnteredAt || task.updatedAt;
      const dwellHours = Math.round((now - new Date(statusEntered)) / (1000 * 60 * 60));

      // 1. Insert alert into Suggestions collection
      await Suggestion.create({
        workspaceId: task.workspaceId,
        projectId: task.projectId,
        risk_category: "Stuck Task",
        risk_score: 100, // arbitrary high score for stuck tasks
        confidence: 1.0,
        scope: { type: "task", id: task._id },
        phrased_text: `Task "${task.title}" has been stuck in '${task.status}' state for ${dwellHours} hours.`,
        details: {
          status: task.status,
          dwellHours,
          dueDate: task.dueDate,
        },
        status: "active",
        model_version: "stuck_detector_v1",
      });

      // 2. Trigger notification to Project Owner + Task Assignee
      const project = await Project.findById(task.projectId, { owner: 1 }).lean(); //

      const recipientSet = new Set();
      if (task.assigneeUserId) recipientSet.add(task.assigneeUserId.toString()); //[cite: 1]
      if (project && project.owner) recipientSet.add(project.owner.toString()); //[cite: 1]

      const recipientUserIds = Array.from(recipientSet); //[cite: 1]

      if (recipientUserIds.length > 0) {
        await aiNotificationQueue.add("send-ai-alert", {
          workspaceId: task.workspaceId,
          recipientUserIds,
          message: `Stuck Task Alert: "${task.title}" has been stuck in '${task.status}' for ${dwellHours} hours.`,
          type: "ai",
        }); //[cite: 1]
      }

      console.log(`[STUCK TASK DETECTED & NOTIFIED] Task ID: ${task._id} | Status: ${task.status}`); //[cite: 1]
    }
  },
  { connection }
);

module.exports = stuckTaskWorker;