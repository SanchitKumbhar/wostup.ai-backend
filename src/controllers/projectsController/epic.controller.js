const async_handler = require("express-async-handler");
const epicService = require("../../services/epic.service");

const createEpicController = async_handler(async (req, res) => {
    if (!req.body) {
        return res.status(400).json({ message: "body not provided" });
    }
    const { workspaceId, projectId, name, summary, description, color, status, startDate, dueDate } = req.body;
    if (!workspaceId || !projectId || !name) {
        return res.status(400).json({ message: "workspaceId, projectId, and name are required" });
    }

    const { statuscode, data } = await epicService.createEpicService(
        { workspaceId, projectId, name, summary, description, color, status, startDate, dueDate },
        req.auth.userId
    );

    if (statuscode === 201) {
        return res.status(201).json({ message: "epic created", data });
    }
    if (statuscode === 403) {
        return res.status(403).json({ message: "only workspace members can create epic" });
    }
    return res.status(400).json({ message: "epic not created" });
});

const updateEpicController = async_handler(async (req, res) => {
    if (!req.body || !req.params.epicId) {
        return res.status(400).json({ message: "body or epicId not provided" });
    }

    const { statuscode, data } = await epicService.updateEpicService(
        req.params.epicId,
        req.auth.userId,
        req.body
    );

    if (statuscode === 200) {
        return res.status(200).json({ message: "epic updated", data });
    }
    if (statuscode === 403) {
        return res.status(403).json({ message: "only creator can update epic" });
    }
    if (statuscode === 404) {
        return res.status(404).json({ message: "epic not found" });
    }
    return res.status(400).json({ message: "epic not updated" });
});

const getEpicByIdController = async_handler(async (req, res) => {
    if (!req.params.epicId) {
        return res.status(400).json({ message: "epicId not provided" });
    }
    const { statuscode, data } = await epicService.getEpicByIdService(req.params.epicId);
    if (statuscode === 404) {
        return res.status(404).json({ message: "epic not found" });
    }
    return res.status(200).json({ message: data });
});

const getAllEpicsController = async_handler(async (req, res) => {
    if (!req.params.projectId) {
        return res.status(400).json({ message: "projectId not provided" });
    }
    const { statuscode, data } = await epicService.getAllEpicsService(req.params.projectId);
    return res.status(statuscode).json({ message: data });
});

const deleteEpicController = async_handler(async (req, res) => {
    if (!req.params.epicId) {
        return res.status(400).json({ message: "epicId not provided" });
    }
    const { statuscode, data } = await epicService.deleteEpicService(req.params.epicId, req.auth.userId);
    if (statuscode === 200) {
        return res.status(200).json({ message: "epic deleted", data });
    }
    if (statuscode === 403) {
        return res.status(403).json({ message: "only creator can delete epic" });
    }
    if (statuscode === 404) {
        return res.status(404).json({ message: "epic not found" });
    }
    return res.status(400).json({ message: "epic not deleted" });
});

module.exports = {
    createEpicController,
    updateEpicController,
    getEpicByIdController,
    getAllEpicsController,
    deleteEpicController,
};