const { Worker } = require("bullmq");
const redisConnection = require("../redisConfig/bullmqRedisConnection");
const Task = require("../models/tasks.model");
const { User } = require("../models");
const OverloadScore = require("../models/overloadScore.model");

// ---------------------------------------------------------
// CONFIG
// ---------------------------------------------------------
const CONFIG = {
    priorityMultiplier: { Low: 1.0, Medium: 1.5, High: 2.0, Critical: 3.0 },
    statusDiscount: { blocked: 0.3, "waiting-review": 0.3 }, // everything else = 1.0
    urgencyWindowDays: 7,
    overdueUrgency: 1.5,
    riskThresholds: { low: 0.7, moderate: 1.0, high: 1.3 },
    contributionThreshold: 0.15,
    capacityWindowDays: 7 // rolling 7-day window for "remaining working days"
};

// Counts weekdays (Mon Fri) in the next `windowDays` calendar days, starting today.
function countRemainingWorkingDays(today, windowDays = CONFIG.capacityWindowDays) {
    let count = 0;
    for (let i = 0; i < windowDays; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        const day = d.getDay(); // 0 = Sunday, 6 = Saturday
        if (day !== 0 && day !== 6) count++;
    }
    return count;
}

function computeTaskWeight(task, today = new Date()) {
    if (task.estimatedEffort == null) {
        console.warn(`Task ${task._id} has no estimatedEffort   skipping in load calc`);
        return 0;
    }

    const priorityMult = CONFIG.priorityMultiplier[task.priority] ?? 1.0;
    const daysLeft = Math.floor((new Date(task.dueDate) - today) / 86400000);

    let urgencyMult;
    if (daysLeft < 0) {
        urgencyMult = CONFIG.overdueUrgency;
    } else if (daysLeft <= CONFIG.urgencyWindowDays) {
        urgencyMult = 1 + (CONFIG.urgencyWindowDays - daysLeft) / CONFIG.urgencyWindowDays;
    } else {
        urgencyMult = 1.0;
    }

    const statusDiscount = CONFIG.statusDiscount[task.status] ?? 1.0;

    return task.estimatedEffort * priorityMult * urgencyMult * statusDiscount;
}

function computeRiskLevel(loadScore) {
    const t = CONFIG.riskThresholds;
    if (loadScore <= t.low) return "low";
    if (loadScore <= t.moderate) return "moderate";
    if (loadScore <= t.high) return "high";
    return "critical";
}

// ---------------------------------------------------------
// WORKER   concurrency: 5 == your "5 workers in parallel"
// ---------------------------------------------------------
const personScoringWorker = new Worker(
    "PersonScoringQueue",
    async (job) => {
        const { workspaceId, userId } = job.data;
        const today = new Date();

        // 1. This person's active tasks across ALL their projects.
        const tasks = await Task.find({
            workspaceId,
            assigneeUserId: userId,
            status: { $ne: "done" },
            deletedAt: null
        }).populate("projectId", "name owner");

        // 2. Real person capacity
        const person = await User.findById(userId);
        if (!person) {
            console.warn(`No user found for ${userId}   skipping score`);
            return null;
        }

        // Safely fallback to 8 hours to avoid NaN capacities
        const workingHoursPerDay = person.workingHoursPerDay ?? 8;
        const remainingWorkingDays = countRemainingWorkingDays(today);
        const capacity = workingHoursPerDay * remainingWorkingDays;

        // 3. Weight each task
        const weighted = tasks.map((t) => ({
            taskId: t._id,
            projectId: t.projectId?._id,
            projectName: t.projectId?.name,
            projectOwnerId: t.projectId?.owner,
            priority: t.priority,
            status: t.status,
            dueDate: t.dueDate,
            weight: computeTaskWeight(t, today)
        }));

        const raw_load = weighted.reduce((sum, t) => sum + t.weight, 0);
        const load_score = capacity > 0 ? raw_load / capacity : 0;
        const risk_level = computeRiskLevel(load_score);

        const contributing_tasks = weighted
            .map((t) => ({ ...t, contribution_pct: raw_load > 0 ? t.weight / raw_load : 0 }))
            .sort((a, b) => b.contribution_pct - a.contribution_pct)
            .filter((t) => t.contribution_pct >= CONFIG.contributionThreshold)
            .slice(0, 5);

        const result = {
            workspaceId,
            userId,
            computed_at: today,
            raw_load: Number(raw_load.toFixed(2)),
            capacity,
            working_hours_per_day: workingHoursPerDay,
            remaining_working_days: remainingWorkingDays,
            load_score: Number(load_score.toFixed(2)),
            risk_level,
            contributing_tasks
        };

        const todayStr = today.toISOString().slice(0, 10);
        await OverloadScore.updateOne(
            { workspaceId, userId, date: todayStr },
            { $set: { ...result, date: todayStr } },
            { upsert: true }
        );
        console.log(result)
        return { ...result, date: todayStr };
    },
    {
        connection: redisConnection,
        concurrency: 5 // <-- your 5 parallel workers
    }
);

module.exports = personScoringWorker;