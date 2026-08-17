const mongoose = require("mongoose");
const { Task, WorkspaceMember, User, Project } = require("../models/index");
const { resolveProjectId } = require("../utils/resolveProject");

function toObjectId(id) {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
  return new mongoose.Types.ObjectId(id);
}

function getTaskHealthState(task, now = Date.now()) {
  const startDate = new Date(task.createdAt || task.startDate || now).getTime();
  const dueDate = task.dueDate ? new Date(task.dueDate).getTime() : null;
  const actualProgress = Number.isFinite(Number(task.actualProgress))
    ? Number(task.actualProgress)
    : 0;

  // Normalized completion for "done" status
  if (task.status === "done") {
    return {
      expectedProgress: 100,
      actualProgress: 100,
      healthStatus: "healthy",
      statusBadge: "COMPLETED",
      isOverdue: false,
      stuckScore: 0,
      daysRemaining: 0,
    };
  }

  // Without due date: estimate default health
  if (!dueDate || Number.isNaN(dueDate) || dueDate <= startDate) {
    const isBlocked = Boolean(task.isBlocked || task.status === "blocked");
    return {
      expectedProgress: 50,
      actualProgress,
      healthStatus: isBlocked ? "blocked" : "healthy",
      statusBadge: isBlocked ? "BLOCKED" : "ON TRACK",
      isOverdue: false,
      stuckScore: isBlocked ? 75 : 10,
      daysRemaining: null,
    };
  }

  const timeElapsed = Math.max(0, now - startDate);
  const totalDuration = Math.max(1, dueDate - startDate);
  const expectedProgress = Math.min(
    100,
    Math.max(0, (timeElapsed / totalDuration) * 100)
  );

  const isOverdue = now > dueDate;
  const diffDays = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
  const progressGap = expectedProgress - actualProgress;

  let healthStatus = "healthy";
  let statusBadge = "ON TRACK";
  let stuckScore = 15;

  if (task.isBlocked || task.status === "blocked") {
    healthStatus = "blocked";
    statusBadge = "BLOCKED";
    stuckScore = 85;
  } else if (isOverdue) {
    healthStatus = "delayed";
    statusBadge = "OVERDUE";
    stuckScore = 90;
  } else if (progressGap > 25) {
    healthStatus = "at_risk";
    statusBadge = "AT RISK";
    stuckScore = 65;
  } else if (progressGap > 10) {
    healthStatus = "attention";
    statusBadge = "NEEDS ATTENTION";
    stuckScore = 40;
  }

  return {
    expectedProgress: Number(expectedProgress.toFixed(1)),
    actualProgress: Number(actualProgress.toFixed(1)),
    healthStatus,
    statusBadge,
    isOverdue,
    stuckScore,
    daysRemaining: diffDays,
  };
}

async function validateMembership(workspaceId, userId) {
  if (!userId) return true;
  const isMember = await WorkspaceMember.findOne(
    { workspaceId, userId: new mongoose.Types.ObjectId(userId) },
    { _id: 1 }
  ).lean();
  return Boolean(isMember);
}

async function getAssigneeMap(tasks) {
  const assigneeIds = [
    ...new Set(
      tasks
        .map((t) => t.assigneeUserId)
        .filter(Boolean)
        .map((id) => id.toString())
    ),
  ];

  if (!assigneeIds.length) return new Map();

  const users = await User.find(
    { _id: { $in: assigneeIds } },
    { name: 1, email: 1, avatar: 1, roleTitle: 1 }
  ).lean();

  return new Map(users.map((u) => [u._id.toString(), u]));
}

function toBoardTask(task, assigneeMap, projectNameMap, now) {
  const health = getTaskHealthState(task, now);
  const assignee = task.assigneeUserId
    ? assigneeMap.get(task.assigneeUserId.toString()) || null
    : null;

  return {
    id: task._id,
    title: task.title,
    description: task.description || "",
    status: task.status,
    priority: task.priority || "Medium",
    dueDate: task.dueDate,
    daysRemaining: health.daysRemaining,
    isBlocked: Boolean(task.isBlocked || task.status === "blocked"),
    isOverdue: health.isOverdue,
    expectedProgress: health.expectedProgress,
    actualProgress: health.actualProgress,
    healthStatus: health.healthStatus,
    statusBadge: health.statusBadge,
    stuckScore: health.stuckScore,
    estimatedEffort: task.estimatedEffort || 0,
    projectId: task.projectId,
    projectName: task.projectId ? projectNameMap.get(task.projectId.toString()) || "Project" : "Project",
    assignee: assignee
      ? {
          id: assignee._id,
          name: assignee.name,
          email: assignee.email,
          avatar: assignee.avatar,
          roleTitle: assignee.roleTitle,
        }
      : null,
    dependency: task.dependency || [],
  };
}

/**
 * 1. Single Task Health
 */
async function getTaskHealthService(taskId) {
  try {
    const task = await Task.findOne({ _id: taskId, deletedAt: null }).lean();
    if (!task) {
      return { status: 404, message: "Task not found" };
    }

    const health = getTaskHealthState(task, Date.now());
    return {
      status: 200,
      data: {
        taskId: task._id,
        title: task.title,
        status: task.status,
        ...health,
      },
    };
  } catch (error) {
    console.error("Error in getTaskHealthService:", error);
    return { status: 500, message: error.message };
  }
}

/**
 * 2. Task Health Summary
 */
async function getTaskHealthSummaryService({ workspaceId, projectId, userId }) {
  try {
    const workspaceObjectId = toObjectId(workspaceId);
    if (!workspaceObjectId) {
      return { status: 400, message: "Invalid workspaceId" };
    }

    const isMember = await validateMembership(workspaceObjectId, userId);
    if (!isMember) {
      return { status: 403, message: "Only workspace members can access task health" };
    }

    const taskQuery = { workspaceId: workspaceObjectId, deletedAt: null };
    if (projectId) {
      const resolvedProjectId = await resolveProjectId(projectId);
      if (resolvedProjectId) taskQuery.projectId = resolvedProjectId;
    }

    const tasks = await Task.find(taskQuery).lean();
    const now = Date.now();

    const totalTasks = tasks.length;
    let completed = 0;
    let inProgress = 0;
    let atRisk = 0;
    let blocked = 0;
    let overdue = 0;
    let criticalCount = 0;
    let totalProgress = 0;

    for (const task of tasks) {
      const health = getTaskHealthState(task, now);
      totalProgress += health.actualProgress;

      if (task.status === "done") {
        completed += 1;
      } else {
        if (task.status === "in-progress") inProgress += 1;
        if (health.isOverdue) overdue += 1;
        if (health.healthStatus === "blocked") blocked += 1;
        if (["blocked", "at_risk", "delayed"].includes(health.healthStatus)) atRisk += 1;
        if ((task.priority || "").toLowerCase() === "critical") criticalCount += 1;
      }
    }

    const completionPercentage = totalTasks ? Number(((completed / totalTasks) * 100).toFixed(1)) : 0;
    const avgProgress = totalTasks ? Number((totalProgress / totalTasks).toFixed(1)) : 0;

    return {
      status: 200,
      data: {
        totalTasks,
        completed,
        inProgress,
        atRisk,
        blocked,
        overdue,
        criticalCount,
        completionPercentage,
        avgProgress,
        healthScore: Math.max(0, Math.round(100 - (atRisk * 8 + overdue * 12 + blocked * 15) / Math.max(1, totalTasks) * 10)),
      },
    };
  } catch (error) {
    console.error("Error in getTaskHealthSummaryService:", error);
    return { status: 500, message: error.message };
  }
}

/**
 * 3. Task Health Board (Categorized Columns)
 */
async function getTaskHealthBoardService({ workspaceId, projectId, userId }) {
  try {
    const workspaceObjectId = toObjectId(workspaceId);
    if (!workspaceObjectId) {
      return { status: 400, message: "Invalid workspaceId" };
    }

    const isMember = await validateMembership(workspaceObjectId, userId);
    if (!isMember) {
      return { status: 403, message: "Only workspace members can access task health" };
    }

    const taskQuery = { workspaceId: workspaceObjectId, deletedAt: null };
    if (projectId) {
      const resolvedProjectId = await resolveProjectId(projectId);
      if (resolvedProjectId) taskQuery.projectId = resolvedProjectId;
    }

    const [tasks, projectDocs] = await Promise.all([
      Task.find(taskQuery).sort({ priority: -1, dueDate: 1 }).lean(),
      Project.find({ workspaceId: workspaceObjectId, deletedAt: null }, { _id: 1, name: 1, key: 1 }).lean(),
    ]);

    const assigneeMap = await getAssigneeMap(tasks);
    const projectNameMap = new Map(projectDocs.map((p) => [p._id.toString(), p.name]));
    const now = Date.now();

    const columns = {
      notStarted: [],
      inProgress: [],
      atRisk: [],
      complete: [],
    };

    for (const task of tasks) {
      const boardTask = toBoardTask(task, assigneeMap, projectNameMap, now);

      if (task.status === "done") {
        columns.complete.push(boardTask);
      } else if (["blocked", "at_risk", "delayed"].includes(boardTask.healthStatus)) {
        columns.atRisk.push(boardTask);
      } else if (task.status === "in-progress") {
        columns.inProgress.push(boardTask);
      } else {
        columns.notStarted.push(boardTask);
      }
    }

    return {
      status: 200,
      data: {
        totalTasks: tasks.length,
        blockedCount: columns.atRisk.filter((t) => t.isBlocked).length,
        atRiskCount: columns.atRisk.length,
        columns,
      },
    };
  } catch (error) {
    console.error("Error in getTaskHealthBoardService:", error);
    return { status: 500, message: error.message };
  }
}

/**
 * 4. Combined Task Health Dashboard
 */
async function getTaskHealthDashboardService(params) {
  const [summaryResult, boardResult] = await Promise.all([
    getTaskHealthSummaryService(params),
    getTaskHealthBoardService(params),
  ]);

  if (summaryResult.status !== 200) return summaryResult;
  if (boardResult.status !== 200) return boardResult;

  return {
    status: 200,
    data: {
      summary: summaryResult.data,
      board: boardResult.data,
    },
  };
}

module.exports = {
  getTaskHealthService,
  getTaskHealthSummaryService,
  getTaskHealthBoardService,
  getTaskHealthDashboardService,
};