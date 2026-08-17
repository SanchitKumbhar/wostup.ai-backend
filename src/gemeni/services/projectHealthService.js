const { Project, Task } = require("../models/index");
const mongoose = require("mongoose");

const MS_IN_DAY = 24 * 60 * 60 * 1000;

function toObjectId(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return null;
    }

    return new mongoose.Types.ObjectId(id);
}

function diffInDays(startDate, endDate) {
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();

    if (Number.isNaN(start) || Number.isNaN(end)) {
        return 0;
    }

    return Math.floor((end - start) / MS_IN_DAY);
}

function getHealthStatus(progress, timeProgress) {
    if (timeProgress <= 0) {
        return "yellow";
    }

    const healthScore = progress / (timeProgress * 100);

    if (healthScore >= 0.9) {
        return "green";
    }

    if (healthScore >= 0.7) {
        return "yellow";
    }

    return "red";
}

async function projectHealthService(workspaceId) {
    const workspaceObjectId = toObjectId(workspaceId);
    if (!workspaceObjectId) {
        return { status: 400, message: "Invalid workspaceId" };
    }

    const projects = await Project.find({
        workspaceId: workspaceObjectId,
        deletedAt: null,
    }, {
        name: 1,
        progress: 1,
        createdAt: 1,
        dueDate: 1,
    }).lean();

    if (!projects.length) {
        return { status: 200, data: [] };
    }

    const projectIds = projects.map((project) => project._id);

    const taskAggregation = await Task.aggregate([
        {
            $match: {
                workspaceId: workspaceObjectId,
                projectId: { $in: projectIds },
                deletedAt: null,
            }
        },
        {
            $group: {
                _id: "$projectId",
                totalTasks: { $sum: 1 },
                completedTasks: {
                    $sum: {
                        $cond: [{ $eq: ["$status", "done"] }, 1, 0]
                    }
                },
                blockers: {
                    $sum: {
                        $cond: [{ $eq: ["$isBlocked", true] }, 1, 0]
                    }
                }
            }
        }
    ]);

    const taskMap = new Map(taskAggregation.map((item) => [item._id.toString(), item]));
    const now = new Date();

    const data = projects.map((project) => {
        const taskStats = taskMap.get(project._id.toString()) || {
            totalTasks: 0,
            completedTasks: 0,
            blockers: 0,
        };

        const totalDuration = Math.max(0, diffInDays(project.createdAt, project.dueDate));
        const daysRemaining = diffInDays(now, project.dueDate);
        const timeUsed = totalDuration - daysRemaining;
        const timeProgress = totalDuration === 0 ? 0 : timeUsed / totalDuration;

        return {
            projectId: project._id,
            projectName: project.name,
            status: getHealthStatus(Number(project.progress || 0), timeProgress),
            completedTasks: taskStats.completedTasks,
            totalTasks: taskStats.totalTasks,
            progress: Number(project.progress || 0),
            daysRemaining,
            blockers: taskStats.blockers,
        };
    });

    return { status: 200, data };
}

module.exports = { projectHealthService };