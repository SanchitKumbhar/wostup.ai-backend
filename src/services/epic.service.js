const { Epic, WorkspaceMember } = require("../models/index");
const { resolveProjectId } = require("../utils/resolveProject");

async function createEpicService(payload, userId) {
    const { workspaceId, projectId, name, summary, description, color, status, startDate, dueDate } = payload;

    const isMember = await WorkspaceMember.findOne({ workspaceId, userId });
    if (!isMember) {
        return { statuscode: 403, data: null };
    }

    const epicData = {
        workspaceId,
        projectId,
        createdBy: userId,
        name,
        summary: summary || "",
        description: description || "",
        color: color || "#8B5CF6",
        status: status || "To Do",
    };

    if (startDate) epicData.startDate = new Date(startDate);
    if (dueDate) epicData.dueDate = new Date(dueDate);

    const data = await Epic.create(epicData);
    return { statuscode: 201, data };
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

    return { statuscode: 200, data: epics };
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