const mongoose = require("mongoose");
const { Task, Suggestion } = require("../models");

// Active debouncing timers map for workspace triggers
const activeDebounceTimers = new Map();

/**
 * Helper to upsert a suggestion into the suggestions collection.
 */
async function upsertSuggestion({
  workspaceId,
  risk_category,
  risk_score,
  confidence = 0.9,
  scope,
  details,
  phrased_text,
}) {
  const filter = {
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    risk_category,
    "scope.type": scope.type,
    "scope.id": new mongoose.Types.ObjectId(scope.id),
  };

  const update = {
    $set: {
      risk_score,
      confidence,
      details,
      phrased_text,
      model_version: "conflict_v1",
      updatedAt: new Date(),
    },
    $setOnInsert: {
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      risk_category,
      scope: {
        type: scope.type,
        id: new mongoose.Types.ObjectId(scope.id),
      },
      validated: false,
      createdAt: new Date(),
    },
  };

  return Suggestion.findOneAndUpdate(filter, update, {
    upsert: true,
    returnDocument: "after",
    runValidators: true,
  });
}

/**
 * 1. Cross-Project Overload Conflict (Multi-Project Double Booking)
 * Detects users assigned to High or Critical priority tasks across >= 2 projects
 * where project deadlines overlap within <= 3 days.
 */
async function detectCrossProjectConflicts(workspaceId) {
  if (!mongoose.Types.ObjectId.isValid(workspaceId)) {
    throw new Error("Invalid workspaceId");
  }

  const wsObjectId = new mongoose.Types.ObjectId(workspaceId);

  const candidates = await Task.aggregate([
    {
      $match: {
        workspaceId: wsObjectId,
        status: { $ne: "done" },
        deletedAt: null,
        priority: { $in: ["High", "Critical"] },
      },
    },
    {
      $group: {
        _id: "$assigneeUserId",
        projectIds: { $addToSet: "$projectId" },
        tasks: {
          $push: {
            taskId: "$_id",
            projectId: "$projectId",
            priority: "$priority",
            dueDate: "$dueDate",
            title: "$title",
          },
        },
      },
    },
    {
      $project: {
        assigneeUserId: "$_id",
        projectCount: { $size: "$projectIds" },
        projectIds: 1,
        tasks: 1,
      },
    },
    {
      $match: {
        projectCount: { $gte: 2 },
      },
    },
  ]);

  const createdSuggestions = [];

  for (const candidate of candidates) {
    const tasksByProject = {};
    for (const task of candidate.tasks) {
      const pId = task.projectId.toString();
      if (!tasksByProject[pId] || new Date(task.dueDate) < new Date(tasksByProject[pId].dueDate)) {
        tasksByProject[pId] = task;
      }
    }

    const projectEarliestTasks = Object.values(tasksByProject).sort(
      (a, b) => new Date(a.dueDate) - new Date(b.dueDate)
    );

    let minGapDays = Infinity;
    for (let i = 0; i < projectEarliestTasks.length - 1; i++) {
      const gapMs = Math.abs(
        new Date(projectEarliestTasks[i + 1].dueDate) - new Date(projectEarliestTasks[i].dueDate)
      );
      const gapDays = gapMs / (1000 * 60 * 60 * 24);
      if (gapDays < minGapDays) {
        minGapDays = gapDays;
      }
    }

    if (minGapDays <= 3) {
      const gapDaysRounded = Math.round(minGapDays * 10) / 10;
      const risk_score = Math.min(100, Math.round(80 + (3 - minGapDays) * 5));
      const phrased_text = `Assignee is assigned to High/Critical tasks across ${candidate.projectCount} distinct projects with deadline gap of ${gapDaysRounded} days (<= 3 days threshold).`;

      const suggestion = await upsertSuggestion({
        workspaceId,
        risk_category: "Cross-Project Conflict",
        risk_score,
        confidence: 0.9,
        scope: {
          type: "person",
          id: candidate.assigneeUserId,
        },
        details: {
          assigneeUserId: candidate.assigneeUserId,
          projectCount: candidate.projectCount,
          projectIds: candidate.projectIds,
          gapDays: gapDaysRounded,
          taskIds: candidate.tasks.map((t) => t.taskId),
        },
        phrased_text,
      });

      createdSuggestions.push(suggestion);
    }
  }

  return createdSuggestions;
}

/**
 * 2. Dependency / Sequence Conflict (Timeline Discrepancy)
 * Detects child tasks where parentTask.dueDate >= childTask.dueDate and parent task is not done.
 * Hardened with pipeline $lookup to enforce workspaceId matching and deletedAt/status filters.
 */
async function detectDependencyConflicts(workspaceId) {
  if (!mongoose.Types.ObjectId.isValid(workspaceId)) {
    throw new Error("Invalid workspaceId");
  }

  const wsObjectId = new mongoose.Types.ObjectId(workspaceId);

  const conflicts = await Task.aggregate([
    {
      $match: {
        workspaceId: wsObjectId,
        status: { $ne: "done" },
        deletedAt: null,
        dependency: { $exists: true, $ne: [] },
      },
    },
    {
      $unwind: "$dependency",
    },
    {
      $lookup: {
        from: "tasks",
        let: { childDependency: "$dependency", wsId: "$workspaceId" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$_id", "$$childDependency"] },
                  { $eq: ["$workspaceId", "$$wsId"] },
                  { $eq: ["$deletedAt", null] },
                  { $ne: ["$status", "done"] },
                ],
              },
            },
          },
        ],
        as: "parentTask",
      },
    },
    {
      $unwind: "$parentTask",
    },
    {
      $match: {
        $expr: { $gte: ["$parentTask.dueDate", "$dueDate"] },
      },
    },
  ]);

  const createdSuggestions = [];

  for (const item of conflicts) {
    const childDueDate = new Date(item.dueDate);
    const parentDueDate = new Date(item.parentTask.dueDate);
    const diffMs = parentDueDate - childDueDate;
    const diffDays = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));

    const risk_score = Math.min(100, 85 + diffDays * 3);
    const phrased_text = `Task '${item.title}' is scheduled due on ${childDueDate.toISOString().split("T")[0]}, before/on its prerequisite parent task '${item.parentTask.title}' due date (${parentDueDate.toISOString().split("T")[0]}).`;

    const suggestion = await upsertSuggestion({
      workspaceId,
      risk_category: "Dependency Conflict",
      risk_score,
      confidence: 0.95,
      scope: {
        type: "task",
        id: item._id,
      },
      details: {
        taskId: item._id,
        taskTitle: item.title,
        childDueDate,
        parentTaskId: item.parentTask._id,
        parentTaskTitle: item.parentTask.title,
        parentDueDate,
        parentStatus: item.parentTask.status,
      },
      phrased_text,
    });

    createdSuggestions.push(suggestion);
  }

  return createdSuggestions;
}

/**
 * 3. Milestone Deadline Mismatch Conflict
 * Detects tasks belonging to a milestone where task.dueDate > milestone.dueDate.
 * Hardened with pipeline $lookup to enforce workspaceId matching and deletedAt filters.
 */
async function detectMilestoneMismatches(workspaceId) {
  if (!mongoose.Types.ObjectId.isValid(workspaceId)) {
    throw new Error("Invalid workspaceId");
  }

  const wsObjectId = new mongoose.Types.ObjectId(workspaceId);

  const mismatches = await Task.aggregate([
    {
      $match: {
        workspaceId: wsObjectId,
        status: { $ne: "done" },
        deletedAt: null,
        milestoneId: { $ne: null },
      },
    },
    {
      $lookup: {
        from: "milestones",
        let: { taskMilestoneId: "$milestoneId", wsId: "$workspaceId" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$_id", "$$taskMilestoneId"] },
                  { $eq: ["$workspaceId", "$$wsId"] },
                  { $eq: ["$deletedAt", null] },
                ],
              },
            },
          },
        ],
        as: "milestone",
      },
    },
    {
      $unwind: "$milestone",
    },
    {
      $match: {
        $expr: { $gt: ["$dueDate", "$milestone.dueDate"] },
      },
    },
  ]);

  const createdSuggestions = [];

  for (const item of mismatches) {
    const taskDueDate = new Date(item.dueDate);
    const milestoneDueDate = new Date(item.milestone.dueDate);
    const overdueMs = taskDueDate - milestoneDueDate;
    const overdueDays = Math.ceil(overdueMs / (1000 * 60 * 60 * 24));

    const risk_score = Math.min(100, 75 + overdueDays * 4);
    const phrased_text = `Task '${item.title}' due date (${taskDueDate.toISOString().split("T")[0]}) exceeds target milestone '${item.milestone.name}' due date (${milestoneDueDate.toISOString().split("T")[0]}) by ${overdueDays} days.`;

    const suggestion = await upsertSuggestion({
      workspaceId,
      risk_category: "Milestone Mismatch",
      risk_score,
      confidence: 0.95,
      scope: {
        type: "task",
        id: item._id,
      },
      details: {
        taskId: item._id,
        taskTitle: item.title,
        taskDueDate,
        milestoneId: item.milestone._id,
        milestoneName: item.milestone.name,
        milestoneDueDate,
        overdueDays,
      },
      phrased_text,
    });

    createdSuggestions.push(suggestion);
  }

  return createdSuggestions;
}

/**
 * 4. Direct Due-Date Clustering (Single-User Overload Spikes)
 * Detects assignees who have >= 3 Critical or High priority tasks due on the exact same date.
 */
async function detectDueDateClustering(workspaceId) {
  if (!mongoose.Types.ObjectId.isValid(workspaceId)) {
    throw new Error("Invalid workspaceId");
  }

  const wsObjectId = new mongoose.Types.ObjectId(workspaceId);

  const clusters = await Task.aggregate([
    {
      $match: {
        workspaceId: wsObjectId,
        status: { $ne: "done" },
        deletedAt: null,
        priority: { $in: ["High", "Critical"] },
      },
    },
    {
      $project: {
        assigneeUserId: 1,
        priority: 1,
        title: 1,
        dateStr: {
          $dateToString: { format: "%Y-%m-%d", date: "$dueDate" },
        },
      },
    },
    {
      $group: {
        _id: {
          assigneeUserId: "$assigneeUserId",
          dateStr: "$dateStr",
        },
        taskCount: { $sum: 1 },
        taskIds: { $push: "$_id" },
        taskTitles: { $push: "$title" },
      },
    },
    {
      $match: {
        taskCount: { $gte: 3 },
      },
    },
  ]);

  const createdSuggestions = [];

  for (const cluster of clusters) {
    const risk_score = Math.min(100, 70 + cluster.taskCount * 5);
    const phrased_text = `Assignee has ${cluster.taskCount} High/Critical priority tasks scheduled due on the exact same date (${cluster._id.dateStr}).`;

    const suggestion = await upsertSuggestion({
      workspaceId,
      risk_category: "Due-Date Clustering",
      risk_score,
      confidence: 0.85,
      scope: {
        type: "person",
        id: cluster._id.assigneeUserId,
      },
      details: {
        assigneeUserId: cluster._id.assigneeUserId,
        dueDate: cluster._id.dateStr,
        taskCount: cluster.taskCount,
        taskIds: cluster.taskIds,
        taskTitles: cluster.taskTitles,
      },
      phrased_text,
    });

    createdSuggestions.push(suggestion);
  }

  return createdSuggestions;
}

/**
 * Main Orchestrator Function
 * Executes all 4 conflict detection functions in parallel for a given workspace.
 */
async function runAllConflictChecks(workspaceId) {
  if (!mongoose.Types.ObjectId.isValid(workspaceId)) {
    throw new Error("Invalid workspaceId");
  }

  const [
    crossProject,
    dependency,
    milestone,
    clustering,
  ] = await Promise.all([
    detectCrossProjectConflicts(workspaceId),
    detectDependencyConflicts(workspaceId),
    detectMilestoneMismatches(workspaceId),
    detectDueDateClustering(workspaceId),
  ]);

  const allSuggestions = [
    ...crossProject,
    ...dependency,
    ...milestone,
    ...clustering,
  ];

  return {
    success: true,
    workspaceId,
    totalConflictsFound: allSuggestions.length,
    breakdown: {
      crossProjectConflicts: crossProject.length,
      dependencyConflicts: dependency.length,
      milestoneMismatches: milestone.length,
      dueDateClustering: clustering.length,
    },
    suggestions: allSuggestions,
  };
}

/**
 * Schedules a debounced conflict detection run for a workspace.
 * Prevents rapid task updates on the same workspace from spawning
 * multiple overlapping aggregation pipelines.
 */
function scheduleDebouncedConflictCheck(workspaceId, delayMs = 500) {
  if (!workspaceId || !mongoose.Types.ObjectId.isValid(workspaceId)) {
    return;
  }

  const wsIdStr = String(workspaceId);
  if (activeDebounceTimers.has(wsIdStr)) {
    clearTimeout(activeDebounceTimers.get(wsIdStr));
  }

  const timer = setTimeout(() => {
    activeDebounceTimers.delete(wsIdStr);
    runAllConflictChecks(wsIdStr).catch((err) => {
      console.error(`Debounced conflict check error for workspace ${wsIdStr}:`, err);
    });
  }, delayMs);

  activeDebounceTimers.set(wsIdStr, timer);
}

/**
 * Gets all detected suggestions for a workspace.
 */
async function getWorkspaceSuggestions(workspaceId, options = {}) {
  if (!mongoose.Types.ObjectId.isValid(workspaceId)) {
    throw new Error("Invalid workspaceId");
  }

  const query = { workspaceId: new mongoose.Types.ObjectId(workspaceId) };
  if (options.risk_category) {
    query.risk_category = options.risk_category;
  }
  if (options.validated !== undefined) {
    query.validated = options.validated === "true" || options.validated === true;
  }

  return Suggestion.find(query).sort({ risk_score: -1, createdAt: -1 });
}

/**
 * Marks a suggestion as validated by a manager / user.
 */
async function validateSuggestion(suggestionId) {
  if (!mongoose.Types.ObjectId.isValid(suggestionId)) {
    throw new Error("Invalid suggestionId");
  }

  return Suggestion.findByIdAndUpdate(
    suggestionId,
    { $set: { validated: true, updatedAt: new Date() } },
    { returnDocument: "after" }
  );
}

module.exports = {
  detectCrossProjectConflicts,
  detectDependencyConflicts,
  detectMilestoneMismatches,
  detectDueDateClustering,
  runAllConflictChecks,
  scheduleDebouncedConflictCheck,
  getWorkspaceSuggestions,
  validateSuggestion,
};
