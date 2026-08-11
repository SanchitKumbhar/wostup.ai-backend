const async_handler = require("express-async-handler");
const sprintService = require("../../services/sprintService");

const createSprintController = async_handler(async (req, res) => {
    if (!req.body) {
        return res.status(400).json({ message: "body not provided" });
    }
    const { workspaceId, projectId, name, goal, startDate, endDate, status } = req.body;
    if (!workspaceId || !projectId || !name || !startDate || !endDate) {
        return res.status(400).json({ message: "workspaceId, projectId, name, startDate, and endDate are required" });
    }

    const { statuscode, data } = await sprintService.createSprintService(
        { workspaceId, projectId, name, goal, startDate, endDate, status },
        req.auth.userId
    );

    if (statuscode === 201) {
        return res.status(201).json({ message: "sprint created", data });
    }
    if (statuscode === 403) {
        return res.status(403).json({ message: "only workspace members can create sprint" });
    }
    return res.status(400).json({ message: "sprint not created" });
});

const updateSprintController = async_handler(async (req, res) => {
    if (!req.body || !req.params.sprintId) {
        return res.status(400).json({ message: "body or sprintId not provided" });
    }

    const { statuscode, data } = await sprintService.updateSprintService(
        req.params.sprintId,
        req.auth.userId,
        req.body
    );

    if (statuscode === 200) {
        return res.status(200).json({ message: "sprint updated", data });
    }
    if (statuscode === 403) {
        return res.status(403).json({ message: "only creator can update sprint" });
    }
    if (statuscode === 404) {
        return res.status(404).json({ message: "sprint not found" });
    }
    return res.status(400).json({ message: "sprint not updated" });
});

const getSprintByIdController = async_handler(async (req, res) => {
    if (!req.params.sprintId) {
        return res.status(400).json({ message: "sprintId not provided" });
    }
    const { statuscode, data } = await sprintService.getSprintByIdService(req.params.sprintId);
    if (statuscode === 404) {
        return res.status(404).json({ message: "sprint not found" });
    }
    return res.status(200).json({ message: data });
});

const getAllSprintsController = async_handler(async (req, res) => {
    if (!req.params.projectId) {
        return res.status(400).json({ message: "projectId not provided" });
    }
    const { statuscode, data } = await sprintService.getAllSprintsService(req.params.projectId);
    return res.status(statuscode).json({ message: data });
});

const deleteSprintController = async_handler(async (req, res) => {
    if (!req.params.sprintId) {
        return res.status(400).json({ message: "sprintId not provided" });
    }
    const { statuscode, data } = await sprintService.deleteSprintService(req.params.sprintId, req.auth.userId);
    if (statuscode === 200) {
        return res.status(200).json({ message: "sprint deleted", data });
    }
    if (statuscode === 403) {
        return res.status(403).json({ message: "only creator can delete sprint" });
    }
    if (statuscode === 404) {
        return res.status(404).json({ message: "sprint not found" });
    }
    return res.status(400).json({ message: "sprint not deleted" });
});

module.exports = {
    createSprintController,
    updateSprintController,
    getSprintByIdController,
    getAllSprintsController,
    deleteSprintController,
};