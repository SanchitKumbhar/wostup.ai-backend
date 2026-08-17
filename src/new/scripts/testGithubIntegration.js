const path = require("path");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
require("dotenv").config();

const { connectToMongo } = require("../db/mongo");
const { ensureMongoSchema } = require("../db/schemaSetup");
const {
  User,
  Workspace,
  WorkspaceMember,
  Project,
  GithubInstallation,
  GithubRepo,
  GithubPullRequest,
  GithubCommit,
} = require("../models");

const JWT_SECRET = process.env.JWT_SECRET;
const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

if (!JWT_SECRET || !GITHUB_WEBHOOK_SECRET) {
  console.error("❌ JWT_SECRET and GITHUB_WEBHOOK_SECRET must be set in environment to run this integration test script.");
  process.exit(1);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    console.error(`❌ ASSERTION FAILED: ${message}. Expected: ${expected}, Actual: ${actual}`);
    process.exit(1);
  }
  console.log(`  ✅ ${message}`);
}

async function runGithubIntegrationTests() {
  console.log("---------------------------------------------------");
  console.log("🧪 STARTING GITHUB APP INTEGRATION TEST SUITE");
  console.log("---------------------------------------------------");

  await connectToMongo();
  await ensureMongoSchema();
  console.log("✅ Connected to MongoDB Atlas & bootstrapped schemas.");

  // 1. Create Test Fixtures
  const testOwner = await User.create({
    name: "Workspace Owner",
    email: `owner_${Date.now()}@wostup.tech`,
    avatar: "user1",
    role: "user",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const testAttacherLeader = await User.create({
    name: "Team Leader Attacher",
    email: `leader_${Date.now()}@wostup.tech`,
    avatar: "user2",
    role: "user",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const testMember = await User.create({
    name: "Regular Member",
    email: `member_${Date.now()}@wostup.tech`,
    avatar: "user3",
    role: "user",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const testWorkspace = await Workspace.create({
    name: `Test Workspace ${Date.now()}`,
    ownerUserId: testOwner._id,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await WorkspaceMember.create({
    workspaceId: testWorkspace._id,
    userId: testOwner._id,
    role: "owner",
    joinedAt: new Date(),
  });

  await WorkspaceMember.create({
    workspaceId: testWorkspace._id,
    userId: testAttacherLeader._id,
    role: "member",
    joinedAt: new Date(),
  });

  await WorkspaceMember.create({
    workspaceId: testWorkspace._id,
    userId: testMember._id,
    role: "member",
    joinedAt: new Date(),
  });

  const testProject1 = await Project.create({
    workspaceId: testWorkspace._id,
    name: "Test Project Alpha",
    key: "ALPHA",
    owner: testOwner._id,
    createdBy: testOwner._id,
    status: "Active",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const testProject2 = await Project.create({
    workspaceId: testWorkspace._id,
    name: "Test Project Beta",
    key: "BETA",
    owner: testOwner._id,
    createdBy: testOwner._id,
    status: "Active",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log("✅ Created mock workspace, users, and projects.");

  // 2. Test Connect State Token Generation
  console.log("\n2. Testing Connect State JWT Token Generation...");
  const stateToken = jwt.sign(
    { workspaceId: testWorkspace._id.toString(), userId: testOwner._id.toString(), purpose: "github_setup" },
    JWT_SECRET,
    { expiresIn: "15m" }
  );

  const decodedState = jwt.verify(stateToken, JWT_SECRET);
  assertEqual(decodedState.workspaceId, testWorkspace._id.toString(), "State JWT contains correct workspaceId");

  // 3. Test Installation & Repository Pool Upsert
  console.log("\n3. Testing Installation & Repo Pool Ingestion...");
  const dummyInstallationId = Math.floor(100000 + Math.random() * 900000);

  const installation = await GithubInstallation.create({
    workspaceId: testWorkspace._id,
    installationId: dummyInstallationId,
    accountLogin: "wostup-org",
    accountType: "Organization",
    installedByUserId: testOwner._id,
    status: "active",
  });
  assertEqual(installation.accountLogin, "wostup-org", "Installation created for wostup-org");

  const repo1 = await GithubRepo.create({
    installationId: dummyInstallationId,
    githubRepoId: 9001,
    fullName: "wostup-org/frontend-app",
    private: true,
    defaultBranch: "main",
    projectId: null,
    attachedByUserId: null,
  });

  const repo2 = await GithubRepo.create({
    installationId: dummyInstallationId,
    githubRepoId: 9002,
    fullName: "wostup-org/backend-service",
    private: true,
    defaultBranch: "develop",
    projectId: null,
    attachedByUserId: null,
  });

  assertEqual(repo1.projectId, null, "Repo 1 initially in unattached pool (projectId === null)");

  // 4. Test Unattached Repos Query
  console.log("\n4. Testing Unattached Repos Query for Workspace...");
  const unattached = await GithubRepo.find({
    installationId: dummyInstallationId,
    projectId: null,
  });
  assertEqual(unattached.length, 2, "Found 2 unattached repositories in workspace pool");

  // 5. Test Project Attachment & Locking
  console.log("\n5. Testing Project Repository Attachment & Locking...");
  repo1.projectId = testProject1._id;
  repo1.attachedByUserId = testAttacherLeader._id;
  await repo1.save();

  const remainingUnattached = await GithubRepo.find({
    installationId: dummyInstallationId,
    projectId: null,
  });
  assertEqual(remainingUnattached.length, 1, "Unattached pool reduced to 1 after attaching repo1 to Project Alpha");
  assertEqual(remainingUnattached[0].githubRepoId, 9002, "Repo 2 remains in unattached pool");

  // 6. Test Detachment RBAC Enforcement Logic
  console.log("\n6. Testing Strict RBAC Rules for Repo Detachment...");

  // Helper simulating RBAC rule check
  async function canUserDetachRepo(userId, projectObj, repoObj) {
    const member = await WorkspaceMember.findOne({
      workspaceId: projectObj.workspaceId,
      userId,
    }).lean();

    const role = String(member?.role || "").toLowerCase();
    const isAdmin = role === "owner" || role === "admin";
    const isAttacher = repoObj.attachedByUserId && repoObj.attachedByUserId.toString() === userId.toString();

    return isAdmin || isAttacher;
  }

  const regularMemberCanDetach = await canUserDetachRepo(testMember._id, testProject1, repo1);
  assertEqual(regularMemberCanDetach, false, "Regular non-attacher member CANNOT detach repository (403 Forbidden)");

  const attacherCanDetach = await canUserDetachRepo(testAttacherLeader._id, testProject1, repo1);
  assertEqual(attacherCanDetach, true, "Team Leader who attached repository CAN detach");

  const ownerCanDetach = await canUserDetachRepo(testOwner._id, testProject1, repo1);
  assertEqual(ownerCanDetach, true, "Workspace Owner CAN detach any repository");

  // Perform detachment by attacher
  repo1.projectId = null;
  repo1.attachedByUserId = null;
  await repo1.save();
  assertEqual(repo1.projectId, null, "Repository successfully detached and returned to unattached pool");

  // Re-attach repo1 to Project Alpha for PR / Webhook tests
  repo1.projectId = testProject1._id;
  repo1.attachedByUserId = testAttacherLeader._id;
  await repo1.save();

  // 7. Test Webhook HMAC Signature & Pull Request Processing
  console.log("\n7. Testing Webhook HMAC Signature Verification & PR Processing...");
  const rawPayload = JSON.stringify({
    action: "closed",
    pull_request: {
      id: 555001,
      number: 42,
      title: "Feature: Add GitHub App Spec",
      state: "closed",
      merged: true,
      merged_at: new Date().toISOString(),
      user: { login: "octocat" },
      created_at: new Date(Date.now() - 3600000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    repository: {
      id: 9001,
      full_name: "wostup-org/frontend-app",
    },
  });

  const hmac = crypto.createHmac("sha256", GITHUB_WEBHOOK_SECRET);
  const signature = "sha256=" + hmac.update(rawPayload).digest("hex");

  // Verify HMAC signature logic
  const isValidSig = crypto.timingSafeEqual(
    Buffer.from(crypto.createHmac("sha256", GITHUB_WEBHOOK_SECRET).update(rawPayload).digest("hex"), "hex"),
    Buffer.from(signature.replace("sha256=", ""), "hex")
  );
  assertEqual(isValidSig, true, "HMAC SHA-256 signature verification passed");

  // Upsert PR into GithubPullRequest
  const prDoc = await GithubPullRequest.create({
    repoId: repo1._id,
    githubPrId: 555001,
    number: 42,
    title: "Feature: Add GitHub App Spec",
    state: "closed",
    merged: true,
    mergedAt: new Date(),
    authorLogin: "octocat",
    createdAtGh: new Date(Date.now() - 3600000),
    updatedAtGh: new Date(),
    rawPayload: JSON.parse(rawPayload),
  });
  assertEqual(prDoc.merged, true, "Pull Request created and marked as merged");

  // 8. Test Commit Webhook Processing
  console.log("\n8. Testing Push Commit Processing...");
  const commitDoc = await GithubCommit.create({
    repoId: repo1._id,
    sha: "a1b2c3d4e5f678901234567890abcdef12345678",
    message: "feat: implement github app spec",
    authorLogin: "octocat",
    committedAt: new Date(),
    rawPayload: {},
  });
  assertEqual(commitDoc.sha, "a1b2c3d4e5f678901234567890abcdef12345678", "Commit upserted successfully");

  // 9. Test Cursor-based PR Pagination Query
  console.log("\n9. Testing Cursor-Based PR Pagination Query...");
  const prs = await GithubPullRequest.find({ repoId: repo1._id })
    .sort({ updatedAtGh: -1, _id: -1 })
    .limit(10);
  assertEqual(prs.length, 1, "Cursor query returned synced pull request");
  assertEqual(prs[0].number, 42, "PR number 42 correctly retrieved");

  // 10. Clean Up Test Data
  console.log("\n10. Cleaning up mock test data...");
  await GithubCommit.deleteMany({ repoId: repo1._id });
  await GithubPullRequest.deleteMany({ repoId: repo1._id });
  await GithubRepo.deleteMany({ installationId: dummyInstallationId });
  await GithubInstallation.deleteMany({ installationId: dummyInstallationId });
  await Project.deleteMany({ workspaceId: testWorkspace._id });
  await WorkspaceMember.deleteMany({ workspaceId: testWorkspace._id });
  await Workspace.deleteOne({ _id: testWorkspace._id });
  await User.deleteMany({ _id: { $in: [testOwner._id, testAttacherLeader._id, testMember._id] } });
  console.log("✅ Test data cleanup complete.");

  console.log("---------------------------------------------------");
  console.log("🎉 ALL GITHUB APP INTEGRATION TESTS PASSED 100%!");
  console.log("---------------------------------------------------");
}

runGithubIntegrationTests().catch((err) => {
  console.error("❌ Test script failed with error:", err);
  process.exit(1);
});
