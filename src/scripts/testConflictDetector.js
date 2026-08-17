const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dns").setServers(["8.8.8.8", "1.1.1.1"]);

const mongoose = require("mongoose");
const { connectToMongo } = require("../db/mongo");
const { ensureMongoSchema } = require("../db/schemaSetup");
const { Task, Milestone, WorkspaceMember, Project, Notification } = require("../models");
const conflictDetectorService = require("../services/conflictDetector.service");
const { sendNotificationToRecipients } = require("../services/notificationDispatchService");
const { setupRedis } = require("../redisConfig/config");
const { io } = require("../app");

function buildKey() {
  return `CF${Math.floor(Math.random() * 1000000)}`.slice(0, 10);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runLiveConflictRealtimeTest() {
  console.log("---------------------------------------------------");
  console.log("🧪 STARTING LIVE REAL-TIME CONFLICT NOTIFICATION TEST");
  console.log("---------------------------------------------------");

  const TARGET_USER_ID = new mongoose.Types.ObjectId("6a7ef0a066f2ce0b4783edf4");
  const TARGET_WORKSPACE_ID = new mongoose.Types.ObjectId("6a7ef1440c71a94254692968");
  const testRunTag = `conflict_live_${Date.now()}`;

  let projectA = null;
  let projectB = null;

  try {
    // 1. Connect to Mongo & Setup Redis Adapter for multi-process Socket delivery
    console.log("1. Connecting to MongoDB Atlas & Redis Adapter...");
    await connectToMongo();
    await ensureMongoSchema();
    await setupRedis(io);
    console.log("✅ MongoDB & Redis Adapter ready.");

    // 2. Verify target user membership
    console.log(`\n2. Verifying user ${TARGET_USER_ID} in workspace ${TARGET_WORKSPACE_ID}...`);
    const membership = await WorkspaceMember.findOne({
      workspaceId: TARGET_WORKSPACE_ID,
      userId: TARGET_USER_ID,
    }).lean();

    if (!membership) {
      throw new Error(`User ${TARGET_USER_ID} is not in workspace ${TARGET_WORKSPACE_ID}`);
    }
    console.log(`Assertion Passed: User membership confirmed (Role: ${membership.role})`);

    // 3. Create test projects inside the live workspace
    projectA = await Project.create({
      workspaceId: TARGET_WORKSPACE_ID,
      name: `Live Conflict Alpha ${testRunTag}`,
      key: buildKey(),
      description: "Project for real-time conflict testing",
      owner: TARGET_USER_ID,
      createdBy: TARGET_USER_ID,
      members: [{ userId: TARGET_USER_ID, role: "Owner" }],
      status: "Active",
      priority: "High",
      visibility: "Workspace",
    });

    projectB = await Project.create({
      workspaceId: TARGET_WORKSPACE_ID,
      name: `Live Conflict Beta ${testRunTag}`,
      key: buildKey(),
      description: "Project for cross-project conflict testing",
      owner: TARGET_USER_ID,
      createdBy: TARGET_USER_ID,
      members: [{ userId: TARGET_USER_ID, role: "Owner" }],
      status: "Active",
      priority: "High",
      visibility: "Workspace",
    });

    const mockMilestone = await Milestone.create({
      workspaceId: TARGET_WORKSPACE_ID,
      projectId: projectA._id,
      createdBy: TARGET_USER_ID,
      name: `Live Target Milestone ${testRunTag}`,
      description: "Target milestone for mismatch checks",
      dueDate: new Date("2026-08-20T23:59:59.000Z"),
      completionPercentage: 20,
    });

    // 4. Seed conflict scenarios
    const task1 = await Task.create({
      workspaceId: TARGET_WORKSPACE_ID,
      projectId: projectA._id,
      assigneeUserId: TARGET_USER_ID,
      createdBy: TARGET_USER_ID,
      title: `Parent Backend Architecture [${testRunTag}]`,
      description: "Core DB architecture task",
      status: "in-progress",
      priority: "Critical",
      dueDate: new Date("2026-08-25T12:00:00.000Z"),
    });

    const task2 = await Task.create({
      workspaceId: TARGET_WORKSPACE_ID,
      projectId: projectA._id,
      assigneeUserId: TARGET_USER_ID,
      createdBy: TARGET_USER_ID,
      title: `Child Frontend Component [${testRunTag}]`,
      description: "Frontend depending on Task 1",
      status: "todo",
      priority: "High",
      dueDate: new Date("2026-08-22T12:00:00.000Z"), // Dependency Conflict
      dependency: [task1._id],
    });

    const task3 = await Task.create({
      workspaceId: TARGET_WORKSPACE_ID,
      projectId: projectB._id,
      assigneeUserId: TARGET_USER_ID,
      createdBy: TARGET_USER_ID,
      title: `Cross-Project Microservice [${testRunTag}]`,
      description: "API gateway integration",
      status: "in-progress",
      priority: "Critical",
      dueDate: new Date("2026-08-24T12:00:00.000Z"), // Cross-Project Overload Conflict
    });

    const task4 = await Task.create({
      workspaceId: TARGET_WORKSPACE_ID,
      projectId: projectA._id,
      assigneeUserId: TARGET_USER_ID,
      createdBy: TARGET_USER_ID,
      milestoneId: mockMilestone._id,
      title: `Milestone Overdue Task [${testRunTag}]`,
      description: "Task due after milestone",
      status: "todo",
      priority: "Medium",
      dueDate: new Date("2026-08-30T12:00:00.000Z"), // Milestone Mismatch
    });

    console.log("✅ Seeded conflict tasks and milestones.");

    // 5. Run conflict detector engine
    console.log("\n5. Running conflict detector calculations...");
    const analysisResult = await conflictDetectorService.runAllConflictChecks(TARGET_WORKSPACE_ID);
    console.log("Analysis Result Breakdown:", analysisResult.breakdown);

    // 6. Broadcast Real-Time Notification & WebSocket Events
    console.log("\n6. Dispatching Real-Time Notification via Socket.IO & Redis Adapter...");
    const topSuggestion = analysisResult.suggestions[0];
    const alertMessage = `AI Alert: Detected ${analysisResult.totalConflictsFound} scheduling conflicts in workspace.`;

    const dispatchResult = await sendNotificationToRecipients(io, {
      workspaceId: TARGET_WORKSPACE_ID,
      recipientUserId: TARGET_USER_ID,
      message: alertMessage,
      type: "ai",
    });

    console.log("Dispatch Result:", dispatchResult);

    // Broadcast dedicated detector channel alert
    io.in(`workspace:${TARGET_WORKSPACE_ID}`).emit("detector:conflict_alert", {
      workspaceId: TARGET_WORKSPACE_ID,
      totalConflicts: analysisResult.totalConflictsFound,
      breakdown: analysisResult.breakdown,
      topSuggestion,
    });

    console.log("✅ WebSocket packet broadcasted to Redis Pub/Sub.");

    // Verify MongoDB persistence
    const savedNotification = await Notification.findOne({
      workspaceId: TARGET_WORKSPACE_ID,
      recipientUserId: TARGET_USER_ID,
      type: "ai",
    }).sort({ timestamp: -1 }).lean();

    console.log("\nPersisted Notification Details:", {
      notificationId: String(savedNotification._id),
      recipientUserId: String(savedNotification.recipientUserId),
      type: savedNotification.type,
      message: savedNotification.message,
    });

    console.log("\n⏳ Keeping process alive for 6 seconds so the WebSocket event delivers to your open browser UI...");
    await sleep(6000);

    console.log("---------------------------------------------------");
    console.log("🎉 LIVE REAL-TIME CONFLICT TEST COMPLETE!");
    console.log("---------------------------------------------------");
  } finally {
    const shouldCleanup = String(process.env.CONFLICT_TEST_CLEANUP || "false").toLowerCase() === "true";

    if (shouldCleanup) {
      console.log("Cleaning up created test fixtures...");
      if (projectA) await Task.deleteMany({ projectId: projectA._id });
      if (projectB) await Task.deleteMany({ projectId: projectB._id });
      await Milestone.deleteMany({ name: new RegExp(testRunTag) });
      if (projectA) await Project.deleteOne({ _id: projectA._id });
      if (projectB) await Project.deleteOne({ _id: projectB._id });
      console.log("✅ Cleanup complete.");
    } else {
      console.log("💡 CONFLICT_TEST_CLEANUP=false: Notification retained in DB for UI inspection.");
    }

    await mongoose.connection.close();
    process.exit(0);
  }
}

runLiveConflictRealtimeTest().catch((err) => {
  console.error("\n❌ TEST FAILED WITH ERROR:", err);
  process.exit(1);
});