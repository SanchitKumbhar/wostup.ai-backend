const { Worker } = require("bullmq");
const redisConnection = require("../redisConfig/bullmqRedisConnection");
const { sendNotificationToRecipients } = require("../services/notificationDispatchService");

/**
 * BEFORE: subscribed to Redis Pub/Sub ("ai_notifications"). If this ran on
 * N server instances, ALL N instances received and processed every
 * message — N duplicate DB writes, N duplicate notification.emit()s.
 *
 * NOW: this is a BullMQ Worker on "AINotificationQueue". Run this same
 * code on as many server instances as you want — BullMQ's job locking
 * guarantees exactly ONE of them processes each job. That's genuine
 * horizontal scaling: more instances = more throughput, not more
 * duplicate work.
 *
 * `io` is still required so whichever instance wins the job can emit the
 * socket event. For that emit to reach a recipient connected to a
 * *different* instance, your Socket.IO server needs the Redis adapter
 * (@socket.io/redis-adapter) configured — without it, only recipients
 * connected to the winning instance will actually receive the socket
 * push (the DB write/notification record will still be created either
 * way, so nothing is lost, they'd just see it on next refresh instead of
 * live).
 *
 * `pubClient` is no longer needed — kept as an accepted (unused) param
 * so existing call sites don't need to change.
 */
module.exports = (io, pubClient) => {
    const worker = new Worker(
        "AINotificationQueue",
        async (job) => {
            const payload = job.data;
            const res = await sendNotificationToRecipients(io, payload);

            if (res.statuscode !== 200) {
                // Throwing marks the job failed — BullMQ will retry it
                // per the queue's configured attempts/backoff instead of
                // silently swallowing the failure like the old catch-and-log
                // pub/sub handler did.
                throw new Error(res.message || "AI notification dispatch failed");
            }

            return res;
        },
        {
            connection: redisConnection,
            concurrency: 5 // process up to 5 AI notification jobs at once per instance
        }
    );

    worker.on("failed", (job, err) => {
        console.error(`AI notification job ${job?.id} failed:`, err && err.message ? err.message : err);
    });

    console.log("AI notification worker started.");
    return worker;
};