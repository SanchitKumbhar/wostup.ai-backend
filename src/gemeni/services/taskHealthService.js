const mongoose = require("mongoose");
const { Task, WorkspaceMember, User } = require("../models/index");

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

    const projectCollection = projectIds ?? projects;
    if (Array.isArray(projectCollection)) {
        rawProjectIds.push(...projectCollection);
    } else if (typeof projectCollection === "string" && projectCollection.trim()) {
        rawProjectIds.push(...projectCollection.split(",").map((id) => id.trim()));
    }

    const uniqueProjectIds = [...new Set(rawProjectIds.filter((id) => Boolean(id)))];
    if (!uniqueProjectIds.length) {
        return { projectObjectIds: [], isValid: true };
    }

    const projectObjectIds = uniqueProjectIds
        .map((id) => toObjectId(id))
        .filter((id) => Boolean(id));

    if (projectObjectIds.length !== uniqueProjectIds.length) {
        return { projectObjectIds: [], isValid: false };
    }

    return { projectObjectIds, isValid: true };
}

function getTaskHealthState(task, now) {
    const startDate = new Date(task.createdAt).getTime();
    const dueDate = new Date(task.dueDate).getTime();
    const actualProgress = Number(task.actualProgress);

    if (
        Number.isNaN(startDate)
        || Number.isNaN(dueDate)
        || dueDate <= startDate
        || Number.isNaN(actualProgress)
    ) {
        return {
            expectedProgress: 0,
            actualProgress: 0,
            healthStatus: "unknown",
            isOverdue: false,
        };
    }

    const timeElapsed = Math.max(0, now - startDate);
    const totalDuration = dueDate - startDate;

    const expectedProgress = Math.min(
        100,
        Math.max(0, (timeElapsed / totalDuration) * 100)
    );

    const lowerBound = Math.max(0, expectedProgress - 30);
    const upperBound = Math.max(0, expectedProgress - 10);
    const isOverdue = now > dueDate && task.status !== "done";

    let healthStatus = "healthy";

    if (task.isBlocked) {
        healthStatus = "blocked";
    } else if (actualProgress < lowerBound || isOverdue) {
        healthStatus = "delayed";
    } else if (actualProgress >= lowerBound && actualProgress < upperBound) {
        healthStatus = "at_risk";
    }

    return {
        expectedProgress: Number(expectedProgress.toFixed(2)),
        actualProgress: Number(actualProgress.toFixed(2)),
        healthStatus,
        isOverdue,
    };
}

async function validateMembership(workspaceId, userId) {
    const isMember = await WorkspaceMember.findOne({ workspaceId, userId }, { _id: 1 }).lean();
    return Boolean(isMember);
}

async function getTasksForScope(workspaceId, filters = {}) {
    const { projectObjectIds = [] } = filters;
    const query = {
        workspaceId,
        deletedAt: null,
    };

    if (projectObjectIds.length === 1) {
        query.projectId = projectObjectIds[0];
    } else if (projectObjectIds.length > 1) {
        query.projectId = { $in: projectObjectIds };
    }

    return Task.find(query).lean();
}

async function getAssigneeMap(tasks) {
    const assigneeIds = [...new Set(tasks
        .map((task) => task.assigneeUserId)
        .filter((id) => Boolean(id))
        .map((id) => id.toString()))];

    if (!assigneeIds.length) {
        return new Map();
    }

    const users = await User.find(
        { _id: { $in: assigneeIds } },
        { name: 1, avatar: 1 }
    ).lean();

    return new Map(users.map((user) => [user._id.toString(), user]));
}

function toBoardTask(task, assigneeMap, now) {
    const health = getTaskHealthState(task, now);
    const assignee = assigneeMap.get(task.assigneeUserId?.toString()) || null;

    return {
        id: task._id,
        title: task.title,
        status: task.status,
        dueDate: task.dueDate,
        isBlocked: Boolean(task.isBlocked),
        expectedProgress: health.expectedProgress,
        actualProgress: health.actualProgress,
        healthStatus: health.healthStatus,
        isOverdue: health.isOverdue,
        assignee: assignee ? {
            id: assignee._id,
            name: assignee.name,
            avatar: assignee.avatar,
        } : null,
    };
}

async function getTaskHealthService(taskId) {
    const task = await Task.findOne({ _id: taskId });

    if (!task) {
        return { status: 404, message: "Task not found" };
    }

    const now = Date.now();
    const health = getTaskHealthState(task, now);

    if (health.healthStatus === "unknown") {
        return { status: 400, message: "Invalid task dates or progress value" };
    }

    return {
        status: 200,
        data: {
            expectedProgress: health.expectedProgress,
            actualProgress: health.actualProgress,
            status: health.healthStatus,
        },
    };
}

async function getTaskHealthSummaryService({
    workspaceId,
    projectId,
    projectIds,
    projects,
    userId,
}) {
    const workspaceObjectId = toObjectId(workspaceId);
    const { projectObjectIds, isValid: areProjectIdsValid } = parseProjectIds(projectId, projectIds, projects);

    if (!workspaceObjectId || !areProjectIdsValid) {
        return { status: 400, message: "Invalid workspaceId or project filter" };
    }

    const isMember = await validateMembership(workspaceObjectId, userId);
    if (!isMember) {
        return { status: 403, message: "Only workspace members can access task health" };
    }

    const tasks = await getTasksForScope(workspaceObjectId, {
        projectObjectIds,
    });
    const now = Date.now();

    const totalTasks = tasks.length;
    let inProgress = 0;
    let atRisk = 0;
    let blocked = 0;
    let completed = 0;

    for (const task of tasks) {
        const health = getTaskHealthState(task, now);

        if (task.status === "in-progress") {
            inProgress += 1;
        }

        if (task.status === "done") {
            completed += 1;
        }

        if (health.healthStatus === "blocked") {
            blocked += 1;
        }

        if (["blocked", "at_risk", "delayed"].includes(health.healthStatus) && task.status !== "done") {
            atRisk += 1;
        }
    }

    const completionPercentage = totalTasks
        ? Number(((completed / totalTasks) * 100).toFixed(2))
        : 0;

    return {
        status: 200,
        data: {
            totalTasks,
            inProgress,
            atRisk,
            blocked,
            completionPercentage,
        },
    };
}

async function getTaskHealthBoardService({
    workspaceId,
    projectId,
    projectIds,
    projects,
    userId,
}) {
    const workspaceObjectId = toObjectId(workspaceId);
    const { projectObjectIds, isValid: areProjectIdsValid } = parseProjectIds(projectId, projectIds, projects);

    if (!workspaceObjectId || !areProjectIdsValid) {
        return { status: 400, message: "Invalid workspaceId or project filter" };
    }

    const isMember = await validateMembership(workspaceObjectId, userId);
    if (!isMember) {
        return { status: 403, message: "Only workspace members can access task health" };
    }

    const tasks = await getTasksForScope(workspaceObjectId, {
        projectObjectIds,
    });
    const assigneeMap = await getAssigneeMap(tasks);
    const now = Date.now();

    const board = {
        notStarted: [],
        inProgress: [],
        atRisk: [],
        complete: [],
    };

    for (const task of tasks) {
        const boardTask = toBoardTask(task, assigneeMap, now);

        if (task.status === "done") {
            board.complete.push(boardTask);
            continue;
        }

        if (["blocked", "at_risk", "delayed"].includes(boardTask.healthStatus)) {
            board.atRisk.push(boardTask);
            continue;
        }

        if (task.status === "in-progress") {
            board.inProgress.push(boardTask);
        } else {
            board.notStarted.push(boardTask);
        }
    }

    return {
        status: 200,
        data: {
            totalTasks: tasks.length,
            blockedCount: board.atRisk.filter((task) => task.isBlocked).length,
            columns: board,
        },
    };
}

async function getTaskHealthDashboardService({
    workspaceId,
    projectId,
    projectIds,
    projects,
    userId,
}) {
    const summaryResult = await getTaskHealthSummaryService({
        workspaceId,
        projectId,
        projectIds,
        projects,
        userId,
    });
    if (summaryResult.status !== 200) {
        return summaryResult;
    }

    const boardResult = await getTaskHealthBoardService({
        workspaceId,
        projectId,
        projectIds,
        projects,
        userId,
    });
    if (boardResult.status !== 200) {
        return boardResult;
    }

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