const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const bcryptjs = require("bcryptjs");
const crypto = require("crypto");
const { connectToMongo } = require("../db/mongo");
const { ensureMongoSchema } = require("../db/schemaSetup");
const {
  User,
  Workspace,
  WorkspaceMember,
  Project,
  Milestone,
  Task,
  AuthAccount,
  AuthSession,
  AuthRefreshToken,
  AuthPasswordResetToken,
  AuthEmailVerificationToken,
} = require("../models");

const TEST_PASSWORD = "Pass@123";

function daysFromNow(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function daysAgo(days) {
  return daysFromNow(-days);
}

async function clearAllData() {
  const models = [
    AuthRefreshToken,
    AuthSession,
    AuthPasswordResetToken,
    AuthEmailVerificationToken,
    AuthAccount,
    Task,
    Milestone,
    Project,
    WorkspaceMember,
    Workspace,
    User,
  ];

  for (const model of models) {
    await model.deleteMany({});
  }
}

async function seedUsersAndAuth() {
  const users = await User.insertMany([
    {
      name: "Sanchit Founder",
      email: "founder@test.local",
      avatar: "SF",
      roleTitle: "Founder",
      skills: ["strategy", "product"],
      emailVerified: true,
      isActive: true,
      deletedAt: null,
    },
    {
      name: "Riya Product",
      email: "riya@test.local",
      avatar: "RP",
      roleTitle: "Product Manager",
      skills: ["planning", "ux"],
      emailVerified: true,
      isActive: true,
      deletedAt: null,
    },
    {
      name: "Aman Developer",
      email: "aman@test.local",
      avatar: "AD",
      roleTitle: "Backend Engineer",
      skills: ["nodejs", "mongodb"],
      emailVerified: true,
      isActive: true,
      deletedAt: null,
    },
    {
      name: "Neha Designer",
      email: "neha@test.local",
      avatar: "ND",
      roleTitle: "UI Designer",
      skills: ["figma", "design-system"],
      emailVerified: false,
      isActive: true,
      deletedAt: null,
    },
  ]);

  const passwordHash = await bcryptjs.hash(TEST_PASSWORD, 10);

  const accounts = users.map((user) => ({
    userId: user._id,
    provider: "local",
    providerAccountId: user.email,
    passwordHash,
    passwordAlgo: "bcrypt",
  }));

  await AuthAccount.insertMany(accounts);

  const founder = users[0];
  const session = await AuthSession.create({
    userId: founder._id,
    sessionToken: crypto.randomBytes(32).toString("hex"),
    ipAddress: "127.0.0.1",
    userAgent: "seed-script",
    expiresAt: daysFromNow(7),
    revokedAt: null,
    createdAt: new Date(),
  });

  const refreshToken = crypto.randomBytes(32).toString("hex");
  const refreshTokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
  await AuthRefreshToken.create({
    userId: founder._id,
    tokenHash: refreshTokenHash,
    sessionId: session._id,
    expiresAt: daysFromNow(14),
    revokedAt: null,
    createdAt: new Date(),
  });

  const passwordResetToken = crypto.randomBytes(32).toString("hex");
  const passwordResetTokenHash = crypto.createHash("sha256").update(passwordResetToken).digest("hex");
  await AuthPasswordResetToken.create({
    userId: users[3]._id,
    tokenHash: passwordResetTokenHash,
    expiresAt: daysFromNow(1),
    usedAt: null,
    createdAt: new Date(),
  });

  const emailVerificationToken = crypto.randomBytes(32).toString("hex");
  const emailVerificationTokenHash = crypto.createHash("sha256").update(emailVerificationToken).digest("hex");
  await AuthEmailVerificationToken.create({
    userId: users[3]._id,
    tokenHash: emailVerificationTokenHash,
    expiresAt: daysFromNow(2),
    verifiedAt: null,
    createdAt: new Date(),
  });

  return {
    users,
    sessionToken: session.sessionToken,
    refreshToken,
    passwordResetToken,
    emailVerificationToken,
  };
}

async function seedWorkspaceData(users) {
  const founder = users[0];
  const productManager = users[1];
  const developer = users[2];
  const designer = users[3];

  const workspace = await Workspace.create({
    name: "Startup Navigator QA Workspace",
    ownerUserId: founder._id,
    description: "Workspace seeded for API testing",
    settings: {
      timezone: "Asia/Kolkata",
      sprintLengthDays: 14,
      currency: "INR",
    },
  });

  const sideWorkspace = await Workspace.create({
    name: "Sandbox Workspace",
    ownerUserId: founder._id,
    description: "Secondary workspace for list/filter testing",
    settings: {
      timezone: "UTC",
      sprintLengthDays: 7,
    },
  });

  await WorkspaceMember.insertMany([
    { workspaceId: workspace._id, userId: founder._id, role: "owner", assignedTasks: [], joinedAt: daysAgo(120) },
    { workspaceId: workspace._id, userId: productManager._id, role: "admin", assignedTasks: [], joinedAt: daysAgo(90) },
    { workspaceId: workspace._id, userId: developer._id, role: "member", assignedTasks: [], joinedAt: daysAgo(60) },
    { workspaceId: workspace._id, userId: designer._id, role: "viewer", assignedTasks: [], joinedAt: daysAgo(30) },
    { workspaceId: sideWorkspace._id, userId: founder._id, role: "owner", assignedTasks: [], joinedAt: daysAgo(15) },
  ]);

  const projects = await Project.insertMany([
    {
      workspaceId: workspace._id,
      name: "Investor Deck Revamp",
      ownerUserId: founder._id,
      createdBy: founder._id,
      status: "active",
      description: "Revamp pitch deck and storytelling for fundraising.",
      progress: 80,
      dueDate: daysFromNow(20),
      createdAt: daysAgo(10),
      updatedAt: new Date(),
      deletedAt: null,
    },
    {
      workspaceId: workspace._id,
      name: "MVP Analytics Module",
      ownerUserId: productManager._id,
      createdBy: productManager._id,
      status: "active",
      description: "Build analytics dashboards and tracking events for MVP.",
      progress: 35,
      dueDate: daysFromNow(20),
      createdAt: daysAgo(10),
      updatedAt: new Date(),
      deletedAt: null,
    },
    {
      workspaceId: workspace._id,
      name: "Website Rebrand",
      ownerUserId: designer._id,
      createdBy: founder._id,
      status: "on-hold",
      description: "Rebrand landing pages and update design system tokens.",
      progress: 22,
      dueDate: daysFromNow(20),
      createdAt: daysAgo(10),
      updatedAt: new Date(),
      deletedAt: null,
    },
    {
      workspaceId: workspace._id,
      name: "Customer Interview Sprint",
      ownerUserId: founder._id,
      createdBy: founder._id,
      status: "active",
      description: "Run interviews and synthesize roadmap insights.",
      progress: 15,
      dueDate: daysFromNow(5),
      createdAt: daysAgo(20),
      updatedAt: new Date(),
      deletedAt: null,
    },
    {
      workspaceId: sideWorkspace._id,
      name: "Sandbox Project",
      ownerUserId: founder._id,
      createdBy: founder._id,
      status: "completed",
      description: "Project in secondary workspace for cross-workspace checks.",
      progress: 100,
      dueDate: daysFromNow(-1),
      createdAt: daysAgo(25),
      updatedAt: new Date(),
      deletedAt: null,
    },
  ]);

  const milestones = await Milestone.insertMany([
    {
      workspaceId: workspace._id,
      projectId: projects[0]._id,
      createdBy: founder._id,
      name: "Deck Structure Finalized",
      description: "Finalize narrative and section flow.",
      dueDate: daysFromNow(7),
      completionPercentage: 85,
      deletedAt: null,
    },
    {
      workspaceId: workspace._id,
      projectId: projects[1]._id,
      createdBy: productManager._id,
      name: "Data Model Ready",
      description: "Finalize schema and tracking event map.",
      dueDate: daysFromNow(8),
      completionPercentage: 40,
      deletedAt: null,
    },
    {
      workspaceId: workspace._id,
      projectId: projects[2]._id,
      createdBy: founder._id,
      name: "Visual Direction",
      description: "Approve typography, color palette, and imagery.",
      dueDate: daysFromNow(6),
      completionPercentage: 25,
      deletedAt: null,
    },
    {
      workspaceId: workspace._id,
      projectId: projects[3]._id,
      createdBy: founder._id,
      name: "Interview Guide",
      description: "Prepare questionnaire and candidate list.",
      dueDate: daysFromNow(2),
      completionPercentage: 30,
      deletedAt: null,
    },
  ]);

  const tasks = await Task.insertMany([
    {
      workspaceId: workspace._id,
      title: "Collect competitor decks",
      description: "Gather and analyze 20 competitor deck examples.",
      status: "done",
      actualProgress: 100,
      assigneeUserId: productManager._id,
      createdBy: founder._id,
      projectId: projects[0]._id,
      milestoneId: milestones[0]._id,
      dueDate: daysFromNow(-2),
      createdAt: daysAgo(14),
      updatedAt: new Date(),
      comments: [
        {
          authorUserId: founder._id,
          authorName: founder.name,
          content: "Great benchmark set. Keep top 5 references pinned.",
          timestamp: daysAgo(4),
        },
      ],
      deletedAt: null,
    },
    {
      workspaceId: workspace._id,
      title: "Draft final deck copy",
      description: "Write concise copy for all pitch deck slides.",
      status: "in-progress",
      actualProgress: 72,
      assigneeUserId: founder._id,
      createdBy: founder._id,
      projectId: projects[0]._id,
      milestoneId: milestones[0]._id,
      dueDate: daysFromNow(5),
      createdAt: daysAgo(9),
      updatedAt: new Date(),
      comments: [],
      deletedAt: null,
    },
    {
      workspaceId: workspace._id,
      title: "Build analytics events table",
      description: "Define event names and payload schema.",
      status: "in-progress",
      actualProgress: 30,
      assigneeUserId: developer._id,
      createdBy: productManager._id,
      projectId: projects[1]._id,
      milestoneId: milestones[1]._id,
      dueDate: daysFromNow(7),
      createdAt: daysAgo(12),
      updatedAt: new Date(),
      comments: [
        {
          authorUserId: productManager._id,
          authorName: productManager.name,
          content: "Please align naming with the tracking spec.",
          timestamp: daysAgo(2),
        },
      ],
      deletedAt: null,
    },
    {
      workspaceId: workspace._id,
      title: "Implement dashboard cards",
      description: "Create KPI cards and trend visualization components.",
      status: "todo",
      actualProgress: 0,
      assigneeUserId: developer._id,
      createdBy: productManager._id,
      projectId: projects[1]._id,
      milestoneId: milestones[1]._id,
      dueDate: daysFromNow(10),
      createdAt: daysAgo(3),
      updatedAt: new Date(),
      comments: [],
      deletedAt: null,
    },
    {
      workspaceId: workspace._id,
      title: "Design new hero layout",
      description: "Create responsive hero concepts for desktop and mobile.",
      status: "in-progress",
      actualProgress: 18,
      assigneeUserId: designer._id,
      createdBy: founder._id,
      projectId: projects[2]._id,
      milestoneId: milestones[2]._id,
      dueDate: daysFromNow(4),
      createdAt: daysAgo(11),
      updatedAt: new Date(),
      comments: [],
      deletedAt: null,
    },
    {
      workspaceId: workspace._id,
      title: "Create interview target list",
      description: "List and contact 15 ideal customer candidates.",
      status: "in-progress",
      actualProgress: 12,
      assigneeUserId: founder._id,
      createdBy: founder._id,
      projectId: projects[3]._id,
      milestoneId: milestones[3]._id,
      dueDate: daysFromNow(1),
      createdAt: daysAgo(19),
      updatedAt: new Date(),
      comments: [],
      deletedAt: null,
    },
    {
      workspaceId: workspace._id,
      title: "Run first 5 interviews",
      description: "Complete first five interviews and document findings.",
      status: "todo",
      actualProgress: 0,
      assigneeUserId: founder._id,
      createdBy: founder._id,
      projectId: projects[3]._id,
      milestoneId: milestones[3]._id,
      dueDate: daysFromNow(3),
      createdAt: daysAgo(6),
      updatedAt: new Date(),
      comments: [],
      deletedAt: null,
    },
  ]);

  return {
    workspace,
    sideWorkspace,
    projects,
    milestones,
    tasks,
    users,
  };
}

async function run() {
  await connectToMongo();
  await ensureMongoSchema();

  console.log("Resetting existing data...");
  await clearAllData();

  console.log("Seeding fresh test data...");
  const authSeed = await seedUsersAndAuth();
  const seeded = await seedWorkspaceData(authSeed.users);

  const summary = {
    users: seeded.users.length,
    workspaces: 2,
    projects: seeded.projects.length,
    milestones: seeded.milestones.length,
    tasks: seeded.tasks.length,
    testPassword: TEST_PASSWORD,
    mainWorkspaceId: seeded.workspace._id.toString(),
    secondaryWorkspaceId: seeded.sideWorkspace._id.toString(),
    sampleProjectId: seeded.projects[1]._id.toString(),
    sampleTaskId: seeded.tasks[2]._id.toString(),
    sessionToken: authSeed.sessionToken,
    refreshToken: authSeed.refreshToken,
    passwordResetToken: authSeed.passwordResetToken,
    emailVerificationToken: authSeed.emailVerificationToken,
  };

  console.log("Seed complete.");
  console.table(summary);

  console.log("Test users:");
  for (const user of seeded.users) {
    console.log(`- ${user.email} / ${TEST_PASSWORD} (id: ${user._id.toString()})`);
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seed failed", error);
    process.exit(1);
  });
