const mongoose = require("mongoose");
const { Project, Task } = require("../models/index");
const TaskActivity = require("../models/task_activities.model");

const MS_IN_DAY = 24 * 60 * 60 * 1000;

function toObjectId(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return new mongoose.Types.ObjectId(id);
}

function diffInDays(startDate, endDate) {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.floor((end - start) / MS_IN_DAY);
}

function calculateHealthScore({ progress, timeProgress, blockers, totalTasks }) {
  if (timeProgress <= 0) return { score: 100, status: "green" };

  const expectedProgress = Math.min(100, Math.max(1, timeProgress * 100));
  const progressRatio = progress / expectedProgress;
  let baseScore = Math.min(100, Math.round(progressRatio * 100));

  if (totalTasks > 0 && blockers > 0) {
    const blockerRatio = blockers / totalTasks;
    const penalty = Math.round(blockerRatio * 30);
    baseScore = Math.max(0, baseScore - penalty);
  }

  let status = "red";
  if (baseScore >= 80) status = "green";
  else if (baseScore >= 60) status = "yellow";

  return { score: baseScore, status };
}

async function generateRealtimeBurndown({
  projectId,
  startDate,
  dueDate,
  tasks,
  now,
  timezone = "UTC",
}) {
  const totalDays = Math.max(1, diffInDays(startDate, dueDate));
  const daysElapsed = Math.max(0, diffInDays(startDate, now));

  // 1. Fetch all activity logs up to current time (including pre-sprint planning)
  const dailyChanges = await TaskActivity.aggregate([
    {
      $match: {
        projectId: new mongoose.Types.ObjectId(projectId),
        createdAt: { $lte: new Date(now) },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone },
        },
        totalScopeDelta: { $sum: "$pointsDelta" },
        remainingDelta: { $sum: "$remainingDelta" },
        firstActivityDate: { $min: "$createdAt" },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const hasActivityLogs = dailyChanges.length > 0;
  const activityMap = new Map(dailyChanges.map((d) => [d._id, d]));

  const totalScopePoints = tasks.reduce(
    (sum, t) => sum + Number(t.storyPoints || t.points || 1),
    0
  );

  // Baseline scope represents planned points at Day 0
  const startDateStr = new Date(startDate).toISOString().split("T")[0];
  let baselineScope = 0;

  if (hasActivityLogs) {
    // Sum all activities logged on or before the start date
    baselineScope = dailyChanges
      .filter((d) => d._id <= startDateStr)
      .reduce((sum, d) => sum + d.totalScopeDelta, 0);

    // Fallback if tasks were logged after startDate without prior scope
    if (baselineScope <= 0) {
      baselineScope = totalScopePoints;
    }
  } else {
    baselineScope = totalScopePoints;
  }

  const idealBurnRate = (baselineScope || 1) / totalDays;

  // Fallback map using Task timestamps
  const fallbackCompletions = tasks
    .filter((t) => t.status === "done" && (t.completedAt || t.updatedAt))
    .map((t) => ({
      points: Number(t.storyPoints || t.points || 1),
      date: new Date(t.completedAt || t.updatedAt),
    }));

  let runningRemaining = 0;
  // Initialize pre-start remaining points
  if (hasActivityLogs) {
    runningRemaining = dailyChanges
      .filter((d) => d._id < startDateStr)
      .reduce((sum, d) => sum + d.remainingDelta, 0);
  }

  const burndown = [];

  for (let i = 0; i <= totalDays; i++) {
    const dayDate = new Date(new Date(startDate).getTime() + i * MS_IN_DAY);
    const dateKey = dayDate.toISOString().split("T")[0];
    const endOfDay = new Date(dayDate).setHours(23, 59, 59, 999);

    const idealRemaining = Math.max(0, Number((baselineScope - idealBurnRate * i).toFixed(1)));
    let actualRemaining = null;

    if (i <= daysElapsed) {
      if (hasActivityLogs) {
        const change = activityMap.get(dateKey);
        if (change) {
          runningRemaining += change.remainingDelta;
        }
        actualRemaining = Math.max(0, runningRemaining);
      } else {
        const pointsDone = fallbackCompletions
          .filter((c) => c.date.getTime() <= endOfDay)
          .reduce((sum, c) => sum + c.points, 0);

        actualRemaining = Math.max(0, totalScopePoints - pointsDone);
      }
    }

    burndown.push({
      date: dateKey,
      day: dayDate.toLocaleDateString("en-US", { weekday: "short" }),
      ideal: idealRemaining,
      actual: actualRemaining,
    });
  }

  return burndown;
}

async function getProjectHealthService(projectId, options = {}) {
  const { timezone = "UTC" } = options;
  const projectObjectId = toObjectId(projectId);

  if (!projectObjectId) {
    return { status: 400, message: "Invalid projectId" };
  }

  const project = await Project.findOne({
    _id: projectObjectId,
    deletedAt: null,
  }).lean();

  if (!project) {
    return { status: 404, message: "Project not found" };
  }

  const tasks = await Task.find({
    projectId: projectObjectId,
    deletedAt: null,
  }).lean();

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === "done" || t.status === "Completed").length;
  const blockers = tasks.filter((t) => t.isBlocked === true).length;

  const now = new Date();
  const startDate = project.startDate || project.createdAt;
  const dueDate = project.dueDate || new Date(new Date(startDate).getTime() + 14 * MS_IN_DAY);

  const totalDurationDays = Math.max(1, diffInDays(startDate, dueDate));
  const daysElapsed = Math.max(0, diffInDays(startDate, now));
  const daysRemaining = project.dueDate ? diffInDays(now, project.dueDate) : null;
  const timeProgress = totalDurationDays > 0 ? daysElapsed / totalDurationDays : 0;

  // Velocity calculations
  const effectiveElapsedDays = Math.max(1, daysElapsed);
  const velocityPerDay = Number((completedTasks / effectiveElapsedDays).toFixed(2));
  const velocityPerWeek = Number((velocityPerDay * 7).toFixed(2));

  const progress =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : (project.progress || 0);

  const { score: healthScore, status: healthStatus } = calculateHealthScore({
    progress,
    timeProgress,
    blockers,
    totalTasks,
  });

  const burndownChart = await generateRealtimeBurndown({
    projectId,
    startDate,
    dueDate,
    tasks,
    now,
    timezone,
  });

  return {
    status: 200,
    data: {
      projectId: project._id,
      projectName: project.name,
      totalTasks,
      completedTasks,
      velocity: {
        tasksPerDay: velocityPerDay,
        tasksPerWeek: velocityPerWeek,
      },
      health: {
        score: healthScore,
        status: healthStatus,
      },
      progress,
      blockers,
      timeline: {
        startDate,
        dueDate: project.dueDate || null,
        daysElapsed,
        daysRemaining,
        totalDurationDays,
      },
      burndownChart,
    },
  };
}

module.exports = { getProjectHealthService };