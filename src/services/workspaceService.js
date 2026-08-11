const { Workspace, WorkspaceMember } = require("../models/index");

async function createWorkspaceService(name, ownerUserId, description, settings) {
    // Check if workspace already exists for this owner with the same name
    const existing = await Workspace.findOne({
        ownerUserId: ownerUserId,
        name: name
    });

    if (existing) {
        return 409; // conflict
    }

    // Create the workspace
    const workspace = await Workspace.create({
        name,
        ownerUserId,
        description: description || "",
        settings: settings || {}
    });

    // ✅ Add the owner as a member
    await WorkspaceMember.create({
        workspaceId: workspace._id,
        userId: ownerUserId,
        role: "owner",
        joinedAt: new Date()
    });

    return { status: 201, data: workspace };
}

async function updateWorkspaceService(workspaceId, body) {
    const result = await Workspace.updateOne(
        { _id: workspaceId },
        { $set: body }
    );

    if (result.matchedCount === 0) {
        return 304;
    }

    return { status: 200, data: result };
}

async function getWorkspaceByIdService(workspaceId) {
    const data = await Workspace.findById(workspaceId);
    if (!data) {
        return { status: 404, message: "Workspace not found" };
    }
    return { status: 200, data: data };
}

async function getWorkspaceService(ownerUserId) {
    const data = await Workspace.find({ ownerUserId: ownerUserId });
    if (!data || data.length === 0) {
        return { status: 404, message: "No workspaces found for this user" };
    }
    return { status: 200, data: data };
}

async function deleteWorkspaceService(workspaceId) {
    const result = await Workspace.deleteOne({ _id: workspaceId });
    if (result.deletedCount === 0) {
        return { status: 404, message: "Workspace not found" };
    }
    return {
        status: 200,
        message: "Workspace deleted successfully",
        data: result
    };
}

module.exports = {
    createWorkspaceService,
    updateWorkspaceService,
    getWorkspaceByIdService,
    getWorkspaceService,
    deleteWorkspaceService
};