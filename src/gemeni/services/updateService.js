const { Update, WorkspaceMember } = require("../models/index");

const getWorkspaceUpdatesService = async (workspaceId, userId) => {
    try {
        const member = await WorkspaceMember.findOne({ workspaceId, userId });
        if (!member) {
            return { statuscode: 403, message: "User is not a member of the workspace" };
        }

        const updates = await Update.find({ workspaceId }).sort({ timestamp: -1 });
        return { statuscode: 200, data: updates };
    } catch (error) {
        return { statuscode: 500, message: error.message };
    }
};

const createWorkspaceUpdateService = async (workspaceId, authorUserId, title, content, type) => {
    try {
        const member = await WorkspaceMember.findOne({ workspaceId, userId: authorUserId });
        if (!member) {
            return { statuscode: 403, message: "Author is not a member of the workspace" };
        }

        const update = await Update.create({
            workspaceId,
            authorUserId,
            title,
            content,
            type,
            timestamp: new Date()
        });

        return { statuscode: 201, data: update };
    } catch (error) {
        return { statuscode: 500, message: error.message };
    }
};

module.exports = {
    getWorkspaceUpdatesService,
    createWorkspaceUpdateService
};