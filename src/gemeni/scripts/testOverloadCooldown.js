const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const { Queue } = require("bullmq");
const redisConnection = require("../redisConfig/bullmqRedisConnection");
const { connectToMongo } = require("../db/mongo");

const {
  User,
  Workspace,
  WorkspaceMember,
  Project,
  Notification,
} = require("../models");

const OverloadScore = require("../models/overloadScore.model");
const OverloadNotificationLog = require("../models/overloadNotificationLog.model");
const notifierWorker = require("../workers/notifier");
const startAiWorker = require("../workers/aiNotification");

const ioStub = {
  in() {
    return {
      async fetchSockets() {
        return [];
      },
    };
  },
};

const aiWorker = startAiWorker(ioStub, null);
const notificationCheckQueue = new Queue("NotificationCheckQueue", { connection: redisConnection });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(description, predicate, timeoutMs = 20000, intervalMs = 500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    const result = await predicate();
    if (result) return result;
    // eslint-disable-next-line no-await-in-loop
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for: ${description}`);
}

async function cleanupTestDocs(testRunTag) {
  const emailRegex = new RegExp(`^${testRunTag}\\.`);

  const users = await User.find({ email: emailRegex }, { _id: 1 });
  const userIds = users.map((u) => u._id);

  await Notification.deleteMany({ recipientUserId: { $in: userIds } });
  await OverloadNotificationLog.deleteMany({ userId: { $in: userIds } });
  await OverloadScore.deleteMany({ userId: { $in: userIds } });
  await Project.deleteMany({ createdBy: { $in: userIds } });
  await WorkspaceMember.deleteMany({ userId: { $in: userIds } });
  await Workspace.deleteMany({ ownerUserId: { $in: userIds } });
  await User.deleteMany({ _id: { $in: userIds } });
}

async function run() {
  const testRunTag = `cooldowntest${Date.now()}`;
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  console.log("\n=== Overload Cooldown Test ===");
  console.log("Run tag:", testRunTag);

  await connectToMongo();

  try {
    const owner = await User.create({
      name: "Cooldown Owner",
      email: `${testRunTag}.owner@test.local`,
      avatar: "OWNR",
      role: "user",
      workingHoursPerDay: 8,
      emailVerified: true,
      isActive: true,
    });

    const assignee = await User.create({
      name: "Cooldown Assignee",
      email: `${testRunTag}.assignee@test.local`,
      avatar: "ASGN",
      role: "user",
      workingHoursPerDay: 8,
      emailVerified: true,
      isActive: true,
    });

    const workspace = await Workspace.create({
      name: `Cooldown Test Workspace ${testRunTag}`,
      ownerUserId: owner._id,
      description: "Cooldown validation workspace",
    });

    await WorkspaceMember.insertMany([
      {
        workspaceId: workspace._id,
        userId: owner._id,
        role: "owner",
        assignedTasks: [],
      },
      {
        workspaceId: workspace._id,
        userId: assignee._id,
        role: "member",
        assignedTasks: [],
      },
    ]);

    await Project.create({
      workspaceId: workspace._id,
      name: `Cooldown Project ${testRunTag}`,
      key: `CD${Math.floor(Math.random() * 10000)}`,
      description: "Project for overload cooldown validation",
      owner: owner._id,
      createdBy: owner._id,
      members: [{ userId: owner._id, role: "Owner" }],
      status: "Active",
      priority: "High",
      visibility: "Workspace",
    });

    const dates = [0, 1, 2, 3].map((daysAgo) => {
      const d = new Date(today);
      d.setDate(d.getDate() - daysAgo);
      return d.toISOString().slice(0, 10);
    });

    await OverloadScore.insertMany(
      dates.map((date) => ({
        workspaceId: workspace._id,
        userId: assignee._id,
        date,
        raw_load: 90,
        capacity: 56,
        working_hours_per_day: 8,
        remaining_working_days: 7,
        load_score: 1.61,
        risk_level: "high",
        contributing_tasks: [
          {
            taskId: new mongoose.Types.ObjectId(),
            projectId: null,
            projectName: "Cooldown Project",
            projectOwnerId: owner._id,
            priority: "Critical",
            status: "todo",
            dueDate: today,
            weight: 90,
            contribution_pct: 1,
          },
        ],
        computed_at: new Date(),
      }))
    );

    console.log("Seeded 4 high-risk scores for the same user");

    const beforeFirst = await Notification.countDocuments({
      workspaceId: workspace._id,
      recipientUserId: owner._id,
      type: "overload_alert",
    });

    await notificationCheckQueue.add("notification-check", {}, { removeOnComplete: true, removeOnFail: 100 });
    console.log("Queued first notification-check run");

    const firstNotification = await waitFor(
      "first overload notification",
      async () => {
        const doc = await Notification.findOne({
          workspaceId: workspace._id,
          recipientUserId: owner._id,
          type: "overload_alert",
        })
          .sort({ timestamp: -1 })
          .lean();
        return doc || null;
      },
      30000,
      500
    );

    const afterFirst = await Notification.countDocuments({
      workspaceId: workspace._id,
      recipientUserId: owner._id,
      type: "overload_alert",
    });

    await notificationCheckQueue.add("notification-check", {}, { removeOnComplete: true, removeOnFail: 100 });
    console.log("Queued second notification-check run immediately");

    await sleep(5000);

    const afterSecond = await Notification.countDocuments({
      workspaceId: workspace._id,
      recipientUserId: owner._id,
      type: "overload_alert",
    });

    const cooldownLog = await OverloadNotificationLog.findOne({
      workspaceId: workspace._id,
      userId: assignee._id,
    }).lean();

    if (beforeFirst !== 0) {
      throw new Error(`Expected zero notifications before test, found ${beforeFirst}`);
    }

    if (afterFirst !== 1) {
      throw new Error(`Expected one notification after first run, found ${afterFirst}`);
    }

    if (afterSecond !== 1) {
      throw new Error(`Cooldown failed: expected notification count to stay at 1, found ${afterSecond}`);
    }

    if (!cooldownLog || !cooldownLog.lastNotifiedAt) {
      throw new Error("Cooldown log was not written");
    }

    console.log("First notification:", {
      id: String(firstNotification._id),
      recipientUserId: String(firstNotification.recipientUserId),
      type: firstNotification.type,
    });

    console.log("Cooldown log lastNotifiedAt:", cooldownLog.lastNotifiedAt);
    console.log("\nPASS: cooldown prevented duplicate notification within the same day");
  } finally {
    if (String(process.env.OVERLOAD_TEST_CLEANUP || "true").toLowerCase() !== "false") {
      await cleanupTestDocs(testRunTag);
      console.log("Cleaned up test documents");
    } else {
      console.log("Skipped cleanup because OVERLOAD_TEST_CLEANUP=false");
    }

    await Promise.allSettled([
      notificationCheckQueue.close(),
      notifierWorker.close(),
      aiWorker.close(),
    ]);

    await mongoose.connection.close();
  }
}

run()
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error("\nFAIL: overload cooldown test failed");
    console.error(error && error.stack ? error.stack : error);

    await Promise.allSettled([
      notificationCheckQueue.close(),
      notifierWorker.close(),
      aiWorker.close(),
    ]);
    await mongoose.connection.close();
    process.exit(1);
  });
