const { Worker, Queue } = require("bullmq");
const redisConnection = require("../redisConfig/bullmqRedisConnection"); // BullMQ-specific — was "./redisConfig", wrong shape for BullMQ
const Task = require("../models/tasks.model");

const personScoringQueue = new Queue("PersonScoringQueue", { connection: redisConnection });

/**
 * Listens on 'CronReportsQueue' for the daily 'overload-detection' trigger
 * (added by scheduler.js). Its ONLY job is to figure out who needs scoring
 * and fan that out — it does NOT calculate anything itself.
 */
const dispatcherWorker = new Worker(
    "CronReportsQueue",
    async (job) => {
        if (job.name !== "overload-detection") return;

        // Distinct (workspaceId, assigneeUserId) pairs with at least one
        // active (not done, not soft-deleted) task right now.
        const activeAssignees = await Task.aggregate([
            {
                $match: {
                    status: { $ne: "done" },
                    deletedAt: null
                }
            },
            {
                $group: {
                    _id: { workspaceId: "$workspaceId", assigneeUserId: "$assigneeUserId" }
                }
            }
        ]);

        console.log(`Dispatching ${activeAssignees.length} person-scoring jobs`);

        for (const { _id } of activeAssignees) {
            await personScoringQueue.add("score-person", {
                workspaceId: _id.workspaceId,
                userId: _id.assigneeUserId
            });
        }
        
        return { dispatched: activeAssignees.length };
    },
    { connection: redisConnection }
);

module.exports = dispatcherWorker;