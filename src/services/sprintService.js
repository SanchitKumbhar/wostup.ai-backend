const { Sprint, WorkspaceMember, Workspace, Project } = require("../models/index");
const mongoose = require("mongoose");
const { resolveProjectId } = require("../utils/resolveProject");
const { generateSubEntityId } = require("../utils/idGenerator");

async function createSprintService(payload, userId) {
    try {
        let { workspaceId, projectId, name, goal, startDate, endDate, status, points } = payload;

        if (!name || !name.trim()) {
            return { statuscode: 400, data: null, message: "Sprint name is required" };
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

        const displayId = await generateSubEntityId("Sprint", resolvedProjectId);

        const parsedStart = startDate ? new Date(startDate) : new Date();
        const parsedEnd = endDate ? new Date(endDate) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

        const sprintData = {
            workspaceId: wsObjectId,
            projectId: resolvedProjectId,
            displayId,
            createdBy: userObjectId,
            name: name.trim(),
            goal: goal || "",
            points: Number(points) || 0,
            status: status || "future",
            startDate: isNaN(parsedStart.getTime()) ? new Date() : parsedStart,
            endDate: isNaN(parsedEnd.getTime()) ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) : parsedEnd,
        };

        const data = await Sprint.create(sprintData);
        return { statuscode: 201, data };
    } catch (error) {
        console.error("Error in createSprintService:", error);
        return { statuscode: 400, data: null, message: error.message };
    }
}

async function updateSprintService(sprintId, userId, body) {
    const sprint = await Sprint.findById(sprintId, { createdBy: 1 });
    if (!sprint) {
        return { statuscode: 404, data: null };
    }
    if (sprint.createdBy.toString() !== userId.toString()) {
        return { statuscode: 403, data: null };
    }

    if (body.startDate) body.startDate = new Date(body.startDate);
    if (body.endDate) body.endDate = new Date(body.endDate);
    if (body.status === "completed" && !body.completedAt) {
        body.completedAt = new Date();
    }

    const data = await Sprint.findOneAndUpdate(
        { _id: sprintId },
        { $set: body },
        { new: true }
    );
    return { statuscode: 200, data };
}

async function getSprintByIdService(sprintId) {
    const data = await Sprint.findOne({ _id: sprintId, deletedAt: null });
    if (!data) {
        return { statuscode: 404, data: null };
    }
    return { statuscode: 200, data };
}
async function getAllSprintsService(projectId) {
  try {
    const resolvedId = await resolveProjectId(projectId);
    if (!resolvedId) {
      return { statuscode: 404, data: null, error: "Project not found" };
    }

    const sprints = await Sprint.find({
      projectId: resolvedId,
      deletedAt: null,
    })
      .populate("createdBy", "name email avatar")
      .sort({ startDate: 1 })
      .lean();

    const enrichedSprints = sprints.map((s, idx) => ({
      ...s,
      displayId: s.displayId || `SPR-${idx + 1}`,
    }));

    return { statuscode: 200, data: enrichedSprints };
  } catch (error) {
    console.error("Error in getAllSprintsService:", error);
    return { statuscode: 500, data: null, error: error.message };
  }
}
async function deleteSprintService(sprintId, userId) {
    const sprint = await Sprint.findById(sprintId, { createdBy: 1 });
    if (!sprint) {
        return { statuscode: 404, data: null };
    }
    if (sprint.createdBy.toString() !== userId.toString()) {
        return { statuscode: 403, data: null };
    }

    const data = await Sprint.updateOne(
        { _id: sprintId },
        { $set: { deletedAt: new Date() } }
    );
    return { statuscode: 200, data };
}

module.exports = {
    createSprintService,
    updateSprintService,
    getSprintByIdService,
    getAllSprintsService,
    deleteSprintService,
};