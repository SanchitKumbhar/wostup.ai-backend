const { Worker } = require("bullmq");
const redisConnection = require("../redisConfig/bullmqRedisConnection"); // BullMQ-specific connection, not the Socket.IO adapter config
const OverloadScore = require("../models/overloadScore.model");
const OverloadNotificationLog = require("../models/overloadNotificationLog.model");
const aiNotificationQueue = require("../queues/aiNotificationQueue");

const NOTIFY_CONFIG = {
    highThreshold: 1.3,              // must match riskThresholds.high in processing.overload.js
    emergencyMultiplier: 1.5,        // load_score > highThreshold * this = bypass the pattern check entirely
    lookbackDays: 5,
    minBadDaysInLookback: 3,         // "3 out of last 5 days" instead of strict consecutive
    cooldownDays: 3,
    minRiskLevel: "high",            // "moderate" never notifies, only high/critical
    contributionThreshold: 0.15      // matches the same cutoff used for contributing_tasks
};

const RISK_ORDER = ["low", "moderate", "high", "critical"];
function meetsMinRisk(level) {
    return RISK_ORDER.indexOf(level) >= RISK_ORDER.indexOf(NOTIFY_CONFIG.minRiskLevel);
}

async function shouldNotify(score) {
    const emergencyCutoff = NOTIFY_CONFIG.highThreshold * NOTIFY_CONFIG.emergencyMultiplier;
    if (score.load_score > emergencyCutoff) return { notify: true, reason: "emergency" };

    const recent = await OverloadScore.find({ workspaceId: score.workspaceId, userId: score.userId })
        .sort({ date: -1 })
        .limit(NOTIFY_CONFIG.lookbackDays);

    const badDays = recent.filter((d) => meetsMinRisk(d.risk_level)).length;
    if (badDays >= NOTIFY_CONFIG.minBadDaysInLookback) return { notify: true, reason: "sustained_pattern" };

    return { notify: false };
}

async function isInCooldown(workspaceId, userId, today) {
    const log = await OverloadNotificationLog.findOne({ workspaceId, userId });
    if (!log) return false;
    const daysSince = Math.floor((today - log.lastNotifiedAt) / 86400000);
    return daysSince < NOTIFY_CONFIG.cooldownDays;
}
const notifierWorker = new Worker(
    "NotificationCheckQueue",
    async (job) => {
        if (job.name !== "notification-check") return;

        const today = new Date();
        const todayStr = today.toISOString().slice(0, 10);

        const todaysScores = await OverloadScore.find({ date: todayStr });
        console.log(`Notification check: evaluating ${todaysScores.length} scores for ${todayStr}`);

        const ownerBatches = {}; // ownerId -> { workspaceId, entries: [] }

        for (const score of todaysScores) {
            const decision = await shouldNotify(score);
            if (!decision.notify) continue;

            // FIXED: emergencies now bypass cooldown too, same as they
            // already bypass the pattern-wait in shouldNotify(). Without
            // this, someone notified yesterday for a routine "sustained
            // pattern" alert would have a genuinely new, worse emergency
            // today silently swallowed for up to 3 days.
            if (decision.reason !== "emergency") {
                if (await isInCooldown(score.workspaceId, score.userId, today)) continue;
            }

            const relevantOwnerIds = new Set(
                (score.contributing_tasks || [])
                    .filter((t) => t.contribution_pct >= NOTIFY_CONFIG.contributionThreshold && t.projectOwnerId)
                    .map((t) => String(t.projectOwnerId))
            );

            if (relevantOwnerIds.size === 0) continue;

            for (const ownerId of relevantOwnerIds) {
                ownerBatches[ownerId] = ownerBatches[ownerId] || {
                    workspaceId: score.workspaceId,
                    entries: []
                };
                ownerBatches[ownerId].entries.push({
                    userId: score.userId,
                    risk_level: score.risk_level,
                    load_score: score.load_score,
                    reason: decision.reason
                });
            }

            await OverloadNotificationLog.updateOne(
                { workspaceId: score.workspaceId, userId: score.userId },
                { $set: { lastNotifiedAt: today } },
                { upsert: true }
            );
        }

        // FIXED: was publisher.publish("ai_notifications", ...) — a Redis
        // pub/sub broadcast that NOTHING was subscribed to anymore, since
        // aiNotification.js was already converted to a BullMQ Worker on
        // "AINotificationQueue". Every notification from here was silently
        // vanishing. Now enqueues a real, durable, retryable job instead —
        // matches what aiNotification.js actually consumes.
        let sentCount = 0;
        for (const [ownerId, batch] of Object.entries(ownerBatches)) {
            const summary = batch.entries
                .map((e) => `${e.userId} (${e.risk_level}${e.reason === "emergency" ? ", urgent" : ""})`)
                .join(", ");

            const payload = {
                workspaceId: batch.workspaceId,
                recipientUserId: ownerId,
                message:
                    batch.entries.length === 1
                        ? `Overload alert: ${summary} is at risk on your project.`
                        : `Overload alert: ${batch.entries.length} team members are at risk on your project(s) — ${summary}`,
                type: "overload_alert"
            };

            await aiNotificationQueue.add("send-ai-notification", payload, {
                attempts: 3,
                backoff: { type: "exponential", delay: 5000 },
                removeOnComplete: true,
                removeOnFail: 100
            });
            sentCount++;
        }

        console.log(`Notification check complete: ${sentCount} owner(s) queued for notification`);
        return { ownersNotified: sentCount };
    },
    { connection: redisConnection }
);

module.exports = notifierWorker;