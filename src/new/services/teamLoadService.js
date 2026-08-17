const mongoose = require("mongoose");
const { Task, Workspace, WorkspaceMember, User, Project } = require("../models/index");

function toObjectId(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return null;
  }
  return new mongoose.Types.ObjectId(id);
}

function parseProjectIds(projectId, projectIds, projects) {
  const rawProjectIds = [];
  if (Array.isArray(projectId)) {
    rawProjectIds.push(...projectId);
  } else if (projectId) {
    rawProjectIds.push(projectId);
  }

  const collection = projectIds ?? projects;
  if (Array.isArray(collection)) {
    rawProjectIds.push(...collection);
  } else if (typeof collection === "string" && collection.trim()) {
    rawProjectIds.push(...collection.split(",").map((id) => id.trim()));
  }

  const unique = [...new Set(rawProjectIds.filter(Boolean))];
  const objectIds = unique.map((id) => toObjectId(id)).filter(Boolean);
  return objectIds;
}

function getTaskLoadWeight(task) {
  if (task.status === "done") {
    return 0;
  }

  const actualProgress = Number(task.actualProgress);
  const safeProgress = Number.isFinite(actualProgress) ? actualProgress : 0;
  const remainingWork = Math.max(0, 100 - safeProgress) / 100;
  const isOverdue = task.dueDate ? new Date(task.dueDate).getTime() < Date.now() : false;

  let urgencyMultiplier = 1;
  if (isOverdue) {
    urgencyMultiplier = 1.5;
  } else if (task.status === "in-progress") {
    urgencyMultiplier = 1.15;
  }

  if (task.isBlocked || task.status === "blocked") {
    urgencyMultiplier += 0.2;
  }

  return Number((remainingWork * urgencyMultiplier).toFixed(2));
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

  const workspace = await Workspace.findById(workspaceObjectId, { _id: 1, name: 1 }).lean();
  if (!workspace) {
    return { status: 404, message: "Workspace not found" };
  }

  if (userId) {
    const requesterObjectId = toObjectId(userId);
    if (!requesterObjectId) {
      return { status: 400, message: "Invalid userId" };
    }

    const requesterMember = await WorkspaceMember.findOne(
      { workspaceId: workspaceObjectId, userId: requesterObjectId },
      { _id: 1 }
    ).lean();

    if (!requesterMember) {
      return { status: 403, message: "Only workspace members can access team load" };
    }
  }

  // 1. Fetch workspace members
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
    return {
      status: 200,
      data: {
        totalMembers: 0,
        overloadedMembers: 0,
        optimalMembers: 0,
        underloadedMembers: 0,
        averageLoadScore: 0,
        averageCapacityUtilization: 0,
        members: [],
      },
    };
  }

  // 2. Fetch User profiles for member details
  const userIds = workspaceMembers.map((m) => m.userId);
  const users = await User.find(
    { _id: { $in: userIds }, deletedAt: null },
    { name: 1, email: 1, avatar: 1, roleTitle: 1, workingHoursPerDay: 1 }
  ).lean();

  const userMap = new Map(users.map((u) => [u._id.toString(), u]));

  // 3. Build Task Query with Project filters
  const taskQuery = {
    workspaceId: workspaceObjectId,
    deletedAt: null,
  };

  const projectObjectIds = parseProjectIds(projectId, projectIds, projects);
  if (projectObjectIds.length === 1) {
    taskQuery.projectId = projectObjectIds[0];
  } else if (projectObjectIds.length > 1) {
    taskQuery.projectId = { $in: projectObjectIds };
  }

  const [tasks, projectDocs] = await Promise.all([
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

  const projectNameMap = new Map(projectDocs.map((p) => [p._id.toString(), p.name]));

  // Group tasks by assignee
  const taskMap = new Map();
  for (const task of tasks) {
    const assigneeId = task.assigneeUserId ? String(task.assigneeUserId) : null;
    if (!assigneeId) continue;

    if (!taskMap.has(assigneeId)) {
      taskMap.set(assigneeId, []);
    }
    taskMap.get(assigneeId).push(task);
  }

  const members = [];
  let overloadedMembers = 0;
  let optimalMembers = 0;
  let underloadedMembers = 0;
  let loadTotal = 0;
  let totalUtilization = 0;

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

    // Apply memberSearch query if passed
    if (searchKeyword) {
      const matchName = (userProfile.name || "").toLowerCase().includes(searchKeyword);
      const matchEmail = (userProfile.email || "").toLowerCase().includes(searchKeyword);
      const matchRole = (userProfile.roleTitle || "").toLowerCase().includes(searchKeyword);
      if (!matchName && !matchEmail && !matchRole) continue;
    }

    const assignedTasks = taskMap.get(userIdValue) || [];
    const openTasks = assignedTasks.filter((t) => t.status !== "done");

    // Load score & breakdown calculations
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

      // Estimated effort in hours (fallback to 4h default per open task if not specified)
      if (task.status !== "done") {
        estimatedWorkHours += task.estimatedEffort || 4;
      }

      // Status metrics
      if (task.status === "done") taskBreakdown.completed += 1;
      if (task.status === "in-progress") taskBreakdown.inProgress += 1;
      if (task.isBlocked || task.status === "blocked") taskBreakdown.blocked += 1;
      if (task.dueDate && new Date(task.dueDate).getTime() < now && task.status !== "done") {
        taskBreakdown.overdue += 1;
      }

      // Priority metrics
      const priority = (task.priority || "Medium").toLowerCase();
      if (priority === "critical") taskBreakdown.critical += 1;
      else if (priority === "high") taskBreakdown.high += 1;
      else if (priority === "low") taskBreakdown.low += 1;
      else taskBreakdown.medium += 1;

      // Project Split
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
    const weeklyCapacityHours = workingHours * 5; // 5 working days sprint/week baseline
    const utilizationPercentage = Number(Math.min(150, Math.round((estimatedWorkHours / weeklyCapacityHours) * 100)));

    // Status classification matching Frontend UI tokens
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
      load: utilizationPercentage, // Dashboard.jsx compatibility (member.load)
      loadScore,
      status,
      riskLevel,
      taskBreakdown,
      projectSplit: Array.from(projectSplitMap.values()),
      assignedTasks,
    });
  }

  const memberCount = members.length;

  return {
    status: 200,
    data: {
      totalMembers: memberCount,
      overloadedMembers,
      optimalMembers,
      underloadedMembers,
      averageLoadScore: memberCount ? Number((loadTotal / memberCount).toFixed(2)) : 0,
      averageCapacityUtilization: memberCount ? Math.round(totalUtilization / memberCount) : 0,
      members,
    },
  };
}

module.exports = {
  getTeamLoadService,
};