const { Sprint, WorkspaceMember } = require("../models/index");
const { resolveProjectId } = require("../utils/resolveProject");

async function createSprintService(payload, userId) {
    const { workspaceId, projectId, name, goal, startDate, endDate, status } = payload;

    const isMember = await WorkspaceMember.findOne({ workspaceId, userId });
    if (!isMember) {
        return { statuscode: 403, data: null };
    }

    const sprintData = {
        workspaceId,
        projectId,
        createdBy: userId,
        name,
        goal: goal || "",
        status: status || "future",
        startDate: new Date(startDate),
        endDate: new Date(endDate),
    };

    const data = await Sprint.create(sprintData);
    return { statuscode: 201, data };
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

    return { statuscode: 200, data: sprints };
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