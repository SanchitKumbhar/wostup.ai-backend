const Project = require("../models/projects.model");

async function projectStatService(workspaceId, pubClient) {
    const totalProjects = await Project.countDocuments({
        workspaceId,
        deletedAt: null,
    });

    const totalCompleted = await Project.countDocuments({
        workspaceId,
        status: "completed",
        deletedAt: null,
    });

    const totalActiveMembers = await pubClient.sCard(`workspace:${workspaceId}:online_users`);

    return { totalProjects, totalCompleted, totalActiveMembers };
}

module.exports = { projectStatService };