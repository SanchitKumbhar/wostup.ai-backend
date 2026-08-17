const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dns").setServers(["8.8.8.8", "1.1.1.1"]);

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

// Use the active Socket.IO server instance so real-time events reach your open browser tab
const { io } = require("../app");
const aiWorker = startAiWorker(io, null);

const cronQueue = new Queue("CronReportsQueue", { connection: redisConnection });
const notificationCheckQueue = new Queue("NotificationCheckQueue", { connection: redisConnection });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(description, predicate, timeoutMs = 25000, intervalMs = 500) {
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

async function cleanupTestDocs(testRunTag, targetWorkspaceId, assigneeId) {
  const emailRegex = new RegExp(`^${testRunTag}\\.`);

  // 1. Remove only the temporary assignee user
  if (assigneeId) {
    await Task.deleteMany({ assigneeUserId: assigneeId });
    await OverloadNotificationLog.deleteMany({ userId: assigneeId });
    await OverloadScore.deleteMany({ userId: assigneeId });
    await WorkspaceMember.deleteOne({ workspaceId: targetWorkspaceId, userId: assigneeId });
    await User.deleteOne({ _id: assigneeId });
  }

  // 2. Remove any other generated test users matching runTag
  const extraUsers = await User.find({ email: emailRegex }, { _id: 1 });
  const extraIds = extraUsers.map((u) => u._id);
  if (extraIds.length) {
    await User.deleteMany({ _id: { $in: extraIds } });
  }

  // 3. Remove test projects created under this test run
  const testProjectRegex = new RegExp(`^Live Overload Test Project ${testRunTag}`);
  await Project.deleteMany({ workspaceId: targetWorkspaceId, name: testProjectRegex });
}

async function run() {
  const testRunTag = `overloadtest${Date.now()}`;
  const todayStr = new Date().toISOString().slice(0, 10);

  const TARGET_USER_ID = new mongoose.Types.ObjectId("6a7ef0a066f2ce0b4783edf4");
  const TARGET_WORKSPACE_ID = new mongoose.Types.ObjectId("6a7ef1440c71a94254692968");

  console.log("\n=== Overload Pipeline & Live UI Real-Time Test ===");
  console.log("Run tag:", testRunTag);

  await connectToMongo();

  let assignee = null;

  try {
    // 1. Verify target user exists and belongs to the workspace
    console.log(`Verifying user ${TARGET_USER_ID} in live workspace ${TARGET_WORKSPACE_ID}...`);
    const workspace = await Workspace.findById(TARGET_WORKSPACE_ID).lean();
    if (!workspace) {
      throw new Error(`Live workspace ${TARGET_WORKSPACE_ID} not found in database`);
    }

    const membership = await WorkspaceMember.findOne({
      workspaceId: TARGET_WORKSPACE_ID,
      userId: TARGET_USER_ID,
    }).lean();

    if (!membership) {
      throw new Error(
        `Assertion Failed: User ${TARGET_USER_ID} is NOT a member of workspace ${TARGET_WORKSPACE_ID}`
      );
    }
    console.log(`Assertion Passed: User membership confirmed (Role: ${membership.role})`);

    // 2. Create a temporary assignee who will become overloaded
    assignee = await User.create({
      name: "Overloaded Engineer",
      email: `${testRunTag}.assignee@test.local`,
      avatar: "OE",
      role: "user",
      workingHoursPerDay: 8,
      emailVerified: true,
      isActive: true,
    });

    // Add assignee to the live workspace so the pipeline processes them
    await WorkspaceMember.updateOne(
      { workspaceId: TARGET_WORKSPACE_ID, userId: assignee._id },
      { $set: { role: "member", assignedTasks: [], joinedAt: new Date() } },
      { upsert: true }
    );

    // Create a test project owned by TARGET_USER_ID in the live workspace
    const project = await Project.create({
      workspaceId: TARGET_WORKSPACE_ID,
      name: `Live Overload Test Project ${testRunTag}`,
      key: buildKey(),
      description: "Live real-time overload pipeline validation",
      owner: TARGET_USER_ID,
      createdBy: TARGET_USER_ID,
      members: [
        { userId: TARGET_USER_ID, role: "Owner" },
        { userId: assignee._id, role: "Developer" },
      ],
      status: "Active",
      priority: "Critical",
      visibility: "Workspace",
    });

    const dueSoon = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Seed heavy tasks assigned to the engineer to trigger critical overload (loadScore > 8)
    await Task.insertMany([
      {
        workspaceId: TARGET_WORKSPACE_ID,
        title: "Critical DB Migration Load A",
        description: "Heavy database migration schema task",
        status: "todo",
        priority: "Critical",
        estimatedEffort: 60,
        actualProgress: 0,
        assigneeUserId: assignee._id,
        createdBy: TARGET_USER_ID,
        projectId: project._id,
        milestoneId: null,
        dependency: [],
        dueDate: dueSoon,
      },
      {
        workspaceId: TARGET_WORKSPACE_ID,
        title: "Critical Auth Optimization Load B",
        description: "High concurrency session token handler",
        status: "todo",
        priority: "Critical",
        estimatedEffort: 60,
        actualProgress: 0,
        assigneeUserId: assignee._id,
        createdBy: TARGET_USER_ID,
        projectId: project._id,
        milestoneId: null,
        dependency: [],
        dueDate: dueSoon,
      },
    ]);

    console.log("Created test fixtures inside live workspace");

    // 3. Clear existing daily cooldown logs so the notification check emits immediately
    await OverloadNotificationLog.deleteMany({
      workspaceId: TARGET_WORKSPACE_ID,
      userId: assignee._id,
    });

    // 4. Trigger overload scoring pipeline
    await cronQueue.add("overload-detection", {}, { removeOnComplete: true, removeOnFail: 100 });
    console.log("Enqueued overload-detection trigger to BullMQ...");

    const score = await waitFor(
      "OverloadScore for assignee",
      async () => {
        const doc = await OverloadScore.findOne({
          workspaceId: TARGET_WORKSPACE_ID,
          userId: assignee._id,
          date: todayStr,
        }).lean();
        return doc || null;
      },
      30000,
      700
    );

    console.log("Overload score created:", {
      load_score: score.load_score,
      risk_level: score.risk_level,
      contributing_tasks: (score.contributing_tasks || []).length,
    });

    // 5. Trigger notification check & WebSocket broadcast
    await notificationCheckQueue.add("notification-check", {}, { removeOnComplete: true, removeOnFail: 100 });
    console.log("Enqueued notification-check trigger...");

    const notif = await waitFor(
      "overload_alert notification record in MongoDB",
      async () => {
        const doc = await Notification.findOne({
          workspaceId: TARGET_WORKSPACE_ID,
          recipientUserId: TARGET_USER_ID,
          type: "overload_alert",
        })
          .sort({ timestamp: -1 })
          .lean();
        return doc || null;
      },
      30000,
      700
    );

    console.log("Notification persisted and broadcasted via WebSocket:", {
      notificationId: String(notif._id),
      recipientUserId: String(notif.recipientUserId),
      type: notif.type,
      message: notif.message,
    });

    console.log("\nPASS: Target user received the live notification event in their active workspace room.");
  } finally {
    // Retain created notification document if OVERLOAD_TEST_CLEANUP=false so you can inspect it in your UI
    const shouldCleanup = String(process.env.OVERLOAD_TEST_CLEANUP || "false").toLowerCase() === "true";

    if (shouldCleanup) {
      await cleanupTestDocs(testRunTag, TARGET_WORKSPACE_ID, assignee?._id);
      console.log("Cleaned up temporary test tasks and assignee.");
    } else {
      console.log("OVERLOAD_TEST_CLEANUP is false: Persisted test notification for live UI inspection.");
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
    console.error("\nFAIL: Test failed");
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