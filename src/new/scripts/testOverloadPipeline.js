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
  Task,
  Notification,
} = require("../models");

const OverloadScore = require("../models/overloadScore.model");
const OverloadNotificationLog = require("../models/overloadNotificationLog.model");

const dispatcherWorker = require("../queues/overload_dispatch");
const scoringWorker = require("../workers/processing.overload");
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

const cronQueue = new Queue("CronReportsQueue", { connection: redisConnection });
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

function buildKey() {
  return `TST${Math.floor(Math.random() * 1000000)}`.slice(0, 10);
}

async function cleanupTestDocs(testRunTag) {
  const emailRegex = new RegExp(`^${testRunTag}\\.`);

  const users = await User.find({ email: emailRegex }, { _id: 1 });
  const userIds = users.map((u) => u._id);

  await Notification.deleteMany({ recipientUserId: { $in: userIds } });
  await OverloadNotificationLog.deleteMany({ userId: { $in: userIds } });
  await OverloadScore.deleteMany({ userId: { $in: userIds } });
  await Task.deleteMany({ createdBy: { $in: userIds } });
  await Project.deleteMany({ createdBy: { $in: userIds } });
  await WorkspaceMember.deleteMany({ userId: { $in: userIds } });
  await Workspace.deleteMany({ ownerUserId: { $in: userIds } });
  await User.deleteMany({ _id: { $in: userIds } });
}

async function run() {
  const testRunTag = `overloadtest${Date.now()}`;
  const todayStr = new Date().toISOString().slice(0, 10);

  console.log("\n=== Overload Pipeline E2E Test ===");
  console.log("Run tag:", testRunTag);

  await connectToMongo();

  try {
    const owner = await User.create({
      name: "Owner User",
      email: `${testRunTag}.owner@test.local`,
      avatar: "OWNR",
      role: "user",
      workingHoursPerDay: 8,
      emailVerified: true,
      isActive: true,
    });

    const assignee = await User.create({
      name: "Assignee User",
      email: `${testRunTag}.assignee@test.local`,
      avatar: "ASGN",
      role: "user",
      workingHoursPerDay: 8,
      emailVerified: true,
      isActive: true,
    });

    const workspace = await Workspace.create({
      name: `Overload Test Workspace ${testRunTag}`,
      ownerUserId: owner._id,
      description: "E2E overload pipeline test",
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

    const project = await Project.create({
      workspaceId: workspace._id,
      name: `Overload Test Project ${testRunTag}`,
      key: buildKey(),
      description: "Project for overload pipeline test",
      owner: owner._id,
      createdBy: owner._id,
      members: [{ userId: owner._id, role: "Owner" }],
      status: "Active",
      priority: "High",
      visibility: "Workspace",
    });

    const dueSoon = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await Task.insertMany([
      {
        workspaceId: workspace._id,
        title: "Critical Task A",
        description: "High load task A",
        status: "todo",
        priority: "Critical",
        estimatedEffort: 60,
        actualProgress: 0,
        assigneeUserId: assignee._id,
        createdBy: owner._id,
        projectId: project._id,
        milestoneId: null,
        dependency: [],
        dueDate: dueSoon,
      },
      {
        workspaceId: workspace._id,
        title: "Critical Task B",
        description: "High load task B",
        status: "todo",
        priority: "Critical",
        estimatedEffort: 60,
        actualProgress: 0,
        assigneeUserId: assignee._id,
        createdBy: owner._id,
        projectId: project._id,
        milestoneId: null,
        dependency: [],
        dueDate: dueSoon,
      },
    ]);

    console.log("Created test users/workspace/project/tasks");

    await cronQueue.add("overload-detection", {}, { removeOnComplete: true, removeOnFail: 100 });
    console.log("Enqueued overload-detection trigger");

    const score = await waitFor(
      "OverloadScore for assignee",
      async () => {
        const doc = await OverloadScore.findOne({
          workspaceId: workspace._id,
          userId: assignee._id,
          date: todayStr,
        }).lean();
        return doc || null;
      },
      30000,
      700
    );

    console.log("Score created:", {
      load_score: score.load_score,
      risk_level: score.risk_level,
      contributing_tasks: (score.contributing_tasks || []).length,
    });

    await notificationCheckQueue.add("notification-check", {}, { removeOnComplete: true, removeOnFail: 100 });
    console.log("Enqueued notification-check trigger");

    const notif = await waitFor(
      "overload_alert notification",
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
      700
    );

    const cooldown = await OverloadNotificationLog.findOne({
      workspaceId: workspace._id,
      userId: assignee._id,
    }).lean();

    console.log("Notification created:", {
      notificationId: String(notif._id),
      recipientUserId: String(notif.recipientUserId),
      type: notif.type,
    });

    console.log("Cooldown log created:", Boolean(cooldown && cooldown.lastNotifiedAt));

    console.log("\nPASS: overload pipeline produced score + notification + cooldown log");
  } finally {
    if (String(process.env.OVERLOAD_TEST_CLEANUP || "true").toLowerCase() !== "false") {
      await cleanupTestDocs(testRunTag);
      console.log("Cleaned up test documents");
    } else {
      console.log("Skipped cleanup because OVERLOAD_TEST_CLEANUP=false");
    }

    await Promise.allSettled([
      cronQueue.close(),
      notificationCheckQueue.close(),
      dispatcherWorker.close(),
      scoringWorker.close(),
      notifierWorker.close(),
      aiWorker.close(),
    ]);

    await mongoose.connection.close();
  }
}

run()
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error("\nFAIL: overload pipeline test failed");
    console.error(error && error.stack ? error.stack : error);

    await Promise.allSettled([
      cronQueue.close(),
      notificationCheckQueue.close(),
      dispatcherWorker.close(),
      scoringWorker.close(),
      notifierWorker.close(),
      aiWorker.close(),
    ]);
    await mongoose.connection.close();
    process.exit(1);
  });
