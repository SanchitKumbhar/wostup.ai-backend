const { Epic, WorkspaceMember, Workspace, Project } = require("../models/index");
const mongoose = require("mongoose");
const { resolveProjectId } = require("../utils/resolveProject");
const { generateSubEntityId } = require("../utils/idGenerator");

async function createEpicService(payload, userId) {
    try {
        let { workspaceId, projectId, name, summary, description, color, status, startDate, dueDate } = payload;

        if (!name || !name.trim()) {
            return { statuscode: 400, data: null, message: "Epic name is required" };
        }

        const resolvedProjectId = await resolveProjectId(projectId);
        if (!resolvedProjectId) {
            return { statuscode: 400, data: null, message: "Invalid or non-existent projectId" };
        }

        if (!workspaceId) {
            const projDoc = await Project.findById(resolvedProjectId).select("workspaceId").lean();
            if (projDoc && projDoc.workspaceId) {
                workspaceId = projDoc.workspaceId;
            }
        }

        if (!workspaceId) {
            return { statuscode: 400, data: null, message: "workspaceId is required" };
        }

        const wsObjectId = mongoose.Types.ObjectId.isValid(workspaceId)
            ? new mongoose.Types.ObjectId(workspaceId)
            : workspaceId;
        const userObjectId = mongoose.Types.ObjectId.isValid(userId)
            ? new mongoose.Types.ObjectId(userId)
            : userId;

        const isMember = await WorkspaceMember.findOne({ workspaceId: wsObjectId, userId: userObjectId }).lean();
        let hasAccess = Boolean(isMember);
        if (!hasAccess && Workspace) {
            const isOwner = await Workspace.findOne({ _id: wsObjectId, ownerUserId: userObjectId }).lean();
            if (isOwner) hasAccess = true;
        }

        if (!hasAccess) {
            return { statuscode: 403, data: null, message: "You are not a member of this workspace" };
        }

        const displayId = await generateSubEntityId("Epic", resolvedProjectId);

        const epicData = {
            workspaceId: wsObjectId,
            projectId: resolvedProjectId,
            displayId,
            createdBy: userObjectId,
            name: name.trim(),
            summary: summary || "",
            description: description || "",
            color: color || "#8B5CF6",
            status: status || "To Do",
        };

        if (startDate) epicData.startDate = new Date(startDate);
        if (dueDate) epicData.dueDate = new Date(dueDate);

        const data = await Epic.create(epicData);
        return { statuscode: 201, data };
    } catch (error) {
        console.error("Error in createEpicService:", error);
        return { statuscode: 400, data: null, message: error.message };
    }
}

async function updateEpicService(epicId, userId, body) {
    const epic = await Epic.findById(epicId, { createdBy: 1 });
    if (!epic) {
        return { statuscode: 404, data: null };
    }
    if (epic.createdBy.toString() !== userId.toString()) {
        return { statuscode: 403, data: null };
    }

    if (body.startDate) body.startDate = new Date(body.startDate);
    if (body.dueDate) body.dueDate = new Date(body.dueDate);

    const data = await Epic.findOneAndUpdate(
        { _id: epicId },
        { $set: body },
        { new: true }
    );
    return { statuscode: 200, data };
}

async function getEpicByIdService(epicId) {
    const data = await Epic.findOne({ _id: epicId, deletedAt: null });
    if (!data) {
        return { statuscode: 404, data: null };
    }
    return { statuscode: 200, data };
}
async function getAllEpicsService(projectId) {
  try {
    const resolvedId = await resolveProjectId(projectId);
    if (!resolvedId) {
      return { statuscode: 404, data: null, error: "Project not found" };
    }

    const epics = await Epic.find({
      projectId: resolvedId,
      deletedAt: null,
    })
      .populate("createdBy", "name email avatar")
      .sort({ createdAt: -1 })
      .lean();

    const enrichedEpics = epics.map((e, idx) => ({
      ...e,
      displayId: e.displayId || `EPC-${epics.length - idx}`,
    }));

    return { statuscode: 200, data: enrichedEpics };
  } catch (error) {
    console.error("Error in getAllEpicsService:", error);
    return { statuscode: 500, data: null, error: error.message };
  }
}
async function deleteEpicService(epicId, userId) {
    const epic = await Epic.findById(epicId, { createdBy: 1 });
    if (!epic) {
        return { statuscode: 404, data: null };
    }
    if (epic.createdBy.toString() !== userId.toString()) {
        return { statuscode: 403, data: null };
    }

    const data = await Epic.updateOne(
        { _id: epicId },
        { $set: { deletedAt: new Date() } }
    );
    return { statuscode: 200, data };
}

module.exports = {
    createEpicService,
    updateEpicService,
    getEpicByIdService,
    getAllEpicsService,
    deleteEpicService,
};