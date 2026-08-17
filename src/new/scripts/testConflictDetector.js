require("dotenv").config();
const mongoose = require("mongoose");
const { connectToMongo } = require("../db/mongo");
const { ensureMongoSchema } = require("../db/schemaSetup");
const { Task, Milestone, Suggestion } = require("../models");
const conflictDetectorService = require("../services/conflictDetector.service");

async function runIntegrationTest() {
  console.log("---------------------------------------------------");
  console.log("🧪 STARTING CONFLICT DETECTOR MODULE INTEGRATION TEST");
  console.log("---------------------------------------------------");

  try {
    // 1. Connect to DB
    console.log("1. Connecting to MongoDB Atlas & bootstrapping schemas...");
    await connectToMongo();
    await ensureMongoSchema();
    console.log("✅ MongoDB connected & schemas verified.");

    // 2. Generate Mock IDs
    const workspaceId = new mongoose.Types.ObjectId();
    const assigneeUserId = new mongoose.Types.ObjectId();
    const creatorUserId = new mongoose.Types.ObjectId();

    const projectAId = new mongoose.Types.ObjectId();
    const projectBId = new mongoose.Types.ObjectId();
    const milestoneId = new mongoose.Types.ObjectId();

    console.log(`\n2. Creating mock test environment for Workspace: ${workspaceId}...`);

    // Create Mock Milestone: Due 2026-08-10
    const mockMilestone = await Milestone.create({
      _id: milestoneId,
      workspaceId,
      projectId: projectAId,
      createdBy: creatorUserId,
      name: "Q3 Release Milestone",
      description: "Milestone for Q3 features",
      dueDate: new Date("2026-08-10T23:59:59.000Z"),
      completionPercentage: 20,
    });

    // ---------------------------------------------------
    // Task 1 & Task 2: For Dependency Conflict & Cross-Project Conflict
    // ---------------------------------------------------
    const task1 = await Task.create({
      workspaceId,
      projectId: projectAId,
      assigneeUserId,
      createdBy: creatorUserId,
      title: "Parent Backend Task 1",
      description: "Core DB architecture task",
      status: "in-progress",
      priority: "Critical",
      dueDate: new Date("2026-08-15T12:00:00.000Z"),
    });

    const task2 = await Task.create({
      workspaceId,
      projectId: projectAId,
      assigneeUserId,
      createdBy: creatorUserId,
      title: "Child Frontend Task 2",
      description: "Frontend integration depending on Task 1",
      status: "todo",
      priority: "High",
      dueDate: new Date("2026-08-12T12:00:00.000Z"), // Due BEFORE parent Task 1 (Dependency Conflict!)
      dependency: [task1._id],
    });

    // ---------------------------------------------------
    // Task 3: In Project B for Cross-Project Overload Conflict
    // ---------------------------------------------------
    const task3 = await Task.create({
      workspaceId,
      projectId: projectBId,
      assigneeUserId,
      createdBy: creatorUserId,
      title: "Project B Critical API Integration",
      description: "API gateway integration",
      status: "in-progress",
      priority: "Critical",
      dueDate: new Date("2026-08-14T12:00:00.000Z"), // Due within 2 days of Task 1 (Cross-Project Conflict!)
    });

    // ---------------------------------------------------
    // Task 4: Milestone Mismatch Conflict
    // ---------------------------------------------------
    const task4 = await Task.create({
      workspaceId,
      projectId: projectAId,
      assigneeUserId,
      createdBy: creatorUserId,
      milestoneId: mockMilestone._id,
      title: "Milestone Exceeding Task 4",
      description: "Task due after target milestone date",
      status: "todo",
      priority: "Medium",
      dueDate: new Date("2026-08-20T12:00:00.000Z"), // Due 2026-08-20 > Milestone due 2026-08-10 (Milestone Mismatch!)
    });

    // ---------------------------------------------------
    // Tasks 5, 6, 7: Due-Date Clustering (3 High/Critical tasks on exact same date 2026-08-25)
    // ---------------------------------------------------
    const clusterDate = new Date("2026-08-25T10:00:00.000Z");

    const task5 = await Task.create({
      workspaceId,
      projectId: projectAId,
      assigneeUserId,
      createdBy: creatorUserId,
      title: "Cluster Task 5",
      description: "Same date task A",
      status: "todo",
      priority: "High",
      dueDate: clusterDate,
    });

    const task6 = await Task.create({
      workspaceId,
      projectId: projectAId,
      assigneeUserId,
      createdBy: creatorUserId,
      title: "Cluster Task 6",
      description: "Same date task B",
      status: "in-progress",
      priority: "Critical",
      dueDate: clusterDate,
    });

    const task7 = await Task.create({
      workspaceId,
      projectId: projectAId,
      assigneeUserId,
      createdBy: creatorUserId,
      title: "Cluster Task 7",
      description: "Same date task C",
      status: "todo",
      priority: "High",
      dueDate: clusterDate,
    });

    console.log("✅ Mock tasks and milestone created successfully.");

    // 3. Execute Conflict Detector Engine
    console.log("\n3. Executing conflictDetectorService.runAllConflictChecks()...");
    const analysisResult = await conflictDetectorService.runAllConflictChecks(workspaceId);

    console.log("\nAnalysis Execution Result:", JSON.stringify(analysisResult, null, 2));

    // 4. Assertions
    console.log("\n4. Running Assertions...");

    if (!analysisResult.success) {
      throw new Error("❌ FAIL: analysisResult.success should be true");
    }
    console.log("✅ PASS: Execution returned success: true");

    const { breakdown } = analysisResult;

    if (breakdown.crossProjectConflicts < 1) {
      throw new Error("❌ FAIL: Cross-Project Conflict was not detected!");
    }
    console.log(`✅ PASS: Cross-Project Conflicts Detected (${breakdown.crossProjectConflicts})`);

    if (breakdown.dependencyConflicts < 1) {
      throw new Error("❌ FAIL: Dependency Conflict was not detected!");
    }
    console.log(`✅ PASS: Dependency Conflicts Detected (${breakdown.dependencyConflicts})`);

    if (breakdown.milestoneMismatches < 1) {
      throw new Error("❌ FAIL: Milestone Mismatch Conflict was not detected!");
    }
    console.log(`✅ PASS: Milestone Mismatches Detected (${breakdown.milestoneMismatches})`);

    if (breakdown.dueDateClustering < 1) {
      throw new Error("❌ FAIL: Due-Date Clustering Conflict was not detected!");
    }
    console.log(`✅ PASS: Due-Date Clustering Detected (${breakdown.dueDateClustering})`);

    // 5. Query Suggestions Service
    console.log("\n5. Testing getWorkspaceSuggestions query service...");
    const storedSuggestions = await conflictDetectorService.getWorkspaceSuggestions(workspaceId);
    console.log(`Fetched ${storedSuggestions.length} stored suggestions from MongoDB suggestions collection.`);

    if (storedSuggestions.length < 4) {
      throw new Error(`❌ FAIL: Expected at least 4 stored suggestions, got ${storedSuggestions.length}`);
    }
    console.log("✅ PASS: Stored suggestions count in MongoDB is correct.");

    // 6. Test Validate Service
    console.log("\n6. Testing validateSuggestion service on first suggestion...");
    const targetSuggestionId = storedSuggestions[0]._id;
    const validatedResult = await conflictDetectorService.validateSuggestion(targetSuggestionId);

    if (!validatedResult || validatedResult.validated !== true) {
      throw new Error("❌ FAIL: Suggestion was not marked validated: true!");
    }
    console.log("✅ PASS: Suggestion validated property correctly set to true.");

    // 7. Cleanup
    console.log("\n7. Cleaning up test data from MongoDB...");
    await Task.deleteMany({ workspaceId });
    await Milestone.deleteMany({ workspaceId });
    await Suggestion.deleteMany({ workspaceId });
    console.log("✅ PASS: Test workspace cleanup complete.");

    console.log("---------------------------------------------------");
    console.log("🎉 ALL 4 CONFLICT DETECTOR TESTS PASSED 100%!");
    console.log("---------------------------------------------------");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ TEST FAILED WITH ERROR:", error);
    process.exit(1);
  }
}

runIntegrationTest();
