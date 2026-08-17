const { Queue } = require("bullmq");
const redisConnection = require("../redisConfig/bullmqRedisConnection"); // adjust path to match your project structure

// Any process can call .add() on this (e.g. notifier.js). Any number of
// server instances can run a Worker consuming it (aiNotification.js) —
// BullMQ guarantees each job is claimed and processed by exactly ONE
// worker, no matter how many instances are listening.
const aiNotificationQueue = new Queue("AINotificationQueue", { connection: redisConnection });

module.exports = aiNotificationQueue;