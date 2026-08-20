const mongoose = require("mongoose");
const { Task, Workspace, WorkspaceMember, User, Project } = require("../models/index");
const { getRedisClient } = require("../redisConfig/config");

const CACHE_TTL_SECONDS = 60; // 1 minute TTL

function toObjectId(id) {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
  return new mongoose.Types.ObjectId(id);
}

function parseProjectIds(projectId, projectIds, projects) {
  const rawProjectIds = [];
  if (Array.isArray(projectId)) rawProjectIds.push(...projectId);
  else if (projectId) rawProjectIds.push(projectId);

  const collection = projectIds ?? projects;
  if (Array.isArray(collection)) rawProjectIds.push(...collection);
  else if (typeof collection === "string" && collection.trim()) {
    rawProjectIds.push(...collection.split(",").map((id) => id.trim()));
  }

  const unique = [...new Set(rawProjectIds.filter(Boolean))];
  return unique.map((id) => toObjectId(id)).filter(Boolean);
}

function getTaskLoadWeight(task) {
  if (task.status === "done") return 0;

  const actualProgress = Number(task.actualProgress);
  const safeProgress = Number.isFinite(actualProgress) ? actualProgress : 0;
  const remainingWork = Math.max(0, 100 - safeProgress) / 100;
  const isOverdue = task.dueDate ? new Date(task.dueDate).getTime() < Date.now() : false;

  let urgencyMultiplier = 1;
  if (isOverdue) urgencyMultiplier = 1.5;
  else if (task.status === "in-progress") urgencyMultiplier = 1.15;

  if (task.isBlocked || task.status === "blocked") urgencyMultiplier += 0.2;

  return Number((remainingWork * urgencyMultiplier).toFixed(2));
}

/**
 * High-performance 4-week trend calculation using MongoDB Facet Aggregation
 */
async function calculateLoadTrendAggregated(workspaceObjectId, projectObjectIds, totalMembers, avgWorkingHours) {
  const now = new Date();
  const MS_IN_WEEK = 7 * 24 * 60 * 60 * 1000;
  const weeklyBaseCapacity = Math.max(1, totalMembers * avgWorkingHours * 5); // 5 working days

  const w2End = new Date(now.getTime() - 3 * MS_IN_WEEK);
  const w2Start = new Date(w2End.getTime() - MS_IN_WEEK);

  const w3End = new Date(now.getTime() - 2 * MS_IN_WEEK);
  const w3Start = new Date(w3End.getTime() - MS_IN_WEEK);

  const w4End = new Date(now.getTime() - 1 * MS_IN_WEEK);
  const w4Start = new Date(w4End.getTime() - MS_IN_WEEK);

  const w5End = now;
  const w5Start = new Date(w5End.getTime() - MS_IN_WEEK);

  const matchStage = {
    workspaceId: workspaceObjectId,
    deletedAt: null,
    createdAt: { $lte: now },
  };

  if (projectObjectIds.length === 1) matchStage.projectId = projectObjectIds[0];
  else if (projectObjectIds.length > 1) matchStage.projectId = { $in: projectObjectIds };

  const [facetResult] = await Task.aggregate([
    { $match: matchStage },
    {
      $facet: {
        W2: [
          {
            $match: {
              createdAt: { $lte: w2End },
              $or: [
                { status: { $ne: "done" } },
                { statusEnteredAt: { $gte: w2Start } },
              ],
            },
          },
          { $group: { _id: null, totalHours: { $sum: { $ifNull: ["$estimatedEffort", 4] } } } },
        ],
        W3: [
          {
            $match: {
              createdAt: { $lte: w3End },
              $or: [
                { status: { $ne: "done" } },
                { statusEnteredAt: { $gte: w3Start } },
              ],
            },
          },
          { $group: { _id: null, totalHours: { $sum: { $ifNull: ["$estimatedEffort", 4] } } } },
        ],
        W4: [
          {
            $match: {
              createdAt: { $lte: w4End },
              $or: [
                { status: { $ne: "done" } },
                { statusEnteredAt: { $gte: w4Start } },
              ],
            },
          },
          { $group: { _id: null, totalHours: { $sum: { $ifNull: ["$estimatedEffort", 4] } } } },
        ],
        W5: [
          {
            $match: {
              createdAt: { $lte: w5End },
              $or: [
                { status: { $ne: "done" } },
                { statusEnteredAt: { $gte: w5Start } },
              ],
            },
          },
          { $group: { _id: null, totalHours: { $sum: { $ifNull: ["$estimatedEffort", 4] } } } },
        ],
      },
    },
  ]);

  const extractHours = (arr) => (arr && arr[0] ? arr[0].totalHours : 0);

  const weeks = [
    { label: "W2", hours: extractHours(facetResult?.W2) },
    { label: "W3", hours: extractHours(facetResult?.W3) },
    { label: "W4", hours: extractHours(facetResult?.W4) },
    { label: "W5", hours: extractHours(facetResult?.W5) },
  ];

  return weeks.map((w) => ({
    week: w.label,
    utilizationPercentage: Math.min(150, Math.round((w.hours / weeklyBaseCapacity) * 100)),
    totalHours: w.hours,
  }));
}

async function getTeamLoadService({
  workspaceId,
  projectId,
  projectIds,
  projects,
  memberId,
  memberSearch,
  userId,
}) {
  const workspaceObjectId = toObjectId(workspaceId);
  if (!workspaceObjectId) {
    return { status: 400, message: "Invalid workspaceId" };
  }

  // 1. Verify User Access
  if (userId) {
    const requesterObjectId = toObjectId(userId);
    if (!requesterObjectId) return { status: 400, message: "Invalid userId" };

    const requesterMember = await WorkspaceMember.findOne(
      { workspaceId: workspaceObjectId, userId: requesterObjectId },
      { _id: 1 }
    ).lean();

    if (!requesterMember) {
      return { status: 403, message: "Only workspace members can access team load" };
    }
  }

  const projectObjectIds = parseProjectIds(projectId, projectIds, projects);
  const cacheKey = `cache:team-load:${workspaceId}:${projectObjectIds.join("-")}:${memberId || "all"}:${memberSearch || "none"}`;
  const redis = getRedisClient();

  // 2. Check Redis Cache
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return { status: 200, data: JSON.parse(cached) };
      }
    } catch (err) {
      console.warn("Redis read cache error:", err.message);
    }
  }

  // 3. Fetch Workspace & Members
  const workspace = await Workspace.findById(workspaceObjectId, { _id: 1, name: 1 }).lean();
  if (!workspace) {
    return { status: 404, message: "Workspace not found" };
  }

  const memberQuery = { workspaceId: workspaceObjectId };
  if (memberId) {
    const parsedMemberId = toObjectId(memberId);
    if (parsedMemberId) memberQuery._id = parsedMemberId;
  }

  const workspaceMembers = await WorkspaceMember.find(memberQuery, {
    userId: 1,
    role: 1,
    joinedAt: 1,
  }).lean();

  if (!workspaceMembers.length) {
    const emptyPayload = {
      totalMembers: 0,
      overloadedMembers: 0,
      optimalMembers: 0,
      underloadedMembers: 0,
      averageLoadScore: 0,
      averageCapacityUtilization: 0,
      loadTrend: [
        { week: "W2", utilizationPercentage: 0, totalHours: 0 },
        { week: "W3", utilizationPercentage: 0, totalHours: 0 },
        { week: "W4", utilizationPercentage: 0, totalHours: 0 },
        { week: "W5", utilizationPercentage: 0, totalHours: 0 },
      ],
      members: [],
    };
    return { status: 200, data: emptyPayload };
  }

  // 4. Fetch Users Profiles & Tasks in parallel
  const userIds = workspaceMembers.map((m) => m.userId);
  const taskQuery = { workspaceId: workspaceObjectId, deletedAt: null };
  if (projectObjectIds.length === 1) taskQuery.projectId = projectObjectIds[0];
  else if (projectObjectIds.length > 1) taskQuery.projectId = { $in: projectObjectIds };

  const [users, tasks, projectDocs] = await Promise.all([
    User.find(
      { _id: { $in: userIds }, deletedAt: null },
      { name: 1, email: 1, avatar: 1, roleTitle: 1, workingHoursPerDay: 1 }
    ).lean(),
    Task.find(taskQuery, {
      title: 1,
      projectId: 1,
      assigneeUserId: 1,
      status: 1,
      priority: 1,
      dueDate: 1,
      actualProgress: 1,
      estimatedEffort: 1,
      isBlocked: 1,
      createdAt: 1,
    }).lean(),
    Project.find({ workspaceId: workspaceObjectId, deletedAt: null }, { _id: 1, name: 1, key: 1 }).lean(),
  ]);

  const userMap = new Map(users.map((u) => [u._id.toString(), u]));
  const projectNameMap = new Map(projectDocs.map((p) => [p._id.toString(), p.name]));

  // 5. Group Tasks by Assignee
  const taskMap = new Map();
  for (const task of tasks) {
    const assigneeId = task.assigneeUserId ? String(task.assigneeUserId) : null;
    if (!assigneeId) continue;
    if (!taskMap.has(assigneeId)) taskMap.set(assigneeId, []);
    taskMap.get(assigneeId).push(task);
  }

  const members = [];
  let overloadedMembers = 0;
  let optimalMembers = 0;
  let underloadedMembers = 0;
  let loadTotal = 0;
  let totalUtilization = 0;
  let totalWorkingHours = 0;

  const searchKeyword = memberSearch ? String(memberSearch).trim().toLowerCase() : null;

  for (const teamMember of workspaceMembers) {
    const userIdValue = String(teamMember.userId);
    const userProfile = userMap.get(userIdValue) || {
      name: "Team Member",
      email: "",
      avatar: "U",
      roleTitle: teamMember.role,
      workingHoursPerDay: 8,
    };

    if (searchKeyword) {
      const matchName = (userProfile.name || "").toLowerCase().includes(searchKeyword);
      const matchEmail = (userProfile.email || "").toLowerCase().includes(searchKeyword);
      const matchRole = (userProfile.roleTitle || "").toLowerCase().includes(searchKeyword);
      if (!matchName && !matchEmail && !matchRole) continue;
    }

    const assignedTasks = taskMap.get(userIdValue) || [];
    const openTasks = assignedTasks.filter((t) => t.status !== "done");

    let loadScore = 0;
    let estimatedWorkHours = 0;
    const taskBreakdown = {
      total: assignedTasks.length,
      open: openTasks.length,
      completed: 0,
      inProgress: 0,
      blocked: 0,
      overdue: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    const projectSplitMap = new Map();
    const now = Date.now();

    for (const task of assignedTasks) {
      const weight = getTaskLoadWeight(task);
      loadScore += weight;

      if (task.status !== "done") {
        estimatedWorkHours += task.estimatedEffort || 4;
      }

      if (task.status === "done") taskBreakdown.completed += 1;
      if (task.status === "in-progress") taskBreakdown.inProgress += 1;
      if (task.isBlocked || task.status === "blocked") taskBreakdown.blocked += 1;
      if (task.dueDate && new Date(task.dueDate).getTime() < now && task.status !== "done") {
        taskBreakdown.overdue += 1;
      }

      const priority = (task.priority || "Medium").toLowerCase();
      if (priority === "critical") taskBreakdown.critical += 1;
      else if (priority === "high") taskBreakdown.high += 1;
      else if (priority === "low") taskBreakdown.low += 1;
      else taskBreakdown.medium += 1;

      if (task.projectId) {
        const pId = task.projectId.toString();
        if (!projectSplitMap.has(pId)) {
          projectSplitMap.set(pId, {
            projectId: pId,
            projectName: projectNameMap.get(pId) || "Project",
            tasksCount: 0,
            hours: 0,
          });
        }
        const pData = projectSplitMap.get(pId);
        pData.tasksCount += 1;
        pData.hours += task.estimatedEffort || (task.status !== "done" ? 4 : 0);
      }
    }

    loadScore = Number(loadScore.toFixed(2));
    const workingHours = userProfile.workingHoursPerDay || 8;
    totalWorkingHours += workingHours;
    const weeklyCapacityHours = workingHours * 5;
    const utilizationPercentage = Number(Math.min(150, Math.round((estimatedWorkHours / weeklyCapacityHours) * 100)));

    let status = "Optimal";
    let riskLevel = "low";
    if (loadScore >= 8 || openTasks.length >= 6 || utilizationPercentage >= 100) {
      status = "Overloaded";
      riskLevel = "high";
      overloadedMembers += 1;
    } else if (loadScore <= 2 && openTasks.length <= 2) {
      status = "Underloaded";
      riskLevel = "low";
      underloadedMembers += 1;
    } else {
      optimalMembers += 1;
      if (utilizationPercentage >= 80) riskLevel = "moderate";
    }

    loadTotal += loadScore;
    totalUtilization += utilizationPercentage;

    members.push({
      memberId: teamMember._id,
      userId: teamMember.userId,
      name: userProfile.name,
      email: userProfile.email,
      avatar: userProfile.avatar,
      role: teamMember.role,
      roleTitle: userProfile.roleTitle || teamMember.role,
      workingHoursPerDay: workingHours,
      capacityHours: weeklyCapacityHours,
      estimatedWorkHours,
      utilizationPercentage,
      load: utilizationPercentage,
      loadScore,
      status,
      riskLevel,
      taskBreakdown,
      projectSplit: Array.from(projectSplitMap.values()),
      assignedTasks,
    });
  }

  const memberCount = members.length;
  const avgHours = memberCount ? totalWorkingHours / memberCount : 8;

  // 6. Aggregate Load Trend (W2 - W5)
  const loadTrend = await calculateLoadTrendAggregated(workspaceObjectId, projectObjectIds, memberCount, avgHours);

  const responseData = {
    totalMembers: memberCount,
    overloadedMembers,
    optimalMembers,
    underloadedMembers,
    averageLoadScore: memberCount ? Number((loadTotal / memberCount).toFixed(2)) : 0,
    averageCapacityUtilization: memberCount ? Math.round(totalUtilization / memberCount) : 0,
    loadTrend,
    members,
  };

  // 7. Write to Redis Cache
  if (redis) {
    try {
      await redis.set(cacheKey, JSON.stringify(responseData), { EX: CACHE_TTL_SECONDS });
    } catch (err) {
      console.warn("Redis write cache error:", err.message);
    }
  }

  return { status: 200, data: responseData };
}

module.exports = {
  getTeamLoadService,
};